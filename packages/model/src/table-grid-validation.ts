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

export const validateTableGrid = (
  table: TableBlock,
): Result<undefined, TableGridValidationError> => {
  const columnIndices = new Map<string, number>();
  for (const [index, column] of table.columns.entries()) {
    columnIndices.set(column.id, index);
  }
  const rowCount = table.rows.length;
  const columnCount = table.columns.length;
  const occupiedBy = new Array<string | undefined>(rowCount * columnCount);

  for (const [rowIndex, row] of table.rows.entries()) {
    for (const cell of row.cells) {
      const columnIndex = columnIndices.get(cell.columnId);
      if (columnIndex === undefined) {
        return invalid("UNKNOWN_COLUMN", rowIndex);
      }

      const rowEnd = rowIndex + cell.rowSpan;
      const columnEnd = columnIndex + cell.columnSpan;
      if (columnEnd > columnCount) {
        return invalid("SPAN_OUT_OF_BOUNDS", rowIndex, columnCount);
      }
      if (rowEnd > rowCount) {
        return invalid("SPAN_OUT_OF_BOUNDS", rowCount, columnIndex);
      }

      for (
        let projectedRow = rowIndex;
        projectedRow < rowEnd;
        projectedRow += 1
      ) {
        for (
          let projectedColumn: number = columnIndex;
          projectedColumn < columnEnd;
          projectedColumn += 1
        ) {
          const coordinate = projectedRow * columnCount + projectedColumn;
          if (occupiedBy[coordinate] !== undefined) {
            return invalid("OVERLAPPING_CELL", projectedRow, projectedColumn);
          }
          occupiedBy[coordinate] = cell.id;
        }
      }
    }
  }

  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      if (occupiedBy[row * columnCount + column] === undefined) {
        return invalid("UNCOVERED_COORDINATE", row, column);
      }
    }
  }

  return { ok: true, value: undefined };
};
