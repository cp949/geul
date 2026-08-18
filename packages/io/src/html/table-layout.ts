import { childElements, propertyInteger } from "./hast-properties.js";
import type { HtmlElementNode } from "./inline-content.js";

export const MAX_TABLE_COLUMNS = 10_000;

export type TableRowSource = {
  element: HtmlElementNode;
  section: "head" | "body";
};

export type CellLayout = {
  element: HtmlElementNode;
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
};

export const layoutColumnSpan = (columnSpan: number): number =>
  Number.isInteger(columnSpan) &&
  columnSpan >= 1 &&
  columnSpan <= MAX_TABLE_COLUMNS
    ? columnSpan
    : 1;

// rowSpan도 columnSpan과 같은 규칙으로 보정한다. rowspan="0"(HTML에서
// "섹션 끝까지"), 음수, 소수는 우리 격자 모델에 대응이 없으므로 1로 본다.
// 커버리지 계산과 방출되는 셀이 같은 값을 써야 검증기가 어긋나지 않는다.
export const layoutRowSpan = (rowSpan: number): number =>
  Number.isInteger(rowSpan) && rowSpan >= 1 ? rowSpan : 1;

export const tableRows = (table: HtmlElementNode): TableRowSource[] => {
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

export const layoutRows = (rows: TableRowSource[]): CellLayout[][] => {
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

export const columnElements = (table: HtmlElementNode): HtmlElementNode[] => {
  const colgroup = childElements(table, "colgroup")[0];
  return colgroup === undefined ? [] : childElements(colgroup, "col");
};

export const inferredColumnCount = (layouts: CellLayout[][]): number =>
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
