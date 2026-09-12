import {
  type Block,
  type CodeBlock,
  type CustomBlock,
  type Document,
  type HeadingBlock,
  type InlineContentItem,
  isKnownBlockType,
  isListItemBlockType,
  isSafeCodeBlockLanguageClassToken,
  type ListItemBlock,
  parseDocument,
  type SyntaxHighlighter,
  type TableBlock,
  type TextBlockProps,
} from "@cp949/geul-model";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";

import type { ExportError } from "../errors.js";
import { blocksInlineContentViolation } from "../inline-content-violation.js";
import { groupListItemRuns } from "../list-item-run-grouping.js";
import type { Result } from "../result.js";
import { applyCodeBlockHighlighting } from "./code-block-highlight.js";
import {
  type HtmlElementContent,
  type HtmlElementNode,
  type HtmlRawNode,
  htmlElement,
  inlineContentToNodes,
} from "./inline-content.js";
import { textBlockPropsStyle } from "./text-block-props-style.js";

// exportHtml이 직접 구성하는 출력 트리 전용 루트다 — import·clipboard
// 파싱 소비처가 공유하는 `HtmlRoot`(inline-content.ts, "raw"를 절대 만들지
// 않는다)와 분리한다(위 blockNodes/knownBlockNodes 분리와 동일 이유).
type HtmlExportRoot = {
  type: "root";
  children: Array<HtmlElementContent | HtmlRawNode>;
};

// allowDangerousHtml: customBlockToHtml(spec §4.5, RD-003)가 반환한
// 완성된 HTML 문자열을 raw 노드로 escape 없이 통과시키기 위해 필요하다
// (사전 검증: 이 옵션 없이는 raw 노드 value가 그대로 escape된다). 등록된
// 렌더러가 없으면 이 경로 자체가 실행되지 않는다.
const stringifyProcessor = unified().use(rehypeStringify, {
  allowDangerousHtml: true,
});

export type ExportHtmlOptions = {
  customBlockToHtml?: Record<string, (block: CustomBlock) => string>;
  // spec §10(Issue #172) — codeBlock을 강조 span 포함 HTML로 내보낸다.
  // exportHtml은 완전 동기라 Promise를 반환하는 결과는 기다리지 않고 해당
  // 코드 블록만 plain으로 남긴다(ADR-0016, code-block-highlight.ts).
  syntaxHighlighter?: SyntaxHighlighter;
};

// TextBlockProps(RD-001)를 가진 7개 블록 타입(paragraph/heading/quote/목록
// 4종)이 공유하는 data-geul-* 매핑이다. 표 셀 색상·정렬(cellNode 아래)과 같은
// 패턴이지만 필드명이 align이 아니라 textAlignment라 별도 속성명을 쓴다.
// style(text-block-props-style.ts, Issue #179)은 이 세 data-geul-* 뒤에
// 마지막으로 붙는다 — import 쪽은 문서 내용 생성에는 style을 읽지 않고
// 항상 data-geul-*만 권위로 삼는다(G-CNV-001). 같은 직렬화 규칙을
// import-warnings.ts가 재사용해 raw style이 이 함수가 낼 값과 정확히
// 같을 때만 "제거됨" 경고를 억제한다 — 순서 자체는 그 비교의 일부라 여기서
// 바꾸면 import-warnings.ts도 함께 바꿔야 한다.
const textBlockPropsAttributes = (
  block: TextBlockProps,
): HtmlElementNode["properties"] => {
  const style = textBlockPropsStyle(block);
  return {
    ...(block.textColor === undefined
      ? {}
      : { dataGeulTextColor: block.textColor }),
    ...(block.backgroundColor === undefined
      ? {}
      : { dataGeulBackgroundColor: block.backgroundColor }),
    ...(block.textAlignment === undefined
      ? {}
      : { dataGeulTextAlignment: block.textAlignment }),
    ...(style === undefined ? {} : { style }),
  };
};

