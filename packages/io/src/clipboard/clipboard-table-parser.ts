import { sanitize } from "hast-util-sanitize";
import rehypeParse from "rehype-parse";
import { unified } from "unified";

import type { ClipboardParseError } from "../errors.js";
import { propertyString, sanitizeLinks } from "../html/hast-properties.js";
import {
  type HtmlElementNode,
  type HtmlRoot,
  inlineContentFromNodes,
} from "../html/inline-content.js";
import { htmlSanitizeSchema } from "../html/sanitize-schema.js";
import {
  type CellLayout,
  columnElements,
  inferredColumnCount,
  layoutColumnSpan,
  layoutRows,
  MAX_TABLE_COLUMNS,
  tableRows,
} from "../html/table-layout.js";
import type { Result } from "../result.js";
import {
  collapseHtmlWhitespace,
  normalizeCellContent,
  sanitizeCellText,
} from "./cell-text.js";
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

// 각 행에서 어떤 셀도 덮지 않는 논리 좌표를 표시한다. 겹치는 좌표는 한 번만
// 표시되므로 패딩이 겹침을 감추지 않는다 — OVERLAPPING_CELL은 그대로
// validateTabularData가 잡는다.
const coveredCoordinates = (
  layouts: CellLayout[][],
  columnCount: number,
): boolean[][] => {
  const covered = layouts.map(() =>
    new Array<boolean>(columnCount).fill(false),
  );

  for (const [rowIndex, row] of layouts.entries()) {
    for (const layout of row) {
      const rowSpan =
        Number.isInteger(layout.rowSpan) && layout.rowSpan >= 1
          ? layout.rowSpan
          : 1;
      const columnSpan = layoutColumnSpan(layout.columnSpan);
      const rowEnd = Math.min(rowIndex + rowSpan, layouts.length);
      const columnEnd = Math.min(layout.columnIndex + columnSpan, columnCount);

      for (let covering = rowIndex; covering < rowEnd; covering += 1) {
        const rowCover = covered[covering];
        if (rowCover === undefined) continue;
        for (let column = layout.columnIndex; column < columnEnd; column += 1) {
          rowCover[column] = true;
        }
      }
    }
  }

  return covered;
};

const tabularDataFromTable = (
  table: HtmlElementNode,
): Result<TabularData, ClipboardParseError> => {
  // 셀 콘텐츠를 만들기 전에 접어야 br이 만든 LF와 원본 마크업 들여쓰기가
  // 만든 개행이 구분된다.
  collapseHtmlWhitespace(table.children);

  const cols = columnElements(table);
  const rows = tableRows(table);
  const layouts = layoutRows(rows);
  // 짧은 행을 빈 셀로 채워 직사각형을 만들려면 colgroup과 실제 셀 중 넓은
  // 쪽을 열 수로 잡아야 한다(TSV 경로의 패딩과 같은 계약, spec §4.3).
  const columnCount = Math.max(cols.length, inferredColumnCount(layouts));

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

  const covered = coveredCoordinates(layouts, columnCount);
  const data: TabularData = {
    columnCount,
    rows: layouts.map((row, rowIndex) => {
      const cells: TabularCell[] = row.map((layout) => ({
        columnIndex: layout.columnIndex,
        rowSpan: layout.rowSpan,
        columnSpan: layout.columnSpan,
        content: normalizeCellContent(
          inlineContentFromNodes(layout.element.children),
        ),
        ...cellStyleFields(layout.element),
      }));

      for (let column = 0; column < columnCount; column += 1) {
        if (covered[rowIndex]?.[column] === true) continue;
        cells.push({
          columnIndex: column,
          rowSpan: 1,
          columnSpan: 1,
          content: [],
        });
      }
      cells.sort((left, right) => left.columnIndex - right.columnIndex);

      return { cells };
    }),
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

  // importHtml과 같은 링크 정책을 적용한다 — 살려두면 core의
  // LinkPolicyExtension.filterTransaction이 붙여넣기 트랜잭션을 통째로 버린다.
  sanitizeLinks(safeRoot.children);

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
        // TSV 셀에 LF는 있을 수 없다(개행이 행 구분자다) — 단독 CR과 나머지
        // C0 제어문자, DEL만 제거하면 model 인라인 텍스트 계약을 만족한다.
        const text = sanitizeCellText(cells[columnIndex] ?? "");
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
