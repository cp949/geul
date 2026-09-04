import { type Editor, Extension } from "@tiptap/core";
import { isInTable } from "@tiptap/pm/tables";

import {
  moveBlockAdjacent,
  type MoveDirection,
} from "./block-move-commands.js";
import { nearestBlockContainerId } from "./block-position.js";
import { resolveSelectionAwareState } from "./selection-aware-state.js";

// block-type-keyboard-extension.ts의 setBlockTypeShortcut과 같은 골격이다
// — 표 셀 안이면 관여하지 않고(false, 표 자체 키맵에 양보), 표 밖이면
// 캐럿이 속한 blockContainer를 moveBlockAdjacent로 라우팅한다. 활성 블록
// 선택 범위(session.getBlockSelection())는 이 DELTA 범위 밖이다 —
// session 전용 private 상태라 키보드 shortcut 확장에서 아직 읽을 방법이
// 없다(RD-004.md "결정" (c), DELTA-02에서 해결).
const moveBlockShortcut = (
  editor: Editor,
  direction: MoveDirection,
): boolean => {
  const state = resolveSelectionAwareState(editor, {
    allowNativeTextSelectionFromCellSelection: true,
  });
  if (isInTable(state)) return false;

  const blockId = nearestBlockContainerId(state);
  if (blockId === null) return false;
  return moveBlockAdjacent(editor, blockId, direction);
};

// BlockNote 기본 단축키(roadmap.md "확인된 BlockNote 기본 단축키·입력
// 규칙 세트" 표) — Shift-Mod-ArrowUp/Down.
export const BlockMoveKeyboardExtension = Extension.create({
  name: "blockMoveKeyboard",

  addKeyboardShortcuts() {
    return {
      "Shift-Mod-ArrowUp": () => moveBlockShortcut(this.editor, "up"),
      "Shift-Mod-ArrowDown": () => moveBlockShortcut(this.editor, "down"),
    };
  },
});
