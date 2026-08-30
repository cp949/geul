import type { Block, Document, InlineContent } from "@cp949/geul-model";

import { computeColumnAlignments } from "./column-align.js";

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
    | "INLINE_CODE_NEWLINE"
    | "NESTED_CHILDREN";
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

const collectTableLosses = (
  block: Extract<Block, { type: "table" }>,
  losses: MarkdownLoss[],
): void => {
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

  const columnAlignments = computeColumnAlignments(block);

  for (const column of block.columns) {
    if (column.width !== DEFAULT_COLUMN_WIDTH) {
      losses.push({
        kind: "COLUMN_WIDTH",
        blockId: block.id,
        message: `Column ${column.id} has non-default width ${column.width}`,
      });
    }
    if (columnAlignments.get(column.id) === "mixed") {
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
      if (cell.textColor !== undefined || cell.backgroundColor !== undefined) {
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
};

// paragraph/heading/quote의 children은 대응 mdast 노드에 블록 슬롯이 없어
// NESTED_CHILDREN이다. 목록 항목의 children은 mdast listItem이 직접
// 표현하므로 손실 없이 재귀 순회한다. 단, 빈 own content 뒤 첫 paragraph는
// GFM이 own paragraph와 child paragraph 경계를 구분하지 못하므로 부모 목록
// 항목의 NESTED_CHILDREN으로 분류한다.
const collectBlockLosses = (block: Block, losses: MarkdownLoss[]): void => {
  if (block.type === "table") {
    collectTableLosses(block, losses);
    return;
  }
  if (block.type === "divider" || block.type === "codeBlock") return;

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
  if (block.children !== undefined && block.children.length > 0) {
    const hasAmbiguousLeadingParagraph =
      (block.type === "bulletListItem" || block.type === "numberedListItem") &&
      block.content.length === 0 &&
      block.children[0]?.type === "paragraph";
    if (
      (block.type !== "bulletListItem" && block.type !== "numberedListItem") ||
      hasAmbiguousLeadingParagraph
    ) {
      losses.push({
        kind: "NESTED_CHILDREN",
        blockId: block.id,
        message: `Block ${block.id} has nested children; GFM export flattens them into sibling blocks`,
      });
    }
    for (const child of block.children) {
      collectBlockLosses(child, losses);
    }
  }
};

export const analyzeMarkdownLoss = (document: Document): MarkdownLoss[] => {
  const losses: MarkdownLoss[] = [];

  for (const block of document.blocks) {
    collectBlockLosses(block, losses);
  }

  return losses;
};
