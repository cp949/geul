import {
  type Document,
  type InlineContent,
  parseDocument,
  type TableBlock,
  type TextMark,
} from "@cp949/geul-model";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import type { ExportError } from "../errors.js";
import type { Result } from "../result.js";
import { analyzeMarkdownLoss, type MarkdownLoss } from "./loss-analysis.js";

const stringifyProcessor = unified().use(remarkStringify).use(remarkGfm);

type MarkdownOutputNode = {
  type: string;
  value?: string;
  depth?: number;
  url?: string;
  align?: Array<null>;
  children?: MarkdownOutputNode[];
};

const markOrder: Record<TextMark["type"], number> = {
  link: 0,
  bold: 1,
  italic: 2,
  strike: 3,
  code: 4,
  underline: 5,
};

const wrapNodes = (
  nodes: MarkdownOutputNode[],
  mark: TextMark,
): MarkdownOutputNode[] => {
  switch (mark.type) {
    case "link":
      return [{ type: "link", url: mark.href, children: nodes }];
    case "bold":
      return [{ type: "strong", children: nodes }];
    case "italic":
      return [{ type: "emphasis", children: nodes }];
    case "strike":
      return [{ type: "delete", children: nodes }];
    case "underline":
      return nodes;
    case "code":
      return nodes;
  }
};

const textNodes = (
  text: string,
  inTableCell: boolean,
): MarkdownOutputNode[] => {
  if (!inTableCell) return [{ type: "text", value: text }];

  const parts = text.split("\n");
  const nodes: MarkdownOutputNode[] = [];
  for (const [index, part] of parts.entries()) {
    if (part.length > 0) nodes.push({ type: "text", value: part });
    if (index < parts.length - 1) {
      nodes.push({ type: "html", value: "<br>" });
    }
  }
  return nodes;
};

const inlineNodes = (
  content: InlineContent,
  inTableCell: boolean,
): MarkdownOutputNode[] =>
  content.flatMap((item) => {
    const marks = (item.marks ?? [])
      .filter((mark) => mark.type !== "underline")
      .map((mark, index) => ({ mark, index }))
      .sort(
        (left, right) =>
          markOrder[left.mark.type] - markOrder[right.mark.type] ||
          left.index - right.index,
      )
      .map(({ mark }) => mark);
    const hasCode = marks.some((mark) => mark.type === "code");
    const wrappingMarks = marks.filter((mark) => mark.type !== "code");
    const nodes =
      hasCode && !item.text.includes("\n")
        ? [{ type: "inlineCode", value: item.text }]
        : textNodes(item.text, inTableCell);

    return [...wrappingMarks]
      .reverse()
      .reduce<MarkdownOutputNode[]>(
        (wrapped, mark) => wrapNodes(wrapped, mark),
        nodes,
      );
  });

const tableNode = (table: TableBlock): MarkdownOutputNode => {
  const columnIndices = new Map(
    table.columns.map((column, index) => [column.id, index]),
  );
  const rows = Array.from({ length: table.rows.length }, () =>
    Array.from(
      { length: table.columns.length },
      (): MarkdownOutputNode => ({ type: "tableCell", children: [] }),
    ),
  );

  for (const [rowIndex, row] of table.rows.entries()) {
    const outputRow = rows[rowIndex];
    if (outputRow === undefined) continue;
    for (const cell of row.cells) {
      const columnIndex = columnIndices.get(cell.columnId);
      if (columnIndex === undefined) continue;
      outputRow[columnIndex] = {
        type: "tableCell",
        children: inlineNodes(cell.content, true),
      };
    }
  }

  return {
    type: "table",
    align: table.columns.map(() => null),
    children: rows.map((cells) => ({ type: "tableRow", children: cells })),
  };
};

const documentNode = (document: Document): MarkdownOutputNode => ({
  type: "root",
  children: document.blocks.map((block) => {
    if (block.type === "table") return tableNode(block);
    if (block.type === "heading") {
      return {
        type: "heading",
        depth: block.level,
        children: inlineNodes(block.content, false),
      };
    }
    return {
      type: "paragraph",
      children: inlineNodes(block.content, false),
    };
  }),
});

export type MarkdownLossNotAllowedError = {
  code: "MARKDOWN_LOSS_NOT_ALLOWED";
  losses: MarkdownLoss[];
};

export type MarkdownExportError = ExportError | MarkdownLossNotAllowedError;

export function exportMarkdown(
  document: Document,
  options: { mode: "strict" },
): Result<string, MarkdownExportError>;
export function exportMarkdown(
  document: Document,
  options: { mode: "lossy" },
): Result<{ markdown: string; warnings: MarkdownLoss[] }, ExportError>;
export function exportMarkdown(
  document: Document,
  options: { mode: "strict" | "lossy" },
): Result<
  string | { markdown: string; warnings: MarkdownLoss[] },
  MarkdownExportError
> {
  const parsed = parseDocument(document);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: "MARKDOWN_DOCUMENT_INVALID",
        message: `Cannot export invalid document: ${parsed.error.message}`,
      },
    };
  }

  const losses = analyzeMarkdownLoss(parsed.value);
  if (options.mode === "strict" && losses.length > 0) {
    return {
      ok: false,
      error: { code: "MARKDOWN_LOSS_NOT_ALLOWED", losses },
    };
  }

  try {
    const markdown = stringifyProcessor.stringify(
      documentNode(parsed.value) as Parameters<
        typeof stringifyProcessor.stringify
      >[0],
    );
    if (options.mode === "strict") return { ok: true, value: markdown };
    return { ok: true, value: { markdown, warnings: losses } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "MARKDOWN_SERIALIZE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to serialize Markdown",
      },
    };
  }
}
