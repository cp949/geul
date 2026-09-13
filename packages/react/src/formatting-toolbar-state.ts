import type { BlockTypeDescriptor, EditorController } from "@cp949/geul-core";

export type SelectionMark = ReturnType<
  EditorController["getSelectionMarks"]
>[number];

export type FormattingToolbarState = {
  activeMarks: SelectionMark[];
  blockSelection: { blockId: string; blockType: BlockTypeDescriptor } | null;
  nestingActions: { canIndent: boolean; canOutdent: boolean } | null;
  isMediaBlockSelected: boolean;
  isCellRangeSelected: boolean;
};

/**
 * 현재 selection 기준으로 서식 관련 상태(활성 mark, 블록 타입, 들여쓰기
 * 가능 여부, 미디어 블록·표 셀 다중선택 여부)만 순수 계산한다. 언제 이
 * 값으로 툴바를 보여줄지·숨길지(hide 판정), 위치를 어떻게 잡을지는
 * 호출부 책임이다 — `FormattingToolbar`(선택 기반 hide + 플로팅 위치)와
 * `StaticToolbar`(상시 렌더 + disable)가 이 계산 하나를 공유하면서도
 * 서로 다른 표시 정책을 가질 수 있는 이유다(RD-001-DELTA-01).
 */
export const computeFormattingToolbarState = (
  editor: EditorController,
): FormattingToolbarState => {
  const blockSelection = editor.getSelectionBlockType();
  return {
    activeMarks: editor.getSelectionMarks(),
    blockSelection,
    nestingActions:
      blockSelection === null
        ? null
        : editor.getBlockNestingActionState(blockSelection.blockId),
    isMediaBlockSelected: editor.getSelectionMediaBlock() !== null,
    isCellRangeSelected: editor.isCellRangeSelected(),
  };
};
