import { type Editor, Extension } from "@tiptap/core";
import { isInTable } from "@tiptap/pm/tables";

import {
  moveBlockAdjacent,
  moveBlockRangeAdjacent,
  type MoveDirection,
} from "./block-move-commands.js";
import { nearestBlockContainerId } from "./block-position.js";
import { resolveSelectionAwareState } from "./selection-aware-state.js";

// PM Selection과 독립된 session 전용 상태(production-editor-session.ts
// "ProductionEditorSession 자체 상태")라 구조적으로만 선언한다 — 그
// 파일이 이미 선언한 순환 의존 회피 관례(공개 BlockSelection 타입과
// 구조가 같지만 import하지 않음)를 이 확장·production-editor-assembly.ts
// 양쪽 옵션 타입에도 그대로 적용한다(export하지 않음, 각자 구조적 복제).
type ActiveBlockSelection = { fromBlockId: string; toBlockId: string };

type BlockMoveKeyboardOptions = {
  getBlockSelection: () => ActiveBlockSelection | null;
};

// block-type-keyboard-extension.ts의 setBlockTypeShortcut과 같은 골격이다
// — 표 셀 안이면 관여하지 않고(false, 표 자체 키맵에 양보), 표 밖이면
// 활성 블록 선택 범위가 있으면 그 범위 전체를, 없으면 캐럿이 속한
// blockContainer 하나를 이동한다(RD-004.md "결정" (c) — session이
// createProductionEditor 호출 전 준비돼 있어 생성자 안에서 캡처한 콜백을
// 이 확장 옵션으로 넘긴다, production-editor-session.ts·
// production-editor-assembly.ts 배선 참고).
const moveBlockShortcut = (
  editor: Editor,
  direction: MoveDirection,
  getBlockSelection: () => ActiveBlockSelection | null,
): boolean => {
  const state = resolveSelectionAwareState(editor, {
    allowNativeTextSelectionFromCellSelection: true,
  });
  if (isInTable(state)) return false;

  const activeSelection = getBlockSelection();
  if (activeSelection !== null) {
    return moveBlockRangeAdjacent(
      editor,
      activeSelection.fromBlockId,
      activeSelection.toBlockId,
      direction,
    );
  }

  const blockId = nearestBlockContainerId(state);
  if (blockId === null) return false;
  return moveBlockAdjacent(editor, blockId, direction);
};

// BlockNote 기본 단축키(roadmap.md "확인된 BlockNote 기본 단축키·입력
// 규칙 세트" 표) — Shift-Mod-ArrowUp/Down.
export const BlockMoveKeyboardExtension =
  Extension.create<BlockMoveKeyboardOptions>({
    name: "blockMoveKeyboard",

    // createId(TableKeyboardNavigationExtension)류와 달리 "선택 없음"이
    // 그 자체로 유효한 기본 상태라(RevisionGuardExtension의
    // canApplyDocumentChange와 같은 패턴) throw하지 않고 null을 반환하는
    // 안전한 기본값을 둔다 — 미설정 fixture(표 셀 가드 테스트 등)도 캐럿
    // 경로로 정상 동작한다.
    addOptions() {
      return { getBlockSelection: () => null };
    },

    addKeyboardShortcuts() {
      const getBlockSelection = this.options.getBlockSelection;
      return {
        "Shift-Mod-ArrowUp": () =>
          moveBlockShortcut(this.editor, "up", getBlockSelection),
        "Shift-Mod-ArrowDown": () =>
          moveBlockShortcut(this.editor, "down", getBlockSelection),
      };
    },
  });