// 4종 leaf 미디어 블록 공통 판별 타입(spec §3.1) — url/name/caption/
// backgroundColor는 4종 공통, showPreview는 image/video/audio, previewWidth/
// textAlignment는 image/video만 갖는다(model MediaBlockCommon과 동형).
type MediaBlock = Extract<
  Document["blocks"][number],
  { type: "file" | "image" | "video" | "audio" }
>;

// outer 요소(figure 있으면 figure, 없으면 bare 시각 태그/빈 div)가 항상 싣는
// data-geul-*(RD-001-DELTA-01.md "설계" 키 순서 고정). dataGeulMediaType은
// own-format 마커 겸 showPreview:false 강등 시 타입 판별자를 겸한다(RD-001.md
// "결정" — file과 강등된 image/video/audio가 똑같이 <a>로 나오므로 태그명만
// 으로 구분할 수 없다). dataGeulName은 caption이 alt를 덮어써도(image) name이
// 사라지지 않도록 4종 공통 단일 진실 공급원으로 별도로 싣는다 — alt·anchor
// 텍스트는 표현용일 뿐 권위 있는 값이 아니다.
const mediaDataAttributes = (
  block: MediaBlock,
): HtmlElementNode["properties"] => ({
  dataGeulBlockId: block.id,
  dataGeulMediaType: block.type,
  ...(block.name === undefined ? {} : { dataGeulName: block.name }),
  ...(block.backgroundColor === undefined
    ? {}
    : { dataGeulBackgroundColor: block.backgroundColor }),
  ...(block.type !== "file" && block.showPreview !== undefined
    ? { dataGeulShowPreview: String(block.showPreview) }
    : {}),
  ...((block.type === "image" || block.type === "video") &&
  block.previewWidth !== undefined
    ? { dataGeulPreviewWidth: String(block.previewWidth) }
    : {}),
  ...((block.type === "image" || block.type === "video") &&
  block.textAlignment !== undefined
    ? { dataGeulTextAlignment: block.textAlignment }
    : {}),
});

// image의 model type은 "image"지만 HTML 태그명은 "img"다 — video/audio는
// 타입명과 태그명이 같다.
const mediaVisualTagName = (type: "image" | "video" | "audio"): string =>
  type === "image" ? "img" : type;

// file, 또는 showPreview:false로 강등된 image/video/audio가 공유하는 <a>
// 출력이다. name이 없으면 url 자체를 링크 텍스트로 쓴다(core
// mediaAnchorChildren 선례 재사용, 슬라이스5 RD-002.md "결정" 대응) —
// io는 별도 계약이지만(ADR-0002) 같은 질문에 같은 답을 반복하지 않는다.
// extraAttrs가 비어 있지 않으면 이 태그 자신이 outer(figure로 감싸지 않음)
// 라는 뜻이다 — figure로 감쌀 때는 빈 객체를 넘긴다(data-geul-*는 figure가
// 갖는다).
const mediaAnchorNode = (
  url: string,
  name: string | undefined,
  extraAttrs: HtmlElementNode["properties"],
): HtmlElementNode =>
  htmlElement("a", { href: url, ...extraAttrs }, [
    { type: "text", value: name ?? url },
  ]);

// image/video/audio의 정상(showPreview !== false) 시각 태그. alt는 spec
// §2.2·§7.1대로 caption이 있으면 caption, 없으면 name을 재사용한다(별도 alt
// prop 신설 없음 — 2026-09-04 사용자 확정, core ImageBlockExtension과 동일
// 공식).
const mediaVisualNode = (
  block: Extract<MediaBlock, { type: "image" | "video" | "audio" }>,
  url: string,
  extraAttrs: HtmlElementNode["properties"],
): HtmlElementNode => {
  if (block.type === "image") {
    return htmlElement(
      "img",
      {
        src: url,
        alt: block.caption ?? block.name ?? "",
        ...extraAttrs,
      },
      [],
    );
  }
  return htmlElement(
    mediaVisualTagName(block.type),
    { src: url, controls: true, ...extraAttrs },
    [],
  );
};

