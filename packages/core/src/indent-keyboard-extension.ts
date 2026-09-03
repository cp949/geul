import type { Result } from "@cp949/geul-model";
import { type Editor, Extension } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { EditorState } from "@tiptap/pm/state";
import { isInTable } from "@tiptap/pm/tables";

import { nearestBlockContainerId } from "./block-position.js";
import type { EditorError } from "./errors.js";
import { indentBlockCommand, outdentBlockCommand } from "./indent-commands.js";
import { resolveSelectionAwareState } from "./selection-aware-state.js";

// CodeBlock Tab 계약은 빈 TextSelection(caret)에만 적용한다. DOM 기준으로
// 재계산한 selection이 codeBlock의 직접 content 안인지 판정한다.
const isCodeBlockCaret = (state: EditorState): boolean =>
  state.selection.empty &&
  state.selection.$from.parent.type.name === "codeBlock";

// selection-only 파생 state와 live state가 같은 doc 참조를 공유할 때
// 파생 state에서 공백 2개 삽입 transaction을 만들어 실제 view에 한
// 번만 dispatch한다. closeHistory로 한 Tab을 하나의 undo 단위로 닫는다.
const insertCodeBlockIndent = (editor: Editor, state: EditorState): boolean => {
  if (state.doc !== editor.view.state.doc) return false;
  const transaction = state.tr.insertText("  ", state.selection.from);
  editor.view.dispatch(closeHistory(transaction));
  return true;
};

// 표 셀 안이면 표 셀 탐색(TableKeyboardNavigationExtension)에 양보하고
// (false), 표 밖이면 캐럿이 속한 blockContainer를 대상으로 command를
// 호출한다. command가 성공한 경우에만 true를 반환해 키 이벤트를 소비한다.
// 적용할 block이 없거나 command가 COMMAND_NOT_APPLICABLE 등으로 실패하면
// false를 반환해 브라우저 기본 순차 포커스 이동을 허용한다.
const routeToBlockCommand = (
  editor: Editor,
  command: (editor: Editor, blockId: string) => Result<void, EditorError>,
  codeBlockAction: "insert" | "pass",
): boolean => {
  const state = resolveSelectionAwareState(editor, {
    allowNativeTextSelectionFromCellSelection: true,
  });
  if (isInTable(state)) return false;
  if (isCodeBlockCaret(state)) {
    return codeBlockAction === "insert"
      ? insertCodeBlockIndent(editor, state)
      : false;
  }

  const blockId = nearestBlockContainerId(state);
  if (blockId === null) return false;
  return command(editor, blockId).ok;
};

export const indentBlockShortcut = (editor: Editor): boolean =>
  routeToBlockCommand(editor, indentBlockCommand, "insert");

export const outdentBlockShortcut = (editor: Editor): boolean =>
  routeToBlockCommand(editor, outdentBlockCommand, "pass");

// 표 밖 Tab/Shift+Tab을 indentBlockCommand/outdentBlockCommand로 라우팅한다
// (spec §5.2 Tab 3분기 중 "그 외 → indent/outdent" 분기). 옵션이 없다 — 두
// 명령 모두 createId를 쓰지 않는다. Tiptap 3.30.1은 같은 priority에서 나중
// 등록된 확장의 keymap을 먼저 실행하므로(sortExtensions(...).reverse()) 이
// 확장과 TableKeyboardNavigationExtension의 등록 순서는 정확성을 보장하지
// 않는다 — 이 확장은 자체 isInTable 가드로 정확성을 보장하므로 등록 순서에
// 기대지 않는다(Ruling D4).
export const IndentKeyboardExtension = Extension.create({
  name: "indentKeyboard",

  addKeyboardShortcuts() {
    return {
      Tab: () => indentBlockShortcut(this.editor),
      "Shift-Tab": () => outdentBlockShortcut(this.editor),
    };
  },
});
