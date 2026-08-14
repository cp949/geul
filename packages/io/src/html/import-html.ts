import {
  type Document,
  type IdFactory,
  isSupportedLinkHref,
  parseDocument,
  type TableBlock,
} from "@cp949/geul-model";
import { sanitize } from "hast-util-sanitize";
import rehypeParse from "rehype-parse";
import { unified } from "unified";

import type { ImportError } from "../errors.js";
import type { Result } from "../result.js";
import {
  collectHtmlImportWarnings,
  type HtmlImportWarning,
} from "./import-warnings.js";
import {
  type HtmlElementNode,
  type HtmlNode,
  type HtmlRoot,
  inlineContentFromNodes,
} from "./inline-content.js";
import { htmlSanitizeSchema } from "./sanitize-schema.js";

const DEFAULT_COLUMN_WIDTH = 160;
const MAX_TABLE_COLUMNS = 10_000;
const MAX_TABLE_LOGICAL_CELLS = 10_000;
const parseProcessor = unified().use(rehypeParse, { fragment: true });

class HtmlDocumentInvalidError extends Error {}

type TableRowSource = {
  element: HtmlElementNode;
  section: "head" | "body";
};

type CellLayout = {
  element: HtmlElementNode;
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
};

const sanitizeLinks = (nodes: HtmlNode[]): void => {
  for (const node of nodes) {
    if (node.type !== "element") continue;

    if (node.tagName === "a") {
      const href = node.properties.href;
      if (typeof href !== "string" || !isSupportedLinkHref(href)) {
        delete node.properties.href;
      }
    }
    sanitizeLinks(node.children);
  }
};

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

const childElements = (
  element: HtmlElementNode,
  tagName?: string,
): HtmlElementNode[] =>
  element.children.filter(
    (child): child is HtmlElementNode =>
      child.type === "element" &&
      (tagName === undefined || child.tagName === tagName),
  );

