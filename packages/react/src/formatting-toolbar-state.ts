import type {
  BlockTypeBlocker,
  BlockTypeDescriptor,
  SelectionQuery,
} from "@cp949/geul-core";

import {
  BLOCK_TYPE_OPTIONS,
  blockTypeToOptionId,
  type BlockTypeBlockers,
} from "./block-type-options.js";

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
  // 텍스트 없는 atom 블록(구분선·미디어·customBlock)이 NodeSelection으로
  // 선택됐는지. mark·색상·link를 적용할 텍스트가 없다(Issue #242).
  isAtomBlockSelected: boolean;
  isCellRangeSelected: boolean;
  // 선택이 codeBlock 문자 구간과 겹치는지. core mark 명령의 거절 조건과
  // 같은 판정이라 여러 블록에 걸친 선택도 포함한다. 끝점만 닿는 선택은
  // false다.
  selectionIntersectsCodeBlock: boolean;
  // 블록 타입 옵션 id별 core 변환 거절 사유(Issue #245). 단일 블록이면
  // getBlockTypeBlocker, 여러 블록 선택이면 getBlockTypesBlocker 결과다.
  // 대상 블록이 없으면 빈 객체다. 탭 입력처럼 블록 타입이 그대로인 문서
  // 변경도 사유를 바꾸므로 상태 동등 비교에 포함한다.
  blockTypeBlockers: BlockTypeBlockers;
};

const computeBlockTypeBlockers = (
  editor: SelectionQuery,
  blockSelection: FormattingToolbarState["blockSelection"],
  multiBlockSelection: FormattingToolbarState["multiBlockSelection"],
): BlockTypeBlockers => {
  const blockers: Record<string, BlockTypeBlocker | null> = {};
  if (blockSelection !== null) {
    for (const option of BLOCK_TYPE_OPTIONS) {
      blockers[option.id] = editor.getBlockTypeBlocker(
        blockSelection.blockId,
        option.blockType,
      );
    }
  } else if (multiBlockSelection !== null) {
    for (const option of BLOCK_TYPE_OPTIONS) {
      blockers[option.id] = editor.getBlockTypesBlocker(
        multiBlockSelection.blockIds,
        option.blockType,
      );
    }
  }
  return blockers;
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
 * 가능 여부, atom 블록·표 셀 다중선택 여부)만 순수 계산한다. 언제 이
 * 값으로 툴바를 보여줄지·숨길지(hide 판정), 위치를 어떻게 잡을지는
 * 호출부 책임이다 — `FormattingToolbar`(선택 기반 hide + 플로팅 위치)와
 * `StaticToolbar`(상시 렌더 + disable)가 이 계산 하나를 공유하면서도
 * 서로 다른 표시 정책을 가질 수 있는 이유다(RD-001-DELTA-01).
 */
export const computeFormattingToolbarState = (
  editor: SelectionQuery,
): FormattingToolbarState => {
  const blockSelection = editor.getSelectionBlockType();
  const isAtomBlockSelected = editor.isAtomBlockSelected();
  const isCellRangeSelected = editor.isCellRangeSelected();
  const multiBlockSelection =
    blockSelection === null && !isAtomBlockSelected && !isCellRangeSelected
      ? computeMultiBlockSelection(editor)
      : null;
  return {
    activeMarks: editor.getSelectionMarks(),
    blockSelection,
    multiBlockSelection,
    nestingActions:
      blockSelection === null
        ? null
        : editor.getBlockNestingActionState(blockSelection.blockId),
    isAtomBlockSelected,
    isCellRangeSelected,
    selectionIntersectsCodeBlock: editor.selectionIntersectsCodeBlock(),
    blockTypeBlockers: computeBlockTypeBlockers(
      editor,
      blockSelection,
      multiBlockSelection,
    ),
  };
};
