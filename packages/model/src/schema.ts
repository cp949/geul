import { z } from "zod";

import { isNestableBlockType, type NestableBlockType } from "./block-kind.js";
import { isCanonicalCellAlign } from "./cell-align.js";
import { isCanonicalCellColor } from "./cell-color.js";
import {
  canonicalizeCodeBlockLanguage,
  isValidCodeBlockLanguage,
  isValidCodeBlockSource,
} from "./code-block.js";
import type { DocumentError } from "./errors.js";
import { isSupportedLinkHref } from "./link-policy.js";
import {
  firstNonCanonicalTextMarkIndex,
  PLAIN_TEXT_MARK_TYPES,
} from "./mark-canonicalization.js";
import type { Result } from "./result.js";
import { isValidDocumentId, isValidInlineText } from "./string-invariants.js";
import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  tableSizeViolationMessage,
  validateTableGrid,
  validateTableSize,
} from "./table-grid-validation.js";
import type { Block, Document, InlineContent, TableBlock } from "./types.js";

type DocumentPath = Array<string | number>;

const textMarkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(PLAIN_TEXT_MARK_TYPES) }),
  z.object({ type: z.literal("link"), href: z.string() }),
]);

const inlineContentSchema = z.array(
  z.object({
    text: z.string(),
    marks: z.array(textMarkSchema).optional(),
  }),
);

// .strict() — TableBlock은 children을 허용하지 않는다(spec 2.2, D15). 스키마가
// children 키를 선언하지 않은 채 기본 z.object()로 두면 미선언 키를 조용히
// 제거해 하위 블록이 무음 유실된다 — strict()로 미선언 키를 파싱 실패로
// 승격시켜 완료 조건 5의 DOCUMENT_INVALID 거절을 zod 파싱 단계에서 확보한다.
const tableBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("table"),
    columns: z.array(z.object({ id: z.string(), width: z.number() })),
    rows: z.array(
      z.object({
        id: z.string(),
        cells: z.array(
          z.object({
            id: z.string(),
            columnId: z.string(),
            rowSpan: z.number(),
            columnSpan: z.number(),
            content: inlineContentSchema,
            textColor: z.string().optional(),
            backgroundColor: z.string().optional(),
            align: z.string().optional(),
          }),
        ),
      }),
    ),
    headerRows: z.union([z.literal(0), z.literal(1)]),
    headerColumns: z.union([z.literal(0), z.literal(1)]),
  })
  .strict();

// .strict() — DividerBlock은 콘텐츠도 children도 없는 리프다(spec §4.2). 기본
// z.object()는 미선언 키(content·children)를 에러 없이 조용히 제거해 구분선에
// 실려 온 하위 블록·텍스트가 무음 유실된다 — strict()로 미선언 키를 파싱
// 실패로 승격시켜 DOCUMENT_INVALID 거절을 zod 파싱 단계에서 확보한다.
const dividerBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("divider"),
  })
  .strict();

const codeBlockContentSchema = z
  .array(
    z
      .object({
        text: z.string(),
      })
      .strict(),
  )
  .max(1);

const codeBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("codeBlock"),
    language: z.string().optional(),
    content: codeBlockContentSchema,
  })
  .strict();

// paragraph/heading/quoteBlockSchema는 children으로 blockSchema를 재귀 참조한다.
// discriminatedUnion이 멤버 스키마의 구체 ZodObject 모양(리터럴 판별 필드)을
// 직접 봐야 하므로 paragraph/heading/quoteBlockSchema 자체는 z.ZodType<T>로
// 넓히지 않는다 — 순환은 children 필드의 z.lazy 콜백 반환 타입 하나에만 명시
// 타입(BlockNode[])을 달아 끊는다. BlockNode는 zod가 실제로 추론하는 모양
// (옵셔널 필드가 항상 `T | undefined`를 명시하는 모양)을 그대로 따르는 스키마
// 전용 타입이다 — model의 손으로 쓴 Block 계열 타입(`children?: Block[]`)은
// exactOptionalPropertyTypes 아래에서 이 모양과 바로 맞지 않는다. 공개 모델
// 타입으로의 변환은 기존과 같이 parseDocument의 `as Document` 캐스트가
// 담당한다.
type ParagraphBlockNode = {
  id: string;
  type: "paragraph";
  content: z.infer<typeof inlineContentSchema>;
  children?: BlockNode[] | undefined;
};

