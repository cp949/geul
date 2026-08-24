import {
  type Document,
  type IdFactory,
  MAX_TABLE_LOGICAL_CELLS,
  parseDocument,
  type TableBlock,
} from "@cp949/geul-model";
import { sanitize } from "hast-util-sanitize";

import type { ImportError } from "../errors.js";
import type { Result } from "../result.js";
import {
  propertyInteger,
  propertyString,
  sanitizeLinks,
} from "./hast-properties.js";
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
import { asRoot, parseHtmlFragment } from "./parse-html.js";
import { htmlSanitizeSchema } from "./sanitize-schema.js";
import {
  type CellLayout,
  columnElements,
  hasSubstantialText,
  inferredColumnCount,
  layoutRows,
  MAX_TABLE_COLUMNS,
  type TableRowSource,
  tableNonSectionChildren,
  tableRows,
} from "./table-layout.js";

const DEFAULT_COLUMN_WIDTH = 160;

class HtmlDocumentInvalidError extends Error {}

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
      const align = propertyString(layout.element, "dataBeAlign") as
        | TableBlock["rows"][number]["cells"][number]["align"]
        | undefined;

      return {
        id: propertyString(layout.element, "dataBeCellId") ?? createId(),
        columnId,
        rowSpan: layout.rowSpan,
        columnSpan: layout.columnSpan,
        content: inlineContentFromNodes(layout.element.children),
        ...(textColor === undefined ? {} : { textColor }),
        ...(backgroundColor === undefined ? {} : { backgroundColor }),
        ...(align === undefined ? {} : { align }),
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
      // caption 등 표 직속 비섹션 자식(thead/tbody/tfoot/tr/colgroup이
      // 아닌 나머지)은 sanitize가 unwrap한 caption 텍스트가 대표 사례다
      // (caption은 htmlAllowedTagNames에 없다). parseTable은 이 노드들을
      // 읽지 않으므로 표 블록 앞에 문단으로 옮겨 담지 않으면 조용히
      // 사라진다(이슈 #70) — clipboard 경로(clipboard-table-parser.ts의
      // walk())와 같은 정책이다. import 쪽 문단 생성은 기존 관례대로
      // inlineContentFromNodes만 쓴다(collapse/normalize 없음 — caption만
      // 예외로 만들지 않는다, 기존 import 문단 생성 경로 전체의 gap이라
      // 이 변경의 범위 밖이다).
      if (node.tagName === "table") {
        const nonSectionChildren = tableNonSectionChildren(node);
        if (hasSubstantialText(textValue(nonSectionChildren))) {
          blocks.push({
            id: createId(),
            type: "paragraph",
            content: inlineContentFromNodes(nonSectionChildren),
          });
        }
      }
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
    const unsafeRoot = parseHtmlFragment(source);
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
