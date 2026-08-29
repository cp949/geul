import {
  type Document,
  parseDocument,
  type TableBlock,
} from "@cp949/geul-model";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";

import type { ExportError } from "../errors.js";
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
        htmlElement(
          "div",
          { dataBeChildren: "1" },
          block.children.map(blockNode),
        ),
      );
    }
    return htmlElement(
      "blockquote",
      { dataBeBlockId: block.id },
      quoteChildren,
    );
  }

  // heading은 model HeadingBlock.level(1~6)을 그대로 h1~h6 태그명으로 쓴다.
  const tagName = block.type === "paragraph" ? "p" : `h${block.level}`;
  const ownNode = htmlElement(
    tagName,
    { dataBeBlockId: block.id },
    inlineContentToNodes(block.content),
  );

  if (block.children === undefined || block.children.length === 0) {
    return ownNode;
  }

  // 자식 블록은 table을 포함해 blockNode를 그대로 재귀 호출한다(완료 조건
  // 6) — table 분기(tableNode)는 이 함수 맨 위에서 이미 처리하므로 별도
  // 분기를 추가하지 않는다.
  return htmlElement("div", { dataBeBlockId: block.id }, [
    ownNode,
    htmlElement("div", { dataBeChildren: "1" }, block.children.map(blockNode)),
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
      children: parsed.value.blocks.map(blockNode),
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