type HeadingBlockNode = {
  id: string;
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content: z.infer<typeof inlineContentSchema>;
  isToggleable?: boolean | undefined;
  collapsed?: boolean | undefined;
  children?: BlockNode[] | undefined;
};

type QuoteBlockNode = {
  id: string;
  type: "quote";
  content: z.infer<typeof inlineContentSchema>;
  children?: BlockNode[] | undefined;
};

type BulletListItemBlockNode = {
  id: string;
  type: "bulletListItem";
  content: z.infer<typeof inlineContentSchema>;
  children?: BlockNode[] | undefined;
};

type NumberedListItemBlockNode = {
  id: string;
  type: "numberedListItem";
  content: z.infer<typeof inlineContentSchema>;
  startNumber?: number | undefined;
  children?: BlockNode[] | undefined;
};

type ToggleListItemBlockNode = {
  id: string;
  type: "toggleListItem";
  content: z.infer<typeof inlineContentSchema>;
  collapsed?: boolean | undefined;
  children?: BlockNode[] | undefined;
};

type DividerBlockNode = z.infer<typeof dividerBlockSchema>;
type CodeBlockNode = z.infer<typeof codeBlockSchema>;

type BlockNode =
  | ParagraphBlockNode
  | HeadingBlockNode
  | z.infer<typeof tableBlockSchema>
  | QuoteBlockNode
  | BulletListItemBlockNode
  | NumberedListItemBlockNode
  | ToggleListItemBlockNode
  | DividerBlockNode
  | CodeBlockNode;

const paragraphBlockSchema = z.object({
  id: z.string(),
  type: z.literal("paragraph"),
  content: inlineContentSchema,
  children: z
    .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
    .optional(),
});

const headingBlockSchema = z.object({
  id: z.string(),
  type: z.literal("heading"),
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  content: inlineContentSchema,
  isToggleable: z.boolean().optional(),
  collapsed: z.boolean().optional(),
  children: z
    .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
    .optional(),
});

const quoteBlockSchema = z.object({
  id: z.string(),
  type: z.literal("quote"),
  content: inlineContentSchema,
  children: z
    .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
    .optional(),
});

// 목록 항목은 text block과 같은 재귀 children을 가지지만 type별 저장 필드를
// 정확히 구분한다. strict()가 bullet의 startNumber와 임의 필드의 무음 유실을
// DOCUMENT_INVALID로 바꾼다.
const bulletListItemBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("bulletListItem"),
    content: inlineContentSchema,
    children: z
      .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
      .optional(),
  })
  .strict();

const numberedListItemBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("numberedListItem"),
    content: inlineContentSchema,
    startNumber: z.number().int().min(0).max(999_999_999).optional(),
    children: z
      .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
      .optional(),
  })
  .strict();

// toggleListItem은 bulletListItem/numberedListItem과 같은 목록 항목 shape
// (content + 재귀 children) 위에 collapsed 하나만 얹는다. collapsed 값 자체는
// heading의 isToggleable 같은 선행 조건이 없다 — 타입 자체가 토글 여부를
// 뜻한다(spec §4.4).
const toggleListItemBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("toggleListItem"),
    content: inlineContentSchema,
    collapsed: z.boolean().optional(),
    children: z
      .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
      .optional(),
  })
  .strict();

