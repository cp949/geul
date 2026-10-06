import type { Editor } from "@tiptap/core";
import type { Node, ResolvedPos } from "@tiptap/pm/model";
import {
  TextSelection,
  type Selection,
  type Transaction,
} from "@tiptap/pm/state";

// 표(table) 경계에 걸친 텍스트 범위의 판정과 삭제(Issue #289). Enter·
// Backspace·Delete 핸들러가 공유하는 core 내부 모듈이다. index.ts에
// 재노출하지 않는다(G-WKS-001).
//
// 표 셀 content는 "inline*"라(D19) 셀과 표 밖 블록 사이 범위는 일반 split·
// join·deleteSelection이 구조를 맞추지 못한다. Enter는 분할할 곳이 없어
// 예외를 던지거나 표를 지웠다. Backspace·Delete는 선택하지 않은 뒷부분
// 텍스트를 셀로 옮기거나 셀을 지웠다.
//
// 경계 범위는 비어 있지 않은 TextSelection이고 $from과 $to가 속한 표가
// 서로 다른 범위다. 한쪽만 표 안이거나 서로 다른 두 표 안이다. 같은 표 안
// 범위, CellSelection, 양 끝이 표 밖인 범위(표를 완전히 감싸는 범위 포함)는
// 대상이 아니다.

// 표 노드 하나의 문서 범위. start는 표 앞, end는 표 뒤 위치다.
type TableSpan = { start: number; end: number };

export type TableBoundaryRange = {
  from: number;
  to: number;
  // $from이 표 안이면 그 표. 표 밖이면 null.
  fromTable: TableSpan | null;
  // $to가 표 안이면 그 표. 표 밖이면 null.
  toTable: TableSpan | null;
};

// $pos가 표 안이면 그 표의 범위를 돌려준다. 표는 중첩되지 않으므로(3.1)
// 가장 가까운 table 조상이 곧 유일한 표다.
function tableSpanAt($pos: ResolvedPos): TableSpan | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "table") {
      return { start: $pos.before(depth), end: $pos.after(depth) };
    }
  }
  return null;
}

// selection이 표 경계 범위면 범위 정보를, 아니면 null을 돌려준다.
// CellSelection은 TextSelection이 아니라 자연히 제외된다.
export function findTableBoundaryRange(
  selection: Selection,
): TableBoundaryRange | null {
  if (!(selection instanceof TextSelection) || selection.empty) return null;
  const fromTable = tableSpanAt(selection.$from);
  const toTable = tableSpanAt(selection.$to);
  if (fromTable === null && toTable === null) return null;
  if (
    fromTable !== null &&
    toTable !== null &&
    fromTable.start === toTable.start
  ) {
    return null;
  }
  return { from: selection.from, to: selection.to, fromTable, toTable };
}

// 역방향 stale 소비(Issue #289, G-EDT-002). 호출 시작 시점의 live selection이
// 경계 범위인데 handler가 false를 돌려주면 true로 바꿔 키를 소비한다. 파생
// selection이 대상 밖이면 handler가 false로 폴스루하고, 그 뒤 Tiptap 기본
// deleteSelection이 live 경계 범위에 적용돼 선택하지 않은 텍스트가 셀로 옮겨
// 간다. 소비하면 문서·selection은 그대로다.
//
// handler가 true면 그대로 true다. 파생 selection 기준의 정상 동작은 바뀌지
// 않는다.
export function consumeWhileLiveBoundaryRange(
  editor: Editor,
  handler: () => boolean,
): boolean {
  const liveIsBoundaryRange =
    findTableBoundaryRange(editor.state.selection) !== null;
  return handler() || liveIsBoundaryRange;
}

// [from, to]에 닫는·여는 토큰만 있고 선택된 내용이 없으면 true다. from을
// 닫는 토큰 뒤로, to를 여는 토큰 앞으로 밀어 서로 만나는지 본다. 이 구간을
// 삭제하면 문서는 그대로인데 구조만 바꾸는 step이 생긴다.
function isStructuralGap(doc: Node, from: number, to: number): boolean {
  if (from >= to) return true;
  let $from = doc.resolve(from);
  while ($from.depth > 0 && $from.parentOffset === $from.parent.content.size) {
    $from = doc.resolve($from.after());
  }
  let $to = doc.resolve(to);
  while ($to.depth > 0 && $to.parentOffset === 0) {
    $to = doc.resolve($to.before());
  }
  return $from.pos >= $to.pos;
}

// 경계 범위의 선택한 텍스트만 tr에 쌓아 지운다. 반환값 없음 — 호출부가
// tr을 한 번 dispatch한다(G-EDT-001).
//
// - 표 안 구간: 범위와 겹치는 각 셀에서 겹친 인라인 구간만 지운다. 셀·행·열
//   구조는 건드리지 않는다.
// - 표 밖 구간: [시작 쪽 표 끝 또는 from, 끝 쪽 표 시작 또는 to]를 일반
//   삭제한다. 사이 블록·사이 표는 사라지고 끝 블록은 텍스트만 줄어 남는다.
//
// 위치가 큰 구간부터 적용해 앞 구간의 위치가 밀리지 않게 한다. 캐럿은
// 범위 시작에 접는다. tr은 호출 시점에 step이 없어야 한다(위치가 tr.doc
// 기준이고 캐럿 매핑이 이 함수의 step만 지나야 한다).
export function deleteTableBoundaryRange(
  tr: Transaction,
  range: TableBoundaryRange,
): void {
  const { from, to, fromTable, toTable } = range;
  const spans: Array<{ from: number; to: number }> = [];

  // 표 안 구간. 사이에 낀 표의 셀은 건드리지 않는다 — 표째 아래 표 밖
  // 구간이 지운다.
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "tableCell") return true;
    const inFromTable =
      fromTable !== null && pos >= fromTable.start && pos < fromTable.end;
    const inToTable =
      toTable !== null && pos >= toTable.start && pos < toTable.end;
    if (inFromTable || inToTable) {
      const start = Math.max(from, pos + 1);
      const end = Math.min(to, pos + 1 + node.content.size);
      if (start < end) spans.push({ from: start, to: end });
    }
    return false;
  });

  // 표 밖 구간. 끝 블록은 텍스트 구간만 따로 지운다. PM 삭제는 끝 블록
  // 텍스트 전체를 덮으면 그 블록째 지우기 때문이다. 끝 블록 내용 시작까지만
  // 일반 삭제하고 끝 블록은 남긴다.
  const outsideFrom = fromTable === null ? from : fromTable.end;
  let outsideTo = toTable === null ? to : toTable.start;
  if (toTable === null) {
    const endBlockStart = tr.doc.resolve(to).start();
    if (endBlockStart < to) spans.push({ from: endBlockStart, to });
    outsideTo = endBlockStart;
  }
  if (!isStructuralGap(tr.doc, outsideFrom, outsideTo)) {
    spans.push({ from: outsideFrom, to: outsideTo });
  }

  spans.sort((a, b) => b.from - a.from);
  for (const span of spans) {
    tr.delete(span.from, span.to);
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(from))));
}
