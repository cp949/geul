import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";

import { textToHardBreakInline } from "./code-block-inline-text.js";

// hardBreak를 받는 textblock(paragraph·heading·quote·목록 항목·callout·표
// 셀, content "inline*")에 남은 리터럴 `\n` text를 hardBreak로 바꾼다
// (Issue #281). codeBlock 텍스트가 범위 삭제·붙여넣기·끌어 옮기기·공개 API로
// 이 블록들에 들어오면 리터럴 개행이 남았다. 화면은 한 줄, export는 두 줄,
// 다음 입력에서는 개행이 공백으로 바뀌었다.
//
// - 경로가 여섯 개 이상이라 경로별 변환 대신 appendTransaction 하나가
//   모든 트랜잭션 뒤에서 정규화한다(출처를 판별하지 않는다).
// - hardBreak 허용은 노드 이름 목록이 아니라 부모의 content match로
//   판정한다(G-EDT-003). codeBlock(content "text*")은 자동 제외된다.
// - `\n` 한 글자와 hardBreak는 둘 다 위치 1칸이다. 문서 크기와 위치가 그대로라
//   selection을 같은 좌표로 되살린다.
// - export는 `\n` text와 hardBreak를 같은 `"\n"`으로 낸다. 저장 모델은
//   바뀌지 않는다.
// - appended transaction이라 history가 root와 같은 이벤트로 묶는다
//   (G-EDT-001). revision도 한 dispatch에 1회다.
//
// 탐색 범위는 이번 트랜잭션들이 바꾼 textblock뿐이다. 타이핑 경로에 문서
// 전체 순회를 넣지 않는다(PIT-0034, changedInlineParentPositions).
export const HardBreakNewlineNormalizeExtension = Extension.create({
  name: "hardBreakNewlineNormalize",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) =>
          normalizeLiteralNewlines(transactions, newState),
      }),
    ];
  },
});

// appendTransaction 본체. 바뀐 textblock의 리터럴 `\n` text를 hardBreak로
// 바꾸는 트랜잭션을 돌려준다. 바꿀 것이 없으면 null이다.
// 플러그인과 탐색 범위 테스트가 같은 경로를 타도록 export한다.
export function normalizeLiteralNewlines(
  transactions: readonly Transaction[],
  newState: EditorState,
): Transaction | null {
  if (!transactions.some((transaction) => transaction.docChanged)) {
    return null;
  }
  const hardBreakType = newState.schema.nodes.hardBreak;
  if (hardBreakType === undefined) return null;

  const tr = newState.tr;
  for (const parentPos of changedInlineParentPositions(
    newState.doc,
    transactions,
  )) {
    const parent = newState.doc.nodeAt(parentPos);
    if (parent === null) continue;
    const contentStart = parentPos + 1;
    parent.forEach((child, offset, index) => {
      if (!child.isText || !(child.text ?? "").includes("\n")) return;
      if (!parent.canReplaceWith(index, index + 1, hardBreakType)) return;
      const from = tr.mapping.map(contentStart + offset);
      tr.replaceWith(
        from,
        from + child.nodeSize,
        textToHardBreakInline(newState.schema, child.text ?? "", child.marks),
      );
    });
  }
  if (!tr.docChanged) return null;

  // 크기가 같아 같은 좌표가 유효하다. replace step의 매핑은 교체 범위 안
  // 위치를 끝으로 밀어내므로 원래 selection을 그대로 되살린다.
  tr.setSelection(newState.selection.map(tr.doc, new Mapping()));
  if (newState.storedMarks !== null) {
    tr.setStoredMarks(newState.storedMarks);
  }
  return tr;
}

// transactions가 바꾼 범위를 마지막 문서(doc) 좌표로 합치고, 그 범위에
// 걸친 inline content 부모(textblock·표 셀)의 시작 위치를 문서 순서로
// 돌려준다. 같은 부모는 한 번만 낸다.
// - step map의 새 범위를 이후 step들의 매핑으로 끝까지 옮긴다.
// - 범위가 부모 안에 일부만 걸쳐도 부모 전체를 정규화 대상으로 본다.
//   setNodeMarkup처럼 부모 토큰만 바꾸는 step도 그 부모를 잡는다.
// - 삭제처럼 폭이 0인 범위는 양옆 1칸을 넓혀 접합된 부모를 잡는다.
// 정규화 테스트가 순회 대상 수를 직접 확인하도록 export한다.
export function changedInlineParentPositions(
  doc: Node,
  transactions: readonly Transaction[],
): number[] {
  const maps = transactions.flatMap((transaction) => transaction.mapping.maps);
  const docSize = doc.content.size;
  const positions = new Set<number>();
  maps.forEach((map, index) => {
    const rest = new Mapping(maps.slice(index + 1));
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const from = Math.max(0, rest.map(newStart, -1) - 1);
      const to = Math.min(docSize, rest.map(newEnd, 1) + 1);
      doc.nodesBetween(from, to, (node, pos) => {
        if (node.inlineContent) {
          positions.add(pos);
          return false;
        }
        return true;
      });
    });
  });
  return [...positions].sort((a, b) => a - b);
}
