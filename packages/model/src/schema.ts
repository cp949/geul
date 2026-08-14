import { z } from "zod";

import type { DocumentError } from "./errors.js";
import { isSupportedLinkHref } from "./link-policy.js";
import { firstNonCanonicalTextMarkIndex } from "./mark-canonicalization.js";
import type { Result } from "./result.js";
import { isValidDocumentId, isValidInlineText } from "./string-invariants.js";
import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  validateTableGrid,
} from "./table-grid-validation.js";
import type { Block, Document, InlineContent } from "./types.js";

type DocumentPath = Array<string | number>;

const textMarkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["bold", "italic", "underline", "strike", "code"]) }),
  z.object({ type: z.literal("link"), href: z.string() }),
]);

const inlineContentSchema = z.array(
  z.object({
    text: z.string(),
    marks: z.array(textMarkSchema).optional(),
  }),
);

const paragraphBlockSchema = z.object({
  id: z.string(),
  type: z.literal("paragraph"),
  content: inlineContentSchema,
});

const headingBlockSchema = z.object({
  id: z.string(),
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  content: inlineContentSchema,
});

const tableBlockSchema = z.object({
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
        }),
      ),
    }),
  ),
  headerRows: z.union([z.literal(0), z.literal(1)]),
  headerColumns: z.union([z.literal(0), z.literal(1)]),
});

const documentSchema = z.object({
  formatVersion: z.number(),
  revision: z.number(),
  blocks: z.array(
    z.discriminatedUnion("type", [
      paragraphBlockSchema,
      headingBlockSchema,
      tableBlockSchema,
    ]),
  ),
});

const colorPattern = /^#[0-9A-F]{6}$/;

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

const validateInlineContent = (
  content: InlineContent,
  contentPath: DocumentPath,
): Result<undefined, DocumentError> => {
  for (const [contentIndex, item] of content.entries()) {
    for (const [markIndex, mark] of (item.marks ?? []).entries()) {
      if (mark.type === "link" && !isSupportedLinkHref(mark.href)) {
        return invalid(
          [...contentPath, contentIndex, "marks", markIndex, "href"],
          "Unsupported link URL",
        );
      }
    }
  }
  return { ok: true, value: undefined };
};

const validateInlineText = (
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
  }
  return { ok: true, value: undefined };
};

const validateText = (blocks: Block[]): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.type === "paragraph" || block.type === "heading") {
      const result = validateInlineText(block.content, [
        "blocks",
        blockIndex,
        "content",
      ]);
      if (!result.ok) return result;
      continue;
    }
    for (const [rowIndex, row] of block.rows.entries()) {
      for (const [cellIndex, cell] of row.cells.entries()) {
        const result = validateInlineText(cell.content, [
          "blocks",
          blockIndex,
          "rows",
          rowIndex,
          "cells",
          cellIndex,
          "content",
        ]);
        if (!result.ok) return result;
      }
    }
  }
  return { ok: true, value: undefined };
};

const validateIds = (blocks: Block[]): Result<undefined, DocumentError> => {
  const ids = new Set<string>();

  for (const [blockIndex, block] of blocks.entries()) {
    const blockId = validateId(ids, block.id, ["blocks", blockIndex, "id"]);
    if (!blockId.ok) return blockId;

    if (block.type !== "table") continue;

    for (const [columnIndex, column] of block.columns.entries()) {
      const columnId = validateId(ids, column.id, [
        "blocks",
        blockIndex,
        "columns",
        columnIndex,
        "id",
      ]);
      if (!columnId.ok) return columnId;
    }
    for (const [rowIndex, row] of block.rows.entries()) {
      const rowId = validateId(ids, row.id, [
        "blocks",
        blockIndex,
        "rows",
        rowIndex,
        "id",
      ]);
      if (!rowId.ok) return rowId;
      for (const [cellIndex, cell] of row.cells.entries()) {
        const cellId = validateId(ids, cell.id, [
          "blocks",
          blockIndex,
          "rows",
          rowIndex,
          "cells",
          cellIndex,
          "id",
        ]);
        if (!cellId.ok) return cellId;
        if (!isValidDocumentId(cell.columnId)) {
          return invalid(
            [
              "blocks",
              blockIndex,
              "rows",
              rowIndex,
              "cells",
              cellIndex,
              "columnId",
            ],
            "Column reference must contain no control characters or invalid surrogate code units",
          );
        }
      }
    }
  }
  return { ok: true, value: undefined };
};

const validateLinks = (blocks: Block[]): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.type === "paragraph" || block.type === "heading") {
      const result = validateInlineContent(block.content, [
        "blocks",
        blockIndex,
        "content",
      ]);
      if (!result.ok) return result;
      continue;
    }
    for (const [rowIndex, row] of block.rows.entries()) {
      for (const [cellIndex, cell] of row.cells.entries()) {
        const result = validateInlineContent(cell.content, [
          "blocks",
          blockIndex,
          "rows",
          rowIndex,
          "cells",
          cellIndex,
          "content",
        ]);
        if (!result.ok) return result;
      }
    }
  }
  return { ok: true, value: undefined };
};

const validateInlineLinkMultiplicity = (
  content: InlineContent,
  contentPath: DocumentPath,
): Result<undefined, DocumentError> => {
  for (const [contentIndex, item] of content.entries()) {
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
  }
  return { ok: true, value: undefined };
};

