import { type Editor, Extension } from "@tiptap/core";
import { isInTable } from "@tiptap/pm/tables";

import { nearestBlockContainerId } from "./block-position.js";
import {
  type BlockTypeConversionDescriptor,
  setBlockTypeCommand,
} from "./block-type-commands.js";
import { resolveSelectionAwareState } from "./selection-aware-state.js";

// IndentKeyboardExtension의 routeToBlockCommand와 같은 구조다 — 표 셀
// 안이면 관여하지 않고(false, 표 자체 키맵에 양보), 표 밖이면 캐럿이 속한
// blockContainer를 setBlockTypeCommand로 라우팅한다. blockId가 없거나
// command가 BLOCK_NOT_FOUND/COMMAND_NOT_APPLICABLE로 실패하면(codeBlock·
// divider 캐럿, 이미 같은 타입 등) false를 반환해 브라우저 기본 동작에
// 양보한다.
export const setBlockTypeShortcut = (
  editor: Editor,
  descriptor: BlockTypeConversionDescriptor,
): boolean => {
  const state = resolveSelectionAwareState(editor, {
    allowNativeTextSelectionFromCellSelection: true,
  });
  if (isInTable(state)) return false;

  const blockId = nearestBlockContainerId(state);
  if (blockId === null) return false;
  return setBlockTypeCommand(editor, blockId, descriptor).ok;
};

// 캐럿 블록 타입 변환 12개 단축키(spec 각주 재확인 원본은 roadmap.md
// "확인된 BlockNote 기본 단축키·입력 규칙 세트" — BlockNote 원본
// KeyboardShortcutsExtension·각 블록 block.ts를 참조만 하고 코드는 복제하지
// 않는다, MPL 경계). paragraph/heading 1-6/quote/목록 4종만 대상이라
// codeBlock·divider·table은 setBlockTypeCommand의 isNestableBlockType
// 가드로 자연히 제외된다.
export const BlockTypeKeyboardExtension = Extension.create({
  name: "blockTypeKeyboard",

  addKeyboardShortcuts() {
    const shortcut =
      (descriptor: BlockTypeConversionDescriptor) => (): boolean =>
        setBlockTypeShortcut(this.editor, descriptor);

    return {
      "Mod-Alt-0": shortcut({ type: "paragraph" }),
      "Mod-Alt-1": shortcut({ type: "heading", level: 1 }),
      "Mod-Alt-2": shortcut({ type: "heading", level: 2 }),
      "Mod-Alt-3": shortcut({ type: "heading", level: 3 }),
      "Mod-Alt-4": shortcut({ type: "heading", level: 4 }),
      "Mod-Alt-5": shortcut({ type: "heading", level: 5 }),
      "Mod-Alt-6": shortcut({ type: "heading", level: 6 }),
      "Mod-Alt-q": shortcut({ type: "quote" }),
      "Mod-Shift-6": shortcut({ type: "toggleListItem" }),
      "Mod-Shift-7": shortcut({ type: "numberedListItem" }),
      "Mod-Shift-8": shortcut({ type: "bulletListItem" }),
      "Mod-Shift-9": shortcut({ type: "checkListItem" }),
    };
  },
});