// 4종 미디어 블록의 HTML export 전체(spec §7.1). url 없는 빈 블록은
// 크래시 없이 data-geul-*만 실은 <div>로 보존한다(문서에 실제로 존재할 수
// 있는 상태 — model이 url을 optional로 둔다, 시각 콘텐츠가 없을 뿐 name·
// caption 등은 여전히 round-trip 대상이다).
const mediaBlockNode = (block: MediaBlock): HtmlElementNode => {
  const dataAttrs = mediaDataAttributes(block);
  const { url, caption } = block;

  if (url === undefined) {
    return htmlElement(
      "div",
      dataAttrs,
      caption === undefined
        ? []
        : [htmlElement("figcaption", {}, [{ type: "text", value: caption }])],
    );
  }

  const suppressed = block.type !== "file" && block.showPreview === false;
  const visual =
    block.type === "file" || suppressed
      ? mediaAnchorNode(url, block.name, caption === undefined ? dataAttrs : {})
      : mediaVisualNode(block, url, caption === undefined ? dataAttrs : {});

  if (caption === undefined) return visual;

  return htmlElement("figure", dataAttrs, [
    visual,
    htmlElement("figcaption", {}, [{ type: "text", value: caption }]),
  ]);
};

const cellNode = (
  table: TableBlock,
  rowIndex: number,
  cell: TableBlock["rows"][number]["cells"][number],
): HtmlElementNode => {
  const firstColumnId = table.columns[0]?.id;
  const isColumnHeader = rowIndex < table.headerRows;
  const isRowHeader =
    !isColumnHeader &&
    table.headerColumns === 1 &&
    cell.columnId === firstColumnId;
  const properties: HtmlElementNode["properties"] = {
    dataGeulCellId: cell.id,
    dataGeulColumnId: cell.columnId,
    rowSpan: cell.rowSpan,
    colSpan: cell.columnSpan,
  };

  if (isRowHeader) properties.scope = "row";
  if (cell.textColor !== undefined) {
    properties.dataGeulTextColor = cell.textColor;
  }
  if (cell.backgroundColor !== undefined) {
    properties.dataGeulBackgroundColor = cell.backgroundColor;
  }
  if (cell.align !== undefined) {
    properties.dataGeulAlign = cell.align;
  }

  return htmlElement(
    isColumnHeader || isRowHeader ? "th" : "td",
    properties,
    inlineContentToNodes(cell.content),
  );
};

const rowNode = (table: TableBlock, rowIndex: number): HtmlElementNode => {
  const row = table.rows[rowIndex];
  if (row === undefined) {
    throw new Error(`Missing table row at index ${rowIndex}`);
  }

  const columnIndices = new Map(
    table.columns.map((column, index) => [column.id, index]),
  );
  const cells = [...row.cells].sort(
    (left, right) =>
      (columnIndices.get(left.columnId) ?? Number.MAX_SAFE_INTEGER) -
      (columnIndices.get(right.columnId) ?? Number.MAX_SAFE_INTEGER),
  );

  return htmlElement(
    "tr",
    { dataGeulRowId: row.id },
    cells.map((cell) => cellNode(table, rowIndex, cell)),
  );
};

const tableNode = (table: TableBlock): HtmlElementNode => {
  const children: HtmlElementContent[] = [
    htmlElement(
      "colgroup",
      {},
      table.columns.map((column) =>
        htmlElement(
          "col",
          {
            dataGeulColumnId: column.id,
            dataGeulWidth: String(column.width),
          },
          [],
        ),
      ),
    ),
  ];

  const headerRow = table.rows[0];
  const useThead =
    table.headerRows === 1 &&
    headerRow !== undefined &&
    headerRow.cells.every((cell) => cell.rowSpan === 1);
  if (useThead) {
    children.push(htmlElement("thead", {}, [rowNode(table, 0)]));
  }

  const bodyStart = useThead ? 1 : 0;
  children.push(
    htmlElement(
      "tbody",
      {},
      table.rows
        .slice(bodyStart)
        .map((_, index) => rowNode(table, bodyStart + index)),
    ),
  );

  return htmlElement(
    "table",
    {
      dataGeulBlockId: table.id,
      dataGeulHeaderRows: String(table.headerRows),
      dataGeulHeaderColumns: String(table.headerColumns),
    },
    children,
  );
};

