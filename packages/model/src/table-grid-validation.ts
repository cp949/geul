import type { Result } from "./result.js";
import type { TableBlock } from "./types.js";

export const MIN_COLUMN_WIDTH = 48;
export const MAX_COLUMN_WIDTH = 1200;

export type TableGridInvalidReason =
  | "UNKNOWN_COLUMN"
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

// 좌표 기반(row/column) 셀 목록이 rowCount x columnCount 격자를 겹침도
// 빈틈도 없이 정확히 한 번씩 덮는지 검증한다. TableBlock의 columnId 기반
// 셀도, id 없는 TabularData의 columnIndex 기반 셀도 이 함수를 공유한다.
export const validateGridCoverage = (
  rowCount: number,
  columnCount: number,
  cells: GridCell[],
): Result<undefined, TableGridValidationError> => {
  const occupied = new Array<boolean>(rowCount * columnCount).fill(false);

  for (const cellEntry of cells) {
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
