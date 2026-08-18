import type { Document, InlineContent, TableBlock } from "@cp949/geul-model";

const DEFAULT_COLUMN_WIDTH = 160;

export type MarkdownLoss = {
  kind:
    | "MERGED_CELL"
    | "COLUMN_WIDTH"
    | "COLUMN_ALIGN"
    | "CELL_COLOR"
    | "UNDERLINE"
    | "HEADER_ROW"
    | "HEADER_COLUMN"
    | "INLINE_CODE_NEWLINE";
  blockId: string;
  rowId?: string;
  cellId?: string;
  message: string;
};

const hasUnderline = (content: InlineContent): boolean =>
  content.some((item) =>
    (item.marks ?? []).some((mark) => mark.type === "underline"),
  );

const hasInlineCodeNewline = (content: InlineContent): boolean =>
  content.some(
    (item) =>
      item.text.includes("\n") &&
      (item.marks ?? []).some((mark) => mark.type === "code"),
  );

const columnAlignAgrees = (block: TableBlock, columnId: string): boolean => {
  let seen: "left" | "center" | "right" | null | undefined;
  for (const row of block.rows) {
    for (const cell of row.cells) {
      if (cell.columnId !== columnId) continue;
      const align = cell.align ?? null;
      if (seen === undefined) {
        seen = align;
        continue;
      }
      if (seen !== align) return false;
    }
  }
  return true;
};

export const analyzeMarkdownLoss = (document: Document): MarkdownLoss[] => {
  const losses: MarkdownLoss[] = [];

  for (const block of document.blocks) {
    if (block.type !== "table") {
      if (hasUnderline(block.content)) {
        losses.push({
          kind: "UNDERLINE",
          blockId: block.id,
          message: `Block ${block.id} contains underline formatting`,
        });
      }
      if (hasInlineCodeNewline(block.content)) {
        losses.push({
          kind: "INLINE_CODE_NEWLINE",
          blockId: block.id,
          message: `Block ${block.id} contains inline code with a newline`,
        });
      }
      continue;
    }

    if (block.headerRows !== 1) {
      losses.push({
        kind: "HEADER_ROW",
        blockId: block.id,
        message: `Table ${block.id} has ${block.headerRows} header rows; GFM export uses 1`,
      });
    }
    if (block.headerColumns !== 0) {
      losses.push({
        kind: "HEADER_COLUMN",
        blockId: block.id,
        message: `Table ${block.id} has ${block.headerColumns} header columns; GFM export uses 0`,
      });
    }

    for (const column of block.columns) {
      if (column.width !== DEFAULT_COLUMN_WIDTH) {
        losses.push({
          kind: "COLUMN_WIDTH",
          blockId: block.id,
          message: `Column ${column.id} has non-default width ${column.width}`,
        });
      }
      if (!columnAlignAgrees(block, column.id)) {
        losses.push({
          kind: "COLUMN_ALIGN",
          blockId: block.id,
          message: `Column ${column.id} has cells with different align values`,
        });
      }
    }

    for (const row of block.rows) {
      for (const cell of row.cells) {
        const location = {
          blockId: block.id,
          rowId: row.id,
          cellId: cell.id,
        };
        if (cell.rowSpan !== 1 || cell.columnSpan !== 1) {
          losses.push({
            kind: "MERGED_CELL",
            ...location,
            message: `Cell ${cell.id} spans ${cell.rowSpan} rows and ${cell.columnSpan} columns`,
          });
        }
        if (
          cell.textColor !== undefined ||
          cell.backgroundColor !== undefined
        ) {
          losses.push({
            kind: "CELL_COLOR",
            ...location,
            message: `Cell ${cell.id} has text or background color`,
          });
        }
        if (hasUnderline(cell.content)) {
          losses.push({
            kind: "UNDERLINE",
            ...location,
            message: `Cell ${cell.id} contains underline formatting`,
          });
        }
        if (hasInlineCodeNewline(cell.content)) {
          losses.push({
            kind: "INLINE_CODE_NEWLINE",
            ...location,
            message: `Cell ${cell.id} contains inline code with a newline`,
          });
        }
      }
    }
  }

  return losses;
};