const validateLinkMultiplicity = (
  blocks: Block[],
): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.type === "paragraph" || block.type === "heading") {
      const result = validateInlineLinkMultiplicity(block.content, [
        "blocks",
        blockIndex,
        "content",
      ]);
      if (!result.ok) return result;
      continue;
    }
    for (const [rowIndex, row] of block.rows.entries()) {
      for (const [cellIndex, cell] of row.cells.entries()) {
        const result = validateInlineLinkMultiplicity(cell.content, [
          "blocks",
          blockIndex,
          "rows",
          rowIndex,
          "cells",
          cellIndex,
          "content",
        ]);
        if (!result.ok) return result;
      }
    }
  }
  return { ok: true, value: undefined };
};

const validateInlineMarkOrder = (
  content: InlineContent,
  contentPath: DocumentPath,
): Result<undefined, DocumentError> => {
  for (const [contentIndex, item] of content.entries()) {
    const invalidIndex = firstNonCanonicalTextMarkIndex(item.marks ?? []);
    if (invalidIndex !== undefined) {
      return invalid(
        [...contentPath, contentIndex, "marks", invalidIndex],
        "Inline marks must use the canonical stored order without duplicate mark types",
      );
    }
  }
  return { ok: true, value: undefined };
};

const validateMarkOrder = (
  blocks: Block[],
): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.type === "paragraph" || block.type === "heading") {
      const result = validateInlineMarkOrder(block.content, [
        "blocks",
        blockIndex,
        "content",
      ]);
      if (!result.ok) return result;
      continue;
    }
    for (const [rowIndex, row] of block.rows.entries()) {
      for (const [cellIndex, cell] of row.cells.entries()) {
        const result = validateInlineMarkOrder(cell.content, [
          "blocks",
          blockIndex,
          "rows",
          rowIndex,
          "cells",
          cellIndex,
          "content",
        ]);
        if (!result.ok) return result;
      }
    }
  }
  return { ok: true, value: undefined };
};

const validateColumnWidths = (
  blocks: Block[],
): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.type !== "table") continue;
    for (const [columnIndex, column] of block.columns.entries()) {
      if (
        !Number.isFinite(column.width) ||
        !Number.isInteger(column.width) ||
        column.width < MIN_COLUMN_WIDTH ||
        column.width > MAX_COLUMN_WIDTH
      ) {
        return invalid(
          ["blocks", blockIndex, "columns", columnIndex, "width"],
          `Column width must be an integer between ${MIN_COLUMN_WIDTH} and ${MAX_COLUMN_WIDTH}`,
        );
      }
    }
  }
  return { ok: true, value: undefined };
};

const validateSpans = (blocks: Block[]): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.type !== "table") continue;
    for (const [rowIndex, row] of block.rows.entries()) {
      for (const [cellIndex, cell] of row.cells.entries()) {
        const cellPath = [
          "blocks",
          blockIndex,
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
      }
    }
  }
  return { ok: true, value: undefined };
};

const validateColors = (blocks: Block[]): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.type !== "table") continue;
    for (const [rowIndex, row] of block.rows.entries()) {
      for (const [cellIndex, cell] of row.cells.entries()) {
        const cellPath = [
          "blocks",
          blockIndex,
          "rows",
          rowIndex,
          "cells",
          cellIndex,
        ] as const;
        if (
          cell.textColor !== undefined &&
          !colorPattern.test(cell.textColor)
        ) {
          return invalid(
            [...cellPath, "textColor"],
            "textColor must be an uppercase #RRGGBB color",
          );
        }
        if (
          cell.backgroundColor !== undefined &&
          !colorPattern.test(cell.backgroundColor)
        ) {
          return invalid(
            [...cellPath, "backgroundColor"],
            "backgroundColor must be an uppercase #RRGGBB color",
          );
        }
      }
    }
  }
  return { ok: true, value: undefined };
};

const validateTableLimits = (
  blocks: Block[],
): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.type !== "table") continue;
    if (block.rows.length * block.columns.length > 10_000) {
      return {
        ok: false,
        error: {
          code: "DOCUMENT_LIMIT_EXCEEDED",
          path: ["blocks", blockIndex],
          message: "Table logical cell count exceeds 10000",
        },
      };
    }
  }
  return { ok: true, value: undefined };
};

const validateTableGrids = (
  blocks: Block[],
): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.type !== "table") continue;

    const result = validateTableGrid(block);
    if (!result.ok) {
      const { reason, row, column } = result.error;
      return {
        ok: false,
        error: {
          code: "TABLE_GRID_INVALID",
          path: ["blocks", blockIndex],
          message: `Table grid ${reason} at row ${row}, column ${column ?? "unknown"}`,
        },
      };
    }
  }
  return { ok: true, value: undefined };
};

export const parseDocument = (
  input: unknown,
): Result<Document, DocumentError> => {
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

  const ids = validateIds(document.blocks);
  if (!ids.ok) return ids;
  const text = validateText(document.blocks);
  if (!text.ok) return text;
  const links = validateLinks(document.blocks);
  if (!links.ok) return links;
  const linkMultiplicity = validateLinkMultiplicity(document.blocks);
  if (!linkMultiplicity.ok) return linkMultiplicity;
  const markOrder = validateMarkOrder(document.blocks);
  if (!markOrder.ok) return markOrder;

  const widths = validateColumnWidths(document.blocks);
  if (!widths.ok) return widths;
  const spans = validateSpans(document.blocks);
  if (!spans.ok) return spans;
  const colors = validateColors(document.blocks);
  if (!colors.ok) return colors;
  const limits = validateTableLimits(document.blocks);
  if (!limits.ok) return limits;
  const grids = validateTableGrids(document.blocks);
  if (!grids.ok) return grids;

  return { ok: true, value: document };
};
