import {
  type Block,
  type CodeBlock,
  type Document,
  type HeadingBlock,
  isListItemBlockType,
  isSafeCodeBlockLanguageClassToken,
  type ListItemBlock,
  parseDocument,
  type TableBlock,
} from "@cp949/geul-model";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";

import type { ExportError } from "../errors.js";
import { groupListItemRuns } from "../list-item-run-grouping.js";
import type { Result } from "../result.js";
import {
  type HtmlElementContent,
  type HtmlElementNode,
  type HtmlRoot,
  htmlElement,
  inlineContentToNodes,
} from "./inline-content.js";

const stringifyProcessor = unified().use(rehypeStringify);

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
    dataBeCellId: cell.id,
    dataBeColumnId: cell.columnId,
    rowSpan: cell.rowSpan,
    colSpan: cell.columnSpan,
  };

  if (isRowHeader) properties.scope = "row";
  if (cell.textColor !== undefined) {
    properties.dataBeTextColor = cell.textColor;
  }
  if (cell.backgroundColor !== undefined) {
    properties.dataBeBackgroundColor = cell.backgroundColor;
  }
  if (cell.align !== undefined) {
    properties.dataBeAlign = cell.align;
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
    { dataBeRowId: row.id },
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
            dataBeColumnId: column.id,
            dataBeWidth: String(column.width),
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
      dataBeBlockId: table.id,
      dataBeHeaderRows: String(table.headerRows),
      dataBeHeaderColumns: String(table.headerColumns),
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

  return htmlElement("pre", { dataBeBlockId: block.id }, [
    htmlElement("code", codeProperties, [
      { type: "text", value: block.content[0]?.text ?? "" },
    ]),
  ]);
};

const listItemNode = (block: ListItemBlock): HtmlElementNode =>
  htmlElement(
    "li",
    {
      dataBeBlockId: block.id,
      ...(block.type === "checkListItem"
        ? { dataBeChecked: String(block.checked) }
        : {}),
    },
    [
      ...(block.children === undefined || block.children.length === 0
        ? inlineContentToNodes(block.content)
        : [
            htmlElement("p", {}, inlineContentToNodes(block.content)),
            ...blockNodes(block.children),
          ]),
    ],
  );

// isToggleable heading·toggleListItem이 공유하는 <details> 표현(로드맵 D4,
// RD-005-DELTA-01.md "착수 전 결정"). collapsed는 3상태(undefined/true/false —
// PM 반전 명령이 항상 boolean으로 고정하므로 세 상태 모두 실제로 나타난다)라
// open(2상태뿐인 HTML boolean 속성, 브라우저 렌더링용 파생값)만으로는
// undefined와 false를 구분 못 한다 — data-be-collapsed(정의된 경우만 출력,
// data-be-checked와 동일한 문자열 패턴)를 round-trip의 단일 진실 공급원으로
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
      htmlElement("div", { dataBeChildren: "1" }, blockNodes(children)),
    );
  }
  return htmlElement(
    "details",
    {
      dataBeBlockId: id,
      dataBeToggleable: "true",
      ...(collapsed === undefined
        ? {}
        : { dataBeCollapsed: String(collapsed) }),
      open: collapsed !== true,
    },
    detailsChildren,
  );
};

// numberedListItem만 <ol>이다 — bulletListItem·checkListItem은 둘 다
// 번호가 없는 <ul>이다(로드맵 D3, checkListItem은 data-be-checked로만
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
const blockNodes = (blocks: Block[]): HtmlElementNode[] =>
  groupListItemRuns(blocks, listNode).map((entry) =>
    entry.kind === "block" ? blockNode(entry.block) : entry.node,
  );

// children이 있는 paragraph/heading은 자기 자신(children 없이, blockId
// 그대로)과 children을 감싼 두 번째 컨테이너를 <div data-be-block-id>
// wrapper 하나로 묶는다(트랙-2 라운드4 확정, 후보 A). <p>는 HTML5상 <div>를
// 자식으로 가질 수 없어(https://html.spec.whatwg.org/#the-p-element,
// "Content model: Phrasing content") 이 wrapper 없이는 children을 <p> 밑에
// 직접 낼 수 없다. children이 없는 블록은 지금처럼 <p>/<hN>을 그대로
// 낸다(diff 최소, 기존 문서 출력 불변 — 완료 조건 5). wrapper 자신은
// dataBeBlockId를 그 블록과 같은 값으로 다시 얹는다(중복이지만 안쪽
// <p>/<hN>과 동일하므로 정보 손실이 없고, 사람이 HTML만 보고도 어느 블록의
// wrapper인지 바로 알 수 있다). 두 번째 컨테이너는 dataBeChildren
// 마커만으로 "자기 콘텐츠"와 "children 묶음"을 구분한다 — import-html.ts의
// findChildrenWrapper가 정확히 이 두 자리(자식 요소 2개: 첫째 p/h1~h6,
// 둘째 dataBeChildren 있는 div)만 wrapper로 인식한다. divider는 children을
// 가질 수 없는 리프라(spec §4.2) 이 wrapper의 자기 콘텐츠 자리에 오지 않는다.
// quote는 이 wrapper를 쓰지 않는다 — blockquote가 flow content를 담을 수
// 있어 자기 콘텐츠 <p>와 children 컨테이너를 blockquote 안에 직접 둔다
// (아래 quote 분기).
const blockNode = (block: Document["blocks"][number]): HtmlElementNode => {
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
        { dataBeBlockId: block.id },
        inlineContentToNodes(block.content),
      ),
      block.children,
    );
  }
  // divider → <hr data-be-block-id>(spec §7.1). 콘텐츠·children 없는 void
  // 요소 하나다 — import-html.ts의 hr 세그먼트가 dataBeBlockId를 되읽는다.
  if (block.type === "divider") {
    return htmlElement("hr", { dataBeBlockId: block.id }, []);
  }
  // quote → <blockquote data-be-block-id><p>content</p>[<div
  // data-be-children>children</div>]</blockquote>(spec §7.1 — children은
  // blockquote 안에 중첩 HTML로, DELTA-06a). blockquote 자신이 id 소유자라
  // 안쪽 <p>에는 id를 얹지 않고, children 컨테이너는 paragraph/heading
  // wrapper와 같은 dataBeChildren 마커를 쓴다. content가 비어도 <p></p>를
  // 낸다 — import-html.ts의 D6 규칙("첫 <p>가 content")의 역변환 대칭이다:
  // 빈 <p>를 생략하면 re-import가 첫 children 문단을 content로 승격한다.
  if (block.type === "quote") {
    const quoteChildren: HtmlElementContent[] = [
      htmlElement("p", {}, inlineContentToNodes(block.content)),
    ];
    if (block.children !== undefined && block.children.length > 0) {
      quoteChildren.push(
        htmlElement("div", { dataBeChildren: "1" }, blockNodes(block.children)),
      );
    }
    return htmlElement(
      "blockquote",
      { dataBeBlockId: block.id },
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
    { dataBeBlockId: block.id },
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
  return htmlElement("div", { dataBeBlockId: block.id }, [
    ownNode,
    htmlElement("div", { dataBeChildren: "1" }, blockNodes(block.children)),
  ]);
};

export const exportHtml = (document: Document): Result<string, ExportError> => {
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
  try {
    const root: HtmlRoot = {
      type: "root",
      children: blockNodes(parsed.value.blocks),
    };
    return {
      ok: true,
      value: stringifyProcessor.stringify(root),
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
