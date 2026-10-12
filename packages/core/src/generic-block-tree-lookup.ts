import type { Block, DocumentBlock, Result } from "@cp949/geul-model";

import { modelBlockTreeAdapter } from "./block-tree-adapters.js";
import { locateBlock, resolveSiblingRange } from "./block-tree-query.js";
import type { EditorError } from "./errors.js";
import { commandNotApplicable } from "./production-editor-session.js";

// 이 함수를 쓰는 generic-block-*-commands.ts 계열 명령(setBlockType 등)은
// 모두 알려진 14종 전용 계약이다 — blockId가 top-level CustomBlock(top-level
// 전용, RD-002-DELTA-01)을 가리키면 "찾지 못함"과 동일하게 처리한다
// (block-tree-edit.ts의 updateBlockInTree와 같은 근거). 반환 타입은 그대로
// Block 기반이라 이 함수 밖 ~20곳 호출부는 변경이 필요 없다.
export const findBlockEntryInTree = (
  blocks: readonly DocumentBlock[],
  blockId: string,
): {
  block: Block;
  siblings: readonly Block[];
  index: number;
  depth: number;
} | null => {
  const location = locateBlock(modelBlockTreeAdapter(blocks), blockId);
  if (location === null) return null;
  return {
    block: location.node as Block,
    siblings: location.siblings as readonly Block[],
    index: location.index,
    depth: location.depth,
  };
};

// Issue #125 D2 — beforeBlockId가 ancestorBlock 자신의 하위 트리 안(자손)에
// 있는지 재귀로 판정한다. moveBlockBefore가 자기 자손 앞으로 이동을
// mutation 전에 거절하는 데만 쓴다 — ancestorBlock 자신은 포함하지 않는다
// (자기 자신 이동은 기존 no-op 판정이 별도로 잡는다).
export const isDescendantOfBlock = (
  ancestorBlock: Block,
  candidateId: string,
): boolean => {
  if (!("children" in ancestorBlock) || ancestorBlock.children === undefined) {
    return false;
  }
  for (const child of ancestorBlock.children) {
    if (child.id === candidateId) return true;
    if (isDescendantOfBlock(child, candidateId)) return true;
  }
  return false;
};

export type BlockSelectionRangeResolution = {
  siblings: readonly Block[];
  startIndex: number;
  endIndex: number;
  rangeBlocks: readonly Block[];
};

// blockSelection이 가리키는 fromBlockId/toBlockId를 현재 documentBlocks에서
// 다시 찾아 범위를 확정한다. deleteSelectedBlocks·moveSelectedBlocksBefore가
// 호출 시점마다 공유하는 mutation 전 판정이다(DELTA-02 완료 조건 13) —
// blockSelection은 runDocumentCommand를 거치지 않는 세션 필드라 외부 명령
// (예: indentBlock으로 범위 안 블록이 다른 부모로 옮겨짐, 또는 deleteBlock으로
// 범위 안 블록이 사라짐)이 stale하게 만들 수 있다. blockId 자체가
// 사라졌으면 BLOCK_NOT_FOUND, 더 이상 같은 부모 형제가 아니면
// COMMAND_NOT_APPLICABLE로 구분한다. findBlockEntryInTree처럼 순수
// 함수로 두어 session 없이도 테스트하기 쉽게 한다.
export const resolveBlockSelectionRange = (
  documentBlocks: readonly DocumentBlock[],
  selection: { fromBlockId: string; toBlockId: string },
  command: string,
): Result<BlockSelectionRangeResolution, EditorError> => {
  const range = resolveSiblingRange(
    modelBlockTreeAdapter(documentBlocks),
    selection.fromBlockId,
    selection.toBlockId,
  );
  if (!range.ok) {
    return range.reason === "not-found"
      ? {
          ok: false,
          error: { code: "BLOCK_NOT_FOUND", blockId: range.blockId },
        }
      : commandNotApplicable(command);
  }
  const { siblings, startIndex, endIndex, nodes } = range.value;
  return {
    ok: true,
    value: {
      siblings: siblings as readonly Block[],
      startIndex,
      endIndex,
      rangeBlocks: nodes as readonly Block[],
    },
  };
};
