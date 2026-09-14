import { Extension, type Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment, type Node, type Schema } from "@tiptap/pm/model";
import {
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";

import { resolveSelectionAwareState } from "./selection-aware-state.js";

// codeBlock에서만 반응하는 Enter(double 개행 종료)·Shift-Enter(캐럿 위치
// 분할 종료, 사용자 요청 20260915)·Delete(빈 블록 삭제) 확장(RD-003
// DELTA-02, Shift-Enter는 그 이후 추가). 셋 다 BlockSplitExtension·
// BlockJoinExtension(priority 101)의 일반 Enter/Delete보다 먼저 실행해야
// 한다 — codeBlock이 아니거나 조건이 안 맞으면 false를 반환해 그
// 확장들에(그리고 그 확장들도 물러나면 Tiptap 코어 내장 Keymap 확장의
// newlineInCode 폴백에) 그대로 양보한다(CodeBlockMarkGuardExtension과 같은
// 이유로 priority 1_100). HardBreakKeyboardExtension은 codeBlock을
// allow-list에서 제외해 Shift-Enter를 그냥 통과시키므로 이 확장과 충돌하지
// 않는다.
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
      "Shift-Enter": () => splitCodeBlockOnShiftEnter(this.editor),
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

// Shift-Enter는 caret 위치에서 codeBlock을 둘로 나눠 탈출한다 — 위
// exitCodeBlockOnDoubleEnter와 달리 "다음 형제가 이미 존재해야 한다"는
// 전제가 없다: 항상 새 paragraph 형제를 만든다(사용자 요청 두 조건 —
// (1) 캐럿이 codeBlock을 탈출해 다음 블록으로 이동한다, (2) caret 이후
// 내용은 더 이상 codeBlock이 아니다). caret 앞부분은 원래 blockId·attrs
// (language·wrap·caption)를 유지한 codeBlock으로 남는다 — 비어 있어도
// 유지한다(caret이 맨 앞이어도 "caret 위치까지만 code block" 규칙을 그대로
// 지킨다, 사용자 결정). caret 뒷부분은 split 위치와 무관하게 항상
// paragraph다 — quote/heading을 쪼개는 BlockSplitExtension의 "끝 split만
// paragraph" 규칙과 달리, codeBlock은 모든 split 위치에서 뒷부분이
// codeBlock이 아니어야 한다는 요구가 있어서다. 범위 선택이면 먼저 지우고
// 그 지점에서 분할한다(block-split-extension.ts splitBlockContainer와 같은
// 순서 — 삭제와 분할을 한 tr에 쌓아 단일 dispatch·undo 단위를 유지한다).
function splitCodeBlockOnShiftEnter(editor: Editor): boolean {
  const { view } = editor;
  const liveState = view.state;
  const selectionAwareState = resolveSelectionAwareState(editor);
  const { selection } = selectionAwareState;

  if (selection.$from.parent.type.name !== "codeBlock") return false;

  const tr = liveState.tr;
  if (!selection.eq(liveState.selection)) {
    tr.setSelection(selection);
  }
  if (!selection.empty) {
    tr.deleteSelection();
  }

  if (!splitCodeBlockAtCaret(tr)) return false;

  view.dispatch(tr);
  return true;
}

// tr.selection(범위 선택이었다면 deleteSelection이 남긴 캐럿)과 tr.doc
// 기준으로 codeBlock 분할 step들을 같은 tr에 쌓는다. 가드 실패 시 false를
// 반환하고 tr에 아무 step도 추가하지 않는다 — dispatch 여부는 호출부가
// 결정한다. block-split-extension.ts splitAtCaret과 같은 컨테이너 재구성
// 패턴(containerStart/End, replaceWith, caret 위치 산술)을 쓰되, codeBlock은
// leafBlockContent라 자신의 blockContainer가 두 번째 자식(자기 nested
// blockGroup)을 가질 수 없어 그 existingGroup 분기가 없다 — 그래서 그
// 가능성을 방어적으로만 확인하고 물러난다.
function splitCodeBlockAtCaret(tr: Transaction): boolean {
  const { $from } = tr.selection;
  const contentNode = $from.parent;
  if (contentNode.type.name !== "codeBlock") return false;

  const containerDepth = $from.depth - 1;
  if (containerDepth < 0) return false;
  const container = $from.node(containerDepth);
  if (container.type.name !== "blockContainer") return false;
  if (container.childCount > 1) return false;

  const schema = contentNode.type.schema;
  const paragraphType = schema.nodes.paragraph;
  if (paragraphType === undefined) return false;

  const containerStart = $from.before(containerDepth);
  const containerEnd = $from.after(containerDepth);
  const splitOffset = $from.parentOffset;

  const beforeContent = contentNode.content.cut(0, splitOffset);
  const afterContent = contentNode.content.cut(splitOffset);

  const updatedContentNode = contentNode.type.create(
    contentNode.attrs,
    beforeContent,
    contentNode.marks,
  );
  const newContentNode = paragraphType.create(
    null,
    codeContentToInlineContent(schema, afterContent),
  );

  // 새 컨테이너는 blockId를 주지 않는다(null/미지정) — BlockIdExtension의
  // appendTransaction이 같은 dispatch 안에서 자동으로 채운다
  // (block-split-extension.ts와 같은 관례).
  const newContainer = container.type.create(null, newContentNode);

  const rebuiltContainer = container.type.create(
    container.attrs,
    Fragment.from(updatedContentNode),
  );
  const replacement = Fragment.from(rebuiltContainer).append(
    Fragment.from(newContainer),
  );

  tr.replaceWith(containerStart, containerEnd, replacement);

  // 커서를 새 블록(새 컨테이너 안 newContentNode) 텍스트 시작 위치로
  // 옮긴다 — block-split-extension.ts splitAtCaret과 같은 산술(existingGroup이
  // 없는 분기와 구조가 같다): containerStart + 1(컨테이너 진입) +
  // updatedContentNode.nodeSize(첫 자식) + 1(원본 컨테이너 종료) + 1(새
  // 컨테이너 진입) + 1(새 contentNode 진입) = 새 콘텐츠 시작.
  const newCaretPos =
    containerStart + 1 + updatedContentNode.nodeSize + 1 + 1 + 1;
  const resolvedCaret = tr.doc.resolve(
    Math.min(newCaretPos, tr.doc.content.size),
  );
  tr.setSelection(TextSelection.near(resolvedCaret));

  return true;
}

// codeBlock 텍스트 조각(리터럴 `\n` 포함 가능, marks 없음 — schema
// `marks: ""`)을 paragraph가 받는 inline 콘텐츠로 변환한다.
// model-to-tiptap.ts의 inlineContentToTiptap이 저장 모델 JSON 위에서 하는
// `\n→hardBreak` 분할과 같은 규칙을 살아있는 PM Fragment 위에서
// 재구현한다(paragraph content: "inline*"라 리터럴 개행을 담은 text
// 노드를 허용하지 않는다). 빈 세그먼트(연속 `\n`)는 text 노드를 만들지
// 않고 건너뛴다 — 원본 규칙과 동일.
function codeContentToInlineContent(schema: Schema, content: Fragment) {
  const hardBreakType = schema.nodes.hardBreak;
  let result = Fragment.empty;
  content.forEach((child: Node) => {
    const segments = (child.text ?? "").split("\n");
    segments.forEach((segment, index) => {
      if (segment.length > 0) {
        result = result.append(Fragment.from(schema.text(segment)));
      }
      if (index < segments.length - 1 && hardBreakType !== undefined) {
        result = result.append(Fragment.from(hardBreakType.create()));
      }
    });
  });
  return result;
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