const blockSchema = z.discriminatedUnion("type", [
  paragraphBlockSchema,
  headingBlockSchema,
  tableBlockSchema,
  quoteBlockSchema,
  bulletListItemBlockSchema,
  numberedListItemBlockSchema,
  toggleListItemBlockSchema,
  dividerBlockSchema,
  codeBlockSchema,
]);

const documentSchema = z.object({
  formatVersion: z.number(),
  revision: z.number(),
  blocks: z.array(blockSchema),
});

const invalid = (
  path: DocumentPath,
  message: string,
): Result<never, DocumentError> => ({
  ok: false,
  error: { code: "DOCUMENT_INVALID", path, message },
});

const documentPath = (path: PropertyKey[]): DocumentPath =>
  path.flatMap((part) =>
    typeof part === "string" || typeof part === "number" ? [part] : [],
  );

const validateId = (
  ids: Set<string>,
  id: string,
  path: DocumentPath,
): Result<undefined, DocumentError> => {
  if (!isValidDocumentId(id)) {
    return invalid(
      path,
      "Id must be non-empty and contain no control characters or invalid surrogate code units",
    );
  }
  if (ids.has(id)) {
    return invalid(path, `Duplicate id: ${id}`);
  }
  ids.add(id);
  return { ok: true, value: undefined };
};

const validateContent = (
  content: InlineContent,
  contentPath: DocumentPath,
): Result<undefined, DocumentError> => {
  for (const [contentIndex, item] of content.entries()) {
    if (!isValidInlineText(item.text)) {
      return invalid(
        [...contentPath, contentIndex, "text"],
        "Inline text must use LF line breaks and contain no other C0 controls, DEL, or invalid surrogate code units",
      );
    }
    for (const [markIndex, mark] of (item.marks ?? []).entries()) {
      if (mark.type === "link" && !isSupportedLinkHref(mark.href)) {
        return invalid(
          [...contentPath, contentIndex, "marks", markIndex, "href"],
          "Unsupported link URL",
        );
      }
    }
    let hasLink = false;
    for (const [markIndex, mark] of (item.marks ?? []).entries()) {
      if (mark.type !== "link") continue;
      if (hasLink) {
        return invalid(
          [...contentPath, contentIndex, "marks", markIndex],
          "Inline item must contain at most one link mark",
        );
      }
      hasLink = true;
    }
    const invalidMarkIndex = firstNonCanonicalTextMarkIndex(item.marks ?? []);
    if (invalidMarkIndex !== undefined) {
      return invalid(
        [...contentPath, contentIndex, "marks", invalidMarkIndex],
        "Inline marks must use the canonical stored order without duplicate mark types",
      );
    }
  }
  return { ok: true, value: undefined };
};

