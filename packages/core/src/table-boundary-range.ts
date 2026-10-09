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

// 삭제 계약. 선택하지 않은 텍스트는 보존하고 선택한 텍스트만 지운다. 끝 쪽이
// 상위 블록의 자식이어도 같다(Issue #293). 라벨이 범위에 든 상위 블록은
// 타입과 attrs를 유지한 채 빈 라벨로 남고 끝 블록은 그 자식으로 남는다.

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

// selection이 같은 표 안에서 서로 다른 셀에 걸친 범위면 true다(Issue #317).
// 두 끝이 같은 표 안이라 findTableBoundaryRange가 null을 돌려주는 범위 중
// 한 셀 안 범위를 뺀 것이다. 한 셀 안 범위는 일반 문자 삭제 몫이다. 셀
// content가 "inline*"라 셀 자체가 $from.parent다.
export function isCrossCellRangeInSameTable(selection: Selection): boolean {
  if (!(selection instanceof TextSelection) || selection.empty) return false;
  const fromTable = tableSpanAt(selection.$from);
  const toTable = tableSpanAt(selection.$to);
  return (
    fromTable !== null &&
    toTable !== null &&
    fromTable.start === toTable.start &&
    !selection.$from.sameParent(selection.$to)
  );
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
// - 표 밖 구간: $to의 조상 체인에서 열린 토큰이 범위에 드는 blockContainer를
//   "대상 컨테이너"라 한다. 대상 컨테이너는 지우지 않고 아래처럼 비운다.
//   - 끝 블록: 라벨 텍스트 [내용 시작, to]만 지운다. 끝이 표 셀이면 표를
//     감싼 컨테이너라 라벨이 없다.
//   - 그 위의 상위 블록: 라벨 인라인 내용 전체를 지운다. 라벨 노드가 남아
//     타입과 attrs를 유지한다.
//   - 체인 자식 앞의 형제 블록: 통째로 지운다. 범위에 든 사이 블록이다.
//   - 사이 구간: [시작 쪽 표 끝 또는 from, 가장 바깥 대상 컨테이너 시작]을
//     일반 삭제한다. 닫는 토큰만 가로지르므로 끝 쪽 블록의 부모 관계가
//     바뀌지 않는다.
//
// 위치가 큰 구간부터 적용해 앞 구간의 위치가 밀리지 않게 한다. 구간은 서로
// 겹치지 않는다. 캐럿은 범위 시작에 접는다. tr은 호출 시점에 step이 없어야
// 한다(위치가 tr.doc 기준이고 캐럿 매핑이 이 함수의 step만 지나야 한다).
//
// preventClearDocument 메타(Issue #317). 첫 블록이 표이고 범위가 첫 셀 시작에서
// 문서 끝까지면 삭제 뒤 문서가 비어 보인다. Tiptap Keymap의 clearDocument가
// appendTransaction에서 clearNodes()를 불러 cellId가 null인 셀을 만들고,
// revision guard가 삭제 전체를 되돌렸다. 이 함수는 표 구조를 유지한 채 텍스트만
// 지우므로 문서를 비우는 정리가 필요 없다. Backspace·Delete·Cut·입력·붙여넣기·
// drop이 모두 이 함수를 거쳐 한 곳에서 막는다.
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

  // 표 밖 구간. 끝 쪽 대상 컨테이너를 깊은 쪽부터 모은다.
  const outsideFrom = fromTable === null ? from : fromTable.end;
  const $to = tr.doc.resolve(to);
  const targetDepths: number[] = [];
  for (let depth = $to.depth; depth > 0; depth -= 1) {
    if (
      $to.node(depth).type.name === "blockContainer" &&
      $to.before(depth) >= outsideFrom
    ) {
      targetDepths.push(depth);
    }
  }

  let outsideTo = toTable === null ? $to.start() : toTable.start;
  targetDepths.forEach((depth, index) => {
    if (toTable === null && index === 0) {
      // 끝 블록은 텍스트 구간만 따로 지운다. PM 삭제는 끝 블록 텍스트 전체를
      // 덮으면 그 블록째 지우기 때문이다.
      if ($to.start() < to) spans.push({ from: $to.start(), to });
      return;
    }
    // 상위 블록. 라벨 노드는 남기고 인라인 내용만 지운다.
    const labelStart = $to.start(depth) + 1;
    const labelSize = $to.node(depth).child(0).content.size;
    if (labelSize > 0) {
      spans.push({ from: labelStart, to: labelStart + labelSize });
    }
    // 체인 자식(자식 컨테이너 또는 끝 쪽 표) 앞의 형제 블록은 범위에 든 사이
    // 블록이다. 상위 블록의 자식 그룹 안이라 사이 구간이 닿지 않는다.
    const groupStart = $to.start(depth + 1);
    const chainChildStart = $to.before(depth + 2);
    if (groupStart < chainChildStart) {
      spans.push({ from: groupStart, to: chainChildStart });
    }
  });
  if (targetDepths.length > 0) {
    outsideTo = $to.before(targetDepths[targetDepths.length - 1]);
  }
  if (!isStructuralGap(tr.doc, outsideFrom, outsideTo)) {
    spans.push({ from: outsideFrom, to: outsideTo });
  }

  spans.sort((a, b) => b.from - a.from);
  for (const span of spans) {
    tr.delete(span.from, span.to);
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(from))));
  tr.setMeta("preventClearDocument", true);
}
