import {
  type Block,
  type CustomBlock,
  type Document,
  type InlineContent,
  isKnownBlockType,
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
import { blocksInlineContentViolation } from "../inline-content-violation.js";
import { groupListItemRuns } from "../list-item-run-grouping.js";
import type { Result } from "../result.js";
import { computeColumnAlignments } from "./column-align.js";
import {
  analyzeMarkdownLoss,
  hasAmbiguousLeadingListParagraph,
  isGfmContainerLikeBlockType,
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
  alt?: string;
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

// table 밖 블록(inTableCell: false)의 `\n`도 table cell과 대칭으로
// 하드브레이크 노드를 삽입한다(RD-004, #177). table cell은 GFM 표 구문이
// 셀 안 개행을 허용하지 않아 mdast `break`가 공백 하나로 뭉개진다(실측,
// mdast-util-to-markdown의 기본 break 핸들러 — 개행이 허용되지 않는
// scope에서는 space로 폴백) — 그래서 계속 `<br>` HTML 노드로 우회한다.
// table 밖은 그 제약이 없어 `break`가 `\\\n`(백슬래시+개행)으로 정상
// 직렬화되고, import 쪽(`import-markdown-inline.ts`의 `case "break"`)은
// 이미 위치와 무관하게 `\n`으로 디코드해 대칭이 갖춰져 있었다 — export
// 쪽만 이 DELTA가 채운다.
const textNodes = (
  text: string,
  inTableCell: boolean,
): MarkdownOutputNode[] => {
  if (!inTableCell && !text.includes("\n")) {
    return [{ type: "text", value: text }];
  }

  const parts = text.split("\n");
  const nodes: MarkdownOutputNode[] = [];
  for (const [index, part] of parts.entries()) {
    if (part.length > 0) nodes.push({ type: "text", value: part });
    if (index < parts.length - 1) {
      nodes.push(
        inTableCell ? { type: "html", value: "<br>" } : { type: "break" },
      );
    }
  }
  return nodes;
};

const inlineNodes = (
  content: InlineContent,
  inTableCell: boolean,
): MarkdownOutputNode[] =>
  content.flatMap((rawItem) => {
    // 계약: exportMarkdown의 blocksInlineContentViolation(RD-002-DELTA-16)
    // 가 이 함수 호출 전에 이미 커스텀 inline 원소·CustomTextMark를
    // MARKDOWN_DOCUMENT_INVALID로 거절했다는 전제 위에서 텍스트 런·알려진
    // 마크로 캐스트한다(core inlineContentToTiptap과 동일 패턴). 이 함수는
    // packages/io/src/index.ts에 재수출되지 않는 내부 전용이라 진입점
    // 게이트를 우회해 호출될 길이 없다.
    const item = rawItem as { text: string; marks?: TextMark[] };
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

// children이 있는 paragraph/heading을 부모 바로 뒤의 형제 블록으로
// 평탄화한다(D5, lossy export 전용 — 이 둘은 확정 사항 9가 원천 불가능으로
// 확정해 재평가 대상이 아니다). 목록 항목(toggleListItem 포함)과 quote
// (isGfmContainerLikeBlockType, BLK-005 재평가로 편입)는 각각 mdast
// listItem·blockquote의 block children으로 계층을 표현할 수 있으므로
// 컨테이너를 유지한 채 내부에서 표현 불가능한 자식만 재귀적으로 평탄화한다.
// own content가 비고 첫 자식이 paragraph면 GFM이 둘의 경계를 구분하지
// 못하므로 그 paragraph를 content로 승격하고 나머지 계층을 유지한다.
const flattenBlocks = (
  blocks: Block[],
  customBlockToMarkdown?: Record<string, (block: CustomBlock) => string>,
): Block[] =>
  blocks.flatMap((block): Block[] => {
    // top-level 전용 CustomBlock(model, RD-002)은 children 필드가 없다.
    // lossy export에서 미등록이면 폐기하고(RD-003, CUSTOM_BLOCK_LOST는
    // analyzeMarkdownLoss가 이미 warnings로 보고했다), 등록돼 있으면 그대로
    // 통과시켜 blockNodes가 렌더러로 렌더하게 한다.
    if (!isKnownBlockType(block.type)) {
      return customBlockToMarkdown?.[block.type] !== undefined ? [block] : [];
    }
    if (block.type === "table") return [block];
    // divider·CodeBlock·4종 미디어 블록은 children 필드 자체가 없어(옵셔널이
    // 아니라 부재, leaf 블록) 아래 block.children 접근 전에 좁힌다 — 이
    // early return 자체는 RD-002(GFM 계약 구현)가 와도 바뀌지 않는다,
    // 애초에 flatten할 children이 없다. quote는 children이 옵셔널이라 아래
    // 범용 분기로 자연스럽게 통과한다(07a).
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
    if (isGfmContainerLikeBlockType(block.type)) {
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
const blockNodes = (
  blocks: Block[],
  customBlockToMarkdown?: Record<string, (block: CustomBlock) => string>,
): MarkdownOutputNode[] =>
  groupListItemRuns(blocks, listNode).map((entry) => {
    if (entry.kind !== "block") return entry.node;
    // top-level 전용 CustomBlock(model, RD-002)이 Block[]로 캐스트된 채
    // 여기 도달할 수 있다 — strict 거절/lossy 폐기(analyzeMarkdownLoss·
    // flattenBlocks)를 이미 거친 뒤라 등록된 타입만 남는다(RD-003). 렌더러가
    // 반환한 markdown 문자열은 mdast 표준 raw HTML 블록 노드로 그대로
    // 삽입한다(CommonMark가 1급으로 지원, 재파싱 없음).
    if (!isKnownBlockType(entry.block.type)) {
      const renderer = customBlockToMarkdown?.[entry.block.type];
      return {
        type: "html",
        value: renderer!(entry.block as unknown as CustomBlock),
      };
    }
    return blockNode(entry.block);
  });

const blockNode = (block: Block): MarkdownOutputNode => {
  if (block.type === "table") return tableNode(block);
  if (block.type === "divider") return { type: "thematicBreak" };
  // 4종 미디어 블록(file/image/video/audio) — Issue #152 슬라이스6, RD-002
  // DELTA-01(spec §7.2). previewWidth/showPreview/textAlignment/caption/
  // backgroundColor는 어느 조합이든 이 함수가 그냥 버린다 — strict export는
  // loss-analysis.ts가 이미 그 값들을 거절했으므로 이 함수에 도달하는 시점엔
  // 값이 있어도(lossy) 안전하게 폐기할 수 있다(폐기 자체는 경고로 이미
  // 보고됨, G-CNV-002). name이 없으면 url을 텍스트로 쓴다(mediaAnchorNode,
  // export-html.ts 전례와 동일 공식).
  if (
    block.type === "file" ||
    block.type === "image" ||
    block.type === "video" ||
    block.type === "audio"
  ) {
    const url = block.url ?? "";
    const text = block.name ?? url;
    // Image는 showPreview:false일 때만 링크로 강등한다(html export의
    // `block.type !== "file" && block.showPreview === false`와 동일 조건 —
    // 재import가 `![]()`만 Image로 인식하므로(spec §7.3) 강등된 이미지도
    // 이미 손실이라 링크로 낸다). Video/Audio/File은 GFM 표현 수단이
    // 아예 없어 showPreview와 무관하게 항상 링크다.
    if (block.type === "image" && block.showPreview !== false) {
      return {
        type: "paragraph",
        children: [{ type: "image", url, alt: text }],
      };
    }
    return {
      type: "paragraph",
      children: [
        { type: "link", url, children: [{ type: "text", value: text }] },
      ],
    };
  }
  // CodeBlock은 model 검증을 통과한 plain-text leaf다. mdast code node가
  // fence 길이와 info string entity escape를 맡아 source/language를 보존한다.
  if (block.type === "codeBlock") {
    // CodeBlock.content는 model 계약상 항상 텍스트 런 1개뿐이다(코드
    // 블록은 커스텀 inline 원소·mark를 담지 않는다) — 계약 전제 캐스트
    // (export-html.ts::codeBlockNode와 동일 패턴).
    const source = block.content[0] as
      { text: string; marks?: TextMark[] } | undefined;
    return {
      type: "code",
      value: source?.text ?? "",
      ...(block.language === undefined
        ? {}
        : { lang: codeBlockLanguage(block.language) }),
    };
  }
  if (isGfmListLikeBlockType(block.type)) {
    return listNode([block as ListItemBlock | ToggleListItemBlock]);
  }
  if (block.type === "quote") {
    // BLK-005 재평가(Issue #151) — GFM blockquote의 content model이 root와
    // 같은 flow content라 children을 listNode의 own-paragraph 규칙과 동일하게
    // 재귀 변환한다(loss-analysis.ts의 hasAmbiguousLeadingListParagraph 문서
    // 참고, 세 곳이 같은 판정을 공유해야 함). own content가 비고 첫 child가
    // paragraph면 GFM이 그 둘의 경계를 구분하지 못해 own paragraph를
    // materialize하지 않는다 — flattenBlocks의 승격과 동일한 판정.
    const childNodes = blockNodes(block.children ?? []);
    const ownParagraph: MarkdownOutputNode = {
      type: "paragraph",
      children: inlineNodes(block.content, false),
    };
    return {
      type: "blockquote",
      children:
        block.content.length === 0 &&
        childNodes.length > 0 &&
        !hasAmbiguousLeadingListParagraph(block)
          ? childNodes
          : [ownParagraph, ...childNodes],
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

const documentNode = (
  document: Document,
  customBlockToMarkdown?: Record<string, (block: CustomBlock) => string>,
): MarkdownOutputNode => ({
  type: "root",
  children: blockNodes(document.blocks as Block[], customBlockToMarkdown),
});

export type MarkdownLossNotAllowedError = {
  code: "MARKDOWN_LOSS_NOT_ALLOWED";
  losses: MarkdownLoss[];
};

export type MarkdownExportError = ExportError | MarkdownLossNotAllowedError;

export function exportMarkdown(
  document: Document,
  options: {
    mode: "strict";
    customBlockToMarkdown?: Record<string, (block: CustomBlock) => string>;
  },
): Result<string, MarkdownExportError>;
export function exportMarkdown(
  document: Document,
  options: {
    mode: "lossy";
    customBlockToMarkdown?: Record<string, (block: CustomBlock) => string>;
  },
): Result<{ markdown: string; warnings: MarkdownLoss[] }, ExportError>;
export function exportMarkdown(
  document: Document,
  options: {
    mode: "strict" | "lossy";
    customBlockToMarkdown?: Record<string, (block: CustomBlock) => string>;
  },
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

  // block 내부 inline 레벨 커스텀 원소·CustomTextMark(EXT-002/EXT-003)는
  // mode(strict/lossy)와 무관하게 임시 거절한다(RD-002-DELTA-16, RD-003
  // 범위 밖 — customInlineContent/customStyles는 이 RD가 다루지 않는다).
  // "손실"이 아니라 "표현 수단 자체가 없음"이라 lossy 모드가 조용히
  // 통과시키면 안 된다. blocksInlineContentViolation은 등록된 top-level
  // CustomBlock(아래 loss 분석에서 허용되는 것)을 divider/media와 동일하게
  // 건너뛴다(자체 방어, inline-content-violation.ts).
  const inlineViolation = blocksInlineContentViolation(
    parsed.value.blocks as Block[],
  );
  if (inlineViolation !== null) {
    return {
      ok: false,
      error: {
        code: "MARKDOWN_DOCUMENT_INVALID",
        message:
          `Block ${inlineViolation.blockId}` +
          (inlineViolation.cellId === undefined
            ? ""
            : ` cell ${inlineViolation.cellId}`) +
          ` ${inlineViolation.reason} — customInlineContent/customStyles registry is not supported yet`,
      },
    };
  }

  // top-level CustomBlock(model, RD-002-DELTA-01) 중 customBlockToMarkdown에
  // 등록되지 않은 타입은 신규 손실 카테고리 CUSTOM_BLOCK_LOST로 처리한다
  // (RD-003, spec §4.5) — 기존 MEDIA_TYPE_LOST/INLINE_COLOR와 동일한
  // strict/lossy 이분법을 그대로 재사용한다. 등록된 타입은 손실이 아니다.
  const customBlockTypes = new Set(
    Object.keys(options.customBlockToMarkdown ?? {}),
  );
  const losses = analyzeMarkdownLoss(parsed.value, customBlockTypes);
  if (options.mode === "strict" && losses.length > 0) {
    return {
      ok: false,
      error: { code: "MARKDOWN_LOSS_NOT_ALLOWED", losses },
    };
  }

  try {
    const outputDocument: Document =
      options.mode === "lossy"
        ? {
            ...parsed.value,
            blocks: flattenBlocks(
              parsed.value.blocks as Block[],
              options.customBlockToMarkdown,
            ),
          }
        : parsed.value;
    const markdown = stringifyProcessor.stringify(
      documentNode(outputDocument, options.customBlockToMarkdown) as Parameters<
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