// CodeBlock source는 일반 inline content와 달리 LF와 literal Tab을 허용하는
// plain text다. inlineContentToNodes를 쓰면 LF가 <br>로 바뀌므로 text node
// 하나로 직렬화한다. class에는 안전한 language token만 복제한다(spec §7.1).
const codeBlockNode = (block: CodeBlock): HtmlElementNode => {
  const codeProperties: HtmlElementNode["properties"] = {};
  if (block.language !== undefined) {
    codeProperties.dataLanguage = block.language;
    if (isSafeCodeBlockLanguageClassToken(block.language)) {
      codeProperties.className = [`language-${block.language}`];
    }
  }

  // CodeBlock.content는 model 계약상 항상 텍스트 런 1개뿐이다(코드 블록은
  // 커스텀 inline 원소·mark를 담지 않는다) — 계약 전제 캐스트(DELTA-14
  // inlineContentToTiptap과 동일 패턴).
  const source = block.content[0] as
    Extract<InlineContentItem, { text: string }> | undefined;
  return htmlElement("pre", { dataGeulBlockId: block.id }, [
    htmlElement("code", codeProperties, [
      { type: "text", value: source?.text ?? "" },
    ]),
  ]);
};

const listItemNode = (block: ListItemBlock): HtmlElementNode =>
  htmlElement(
    "li",
    {
      dataGeulBlockId: block.id,
      ...(block.type === "checkListItem"
        ? { dataGeulChecked: String(block.checked) }
        : {}),
      ...textBlockPropsAttributes(block),
    },
    [
      ...(block.children === undefined || block.children.length === 0
        ? inlineContentToNodes(block.content)
        : [
            htmlElement("p", {}, inlineContentToNodes(block.content)),
            ...knownBlockNodes(block.children),
          ]),
    ],
  );

// isToggleable heading·toggleListItem이 공유하는 <details> 표현(로드맵 D4,
// RD-005-DELTA-01.md "착수 전 결정"). collapsed는 3상태(undefined/true/false —
// PM 반전 명령이 항상 boolean으로 고정하므로 세 상태 모두 실제로 나타난다)라
// open(2상태뿐인 HTML boolean 속성, 브라우저 렌더링용 파생값)만으로는
// undefined와 false를 구분 못 한다 — data-geul-collapsed(정의된 경우만 출력,
// data-geul-checked와 동일한 문자열 패턴)를 round-trip의 단일 진실 공급원으로
// 삼는다. summary는 호출자가 만든다 — heading은 기존 <hN>을 감싸고,
// toggleListItem은 own id·content를 <summary> 자신이 직접 갖는다(<li>가
// 아니라 여기서 처음 id가 등장하므로).
const detailsNode = (
  id: string,
  collapsed: boolean | undefined,
  summary: HtmlElementNode,
  children: Block[] | undefined,
): HtmlElementNode => {
  const detailsChildren: HtmlElementContent[] = [summary];
  if (children !== undefined && children.length > 0) {
    detailsChildren.push(
      htmlElement("div", { dataGeulChildren: "1" }, knownBlockNodes(children)),
    );
  }
  return htmlElement(
    "details",
    {
      dataGeulBlockId: id,
      dataGeulToggleable: "true",
      ...(collapsed === undefined
        ? {}
        : { dataGeulCollapsed: String(collapsed) }),
      open: collapsed !== true,
    },
    detailsChildren,
  );
};

