import { isKnownBlockType } from "./block-schema.js";
import type { DocumentPath } from "./document-validation-helpers.js";
import type { DocumentError } from "./errors.js";
import type { Result } from "./result.js";
import type { Block, DocumentBlock, TableBlock } from "./types.js";

// 표 전용 검증(열 너비·셀 속성·크기 상한·격자, table-block-validation.ts)이
// 트리 전체에서 같은 규칙으로 적용되게 하는 단일 순회 지점이다 — 최상위
// 배열만 돌면 paragraph/heading/quote의 children으로 들어간 표(스키마·
// indentBlock이 허용하는 배치)가 네 검증을 통째로 우회한다. 깊이 상한은
// validateNestingDepth가 이미 보장하므로 이 재귀는 상수 깊이 안에서 끝난다.
export const visitTableBlocks = (
  blocks: DocumentBlock[],
  path: DocumentPath,
  visit: (
    table: TableBlock,
    tablePath: DocumentPath,
  ) => Result<undefined, DocumentError>,
): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    const blockPath = [...path, blockIndex];
    // CustomBlock(top-level 전용)은 table도 children도 없는 리프다 —
    // document-structure-validation.ts의 validateBlocksAt과 같은 이유로
    // known: Block 캐스트 전에 걸러낸다.
    if (!isKnownBlockType(block.type)) continue;
    const known = block as Block;
    if (known.type === "table") {
      const result = visit(known, blockPath);
      if (!result.ok) return result;
      continue;
    }
    // divider·codeBlock·4종 미디어 블록은 children 필드가 없는 리프다 —
    // 나머지(paragraph/heading/quote/목록 항목)만 children으로 내려간다.
    if (
      known.type === "divider" ||
      known.type === "codeBlock" ||
      known.type === "file" ||
      known.type === "image" ||
      known.type === "video" ||
      known.type === "audio"
    )
      continue;
    if (known.children !== undefined) {
      const children = visitTableBlocks(
        known.children,
        [...blockPath, "children"],
        visit,
      );
      if (!children.ok) return children;
    }
  }
  return { ok: true, value: undefined };
};
