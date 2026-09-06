import { isNestableBlockType, type NestableBlockType } from "./block-kind.js";
import { isKnownBlockType } from "./block-schema.js";
import { canonicalizeCodeBlockLanguage } from "./code-block.js";
import type { Block, DocumentBlock } from "./types.js";

export const canonicalizeCodeBlockLanguages = (
  blocks: DocumentBlock[],
): void => {
  for (const block of blocks) {
    // CustomBlock(top-level 전용)에는 language/children 필드 자체가 없다 —
    // document-structure-validation.ts의 validateBlocksAt과 같은 이유로
    // known: Block 캐스트 전에 걸러낸다.
    if (!isKnownBlockType(block.type)) continue;
    const known = block as Block;
    if (known.type === "codeBlock") {
      if (known.language !== undefined) {
        known.language = canonicalizeCodeBlockLanguage(known.language);
      }
      continue;
    }
    if (isNestableBlockType(known.type)) {
      const children = (known as Extract<Block, { type: NestableBlockType }>)
        .children;
      if (children !== undefined) canonicalizeCodeBlockLanguages(children);
    }
  }
};
