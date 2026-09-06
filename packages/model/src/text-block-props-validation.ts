import { isNestableBlockType, type NestableBlockType } from "./block-kind.js";
import { isCanonicalCellAlign } from "./cell-align.js";
import { isCanonicalCellColor } from "./cell-color.js";
import { invalid, type DocumentPath } from "./document-validation-helpers.js";
import type { DocumentError } from "./errors.js";
import type { Result } from "./result.js";
import type { Block, DocumentBlock } from "./types.js";

// TextBlockProps(textColor/backgroundColor/textAlignment) 정규형 검증이다.
// validateCells(table-block-validation.ts)와 같은 이유로 별도 순회 함수로
// 둔다 — document-structure-validation.ts의 validateBlocksAt은 구조
// 불변식(id 유일성·content·heading 교차 필드)을 판정하는 자리이고, 이
// 함수는 표 셀 색상·정렬 검증과 같은 "타입값 정규형" 범주다. 대상은
// isNestableBlockType으로 좁힌 7개 타입뿐이다(table/divider/codeBlock은
// 이 필드 자체를 zod 스키마가 선언하지 않아 이미 DOCUMENT_INVALID로
// 거절된다). 재귀는 nestable children을 따라간다 — 깊이 상한은
// validateNestingDepth가 이미 보장한다.
const validateTextBlockPropsAt = (
  blocks: DocumentBlock[],
  path: DocumentPath,
): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    const blockPath = [...path, blockIndex];
    if (!isNestableBlockType(block.type)) continue;
    const nestable = block as Extract<Block, { type: NestableBlockType }>;

    if (
      nestable.textColor !== undefined &&
      !isCanonicalCellColor(nestable.textColor)
    ) {
      return invalid(
        [...blockPath, "textColor"],
        "textColor must be an uppercase #RRGGBB color",
      );
    }
    if (
      nestable.backgroundColor !== undefined &&
      !isCanonicalCellColor(nestable.backgroundColor)
    ) {
      return invalid(
        [...blockPath, "backgroundColor"],
        "backgroundColor must be an uppercase #RRGGBB color",
      );
    }
    if (
      nestable.textAlignment !== undefined &&
      !isCanonicalCellAlign(nestable.textAlignment)
    ) {
      return invalid(
        [...blockPath, "textAlignment"],
        "textAlignment must be one of left, center, right",
      );
    }

    if (nestable.children !== undefined) {
      const children = validateTextBlockPropsAt(nestable.children, [
        ...blockPath,
        "children",
      ]);
      if (!children.ok) return children;
    }
  }
  return { ok: true, value: undefined };
};

export const validateTextBlockProps = (
  blocks: DocumentBlock[],
): Result<undefined, DocumentError> =>
  validateTextBlockPropsAt(blocks, ["blocks"]);
