import type { Result } from "./result.js";
import type { TableBlock } from "./types.js";

export const MIN_COLUMN_WIDTH = 48;
export const MAX_COLUMN_WIDTH = 1200;

// 표 하나가 가질 수 있는 논리 셀 수의 상한. import(html/markdown), 클립보드
// 붙여넣기, TableGrid 확장이 모두 같은 예산을 써야 한 경로로 들어온 표가
// 다른 경로에서 거절되지 않는다 — 이 판정의 권위는 model에 있다.
export const MAX_TABLE_LOGICAL_CELLS = 10_000;

// 표 하나가 가질 수 있는 열 수의 상한. MAX_TABLE_LOGICAL_CELLS와 같은 이유로
// 권위가 model에 있다 — import(html/markdown)·클립보드 붙여넣기가 각자
// 사본을 들고 다르게 판정하면 한 경로에서 통과한 표가 다른 경로에서
// 거절된다.
export const MAX_TABLE_COLUMNS = 10_000;

export type TableGridInvalidReason =
  | "UNKNOWN_COLUMN"
  | "INVALID_COORDINATE"
  | "INVALID_GRID_SIZE"
  | "SPAN_OUT_OF_BOUNDS"
  | "OVERLAPPING_CELL"
  | "UNCOVERED_COORDINATE";

export type TableGridValidationError = {
  code: "TABLE_GRID_INVALID";
  reason: TableGridInvalidReason;
  row: number;
  column?: number;
};

export type GridCell = {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
};

const invalid = (
  reason: TableGridInvalidReason,
  row: number,
  column?: number,
): Result<never, TableGridValidationError> => ({
  ok: false,
  error:
    column === undefined
      ? { code: "TABLE_GRID_INVALID", reason, row }
      : { code: "TABLE_GRID_INVALID", reason, row, column },
});

export type TableSizeViolation =
  "TOO_MANY_COLUMNS" | "TOO_MANY_CELLS" | "INVALID_SIZE";

/**
 * 표 크기가 MAX_TABLE_COLUMNS/MAX_TABLE_LOGICAL_CELLS 예산 안에 있는지
 * 판정한다. 위반 종류만 반환하는 순수 함수다 — throw할지 Result로 감쌀지,
 * 메시지를 어떻게 조합할지는 호출부의 에러 계약(io의
 * HtmlDocumentInvalidError·ClipboardParseError·MarkdownDocumentInvalidError)에
 * 속하는 문제라 여기서 관여하지 않는다.
 */
export const validateTableSize = (input: {
  columnCount: number;
  rowCount: number;
}): TableSizeViolation | undefined => {
  // rowCount/columnCount가 정수·비음수임을 보장하지 않으면 아래
  // 곱셈(rowCount * columnCount)이 NaN이거나 음수가 돼 상한 비교를
  // 그대로 통과해버린다(validateGridCoverage의 raw-number 가드와 같은
  // 이유 — C12).
  if (
    !Number.isInteger(input.rowCount) ||
    !Number.isInteger(input.columnCount) ||
    input.rowCount < 0 ||
    input.columnCount < 0
  ) {
    return "INVALID_SIZE";
  }
  if (input.columnCount > MAX_TABLE_COLUMNS) return "TOO_MANY_COLUMNS";
  if (input.rowCount * input.columnCount > MAX_TABLE_LOGICAL_CELLS) {
    return "TOO_MANY_CELLS";
  }
  return undefined;
};

/**
 * validateTableSize가 반환한 위반 종류를 사람이 읽을 메시지로 바꾼다.
 * throw할지 Result로 감쌀지는 여전히 호출부의 에러 계약에 속하지만,
 * 메시지 텍스트 자체는 반환 방식과 무관한 순수 문자열이라 여기서
 * 공유한다 — import(html/markdown), 클립보드 붙여넣기 4곳 이상이 이
 * 조건 분기를 그대로 복붙하고 있었다.
 */
export const tableSizeViolationMessage = (
  violation: TableSizeViolation,
): string => {
  if (violation === "TOO_MANY_COLUMNS") {
    return `Table column count exceeds ${MAX_TABLE_COLUMNS}`;
  }
  if (violation === "TOO_MANY_CELLS") {
    return `Table logical cell count exceeds ${MAX_TABLE_LOGICAL_CELLS}`;
  }
  return "Table size must be a non-negative integer";
};

