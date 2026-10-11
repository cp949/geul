// document-import 경로의 표 파싱을 담당한다: sanitized <table> 요소를
// model TableBlock으로 변환하고(parseTable), headerRows/headerColumns를
// 명시 속성이 없을 때 셀 구조로 추론한다(inferHeaderRows/inferHeaderColumns).
import {
  type IdFactory,
  isCanonicalCellAlign,
  isCanonicalCellColor,
  MAX_COLUMN_WIDTH,
  MAX_TABLE_COLUMNS,
  MIN_COLUMN_WIDTH,
  type TableBlock,
  tableSizeViolationMessage,
  validateTableSize,
} from "@cp949/geul-model";

import { cellPresentation } from "./element-presentation.js";
import { propertyInteger, propertyString } from "./hast-properties.js";
import type { HtmlImportContext } from "./import-context.js";
import {
  HtmlDocumentInvalidError,
  propertyHeaderFlag,
  sanitizeInlineContentText,
  validOptionalValue,
} from "./import-html-helpers.js";
import {
  type HtmlElementNode,
  inlineContentFromNodes,
} from "./inline-content.js";
import { flattenBlockBoundaryTagNames } from "./parse-html.js";
import {
  type CellLayout,
  columnElements,
  columnSpanViolationMessage,
  findOversizedColumnSpanCell,
  inferredColumnCount,
  layoutRows,
  layoutRowSpan,
  malformedColumnSpan,
  type TableRowSource,
  tableRows,
} from "./table-layout.js";

const DEFAULT_COLUMN_WIDTH = 160;

// 열 폭 판정이다. model 열 폭 검증과 같은 상수를 쓴다(G-CNV-001).
const isValidColumnWidth = (width: number): boolean =>
  Number.isInteger(width) &&
  width >= MIN_COLUMN_WIDTH &&
  width <= MAX_COLUMN_WIDTH;