const propertyString = (
  element: HtmlElementNode,
  name: string,
): string | undefined => {
  const value = element.properties[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const propertyInteger = (
  element: HtmlElementNode,
  name: string,
  fallback: number,
): number => {
  const value = element.properties[name];
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
};

const propertyHeaderFlag = (
  element: HtmlElementNode,
  name: string,
): 0 | 1 | undefined => {
  const value = propertyInteger(element, name, Number.NaN);
  return value === 0 || value === 1 ? value : undefined;
};

const createDefaultIdFactory = (root: HtmlRoot): IdFactory => {
  const usedIds = new Set<string>();
  const idProperties = new Set([
    "dataBeBlockId",
    "dataBeColumnId",
    "dataBeRowId",
    "dataBeCellId",
  ]);

  const collectIds = (nodes: HtmlNode[]): void => {
    for (const node of nodes) {
      if (node.type !== "element") continue;
      for (const [name, value] of Object.entries(node.properties)) {
        if (idProperties.has(name) && typeof value === "string") {
          usedIds.add(value);
        }
      }
      collectIds(node.children);
    }
  };
  collectIds(root.children);

  let sequence = 0;
  return () => {
    let id: string;
    do {
      sequence += 1;
      id = `html-${sequence}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };
};

const textValue = (nodes: HtmlNode[]): string =>
  nodes
    .map((node) =>
      node.type === "text"
        ? node.value
        : node.type === "element"
          ? node.tagName === "br"
            ? "\n"
            : textValue(node.children)
          : "",
    )
    .join("");

const tableRows = (table: HtmlElementNode): TableRowSource[] => {
  const rows: TableRowSource[] = [];

  for (const child of childElements(table)) {
    if (child.tagName === "thead" || child.tagName === "tbody") {
      for (const row of childElements(child, "tr")) {
        rows.push({
          element: row,
          section: child.tagName === "thead" ? "head" : "body",
        });
      }
      continue;
    }
    if (child.tagName === "tr") {
      rows.push({ element: child, section: "body" });
    }
  }

  return rows;
};

const layoutColumnSpan = (columnSpan: number): number =>
  Number.isInteger(columnSpan) &&
  columnSpan >= 1 &&
  columnSpan <= MAX_TABLE_COLUMNS
    ? columnSpan
    : 1;

const layoutRows = (rows: TableRowSource[]): CellLayout[][] => {
  const occupiedUntilRow: number[] = [];

  return rows.map((row, rowIndex) => {
    const layouts: CellLayout[] = [];
    let columnIndex = 0;

    for (const cell of childElements(row.element).filter(
      (element) => element.tagName === "td" || element.tagName === "th",
    )) {
      while ((occupiedUntilRow[columnIndex] ?? 0) > rowIndex) {
        columnIndex += 1;
      }

      const rowSpan = propertyInteger(cell, "rowSpan", 1);
      const columnSpan = propertyInteger(cell, "colSpan", 1);
      layouts.push({ element: cell, columnIndex, rowSpan, columnSpan });

      const boundedColumnSpan = layoutColumnSpan(columnSpan);
      if (Number.isInteger(rowSpan) && rowSpan >= 1) {
        for (
          let coveredColumn = columnIndex;
          coveredColumn < columnIndex + boundedColumnSpan;
          coveredColumn += 1
        ) {
          occupiedUntilRow[coveredColumn] = rowIndex + rowSpan;
        }
      }
      columnIndex += boundedColumnSpan;
    }

    return layouts;
  });
};

const columnElements = (table: HtmlElementNode): HtmlElementNode[] => {
  const colgroup = childElements(table, "colgroup")[0];
  return colgroup === undefined ? [] : childElements(colgroup, "col");
};

const inferredColumnCount = (layouts: CellLayout[][]): number =>
  layouts.reduce(
    (maximum, row) =>
      row.reduce(
        (rowMaximum, cell) =>
          Math.max(
            rowMaximum,
            cell.columnIndex + layoutColumnSpan(cell.columnSpan),
          ),
        maximum,
      ),
    0,
  );

const inferHeaderRows = (
  rows: TableRowSource[],
  layouts: CellLayout[][],
): 0 | 1 => {
  if (rows[0]?.section === "head") return 1;
  const firstRow = layouts[0];
  if (firstRow === undefined || firstRow.length === 0) return 0;

  return firstRow.every(
    ({ element }) =>
      element.tagName === "th" && element.properties.scope !== "row",
  )
    ? 1
    : 0;
};

const inferHeaderColumns = (
  layouts: CellLayout[][],
  headerRows: 0 | 1,
  columns: TableBlock["columns"],
): 0 | 1 => {
  const firstColumnId = columns[0]?.id;
  for (const row of layouts.slice(headerRows)) {
    const hasCanonicalColumnIds = row.some(
      ({ element }) => propertyString(element, "dataBeColumnId") !== undefined,
    );
    const firstColumnCell = hasCanonicalColumnIds
      ? row.find(
          ({ element }) =>
            propertyString(element, "dataBeColumnId") === firstColumnId,
        )
      : row.find(({ columnIndex }) => columnIndex === 0);
    if (
      firstColumnCell?.element.tagName === "th" &&
      (firstColumnCell.element.properties.scope === "row" ||
        firstColumnCell.element.properties.scope === undefined)
    ) {
      return 1;
    }
  }
  return 0;
};

const parseTable = (
  element: HtmlElementNode,
  createId: IdFactory,
): TableBlock => {
  const tableId = propertyString(element, "dataBeBlockId") ?? createId();
  const cols = columnElements(element);
  if (cols.length > MAX_TABLE_COLUMNS) {
    throw new HtmlDocumentInvalidError(
      `Table column count exceeds ${MAX_TABLE_COLUMNS}`,
    );
  }
  const rows = tableRows(element);
  const layouts = layoutRows(rows);
  const columnCount =
    cols.length > 0 ? cols.length : inferredColumnCount(layouts);
  if (columnCount > MAX_TABLE_COLUMNS) {
    throw new HtmlDocumentInvalidError(
      `Table column count exceeds ${MAX_TABLE_COLUMNS}`,
    );
  }
  if (rows.length * columnCount > MAX_TABLE_LOGICAL_CELLS) {
    throw new HtmlDocumentInvalidError(
      `Table logical cell count exceeds ${MAX_TABLE_LOGICAL_CELLS}`,
    );
  }

  const firstLayoutByColumn = new Map<number, CellLayout>();
  for (const row of layouts) {
    for (const layout of row) {
      if (!firstLayoutByColumn.has(layout.columnIndex)) {
        firstLayoutByColumn.set(layout.columnIndex, layout);
      }
    }
  }

  const columns: TableBlock["columns"] = Array.from(
    { length: columnCount },
    (_, columnIndex) => {
      const col = cols[columnIndex];
      const cellColumnId = firstLayoutByColumn.get(columnIndex);
      const id =
        col === undefined
          ? (propertyString(
              cellColumnId?.element ?? element,
              "dataBeColumnId",
            ) ?? createId())
          : (propertyString(col, "dataBeColumnId") ?? createId());
      const width =
        col === undefined
          ? DEFAULT_COLUMN_WIDTH
          : propertyInteger(
              col,
              "dataBeWidth",
              propertyInteger(col, "width", DEFAULT_COLUMN_WIDTH),
            );
      return { id, width };
    },
  );

  const modelRows: TableBlock["rows"] = rows.map((row, rowIndex) => ({
    id: propertyString(row.element, "dataBeRowId") ?? createId(),
    cells: (layouts[rowIndex] ?? []).map((layout) => {
      const column = columns[layout.columnIndex];
      const columnId =
        propertyString(layout.element, "dataBeColumnId") ??
        column?.id ??
        createId();
      const textColor = propertyString(layout.element, "dataBeTextColor");
      const backgroundColor = propertyString(
        layout.element,
        "dataBeBackgroundColor",
      );

      return {
        id: propertyString(layout.element, "dataBeCellId") ?? createId(),
        columnId,
        rowSpan: layout.rowSpan,
        columnSpan: layout.columnSpan,
        content: inlineContentFromNodes(layout.element.children),
        ...(textColor === undefined ? {} : { textColor }),
        ...(backgroundColor === undefined ? {} : { backgroundColor }),
      };
    }),
  }));
  const headerRows =
    propertyHeaderFlag(element, "dataBeHeaderRows") ??
    inferHeaderRows(rows, layouts);
  const headerColumns =
    propertyHeaderFlag(element, "dataBeHeaderColumns") ??
    inferHeaderColumns(layouts, headerRows, columns);

  return {
    id: tableId,
    type: "table",
    columns,
    rows: modelRows,
    headerRows,
    headerColumns,
  };
};

const parseBlock = (
  element: HtmlElementNode,
  createId: IdFactory,
): Document["blocks"][number] => {
  if (element.tagName === "table") return parseTable(element, createId);

  const id = propertyString(element, "dataBeBlockId") ?? createId();
  const content = inlineContentFromNodes(element.children);
  if (element.tagName === "p") return { id, type: "paragraph", content };

  const level = Number(element.tagName.slice(1)) as 1 | 2 | 3;
  return { id, type: "heading", level, content };
};

const documentFromRoot = (root: HtmlRoot, createId: IdFactory): Document => {
  const blocks: Document["blocks"] = [];
  let inlineNodes: HtmlNode[] = [];

  const flushInlineNodes = (): void => {
    if (inlineNodes.length === 0) return;
    if (textValue(inlineNodes).trim().length > 0) {
      blocks.push({
        id: createId(),
        type: "paragraph",
        content: inlineContentFromNodes(inlineNodes),
      });
    }
    inlineNodes = [];
  };

  for (const node of root.children) {
    if (
      node.type === "element" &&
      ["p", "h1", "h2", "h3", "table"].includes(node.tagName)
    ) {
      flushInlineNodes();
      blocks.push(parseBlock(node, createId));
      continue;
    }
    inlineNodes.push(node);
  }
  flushInlineNodes();

  return { formatVersion: 1, revision: 0, blocks };
};

export const importHtml = (
  source: string,
  options?: { createId?: IdFactory },
): Result<
  { document: Document; warnings: HtmlImportWarning[] },
  ImportError
> => {
  try {
    const unsafeRoot = asRoot(parseProcessor.parse(source));
    if (unsafeRoot === undefined) {
      return {
        ok: false,
        error: {
          code: "HTML_PARSE_FAILED",
          message: "HTML parser did not produce a root node",
        },
      };
    }
    const warnings = collectHtmlImportWarnings(unsafeRoot);
    const safeRoot = asRoot(sanitize(unsafeRoot, htmlSanitizeSchema));
    if (safeRoot === undefined) {
      return {
        ok: false,
        error: {
          code: "HTML_PARSE_FAILED",
          message: "HTML parser did not produce a root node",
        },
      };
    }

    sanitizeLinks(safeRoot.children);
    const document = documentFromRoot(
      safeRoot,
      options?.createId ?? createDefaultIdFactory(safeRoot),
    );
    const parsed = parseDocument(document);
    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          code: "HTML_DOCUMENT_INVALID",
          message: `Imported HTML produced an invalid document: ${parsed.error.message}`,
        },
      };
    }

    return {
      ok: true,
      value: { document: parsed.value, warnings },
    };
  } catch (error) {
    if (error instanceof HtmlDocumentInvalidError) {
      return {
        ok: false,
        error: {
          code: "HTML_DOCUMENT_INVALID",
          message: `Imported HTML produced an invalid document: ${error.message}`,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "HTML_PARSE_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to parse HTML",
      },
    };
  }
};