// numberedListItem만 <ol>이다 — bulletListItem·checkListItem은 둘 다
// 번호가 없는 <ul>이다(로드맵 D3, checkListItem은 data-geul-checked로만
// 구분한다).
const listNode = (blocks: ListItemBlock[]): HtmlElementNode => {
  const first = blocks[0];
  if (first === undefined) throw new Error("Cannot serialize an empty list");
  return htmlElement(
    first.type === "numberedListItem" ? "ol" : "ul",
    first.type === "numberedListItem" && first.startNumber !== undefined
      ? { start: first.startNumber }
      : {},
    blocks.map(listItemNode),
  );
};

// 연속된 flat 목록 형제를 종류별 컨테이너로 묶는 경계 판정은
// list-item-run-grouping.ts가 소유한다(export-markdown.ts와 공유, 아키텍처
// 리뷰 6차 후보 L2) — 여기서는 <ul>/<ol> 생성(listNode)만 주입한다.
const blockNodes = (
  blocks: Block[],
  customBlockToHtml?: Record<string, (block: CustomBlock) => string>,
): Array<HtmlElementContent | HtmlRawNode> =>
  groupListItemRuns(blocks, listNode).map((entry) => {
    if (entry.kind !== "block") return entry.node;
    // top-level 전용 CustomBlock(model, RD-002)이 Block[]로 캐스트된 채
    // 여기 도달할 수 있다 — exportHtml 진입점이 등록된 타입만 통과시켰다는
    // 계약 위에서 렌더러를 바로 호출한다(RD-003). 렌더러가 반환한 문자열은
    // 구조화된 트리로 재파싱하지 않고 raw 노드로 그대로 삽입한다.
    if (!isKnownBlockType(entry.block.type)) {
      const renderer = customBlockToHtml?.[entry.block.type];
      return {
        type: "raw" as const,
        value: renderer!(entry.block as unknown as CustomBlock),
      };
    }
    return blockNode(entry.block);
  });

// CustomBlock은 top-level 전용 leaf라(model, RD-002) 어떤 블록의 children
// 자리에도 나타나지 않는다 — 이 불변식 위에서 재귀 호출 자리는 raw 노드가
// 섞이지 않은 blockNodes 결과만 받는다고 좁혀 쓴다(customBlockToHtml을
// threading하지 않는 이유이기도 하다). 최상위 호출(exportHtml 본문)만
// customBlockToHtml을 직접 전달하고 이 헬퍼를 거치지 않는다.
const knownBlockNodes = (blocks: Block[]): HtmlElementContent[] =>
  blockNodes(blocks) as HtmlElementContent[];

