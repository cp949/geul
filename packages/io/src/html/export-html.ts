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

const blockNode = (block: Document["blocks"][number]): HtmlElementNode => {
  if (block.type === "table") return tableNode(block);

  const tagName = block.type === "paragraph" ? "p" : `h${block.level}`;
  return htmlElement(
    tagName,
    { dataBeBlockId: block.id },
    inlineContentToNodes(block.content),
  );
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
