import { sanitize } from "hast-util-sanitize";
import rehypeParse from "rehype-parse";
import { unified } from "unified";

import type { ClipboardParseError } from "../errors.js";
import { propertyString } from "../html/hast-properties.js";
import {
  type HtmlElementNode,
  type HtmlRoot,
  inlineContentFromNodes,
} from "../html/inline-content.js";
import { htmlSanitizeSchema } from "../html/sanitize-schema.js";
import {
  columnElements,
  inferredColumnCount,
  layoutRows,
  MAX_TABLE_COLUMNS,
  tableRows,
} from "../html/table-layout.js";
import type { Result } from "../result.js";
import { parseStyleDeclarations } from "./style-declarations.js";
import {
  type TabularCell,
  type TabularData,
  validateTabularData,
} from "./tabular-data.js";

const MAX_TABLE_LOGICAL_CELLS = 10_000;
const parseProcessor = unified().use(rehypeParse, { fragment: true });

const asRoot = (node: unknown): HtmlRoot | undefined => {
  if (
    typeof node !== "object" ||
    node === null ||
    !("type" in node) ||
    node.type !== "root" ||
    !("children" in node) ||
    !Array.isArray(node.children)
  ) {
    return undefined;
  }
  return node as HtmlRoot;
};

const findFirstTable = (root: HtmlRoot): HtmlElementNode | undefined => {
  for (const node of root.children) {
    if (node.type !== "element") continue;
    if (node.tagName === "table") return node;
    const nested = findFirstTable({ type: "root", children: node.children });
    if (nested !== undefined) return nested;
  }
  return undefined;
};

// data-be-*(자기 복사)가 있으면 우선하고, 없으면 style에서 뽑는다(외부
// Excel/Google Sheets는 data-be-*가 없으므로 항상 style로 떨어진다).
const cellStyleFields = (
  element: HtmlElementNode,
): Pick<TabularCell, "textColor" | "backgroundColor" | "align"> => {
  const styleAttribute = propertyString(element, "style");
  const parsedStyle =
    styleAttribute === undefined ? {} : parseStyleDeclarations(styleAttribute);

  const textColor =
    propertyString(element, "dataBeTextColor") ?? parsedStyle.color;
  const backgroundColor =
    propertyString(element, "dataBeBackgroundColor") ??
    parsedStyle.backgroundColor;
  const dataAlign = propertyString(element, "dataBeAlign") as
    | "left"
    | "center"
    | "right"
    | undefined;
  const align = dataAlign ?? parsedStyle.align;

  return {
    ...(textColor === undefined ? {} : { textColor }),
    ...(backgroundColor === undefined ? {} : { backgroundColor }),
    ...(align === undefined ? {} : { align }),
  };
};

const tabularDataFromTable = (
  table: HtmlElementNode,
): Result<TabularData, ClipboardParseError> => {
  const cols = columnElements(table);
  const rows = tableRows(table);
  const layouts = layoutRows(rows);
  const columnCount =
    cols.length > 0 ? cols.length : inferredColumnCount(layouts);

  if (columnCount === 0) {
    return { ok: false, error: { code: "NOT_TABULAR" } };
  }
  if (columnCount > MAX_TABLE_COLUMNS) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message: `Table column count exceeds ${MAX_TABLE_COLUMNS}`,
      },
    };
  }
  if (rows.length * columnCount > MAX_TABLE_LOGICAL_CELLS) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message: `Table logical cell count exceeds ${MAX_TABLE_LOGICAL_CELLS}`,
      },
    };
  }

  const data: TabularData = {
    columnCount,
    rows: layouts.map((row) => ({
      cells: row.map((layout) => ({
        columnIndex: layout.columnIndex,
        rowSpan: layout.rowSpan,
        columnSpan: layout.columnSpan,
        content: inlineContentFromNodes(layout.element.children),
        ...cellStyleFields(layout.element),
      })),
    })),
  };

  const validated = validateTabularData(data);
  return validated.ok ? { ok: true, value: data } : validated;
};

const parseHtmlTable = (
  html: string,
): Result<TabularData, ClipboardParseError> => {
  const unsafeRoot = asRoot(parseProcessor.parse(html));
  if (unsafeRoot === undefined)
    return { ok: false, error: { code: "NOT_TABULAR" } };

  const safeRoot = asRoot(sanitize(unsafeRoot, htmlSanitizeSchema));
  if (safeRoot === undefined)
    return { ok: false, error: { code: "NOT_TABULAR" } };

  const table = findFirstTable(safeRoot);
  if (table === undefined) return { ok: false, error: { code: "NOT_TABULAR" } };

  return tabularDataFromTable(table);
};

const parseTsv = (text: string): Result<TabularData, ClipboardParseError> => {
  if (!text.includes("\t"))
    return { ok: false, error: { code: "NOT_TABULAR" } };

  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.length > 0);
  if (lines.length === 0) return { ok: false, error: { code: "NOT_TABULAR" } };

  const rows = lines.map((line) => line.split("\t"));
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (columnCount === 0) return { ok: false, error: { code: "NOT_TABULAR" } };
  if (rows.length * columnCount > MAX_TABLE_LOGICAL_CELLS) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message: `Table logical cell count exceeds ${MAX_TABLE_LOGICAL_CELLS}`,
      },
    };
  }

  const data: TabularData = {
    columnCount,
    rows: rows.map((cells) => ({
      cells: Array.from({ length: columnCount }, (_, columnIndex) => {
        const text = cells[columnIndex] ?? "";
        return {
          columnIndex,
          rowSpan: 1,
          columnSpan: 1,
          content: text.length === 0 ? [] : [{ text }],
        };
      }),
    })),
  };

  const validated = validateTabularData(data);
  return validated.ok ? { ok: true, value: data } : validated;
};

export const parseClipboardTable = (input: {
  html?: string;
  text?: string;
}): Result<TabularData, ClipboardParseError> => {
  if (input.html !== undefined && input.html.length > 0) {
    const htmlResult = parseHtmlTable(input.html);
    if (htmlResult.ok || htmlResult.error.code === "CLIPBOARD_TABLE_INVALID") {
      return htmlResult;
    }
    // NOT_TABULAR(html에 표 없음) -> TSV로 폴백.
  }
  if (input.text !== undefined && input.text.length > 0) {
    return parseTsv(input.text);
  }
  return { ok: false, error: { code: "NOT_TABULAR" } };
};
