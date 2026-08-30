import {
  type Block,
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
import { computeColumnAlignments } from "./column-align.js";
import { analyzeMarkdownLoss, type MarkdownLoss } from "./loss-analysis.js";

// rule: "-"는 mdast-util-to-markdown(remark-stringify 내부 직렬화기) 기존
// 옵션이다 — thematicBreak를 기본값 "***" 대신 "---"로 쓰게 한다(spec §7.2,
// DELTA-07).
const stringifyProcessor = unified()
  .use(remarkStringify, { rule: "-", incrementListMarker: false })
  .use(remarkGfm);

type MarkdownOutputNode = {
  type: string;
  value?: string;
  depth?: number;
  url?: string;
  lang?: string;
  align?: Array<"left" | "center" | "right" | null>;
  ordered?: boolean;
  start?: number;
  spread?: boolean;
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
    Array.from({ length: table.columns.length }, (): MarkdownOutputNode => ({
      type: "tableCell",
      children: [],
    })),
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

  const columnAlignments = computeColumnAlignments(table);

  return {
    type: "table",
    align: table.columns.map((column) => {
      const align = columnAlignments.get(column.id);
      return align === undefined || align === "mixed" ? null : align;
    }),
    children: rows.map((cells) => ({ type: "tableRow", children: cells })),
  };
};

// children이 있는 paragraph/heading/quote를 부모 바로 뒤의 형제 블록으로
// 평탄화한다(D5, lossy export 전용). GFM(mdast)의 paragraph/heading
// 노드에는 자식 블록 슬롯이 없어 계층을 표현할 수 없다 — depth와 무관하게
// 전부 평탄화해 콘텐츠는 보존하고 계층 정보만 손실로 남긴다(strict 모드는
// analyzeMarkdownLoss가 NESTED_CHILDREN을 이미 거부하므로 이 함수에
// 도달하지 않는다).
const flattenBlocks = (blocks: Block[]): Block[] =>
  blocks.flatMap((block): Block[] => {
    if (block.type === "table") return [block];
    // divider와 CodeBlock은 children 필드 자체가 없어(옵셔널이 아니라 부재)
    // 아래 block.children 접근 전에 좁힌다. quote는 children이 옵셔널이라
    // 아래 범용 분기로 자연스럽게 통과한다(07a).
    if (block.type === "divider" || block.type === "codeBlock") return [block];
    if (block.children === undefined || block.children.length === 0) {
      return [block];
    }
    const { children, ...ownBlock } = block;
    return [ownBlock, ...flattenBlocks(children)];
  });

// remark-stringify는 info string의 공백·backtick은 entity로 바꾸지만 기존
// entity 형태의 ampersand는 그대로 둔다. 재파싱 때 `&copy;`가 `©`가 되지
// 않도록 ampersand를 먼저 escape해 unknown language를 exact 보존한다.
const codeBlockLanguage = (language: string): string =>
  language.replace(/&/g, "&amp;");

type ListItemBlock = Extract<
  Block,
  { type: "bulletListItem" | "numberedListItem" }
>;

const listNode = (blocks: ListItemBlock[]): MarkdownOutputNode => {
  const first = blocks[0];
  if (first === undefined) throw new Error("Cannot serialize an empty list");
  return {
    type: "list",
    ordered: first.type === "numberedListItem",
    spread: false,
    ...(first.type === "numberedListItem" && first.startNumber !== undefined
      ? { start: first.startNumber }
      : {}),
    children: blocks.map((block) => ({
      type: "listItem",
      spread: false,
      children: [
        {
          type: "paragraph",
          children: inlineNodes(block.content, false),
        },
      ],
    })),
  };
};

// 연속된 flat 목록 형제를 mdast list로 묶는다. 번호 항목의 명시적
// startNumber는 새 list의 start가 되어 그 항목부터 번호를 다시 시작한다.
const blockNodes = (blocks: Block[]): MarkdownOutputNode[] => {
  const nodes: MarkdownOutputNode[] = [];
  for (let index = 0; index < blocks.length; ) {
    const first = blocks[index];
    if (
      first?.type !== "bulletListItem" &&
      first?.type !== "numberedListItem"
    ) {
      if (first !== undefined) nodes.push(blockNode(first));
      index += 1;
      continue;
    }

    const items: ListItemBlock[] = [first];
    let nextIndex = index + 1;
    while (nextIndex < blocks.length) {
      const next = blocks[nextIndex];
      if (next?.type !== first.type) break;
      if (
        next.type === "numberedListItem" &&
        next.startNumber !== undefined
      ) {
        break;
      }
      items.push(next);
      nextIndex += 1;
    }
    nodes.push(listNode(items));
    index = nextIndex;
  }
  return nodes;
};

const blockNode = (block: Block): MarkdownOutputNode => {
  if (block.type === "table") return tableNode(block);
  if (block.type === "divider") return { type: "thematicBreak" };
  // CodeBlock은 model 검증을 통과한 plain-text leaf다. mdast code node가
  // fence 길이와 info string entity escape를 맡아 source/language를 보존한다.
  if (block.type === "codeBlock") {
    return {
      type: "code",
      value: block.content[0]?.text ?? "",
      ...(block.language === undefined
        ? {}
        : { lang: codeBlockLanguage(block.language) }),
    };
  }
  if (
    block.type === "bulletListItem" ||
    block.type === "numberedListItem"
  ) {
    return listNode([block]);
  }
  if (block.type === "quote") {
    return {
      type: "blockquote",
      children: [
        { type: "paragraph", children: inlineNodes(block.content, false) },
      ],
    };
  }
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
};

const documentNode = (document: Document): MarkdownOutputNode => ({
  type: "root",
  children: blockNodes(document.blocks),
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
    const outputDocument: Document =
      options.mode === "lossy"
        ? { ...parsed.value, blocks: flattenBlocks(parsed.value.blocks) }
        : parsed.value;
    const markdown = stringifyProcessor.stringify(
      documentNode(outputDocument) as Parameters<
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