// children이 있는 paragraph/heading은 자기 자신(children 없이, blockId
// 그대로)과 children을 감싼 두 번째 컨테이너를 <div data-geul-block-id>
// wrapper 하나로 묶는다(트랙-2 라운드4 확정, 후보 A). <p>는 HTML5상 <div>를
// 자식으로 가질 수 없어(https://html.spec.whatwg.org/#the-p-element,
// "Content model: Phrasing content") 이 wrapper 없이는 children을 <p> 밑에
// 직접 낼 수 없다. children이 없는 블록은 지금처럼 <p>/<hN>을 그대로
// 낸다(diff 최소, 기존 문서 출력 불변 — 완료 조건 5). wrapper 자신은
// dataGeulBlockId를 그 블록과 같은 값으로 다시 얹는다(중복이지만 안쪽
// <p>/<hN>과 동일하므로 정보 손실이 없고, 사람이 HTML만 보고도 어느 블록의
// wrapper인지 바로 알 수 있다). 두 번째 컨테이너는 dataGeulChildren
// 마커만으로 "자기 콘텐츠"와 "children 묶음"을 구분한다 — import-html.ts의
// findChildrenWrapper가 정확히 이 두 자리(자식 요소 2개: 첫째 p/h1~h6,
// 둘째 dataGeulChildren 있는 div)만 wrapper로 인식한다. divider는 children을
// 가질 수 없는 리프라(spec §4.2) 이 wrapper의 자기 콘텐츠 자리에 오지 않는다.
// quote는 이 wrapper를 쓰지 않는다 — blockquote가 flow content를 담을 수
// 있어 자기 콘텐츠 <p>와 children 컨테이너를 blockquote 안에 직접 둔다
// (아래 quote 분기).
const blockNode = (block: Block): HtmlElementNode => {
  if (block.type === "table") return tableNode(block);
  if (block.type === "codeBlock") return codeBlockNode(block);
  if (isListItemBlockType(block.type)) {
    return listNode([block as ListItemBlock]);
  }
  // toggleListItem은 ListItemBlockType이 아니다(로드맵 D2 — <li>/<ul> 표현이
  // 없다). heading과 동형으로 독립 <details>를 낸다(로드맵 D4).
  if (block.type === "toggleListItem") {
    return detailsNode(
      block.id,
      block.collapsed,
      htmlElement(
        "summary",
        { dataGeulBlockId: block.id, ...textBlockPropsAttributes(block) },
        inlineContentToNodes(block.content),
      ),
      block.children,
    );
  }
  // divider → <hr data-geul-block-id>(spec §7.1). 콘텐츠·children 없는 void
  // 요소 하나다 — import-html.ts의 hr 세그먼트가 dataGeulBlockId를 되읽는다.
  if (block.type === "divider") {
    return htmlElement("hr", { dataGeulBlockId: block.id }, []);
  }
  // 4종 미디어 블록(file/image/video/audio, spec §7.1) — RD-001-DELTA-01.
  if (
    block.type === "file" ||
    block.type === "image" ||
    block.type === "video" ||
    block.type === "audio"
  ) {
    return mediaBlockNode(block);
  }
  // quote → <blockquote data-geul-block-id><p>content</p>[<div
  // data-geul-children>children</div>]</blockquote>(spec §7.1 — children은
  // blockquote 안에 중첩 HTML로, DELTA-06a). blockquote 자신이 id 소유자라
  // 안쪽 <p>에는 id를 얹지 않고, children 컨테이너는 paragraph/heading
  // wrapper와 같은 dataGeulChildren 마커를 쓴다. content가 비어도 <p></p>를
  // 낸다 — import-html.ts의 D6 규칙("첫 <p>가 content")의 역변환 대칭이다:
  // 빈 <p>를 생략하면 re-import가 첫 children 문단을 content로 승격한다.
  if (block.type === "quote") {
    const quoteChildren: HtmlElementContent[] = [
      htmlElement("p", {}, inlineContentToNodes(block.content)),
    ];
    if (block.children !== undefined && block.children.length > 0) {
      quoteChildren.push(
        htmlElement(
          "div",
          { dataGeulChildren: "1" },
          knownBlockNodes(block.children),
        ),
      );
    }
    return htmlElement(
      "blockquote",
      { dataGeulBlockId: block.id, ...textBlockPropsAttributes(block) },
      quoteChildren,
    );
  }

  // heading은 model HeadingBlock.level(1~6)을 그대로 h1~h6 태그명으로 쓴다.
  // isListItemBlockType(위)이 discriminated union인 block 자체는 좁히지
  // 못해, table/codeBlock/목록/divider/quote를 모두 걸러낸 이 지점이
  // paragraph 아니면 heading뿐이라는 것을 predicate 계약으로 명시한다.
  const tagName =
    block.type === "paragraph" ? "p" : `h${(block as HeadingBlock).level}`;
  const ownNode = htmlElement(
    tagName,
    { dataGeulBlockId: block.id, ...textBlockPropsAttributes(block) },
    inlineContentToNodes(block.content),
  );

  // isToggleable heading은 children-wrapper(<div>) 대신 <details>로 감싼다
  // (로드맵 D4) — children 유무와 무관하게 항상 감싼다. isToggleable 자체가
  // 보존 대상이라 children이 없어도 <details> 없이는 그 사실이 사라진다.
  if (block.type === "heading" && block.isToggleable === true) {
    return detailsNode(
      block.id,
      block.collapsed,
      htmlElement("summary", {}, [ownNode]),
      block.children,
    );
  }

  if (block.children === undefined || block.children.length === 0) {
    return ownNode;
  }

  // 자식 블록은 table을 포함해 blockNode를 그대로 재귀 호출한다(완료 조건
  // 6) — table 분기(tableNode)는 이 함수 맨 위에서 이미 처리하므로 별도
  // 분기를 추가하지 않는다.
  return htmlElement("div", { dataGeulBlockId: block.id }, [
    ownNode,
    htmlElement(
      "div",
      { dataGeulChildren: "1" },
      knownBlockNodes(block.children),
    ),
  ]);
};