// 좌표 기반(row/column) 셀 목록이 rowCount x columnCount 격자를 겹침도
// 빈틈도 없이 정확히 한 번씩 덮는지 검증한다. TableBlock의 columnId 기반
// 셀도, id 없는 TabularData의 columnIndex 기반 셀도 이 함수를 공유한다.
export const validateGridCoverage = (
  rowCount: number,
  columnCount: number,
  cells: GridCell[],
): Result<undefined, TableGridValidationError> => {
  // 개별 셀 좌표는 아래에서 꼼꼼히 검사하지만, rowCount/columnCount 자체가
  // 정수·비음수임을 보장하지 않으면 다음 줄의 new Array(rowCount *
  // columnCount)가 (NaN이거나 곱이 음수일 때) RangeError로 Result 계약
  // 밖으로 샌다 — 이 함수의 유일한 raw-number 호출부가 각자 앞단에
  // 같은 가드를 재구현해온 이유다. 하한을 0이 아니라 1로 두는 이유는
  // RangeError 회피가 아니라 별개 불변식이다 — 표는 항상 ≥1행·≥1열이고
  // (insertTable·deleteRow/deleteColumn이 이미 이 불변식을 지킨다),
  // model 자신이 0행/0열 표를 구조적으로 승인하던 gate hole이었다(C11).
  if (
    !Number.isInteger(rowCount) ||
    !Number.isInteger(columnCount) ||
    rowCount < 1 ||
    columnCount < 1
  ) {
    return invalid("INVALID_GRID_SIZE", rowCount, columnCount);
  }

  const occupied = new Array<boolean>(rowCount * columnCount).fill(false);

  for (const cellEntry of cells) {
    // TableBlock 경로는 columnId 조회가 좌표를 0 이상 정수로 보장하지만,
    // 공개 API로 들어오는 좌표(io의 TabularData 등)에는 그런 보장이 없다.
    // 음수 좌표는 occupied의 인덱스 밖 속성에 써서 상한 검사와 커버리지
    // 검사를 모두 통과해버리므로 여기서 먼저 막는다.
    if (
      !Number.isInteger(cellEntry.row) ||
      !Number.isInteger(cellEntry.column) ||
      cellEntry.row < 0 ||
      cellEntry.column < 0
    ) {
      return invalid("INVALID_COORDINATE", cellEntry.row, cellEntry.column);
    }
    if (
      !Number.isInteger(cellEntry.rowSpan) ||
      !Number.isInteger(cellEntry.columnSpan) ||
      cellEntry.rowSpan < 1 ||
      cellEntry.columnSpan < 1
    ) {
      return invalid("INVALID_COORDINATE", cellEntry.row, cellEntry.column);
    }

    const rowEnd = cellEntry.row + cellEntry.rowSpan;
    const columnEnd = cellEntry.column + cellEntry.columnSpan;
    if (columnEnd > columnCount) {
      return invalid("SPAN_OUT_OF_BOUNDS", cellEntry.row, columnCount);
    }
    if (rowEnd > rowCount) {
      return invalid("SPAN_OUT_OF_BOUNDS", rowCount, cellEntry.column);
    }

    for (
      let projectedRow = cellEntry.row;
      projectedRow < rowEnd;
      projectedRow += 1
    ) {
      for (
        let projectedColumn = cellEntry.column;
        projectedColumn < columnEnd;
        projectedColumn += 1
      ) {
        const coordinate = projectedRow * columnCount + projectedColumn;
        if (occupied[coordinate] === true) {
          return invalid("OVERLAPPING_CELL", projectedRow, projectedColumn);
        }
        occupied[coordinate] = true;
      }
    }
  }

  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      if (occupied[row * columnCount + column] !== true) {
        return invalid("UNCOVERED_COORDINATE", row, column);
      }
    }
  }

  return { ok: true, value: undefined };
};

export const validateTableGrid = (
  table: TableBlock,
): Result<undefined, TableGridValidationError> => {
  const columnIndices = new Map<string, number>();
  for (const [index, column] of table.columns.entries()) {
    columnIndices.set(column.id, index);
  }

  const cells: GridCell[] = [];
  for (const [rowIndex, row] of table.rows.entries()) {
    for (const cellEntry of row.cells) {
      const columnIndex = columnIndices.get(cellEntry.columnId);
      if (columnIndex === undefined) {
        return invalid("UNKNOWN_COLUMN", rowIndex);
      }
      cells.push({
        row: rowIndex,
        column: columnIndex,
        rowSpan: cellEntry.rowSpan,
        columnSpan: cellEntry.columnSpan,
      });
    }
  }

  return validateGridCoverage(table.rows.length, table.columns.length, cells);
};
