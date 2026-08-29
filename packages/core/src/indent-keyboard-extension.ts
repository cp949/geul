import type { Result } from "@cp949/geul-model";
import { type Editor, Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { isInTable } from "@tiptap/pm/tables";

import type { EditorError } from "./errors.js";
import { indentBlockCommand, outdentBlockCommand } from "./indent-commands.js";
import { resolveSelectionAwareState } from "./selection-aware-state.js";

// 캐럿(state.selection.$from)에서 가장 가까운 blockContainer 조상의
// blockId를 찾는다. depth 역순으로 올라가며 첫 blockContainer를 찾으면 그
// attrs.blockId를 반환한다 — 스키마상 blockContainer는 항상 유효한
// blockId를 갖지만 방어적으로 없으면 null이다.
const nearestBlockContainerId = (state: EditorState): string | null => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "blockContainer") {
      const blockId = node.attrs.blockId;
      return typeof blockId === "string" && blockId.length > 0 ? blockId : null;
    }
  }
  return null;
};

// CodeBlock은 RD-004 전 Tab/Shift+Tab 편집 의미가 아직 없다. DOM 기준으로
// 재계산한 selection의 직접 textblock이 CodeBlock이면 일반 indent/outdent
// router로 넘기지 않고 키를 소비한다. selection-only 파생 state도 실제
// dispatch하지 않으므로 document·selection·history가 모두 그대로다.
const isCodeBlockSelection = (state: EditorState): boolean =>
  state.selection.$from.parent.type.name === "codeBlock";

// 표 셀 안이면 표 셀 탐색(TableKeyboardNavigationExtension)에 양보하고
// (false), 표 밖이면 캐럿이 속한 blockContainer를 대상으로 command를
// 호출한다. command가 성공한 경우에만 true를 반환해 키 이벤트를 소비한다.
// 적용할 block이 없거나 command가 COMMAND_NOT_APPLICABLE 등으로 실패하면
// false를 반환해 브라우저 기본 순차 포커스 이동을 허용한다.
const routeToBlockCommand = (
  editor: Editor,
  command: (editor: Editor, blockId: string) => Result<void, EditorError>,
): boolean => {
  const state = resolveSelectionAwareState(editor);
  if (isInTable(state)) return false;
  if (isCodeBlockSelection(state)) return true;

  const blockId = nearestBlockContainerId(state);
  if (blockId === null) return false;
  return command(editor, blockId).ok;
};

export const indentBlockShortcut = (editor: Editor): boolean =>
  routeToBlockCommand(editor, indentBlockCommand);

export const outdentBlockShortcut = (editor: Editor): boolean =>
  routeToBlockCommand(editor, outdentBlockCommand);

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
