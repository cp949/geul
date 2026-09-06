import type {
  Result,
  TableBlock,
  TableGridValidationError,
} from "@cp949/geul-model";
import { validateTableGrid } from "@cp949/geul-model";

export type TableCell = TableBlock["rows"][number]["cells"][number];

export const DEFAULT_COLUMN_WIDTH = 160;

export const indexOutOfRange: Result<never, TableGridError> = {
  ok: false,
  error: { code: "INDEX_OUT_OF_RANGE" },
};

// 표 열 id → 배열 인덱스 조회. table-grid 계열 파일 6곳과 model-to-tiptap.ts가
// 공유하는 단일 조회 지점이다(카드 Z 그릴링, 04.html) — 각자 새로 만들면
// 조회 규칙이 갈라질 여지가 열린다.
export const columnIndexMap = (table: TableBlock): Map<string, number> =>
  new Map(table.columns.map((column, index) => [column.id, index] as const));

export type TableGrid = {
  rowCount: number;
  columnCount: number;
  cellAt(
    row: number,
    column: number,
  ): { cellId: string; anchorRow: number; anchorColumn: number } | undefined;
};

export type TableGridError =
  | TableGridValidationError
  | { code: "NOT_RECTANGULAR" }
  | { code: "MERGE_BOUNDARY_CROSSED" }
  | { code: "LAST_ROW" }
  | { code: "LAST_COLUMN" }
  | { code: "COLUMN_WIDTH_OUT_OF_RANGE"; width: number }
  | { code: "INDEX_OUT_OF_RANGE" }
  | { code: "CELL_NOT_FOUND"; cellId: string }
  | { code: "INVALID_COLOR"; color: string }
  | { code: "INVALID_ALIGN"; align: string }
  | { code: "CELL_LIMIT_EXCEEDED" }
  | { code: "PASTE_MERGE_CONFLICT" };

export const projectTableGrid = (
  table: TableBlock,
): Result<TableGrid, TableGridValidationError> => {
  const rowCount = table.rows.length;
  const columnCount = table.columns.length;
  const columnIndices = columnIndexMap(table);

  const cells = new Array<
    { cellId: string; anchorRow: number; anchorColumn: number } | undefined
  >(rowCount * columnCount);

  for (const [rowIndex, row] of table.rows.entries()) {
    for (const cellEntry of row.cells) {
      const columnIndex = columnIndices.get(cellEntry.columnId);
      if (columnIndex === undefined) continue;

      const rowEnd = Math.min(rowIndex + cellEntry.rowSpan, rowCount);
      const columnEnd = Math.min(
        columnIndex + cellEntry.columnSpan,
        columnCount,
      );
      for (let row2 = rowIndex; row2 < rowEnd; row2 += 1) {
        for (let column2 = columnIndex; column2 < columnEnd; column2 += 1) {
          cells[row2 * columnCount + column2] = {
            cellId: cellEntry.id,
            anchorRow: rowIndex,
            anchorColumn: columnIndex,
          };
        }
      }
    }
  }

  const grid: TableGrid = {
    rowCount,
    columnCount,
    cellAt(row, column) {
      if (row < 0 || row >= rowCount || column < 0 || column >= columnCount) {
        return undefined;
      }
      return cells[row * columnCount + column];
    },
  };

  const validation = validateTableGrid(table);
  if (!validation.ok) return validation;
  return { ok: true, value: grid };
};

export const isRectangular = (
  grid: TableGrid,
  from: { row: number; column: number },
  to: { row: number; column: number },
): boolean => {
  const rowFrom = Math.min(from.row, to.row);
  const rowTo = Math.max(from.row, to.row);
  const columnFrom = Math.min(from.column, to.column);
  const columnTo = Math.max(from.column, to.column);

  const insideCellIds = new Set<string>();
  for (let row = rowFrom; row <= rowTo; row += 1) {
    for (let column = columnFrom; column <= columnTo; column += 1) {
      const occupant = grid.cellAt(row, column);
      if (occupant === undefined) return false;
      insideCellIds.add(occupant.cellId);
    }
  }

  const crossesBorder = (row: number, column: number): boolean => {
    const occupant = grid.cellAt(row, column);
    return occupant !== undefined && insideCellIds.has(occupant.cellId);
  };

  if (rowFrom > 0) {
    for (let column = columnFrom; column <= columnTo; column += 1) {
      if (crossesBorder(rowFrom - 1, column)) return false;
    }
  }
  if (rowTo < grid.rowCount - 1) {
    for (let column = columnFrom; column <= columnTo; column += 1) {
      if (crossesBorder(rowTo + 1, column)) return false;
    }
  }
  if (columnFrom > 0) {
    for (let row = rowFrom; row <= rowTo; row += 1) {
      if (crossesBorder(row, columnFrom - 1)) return false;
    }
  }
  if (columnTo < grid.columnCount - 1) {
    for (let row = rowFrom; row <= rowTo; row += 1) {
      if (crossesBorder(row, columnTo + 1)) return false;
    }
  }

  return true;
};

export const emptyCell = (id: string, columnId: string): TableCell => ({
  id,
  columnId,
  rowSpan: 1,
  columnSpan: 1,
  content: [],
});

export type TableCellTarget =
  | { kind: "row"; index: number }
  | { kind: "column"; index: number }
  | { kind: "cells"; cellIds: readonly string[] };
