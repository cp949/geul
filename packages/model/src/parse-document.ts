// model의 문서 파싱 단일 진입점이다. 원시 unknown 입력 → 방어적 깊이 검사
// (document-nesting-depth.ts) → zod shape 검증(block-schema.ts) → 구조
// 불변식(document-structure-validation.ts) → 표/텍스트 정규형 검증
// (table-block-validation.ts, text-block-props-validation.ts) → codeBlock
// language 정규화(code-block-language-canonicalization.ts) 순으로 조립만
// 한다. 각 단계의 판정 로직은 해당 파일이 소유하고 여기서 재구현하지
// 않는다(ADR-0011).
import { blockOrCustomBlockSchema, documentSchema } from "./block-schema.js";
import { canonicalizeCodeBlockLanguages } from "./code-block-language-canonicalization.js";
import { validateNestingDepth } from "./document-nesting-depth.js";
import { validateBlocks } from "./document-structure-validation.js";
import { documentPath, invalid } from "./document-validation-helpers.js";
import type { DocumentError } from "./errors.js";
import { inlineContentItemSchema } from "./inline-content-schema.js";
import type { Result } from "./result.js";
import {
  validateCells,
  validateColumnWidths,
  validateTableGrids,
  validateTableLimits,
} from "./table-block-validation.js";
import { validateTextBlockProps } from "./text-block-props-validation.js";
import type {
  Block,
  CustomBlock,
  Document,
  InlineContentItem,
} from "./types.js";

export const parseDocument = (
  input: unknown,
): Result<Document, DocumentError> => {
  const depth = validateNestingDepth(input);
  if (!depth.ok) return depth;

  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: documentPath(issue?.path ?? []),
        message: issue?.message ?? "Invalid document",
      },
    };
  }

  const document = parsed.data as Document;
  if (document.formatVersion !== 1) {
    return {
      ok: false,
      error: {
        code: "DOCUMENT_FORMAT_UNSUPPORTED",
        path: ["formatVersion"],
        message: `Unsupported format version: ${document.formatVersion}`,
      },
    };
  }
  if (!Number.isSafeInteger(document.revision) || document.revision < 0) {
    return invalid(
      ["revision"],
      "Revision must be a non-negative safe integer",
    );
  }

  const structure = validateBlocks(document.blocks);
  if (!structure.ok) return structure;

  const widths = validateColumnWidths(document.blocks);
  if (!widths.ok) return widths;
  const cells = validateCells(document.blocks);
  if (!cells.ok) return cells;
  const textBlockProps = validateTextBlockProps(document.blocks);
  if (!textBlockProps.ok) return textBlockProps;
  const limits = validateTableLimits(document.blocks);
  if (!limits.ok) return limits;
  const grids = validateTableGrids(document.blocks);
  if (!grids.ok) return grids;

  canonicalizeCodeBlockLanguages(document.blocks);

  return { ok: true, value: document };
};

// CustomBlock(EXT-001)의 단일 진입점이다. Document/parseDocument는 아직 이
// 라우팅을 쓰지 않는다 — Document.blocks를 넓히면 core/react/io의 기존
// Block[] 소비처가 즉시 깨진다(2026-09-06 grep 72곳). core에 customBlocks
// registry를 실제로 배선하는 RD-002가 그 소비처들을 함께 넓힌다
// (RD-001-DELTA-01 "설계 결정", _works/roadmap/RD-002.md). id 유일성 등
// 문서 전체 검증(validateBlocksAt)도 아직 배선하지 않는다 — 이 함수는
// envelope(구조) 검증만 한다.
export const parseBlockOrCustomBlock = (
  input: unknown,
): Result<Block | CustomBlock, DocumentError> => {
  const parsed = blockOrCustomBlockSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: documentPath(issue?.path ?? []),
        message: issue?.message ?? "Invalid block",
      },
    };
  }
  return { ok: true, value: parsed.data };
};

// InlineContentItem(EXT-002)/CustomTextMark(EXT-003)의 단일 진입점이다.
// parseBlockOrCustomBlock과 같은 이유로 기존 InlineContent/inlineContentSchema는
// 아직 바꾸지 않는다 — RD-002가 core registry를 배선할 때 함께 넓힌다.
export const parseInlineContentItem = (
  input: unknown,
): Result<InlineContentItem, DocumentError> => {
  const parsed = inlineContentItemSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: documentPath(issue?.path ?? []),
        message: issue?.message ?? "Invalid inline content item",
      },
    };
  }
  return { ok: true, value: parsed.data };
};
