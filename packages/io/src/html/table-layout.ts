import { childElements, propertyInteger } from "./hast-properties.js";
import type { HtmlElementNode } from "./inline-content.js";

export const MAX_TABLE_COLUMNS = 10_000;

export type TableRowSource = {
  element: HtmlElementNode;
  section: "head" | "body" | "foot";
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

// 소스 문서에서 thead/tbody/tfoot의 등장 순서는 브라우저 렌더링 순서와
// 무관하다(예: tfoot이 tbody보다 앞에 올 수 있다). head/body/foot 세 버킷에
// 먼저 모으고 논리 순서(head → body → foot)로 이어붙여야, 저자가 어떤 순서로
// 섹션을 배치했든 표가 항상 같은 행 순서로 파싱된다. 같은 버킷 안에서는
// 여러 tbody/tfoot이 있어도 만난 순서 그대로 append해 문서 순서를 지킨다.
export const tableRows = (table: HtmlElementNode): TableRowSource[] => {
  const headRows: TableRowSource[] = [];
  const bodyRows: TableRowSource[] = [];
  const footRows: TableRowSource[] = [];
  const bucketFor = (section: TableRowSource["section"]): TableRowSource[] =>
    section === "head" ? headRows : section === "foot" ? footRows : bodyRows;

  for (const child of childElements(table)) {
    if (
      child.tagName === "thead" ||
      child.tagName === "tbody" ||
      child.tagName === "tfoot"
    ) {
      const section: TableRowSource["section"] =
        child.tagName === "thead"
          ? "head"
          : child.tagName === "tfoot"
            ? "foot"
            : "body";
      const bucket = bucketFor(section);
      for (const row of childElements(child, "tr")) {
        bucket.push({ element: row, section });
      }
      continue;
    }
    if (child.tagName === "tr") {
      bodyRows.push({ element: child, section: "body" });
    }
  }

  return [...headRows, ...bodyRows, ...footRows];
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
