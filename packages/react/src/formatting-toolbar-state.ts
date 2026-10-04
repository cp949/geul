import type { BlockTypeDescriptor, SelectionQuery } from "@cp949/geul-core";

import { blockTypeToOptionId } from "./block-type-options.js";

export type SelectionMark = ReturnType<
  SelectionQuery["getSelectionMarks"]
>[number];

export type FormattingToolbarState = {
  activeMarks: SelectionMark[];
  blockSelection: { blockId: string; blockType: BlockTypeDescriptor } | null;
  // 여러 블록에 걸친 텍스트 선택. blockSelection이 null이고 닿은 블록이
  // 둘 이상일 때만 채운다. blockType은 모든 블록이 같은 타입일 때만 값이고
  // 섞여 있으면 null이다. 들여쓰기·내어쓰기는 이 선택에 적용하지 않는다.
  multiBlockSelection: {
    blockIds: string[];
    blockType: BlockTypeDescriptor | null;
  } | null;
  nestingActions: { canIndent: boolean; canOutdent: boolean } | null;
  isMediaBlockSelected: boolean;
  isCellRangeSelected: boolean;
  // 선택이 codeBlock 문자 구간과 겹치는지. core mark 명령의 거절 조건과
  // 같은 판정이라 여러 블록에 걸친 선택도 포함한다. 끝점만 닿는 선택은
  // false다.
  selectionIntersectsCodeBlock: boolean;
};

const computeMultiBlockSelection = (
  editor: SelectionQuery,
): FormattingToolbarState["multiBlockSelection"] => {
  const blocks = editor.getSelectionBlocks();
  const [first] = blocks;
  if (first === undefined || blocks.length < 2) return null;
  const isUniform = blocks.every(
    ({ blockType }) =>
      blockTypeToOptionId(blockType) === blockTypeToOptionId(first.blockType),
  );
  return {
    blockIds: blocks.map(({ blockId }) => blockId),
    blockType: isUniform ? first.blockType : null,
  };
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
  editor: SelectionQuery,
): FormattingToolbarState => {
  const blockSelection = editor.getSelectionBlockType();
  const isMediaBlockSelected = editor.getSelectionMediaBlock() !== null;
  const isCellRangeSelected = editor.isCellRangeSelected();
  return {
    activeMarks: editor.getSelectionMarks(),
    blockSelection,
    multiBlockSelection:
      blockSelection === null && !isMediaBlockSelected && !isCellRangeSelected
        ? computeMultiBlockSelection(editor)
        : null,
    nestingActions:
      blockSelection === null
        ? null
        : editor.getBlockNestingActionState(blockSelection.blockId),
    isMediaBlockSelected,
    isCellRangeSelected,
    selectionIntersectsCodeBlock: editor.selectionIntersectsCodeBlock(),
  };
};
