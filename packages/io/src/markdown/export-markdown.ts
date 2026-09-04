import {
  type Block,
  type Document,
  type InlineContent,
  type ListItemBlock,
  parseDocument,
  type TableBlock,
  type TextMark,
  type ToggleListItemBlock,
} from "@cp949/geul-model";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import type { ExportError } from "../errors.js";
import { groupListItemRuns } from "../list-item-run-grouping.js";
import type { Result } from "../result.js";
import { computeColumnAlignments } from "./column-align.js";
import {
  analyzeMarkdownLoss,
  hasAmbiguousLeadingListParagraph,
  isGfmListLikeBlockType,
  type MarkdownLoss,
} from "./loss-analysis.js";

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
  checked?: boolean;
  children?: MarkdownOutputNode[];
};

// textColor/backgroundColor는 기존 6종 뒤(6·7)에 붙는다 — RD-001
// DELTA-01(model TextMark 확장)이 이 Record를 컴파일 오류로 강제 갱신시켜
// 여기 추가했다.
const markOrder: Record<TextMark["type"], number> = {
  link: 0,
  bold: 1,
  italic: 2,
  strike: 3,
  code: 4,
  underline: 5,
  textColor: 6,
  backgroundColor: 7,
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
    case "textColor":
    case "backgroundColor":
      // GFM/commonmark에는 색상을 표현할 구문이 없다 — underline·code와
      // 같은 이유로 값을 버리고 콘텐츠만 통과시킨다(최종 lossy 동작,
      // 임시 스텁이 아니다). strict export의 거절과 손실 경고 보고는 더
      // 상위 계층(analyzeMarkdownLoss)이 맡는다 — RD-004가 그 카테고리를
      // 추가한다.
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
// 평탄화한다(D5, lossy export 전용). 목록 항목(toggleListItem 포함,
// isGfmListLikeBlockType)은 mdast listItem의 block children으로 계층을
// 표현할 수 있으므로 컨테이너를 유지한 채 내부에서 표현 불가능한 자식만
// 재귀적으로 평탄화한다. own content가 비고 첫 자식이 paragraph면 GFM이
// 둘의 경계를 구분하지 못하므로 그 paragraph를 content로 승격하고 나머지
// 목록 계층을 유지한다.
const flattenBlocks = (blocks: Block[]): Block[] =>
  blocks.flatMap((block): Block[] => {
    if (block.type === "table") return [block];
    // divider·CodeBlock·4종 미디어 블록(RD-003)은 children 필드 자체가
    // 없어(옵셔널이 아니라 부재) 아래 block.children 접근 전에 좁힌다.
    // quote는 children이 옵셔널이라 아래 범용 분기로 자연스럽게
    // 통과한다(07a).
    if (
      block.type === "divider" ||
      block.type === "codeBlock" ||
      block.type === "file" ||
      block.type === "image" ||
      block.type === "video" ||
      block.type === "audio"
    )
      return [block];
    if (block.children === undefined || block.children.length === 0) {
      return [block];
    }
    if (isGfmListLikeBlockType(block.type)) {
      const { children, ...ownBlock } = block;
      const flattenedChildren = flattenBlocks(children);
      const firstChild = flattenedChildren[0];
      // hasAmbiguousLeadingListParagraph(block)가 승격 여부를 결정한다.
      // firstChild?.type==="paragraph"는 순수 TS 좁히기용이다 — block.children[0]과
      // flattenedChildren[0]은 다른 값이라 TS가 둘의 동치를 모른다(hasAmbiguousLeadingListParagraph
      // 문서 참고, 두 값은 항상 같은 판정으로 일치하도록 증명됨).
      if (
        hasAmbiguousLeadingListParagraph(block) &&
        firstChild?.type === "paragraph"
      ) {
        const remainingChildren = flattenedChildren.slice(1);
        return [
          {
            ...ownBlock,
            content: firstChild.content,
            ...(remainingChildren.length === 0
              ? {}
              : { children: remainingChildren }),
          },
        ];
      }
      return [{ ...ownBlock, children: flattenedChildren }];
    }
    const { children, ...ownBlock } = block;
    return [ownBlock, ...flattenBlocks(children)];
  });

// remark-stringify는 info string의 공백·backtick은 entity로 바꾸지만 기존
// entity 형태의 ampersand는 그대로 둔다. 재파싱 때 `&copy;`가 `©`가 되지
// 않도록 ampersand를 먼저 escape해 unknown language를 exact 보존한다.
const codeBlockLanguage = (language: string): string =>
  language.replace(/&/g, "&amp;");

const listNode = (
  blocks: Array<ListItemBlock | ToggleListItemBlock>,
): MarkdownOutputNode => {
  const first = blocks[0];
  if (first === undefined) throw new Error("Cannot serialize an empty list");
  const spread = blocks.some(
    (block) => block.children !== undefined && block.children.length > 0,
  );
  return {
    type: "list",
    ordered: first.type === "numberedListItem",
    spread,
    ...(first.type === "numberedListItem" && first.startNumber !== undefined
      ? { start: first.startNumber }
      : {}),
    children: blocks.map((block) => {
      const childNodes = blockNodes(block.children ?? []);
      const ownParagraph: MarkdownOutputNode = {
        type: "paragraph",
        children: inlineNodes(block.content, false),
      };
      return {
        type: "listItem",
        spread: block.children !== undefined && block.children.length > 0,
        // mdast-util-gfm-task-list-item은 listItem의 첫 자식이 paragraph일
        // 때만 `[ ]`/`[x]`를 붙인다(라이브러리 소스 확인). 아래 own paragraph
        // 생략 최적화 때문에 첫 자식이 non-paragraph가 되는 조합(own content
        // 비고 첫 child가 quote 등)은 checked가 stringify 시 조용히
        // 사라진다 — own paragraph를 강제로 materialize해 봐도 그 빈
        // paragraph와 다음 child 사이 필수 빈 줄을 체크박스 정규식 후처리가
        // 잘라먹어 깨진 Markdown이 나온다(실측 확인, 라이브러리 결함에 가까운
        // 상호작용이라 이 DELTA에서 우회하지 않는다). 대신 이 조합을
        // loss-analysis.ts의 CHECKED_STATE_LOST로 명시 보고해 조용한 손실을
        // 막는다 — checked는 그 케이스에서만 값이 있어도 stringify가 무시한다.
        ...(block.type === "checkListItem" ? { checked: block.checked } : {}),
        // 빈 own paragraph는 Markdown에 materialize되지 않는다. 첫 자식이
        // non-paragraph면 이를 첫 mdast child로 직접 두어 `- > quote` 같은
        // 표현 가능한 빈-content 목록 구조를 보존한다. hasAmbiguousLeadingListParagraph는
        // flattenBlocks가 이미 한 번 승격을 시도한 뒤에도 남는 잔여 모호함
        // (예: 승격된 첫 child 자체가 빈 paragraph라 다음 child가 다시 첫
        // 자리에 오는 경우)까지 같은 판정으로 잡는다.
        children:
          block.content.length === 0 &&
          childNodes.length > 0 &&
          !hasAmbiguousLeadingListParagraph(block)
            ? childNodes
            : [ownParagraph, ...childNodes],
      };
    }),
  };
};

// 연속된 flat 목록 형제를 mdast list로 묶는 경계 판정은
// list-item-run-grouping.ts가 소유한다(export-html.ts와 공유, 아키텍처
// 리뷰 6차 후보 L2) — 여기서는 mdast list 생성(listNode)만 주입한다.
const blockNodes = (blocks: Block[]): MarkdownOutputNode[] =>
  groupListItemRuns(blocks, listNode).map((entry) =>
    entry.kind === "block" ? blockNode(entry.block) : entry.node,
  );

const blockNode = (block: Block): MarkdownOutputNode => {
  if (block.type === "table") return tableNode(block);
  if (block.type === "divider") return { type: "thematicBreak" };
  // 4종 미디어 블록(file/image/video/audio) — RD-003(io 컴파일 안전 최소
  // 패치)의 placeholder다. 실제 GFM 계약(spec §7.2 — image만 strict
  // round-trip, 나머지는 strict 거절/lossy link 강등)은 슬라이스6이
  // 구현하고 이 분기를 교체한다. content가 없는 leaf라 표현할 인라인이
  // 없다 — 빈 paragraph로 최소 안전 출력한다.
  if (
    block.type === "file" ||
    block.type === "image" ||
    block.type === "video" ||
    block.type === "audio"
  ) {
    return { type: "paragraph", children: [] };
  }
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
  if (isGfmListLikeBlockType(block.type)) {
    return listNode([block as ListItemBlock | ToggleListItemBlock]);
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