// col의 폭을 읽는다. data-geul-width가 우선이고 없을 때만 width 속성을 본다.
// 값이 있는데 무효이면(정수 아님, 범위 밖) 그 속성만 버리고 경고한 뒤 다음
// 후보로 넘어간다. 후보가 모두 없거나 무효이면 기본 폭이다(Issue #358).
const columnWidthFrom = (
  col: HtmlElementNode,
  context: HtmlImportContext,
): number => {
  for (const property of ["dataGeulWidth", "width"]) {
    const raw = col.properties[property];
    if (raw === undefined || raw === null || raw === "") continue;
    const width = validOptionalValue(
      context,
      col,
      property,
      propertyInteger(col, property, Number.NaN),
      isValidColumnWidth,
    );
    if (width !== undefined) return width;
  }
  return DEFAULT_COLUMN_WIDTH;
};

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
      ({ element }) =>
        propertyString(element, "dataGeulColumnId") !== undefined,
    );
    const firstColumnCell = hasCanonicalColumnIds
      ? row.find(
          ({ element }) =>
            propertyString(element, "dataGeulColumnId") === firstColumnId,
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

export const parseTable = (
  element: HtmlElementNode,
  createId: IdFactory,
  context: HtmlImportContext,
): TableBlock => {
  const tableId = propertyString(element, "dataGeulBlockId") ?? createId();
  const cols = columnElements(element);
  if (cols.length > MAX_TABLE_COLUMNS) {
    throw new HtmlDocumentInvalidError(
      tableSizeViolationMessage("TOO_MANY_COLUMNS"),
    );
  }
  const rows = tableRows(element);
  const layouts = layoutRows(rows);

  // colgroup이 없으면(cols.length === 0) columnCount는 아래에서
  // inferredColumnCount로 정한다 — 각 셀의 reach(columnIndex + colspan)
  // 중 최댓값이다. 이 계산은 자기 강화 구조라 과대 colspan 셀 자신이
  // 자기를 걸러낼 상한까지 함께 부풀린다. colgroup이 있으면 columnCount가
  // cols.length로 고정돼 셀 span에서 파생되지 않으므로 이 위험이 없고,
  // 과대 colspan은 model의 validateGridCoverage가 SPAN_OUT_OF_BOUNDS로
  // 이미 막는다 — 그래서 이 선제 검사는 colgroup이 없을 때만 돈다
  // (Issue #115). 판정 자체(자기 강화를 막는 방법, rowSpan 가중치 계약,
  // Issue #35/#114/#116/#117 이력)는 findOversizedColumnSpanCell
  // (table-layout.ts)이 소유한다 — clipboard-table-parser.ts와 이 판정을
  // 공유한다.
  if (cols.length === 0) {
    const violation = findOversizedColumnSpanCell(layouts, cols.length);
    if (violation !== undefined) {
      throw new HtmlDocumentInvalidError(columnSpanViolationMessage(violation));
    }
  }

  const columnCount =
    cols.length > 0 ? cols.length : inferredColumnCount(layouts);
  const sizeViolation = validateTableSize({
    columnCount,
    rowCount: rows.length,
  });
  if (sizeViolation !== undefined) {
    throw new HtmlDocumentInvalidError(
      tableSizeViolationMessage(sizeViolation),
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
              "dataGeulColumnId",
            ) ?? createId())
          : (propertyString(col, "dataGeulColumnId") ?? createId());
      const width =
        col === undefined
          ? DEFAULT_COLUMN_WIDTH
          : columnWidthFrom(col, context);
      return { id, width };
    },
  );

  const modelRows: TableBlock["rows"] = rows.map((row, rowIndex) => ({
    id: propertyString(row.element, "dataGeulRowId") ?? createId(),
    cells: (layouts[rowIndex] ?? []).map((layout) => {
      const column = columns[layout.columnIndex];
      const columnId =
        propertyString(layout.element, "dataGeulColumnId") ??
        column?.id ??
        createId();
      // data-geul-*는 model 판정으로 거른다. 무효 값은 그 필드만 버리고
      // 경고하며 style로 되살리지 않는다(Issue #358). 없는 필드만
      // style·bgcolor에서 td·th → tr → table 순으로 채운다(Issue #334). tr은
      // 이 셀이 시작하는 행이다(rowspan 셀도 같다).
      const rawTextColor = propertyString(layout.element, "dataGeulTextColor");
      const rawBackgroundColor = propertyString(
        layout.element,
        "dataGeulBackgroundColor",
      );
      const dataTextColor = validOptionalValue(
        context,
        layout.element,
        "dataGeulTextColor",
        rawTextColor,
        isCanonicalCellColor,
      );
      const dataBackgroundColor = validOptionalValue(
        context,
        layout.element,
        "dataGeulBackgroundColor",
        rawBackgroundColor,
        isCanonicalCellColor,
      );
      // 서식은 data-geul-* 색과 독립이라 항상 읽는다.
      const styled = cellPresentation(layout.element, row.element, element);
      const textColor =
        rawTextColor === undefined ? styled.textColor : dataTextColor;
      const backgroundColor =
        rawBackgroundColor === undefined
          ? styled.backgroundColor
          : dataBackgroundColor;
      const align = validOptionalValue(
        context,
        layout.element,
        "dataGeulAlign",
        propertyString(layout.element, "dataGeulAlign"),
        isCanonicalCellAlign,
      ) as TableBlock["rows"][number]["cells"][number]["align"] | undefined;

      return {
        id: propertyString(layout.element, "dataGeulCellId") ?? createId(),
        columnId,
        // rowSpan은 clipboard-table-parser.ts와 같은 seam(layoutRowSpan)으로
        // 보정한다 — 여기서 raw 값을 그대로 담으면 rowspan="0"·비정수
        // rowspan처럼 흔한 malformed 마크업이 model의 validateGridCoverage에서
        // INVALID_COORDINATE로 거절돼 문서 전체가 HTML_DOCUMENT_INVALID로
        // 실패한다(clipboard 경로는 이미 보정해 통과한다). columnSpan은
        // layoutColumnSpan이 아니라 malformedColumnSpan을 쓴다 — 이유는
        // 그 함수의 선언부 주석 참조(오버사이즈 colspan 보안 거절을
        // 우회하지 않아야 한다).
        rowSpan: layoutRowSpan(layout.rowSpan),
        columnSpan: malformedColumnSpan(layout.columnSpan),
        content: sanitizeInlineContentText(
          inlineContentFromNodes(layout.element.children, {
            blockBreakTagNames: flattenBlockBoundaryTagNames,
            baseFormat: styled.format,
            onText: context.codePoints.inlineText,
          }),
        ),
        ...(textColor === undefined ? {} : { textColor }),
        ...(backgroundColor === undefined ? {} : { backgroundColor }),
        ...(align === undefined ? {} : { align }),
      };
    }),
  }));
  const headerRows =
    propertyHeaderFlag(element, "dataGeulHeaderRows") ??
    inferHeaderRows(rows, layouts);
  const headerColumns =
    propertyHeaderFlag(element, "dataGeulHeaderColumns") ??
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
