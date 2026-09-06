import {
  blockTypeDescriptorFromBlock,
  isKnownBlockType,
  type BlockTypeDescriptor,
  type BlockTypeSource,
} from "@cp949/geul-core";

import type { StoredBlock } from "./block-side-menu-types.js";

// Turn into의 권위는 DOM 투영이 아니라 최신 저장 document다. blockId를
// 안정 ID로 재귀 조회해 top-level·nested block이 같은 descriptor 경로를 쓴다.
// leaf 매핑(type→BlockTypeDescriptor) 자체는 core의 blockTypeDescriptorFromBlock이
// 소유한다(아키텍처 리뷰 6차 후보 L3) — 여기 남는 건 id 재귀 조회뿐이다.
export const findBlockTypeDescriptor = (
  blocks: readonly StoredBlock[],
  blockId: string,
): BlockTypeDescriptor | null => {
  for (const block of blocks) {
    if (block.id === blockId) {
      // top-level CustomBlock(model, RD-002-DELTA-01)의 서술자는 아직 없다
      // (registry는 RD-002-DELTA-11) — "찾지 못함"과 동일하게 취급한다
      // (core의 generic-block-commands.ts와 같은 패턴).
      if (!isKnownBlockType(block.type)) return null;
      return blockTypeDescriptorFromBlock(block as BlockTypeSource);
    }
    if ("children" in block && block.children !== undefined) {
      const nested = findBlockTypeDescriptor(block.children, blockId);
      if (nested !== null) return nested;
    }
  }
  return null;
};