// ids는 트리 전체(모든 깊이)가 공유하는 단일 Set이다 — 재귀 호출마다 새로
// 만들면 서로 다른 깊이의 중복 id를 놓친다(완료 조건 2). path는 현재 순회
// 위치의 blockPath 접두사이고, 최상위 호출은 validateBlocks가 ["blocks"]로
// 시작한다.
const validateBlocksAt = (
  blocks: Block[],
  path: DocumentPath,
  ids: Set<string>,
): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    const blockPath = [...path, blockIndex];
    const blockId = validateId(ids, block.id, [...blockPath, "id"]);
    if (!blockId.ok) return blockId;

    // divider는 id 외에 검증할 필드가 없다 — 아래 표 코드 경로로 떨어지지
    // 않게 여기서 끝낸다.
    if (block.type === "divider") continue;

    if (block.type === "codeBlock") {
      const item = block.content[0];
      if (item !== undefined) {
        if (item.text.length === 0) {
          return invalid(
            [...blockPath, "content", 0, "text"],
            "CodeBlock source run must not be empty",
          );
        }
        if (!isValidCodeBlockSource(item.text)) {
          return invalid(
            [...blockPath, "content", 0, "text"],
            "CodeBlock source may contain LF and Tab but no other C0 controls, DEL, or invalid surrogate code units",
          );
        }
      }
      if (
        block.language !== undefined &&
        !isValidCodeBlockLanguage(block.language)
      ) {
        return invalid(
          [...blockPath, "language"],
          "CodeBlock language must be non-empty and contain no control characters or invalid surrogate code units",
        );
      }
      continue;
    }

    // heading 전용 불변식(spec §4.1): collapsed가 있는데 isToggleable이
    // true가 아니면 거절한다. codeBlock과 같은 구조 — nestable 공통 처리
    // (content·children 재귀) 전에 타입 전용 검증을 먼저 건다. 이 판정을
    // 다른 곳(core codec 등)에 복제하지 않는다(G-CNV-001) — heading의
    // collapsed·isToggleable은 여기서만 유효성을 판정하고 나머지 계층은
    // 값을 그대로 직대응한다.
    if (
      block.type === "heading" &&
      block.collapsed !== undefined &&
      block.isToggleable !== true
    ) {
      return invalid(
        [...blockPath, "collapsed"],
        "Heading collapsed requires isToggleable: true",
      );
    }

    if (isNestableBlockType(block.type)) {
      // isNestableBlockType은 model 밖(core의 PM node.type.name 등)에서도
      // 쓰는 문자열 predicate라 discriminated union인 block 자체는 좁히지
      // 못한다 — 명시적으로 좁힌다.
      const nestable = block as Extract<Block, { type: NestableBlockType }>;
      const content = validateContent(nestable.content, [
        ...blockPath,
        "content",
      ]);
      if (!content.ok) return content;
      if (nestable.children !== undefined) {
        const children = validateBlocksAt(
          nestable.children,
          [...blockPath, "children"],
          ids,
        );
        if (!children.ok) return children;
      }
      continue;
    }

    // 위에서 divider/codeBlock/nestable을 모두 걸러냈으니 predicate 계약상
    // 이 지점은 table뿐이다.
    const table = block as TableBlock;
    for (const [columnIndex, column] of table.columns.entries()) {
      const columnId = validateId(ids, column.id, [
        ...blockPath,
        "columns",
        columnIndex,
        "id",
      ]);
      if (!columnId.ok) return columnId;
    }

    for (const [rowIndex, row] of table.rows.entries()) {
      const rowId = validateId(ids, row.id, [
        ...blockPath,
        "rows",
        rowIndex,
        "id",
      ]);
      if (!rowId.ok) return rowId;

      for (const [cellIndex, cell] of row.cells.entries()) {
        const cellPath = [
          ...blockPath,
          "rows",
          rowIndex,
          "cells",
          cellIndex,
        ] as const;
        const cellId = validateId(ids, cell.id, [...cellPath, "id"]);
        if (!cellId.ok) return cellId;
        if (!isValidDocumentId(cell.columnId)) {
          return invalid(
            [...cellPath, "columnId"],
            "Column reference must contain no control characters or invalid surrogate code units",
          );
        }
        const content = validateContent(cell.content, [...cellPath, "content"]);
        if (!content.ok) return content;
      }
    }
  }
  return { ok: true, value: undefined };
};

const validateBlocks = (blocks: Block[]): Result<undefined, DocumentError> =>
  validateBlocksAt(blocks, ["blocks"], new Set<string>());

// 표 전용 검증(열 너비·셀 속성·크기 상한·격자)이 트리 전체에서 같은 규칙으로
// 적용되게 하는 단일 순회 지점이다 — 최상위 배열만 돌면 paragraph/heading/quote의
// children으로 들어간 표(스키마·indentBlock이 허용하는 배치)가 네 검증을
// 통째로 우회한다. 깊이 상한은 validateNestingDepth가 이미 보장하므로 이
// 재귀는 상수 깊이 안에서 끝난다.
const visitTableBlocks = (
  blocks: Block[],
  path: DocumentPath,
  visit: (
    table: TableBlock,
    tablePath: DocumentPath,
  ) => Result<undefined, DocumentError>,
): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    const blockPath = [...path, blockIndex];
    if (block.type === "table") {
      const result = visit(block, blockPath);
      if (!result.ok) return result;
      continue;
    }
    // divider와 codeBlock은 children 필드가 없는 리프다 — 나머지
    // (paragraph/heading/quote/목록 항목)만 children으로 내려간다.
    if (block.type === "divider" || block.type === "codeBlock") continue;
    if (block.children !== undefined) {
      const children = visitTableBlocks(
        block.children,
        [...blockPath, "children"],
        visit,
      );
      if (!children.ok) return children;
    }
  }
  return { ok: true, value: undefined };
};