export const exportHtml = (
  document: Document,
  options?: ExportHtmlOptions,
): Result<string, ExportError> => {
  const parsed = parseDocument(document);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: "HTML_DOCUMENT_INVALID",
        message: `Cannot export invalid document: ${parsed.error.message}`,
      },
    };
  }
  // top-level CustomBlock(model, RD-002-DELTA-01) 중 customBlockToHtml에
  // 등록되지 않은 타입만 거절한다(RD-003, spec §4.5 CUSTOM_BLOCK_LOST) —
  // exportHtml은 strict/lossy 모드가 없어(spec 시그니처 참고) 미등록은
  // 항상 즉시 거절로 충분하다. 등록된 타입은 아래 blockNodes가 렌더러를
  // 호출해 처리한다.
  const unsupportedBlock = parsed.value.blocks.find(
    (block) =>
      !isKnownBlockType(block.type) &&
      options?.customBlockToHtml?.[block.type] === undefined,
  );
  if (unsupportedBlock !== undefined) {
    return {
      ok: false,
      error: {
        code: "HTML_DOCUMENT_INVALID",
        message: `Block ${unsupportedBlock.id} has unregistered custom type "${unsupportedBlock.type}" — no customBlockToHtml renderer is registered for it`,
      },
    };
  }
  // block 내부 inline 레벨 커스텀 원소·CustomTextMark(EXT-002/EXT-003)도
  // 같은 이유로 임시 거절한다(RD-002-DELTA-16) — top-level 게이트(위)는
  // 최상위 block 타입만 보고 content 안쪽은 검사하지 않아, 이 가드가 없으면
  // inlineContentToNodes가 item.text/item.marks에 무가드 접근해 크래시한다.
  // blocksInlineContentViolation은 등록된 CustomBlock(RD-003으로 위 게이트를
  // 통과한 것)을 divider/media와 동일하게 건너뛴다(자체 방어).
  const inlineViolation = blocksInlineContentViolation(
    parsed.value.blocks as Block[],
  );
  if (inlineViolation !== null) {
    return {
      ok: false,
      error: {
        code: "HTML_DOCUMENT_INVALID",
        message:
          `Block ${inlineViolation.blockId}` +
          (inlineViolation.cellId === undefined
            ? ""
            : ` cell ${inlineViolation.cellId}`) +
          ` ${inlineViolation.reason} — customInlineContent/customStyles registry is not supported yet`,
      },
    };
  }
  try {
    const root: HtmlExportRoot = {
      type: "root",
      children: blockNodes(
        parsed.value.blocks as Block[],
        options?.customBlockToHtml,
      ),
    };
    if (options?.syntaxHighlighter !== undefined) {
      root.children = applyCodeBlockHighlighting(
        root.children,
        options.syntaxHighlighter,
      );
    }
    return {
      ok: true,
      // "raw" 노드는 hast-util-raw의 타입 확장 없이는 hast의 공식
      // RootContent 유니온에 없다 — 런타임은 hast-util-to-html이
      // allowDangerousHtml 옵션만으로 이미 지원함을 스크립트로 확인했다
      // (export-markdown.ts의 documentNode 캐스트와 동일한 계약 전제
      // 캐스트, RD-003).
      value: stringifyProcessor.stringify(
        root as Parameters<typeof stringifyProcessor.stringify>[0],
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "HTML_SERIALIZE_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to serialize HTML",
      },
    };
  }
};
