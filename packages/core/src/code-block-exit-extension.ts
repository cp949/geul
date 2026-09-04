import { Extension, type Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection, type EditorState } from "@tiptap/pm/state";

import { resolveSelectionAwareState } from "./selection-aware-state.js";

// codeBlock에서만 반응하는 Enter(double 개행 종료)·Delete(빈 블록 삭제)
// 확장(RD-003 DELTA-02). 둘 다 BlockSplitExtension·BlockJoinExtension
// (priority 101)의 일반 Enter/Delete보다 먼저 실행해야 한다 — codeBlock이
// 아니거나 조건이 안 맞으면 false를 반환해 그 확장들에(그리고 그 확장들도
// 물러나면 Tiptap 코어 내장 Keymap 확장의 newlineInCode 폴백에) 그대로
// 양보한다(CodeBlockMarkGuardExtension과 같은 이유로 priority 1_100).
// G-EDT-002: 클릭 직후 곧바로 실행될 수 있는 핸들러라 DOM 기준으로 다시
// 계산한 state로 판정한다. 실제 문서 transaction은 항상 live state에서
// 만든다 — 파생 state는 selection 판정에만 쓴다(문서 참조가 같아 위치
// 계산은 그대로 재사용해도 안전하다).
export const CodeBlockExitExtension = Extension.create({
  name: "codeBlockExit",
  priority: 1_100,

  addKeyboardShortcuts() {
    return {
      Enter: () => exitCodeBlockOnDoubleEnter(this.editor),
      Delete: () => deleteEmptyCodeBlock(this.editor),
    };
  },
});

// 캐럿이 codeBlock 콘텐츠 끝에 있고 그 바로 앞 글자가 이미 개행(직전
// Enter가 만든 빈 줄)이면 "두 번째 Enter"로 판정한다 — 완전히 빈 codeBlock
// (content.size === 0)의 첫 Enter는 대상이 아니다(그건 일반 개행 삽입으로
// 남겨 둔다, "빈 CodeBlock Delete 삭제"와 트리거 키 자체가 다르다).
function isDoubleEnterExitPoint(state: EditorState): boolean {
  const { selection } = state;
  if (!selection.empty || selection.$from.parent.type.name !== "codeBlock") {
    return false;
  }
  const { parent, parentOffset } = selection.$from;
  return (
    parentOffset === parent.content.size &&
    parentOffset > 0 &&
    parent.textBetween(parentOffset - 1, parentOffset) === "\n"
  );
}

function exitCodeBlockOnDoubleEnter(editor: Editor): boolean {
  const derivedState = resolveSelectionAwareState(editor);
  const liveState = editor.state;
  const referenceState = isDoubleEnterExitPoint(derivedState)
    ? derivedState
    : liveState;
  if (!isDoubleEnterExitPoint(referenceState)) return false;

  const $from = referenceState.selection.$from;
  const containerDepth = $from.depth - 1;
  if (containerDepth < 0) return false;
  const container = $from.node(containerDepth);
  if (container.type.name !== "blockContainer") return false;

  // 직전 Enter가 넣은 마지막 개행 한 글자만 지운다 — 그 앞 code source는
  // 그대로 둔다.
  const tr = liveState.tr.delete($from.pos - 1, $from.pos);

  // codeBlock이 문서 최상위 마지막 블록이면 TrailingBlockExtension이 항상
  // 그 뒤에 맨몸 paragraph를 붙여 둔다(endsWithChildlessParagraph가
  // firstChild 타입을 "paragraph"로만 인정, codeBlock은 항상 거절 →
  // trailing-block-extension.ts) — 그 경우 다음 형제 blockContainer가
  // 보장돼 divider input rule처럼 "형제 없으면 새로 만드는" 분기가
  // 필요 없다. 다만 이 불변식은 "문서 최상위 마지막"에만 적용된다 —
  // codeBlock이 들여쓴 blockGroup의 마지막 자식이거나(그 그룹 안엔 다음
  // 형제가 없음) 다음 형제가 blockContainer로 감싸이지 않는 divider/table
  // 이면 아래에서 그대로 물러난다(일반 개행 삽입으로 폴백).
  const containerEnd = tr.mapping.map($from.after(containerDepth));
  const nextSibling = tr.doc.resolve(containerEnd).nodeAfter;
  if (nextSibling === null || nextSibling.type.name !== "blockContainer") {
    return false;
  }
  tr.setSelection(TextSelection.create(tr.doc, containerEnd + 2));

  editor.view.dispatch(tr);
  return true;
}

function isEmptyCodeBlockCaret(state: EditorState): boolean {
  const { selection } = state;
  return (
    selection.empty &&
    selection.$from.parent.type.name === "codeBlock" &&
    selection.$from.parent.content.size === 0
  );
}

function deleteEmptyCodeBlock(editor: Editor): boolean {
  const derivedState = resolveSelectionAwareState(editor);
  const liveState = editor.state;
  const referenceState = isEmptyCodeBlockCaret(derivedState)
    ? derivedState
    : liveState;
  if (!isEmptyCodeBlockCaret(referenceState)) return false;

  const $from = referenceState.selection.$from;
  const containerDepth = $from.depth - 1;
  if (containerDepth < 0) return false;
  const container = $from.node(containerDepth);
  if (container.type.name !== "blockContainer") return false;

  // deleteBlock(generic-block-commands.ts)과 같은 가드 — blockGroup의
  // 유일한 자식이면 그 그룹째로 지운다. "문서 최상위 유일 블록" 가드는
  // 여기 없다: codeBlock은 위 exitCodeBlockOnDoubleEnter와 같은 이유로
  // 문서 최상위 마지막 블록일 때 TrailingBlockExtension이 항상 trailing
  // paragraph를 붙여 두므로, 이 codeBlock이 doc의 유일한 자식인 상태
  // 자체가 이 handler가 실행되는 시점엔 존재할 수 없다(도달 불가능한
  // 가드는 만들지 않는다 — 테스트로 고정할 수 없는 분기다).
  const parentDepth = containerDepth - 1;
  const parent = $from.node(parentDepth);
  const removesWholeGroup =
    parent.type.name === "blockGroup" && parent.childCount === 1;

  const deleteFrom = removesWholeGroup
    ? $from.before(parentDepth)
    : $from.before(containerDepth);
  const deleteTo = removesWholeGroup
    ? $from.after(parentDepth)
    : $from.after(containerDepth);

  editor.view.dispatch(closeHistory(liveState.tr.delete(deleteFrom, deleteTo)));
  return true;
}