const validateColumnWidths = (
  blocks: Block[],
): Result<undefined, DocumentError> =>
  visitTableBlocks(blocks, ["blocks"], (table, tablePath) => {
    for (const [columnIndex, column] of table.columns.entries()) {
      if (
        !Number.isFinite(column.width) ||
        !Number.isInteger(column.width) ||
        column.width < MIN_COLUMN_WIDTH ||
        column.width > MAX_COLUMN_WIDTH
      ) {
        return invalid(
          [...tablePath, "columns", columnIndex, "width"],
          `Column width must be an integer between ${MIN_COLUMN_WIDTH} and ${MAX_COLUMN_WIDTH}`,
        );
      }
    }
    return { ok: true, value: undefined };
  });

const validateCells = (blocks: Block[]): Result<undefined, DocumentError> =>
  visitTableBlocks(blocks, ["blocks"], (table, tablePath) => {
    for (const [rowIndex, row] of table.rows.entries()) {
      for (const [cellIndex, cell] of row.cells.entries()) {
        const cellPath = [
          ...tablePath,
          "rows",
          rowIndex,
          "cells",
          cellIndex,
        ] as const;
        if (!Number.isInteger(cell.rowSpan) || cell.rowSpan < 1) {
          return invalid(
            [...cellPath, "rowSpan"],
            "rowSpan must be a positive integer",
          );
        }
        if (!Number.isInteger(cell.columnSpan) || cell.columnSpan < 1) {
          return invalid(
            [...cellPath, "columnSpan"],
            "columnSpan must be a positive integer",
          );
        }
        if (
          cell.textColor !== undefined &&
          !isCanonicalCellColor(cell.textColor)
        ) {
          return invalid(
            [...cellPath, "textColor"],
            "textColor must be an uppercase #RRGGBB color",
          );
        }
        if (
          cell.backgroundColor !== undefined &&
          !isCanonicalCellColor(cell.backgroundColor)
        ) {
          return invalid(
            [...cellPath, "backgroundColor"],
            "backgroundColor must be an uppercase #RRGGBB color",
          );
        }
        if (cell.align !== undefined && !isCanonicalCellAlign(cell.align)) {
          return invalid(
            [...cellPath, "align"],
            "align must be one of left, center, right",
          );
        }
      }
    }
    return { ok: true, value: undefined };
  });

const validateTableLimits = (
  blocks: Block[],
): Result<undefined, DocumentError> =>
  visitTableBlocks(blocks, ["blocks"], (table, tablePath) => {
    const violation = validateTableSize({
      columnCount: table.columns.length,
      rowCount: table.rows.length,
    });
    if (violation !== undefined) {
      return {
        ok: false,
        error: {
          code: "DOCUMENT_LIMIT_EXCEEDED",
          path: tablePath,
          message: tableSizeViolationMessage(violation),
        },
      };
    }
    return { ok: true, value: undefined };
  });

const validateTableGrids = (
  blocks: Block[],
): Result<undefined, DocumentError> =>
  visitTableBlocks(blocks, ["blocks"], (table, tablePath) => {
    const result = validateTableGrid(table);
    if (!result.ok) {
      const { reason, row, column } = result.error;
      return {
        ok: false,
        error: {
          code: "TABLE_GRID_INVALID",
          path: tablePath,
          message: `Table grid ${reason} at row ${row}, column ${column ?? "unknown"}`,
        },
      };
    }
    return { ok: true, value: undefined };
  });

// spec §3.2 "조작된 JSON의 재귀 검증 스택 사용을 방어" — 정상 중첩 상한과
// 스택 오버플로 방어를 같은 상수·같은 오류 코드로 묶는다(spec §8, 완료 조건
// 4·6). blocks 배열 자체가 depth 1이다.
export const MAX_NESTING_DEPTH = 64;

// input은 아직 zod로 파싱되지 않은 원시 값이라 형태를 신뢰할 수 없다.
// children 배열만 방어적으로 따라가며 최대 깊이를 센다. depth가 상한을
// 넘는 즉시(더 깊이 들어가지 않고) 반환하므로, 수천 단계로 조작된 children
// 체인이 들어와도 재귀 스택이 상수 깊이(MAX_NESTING_DEPTH + 1) 안에서
// 끝난다 — documentSchema.safeParse보다 먼저 실행해 zod의 재귀 파싱 자체가
// 시작되지 않게 한다(PIT-0034: 결정적 조건, wall-clock 아님).
const findNestingDepthViolation = (
  blocks: unknown,
  depth: number,
  path: DocumentPath,
): DocumentPath | undefined => {
  if (depth > MAX_NESTING_DEPTH) return path;
  if (!Array.isArray(blocks)) return undefined;

  for (const [index, block] of blocks.entries()) {
    if (block === null || typeof block !== "object") continue;
    const { type, children } = block as {
      type?: unknown;
      children?: unknown;
    };
    // schema가 children을 허용하는 블록만 따라간다. table/divider/codeBlock과
    // 알 수 없는 판별자의 children은 strict shape 위반이므로 zod가 원래
    // DOCUMENT_INVALID path에서 판정해야 한다.
    if (typeof type !== "string" || !isNestableBlockType(type)) {
      continue;
    }
    // 빈 children 배열은 "자식 없음"이다 — 다른 층(validateBlocksAt,
    // model-to-tiptap)과 같은 해석. 배열이 아닌 값은 어차피 zod가 거절하므로
    // 깊이 위반으로 오분류하지 않고 그쪽에 맡긴다.
    if (!Array.isArray(children) || children.length === 0) continue;
    const violation = findNestingDepthViolation(children, depth + 1, [
      ...path,
      index,
      "children",
    ]);
    if (violation) return violation;
  }
  return undefined;
};

const validateNestingDepth = (
  input: unknown,
): Result<undefined, DocumentError> => {
  const blocks =
    input !== null && typeof input === "object" && "blocks" in input
      ? (input as { blocks?: unknown }).blocks
      : undefined;
  const violation = findNestingDepthViolation(blocks, 1, ["blocks"]);
  if (violation) {
    return {
      ok: false,
      error: {
        code: "DOCUMENT_LIMIT_EXCEEDED",
        path: violation,
        message: `Nesting depth exceeds ${MAX_NESTING_DEPTH}`,
      },
    };
  }
  return { ok: true, value: undefined };
};

const canonicalizeCodeBlockLanguages = (blocks: Block[]): void => {
  for (const block of blocks) {
    if (block.type === "codeBlock") {
      if (block.language !== undefined) {
        block.language = canonicalizeCodeBlockLanguage(block.language);
      }
      continue;
    }
    if (isNestableBlockType(block.type)) {
      const children = (block as Extract<Block, { type: NestableBlockType }>)
        .children;
      if (children !== undefined) canonicalizeCodeBlockLanguages(children);
    }
  }
};

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
  const limits = validateTableLimits(document.blocks);
  if (!limits.ok) return limits;
  const grids = validateTableGrids(document.blocks);
  if (!grids.ok) return grids;

  canonicalizeCodeBlockLanguages(document.blocks);

  return { ok: true, value: document };
};
