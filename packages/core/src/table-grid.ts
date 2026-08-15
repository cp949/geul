import type {
  IdFactory,
  Result,
  TableBlock,
  TableGridValidationError,
} from "@cp949/geul-model";
import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  validateTableGrid,
} from "@cp949/geul-model";

type TableCell = TableBlock["rows"][number]["cells"][number];

export const DEFAULT_COLUMN_WIDTH = 160;

const indexOutOfRange: Result<never, TableGridError> = {
  ok: false,
  error: { code: "INDEX_OUT_OF_RANGE" },
};

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
  | { code: "CELL_NOT_FOUND"; cellId: string };

export const projectTableGrid = (
  table: TableBlock,
): Result<TableGrid, TableGridValidationError> => {
  const rowCount = table.rows.length;
  const columnCount = table.columns.length;
  const columnIndices = new Map(
    table.columns.map((column, index) => [column.id, index] as const),
  );

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

const emptyCell = (id: string, columnId: string): TableCell => ({
  id,
  columnId,
  rowSpan: 1,
  columnSpan: 1,
  content: [],
});

export const insertRow = (
  table: TableBlock,
  atIndex: number,
  createId: IdFactory,
): Result<TableBlock, TableGridError> => {
  if (
    !Number.isInteger(atIndex) ||
    atIndex < 0 ||
    atIndex > table.rows.length
  ) {
    return indexOutOfRange;
  }

  const columnIndices = new Map(
    table.columns.map((column, index) => [column.id, index] as const),
  );
  const coveredColumnIds = new Set<string>();

  const rows = table.rows.map((row, rowIndex) => {
    if (rowIndex >= atIndex) return row;
    return {
      ...row,
      cells: row.cells.map((cellEntry) => {
        const columnIndex = columnIndices.get(cellEntry.columnId);
        const straddles =
          columnIndex !== undefined &&
          cellEntry.rowSpan > 1 &&
          atIndex <= rowIndex + cellEntry.rowSpan - 1;
        if (!straddles || columnIndex === undefined) return cellEntry;

        for (
          let column = columnIndex;
          column < columnIndex + cellEntry.columnSpan;
          column += 1
        ) {
          const coveredColumn = table.columns[column];
          if (coveredColumn !== undefined) {
            coveredColumnIds.add(coveredColumn.id);
          }
        }
        return { ...cellEntry, rowSpan: cellEntry.rowSpan + 1 };
      }),
    };
  });

  const newRow = {
    id: createId(),
    cells: table.columns
      .filter((column) => !coveredColumnIds.has(column.id))
      .map((column) => emptyCell(createId(), column.id)),
  };

  rows.splice(atIndex, 0, newRow);

  return { ok: true, value: { ...table, rows } };
};

export const insertColumn = (
  table: TableBlock,
  atIndex: number,
  createId: IdFactory,
): Result<TableBlock, TableGridError> => {
  if (
    !Number.isInteger(atIndex) ||
    atIndex < 0 ||
    atIndex > table.columns.length
  ) {
    return indexOutOfRange;
  }

  const columnIndices = new Map(
    table.columns.map((column, index) => [column.id, index] as const),
  );

  const newColumn = { id: createId(), width: DEFAULT_COLUMN_WIDTH };
  const columns = [...table.columns];
  columns.splice(atIndex, 0, newColumn);

  const coveredRowIndices = new Set<number>();

  const rows = table.rows.map((row, rowIndex) => ({
    ...row,
    cells: row.cells.map((cellEntry) => {
      const columnIndex = columnIndices.get(cellEntry.columnId);
      const straddles =
        columnIndex !== undefined &&
        cellEntry.columnSpan > 1 &&
        columnIndex < atIndex &&
        atIndex <= columnIndex + cellEntry.columnSpan - 1;
      if (!straddles || columnIndex === undefined) return cellEntry;

      for (
        let coveredRow = rowIndex;
        coveredRow < rowIndex + cellEntry.rowSpan;
        coveredRow += 1
      ) {
        coveredRowIndices.add(coveredRow);
      }
      return { ...cellEntry, columnSpan: cellEntry.columnSpan + 1 };
    }),
  }));

  const rowsWithNewColumnCells = rows.map((row, rowIndex) =>
    coveredRowIndices.has(rowIndex)
      ? row
      : { ...row, cells: [...row.cells, emptyCell(createId(), newColumn.id)] },
  );

  return {
    ok: true,
    value: { ...table, columns, rows: rowsWithNewColumnCells },
  };
};

export const deleteRow = (
  table: TableBlock,
  index: number,
): Result<TableBlock, TableGridError> => {
  if (!Number.isInteger(index) || index < 0 || index >= table.rows.length) {
    return indexOutOfRange;
  }
  if (table.rows.length <= 1) {
    return { ok: false, error: { code: "LAST_ROW" } };
  }

  const successorCells: TableCell[] = [];
  const remainingRows = table.rows.flatMap((row, rowIndex) => {
    if (rowIndex === index) {
      for (const cellEntry of row.cells) {
        if (cellEntry.rowSpan > 1) {
          successorCells.push({
            ...cellEntry,
            rowSpan: cellEntry.rowSpan - 1,
          });
        }
      }
      return [];
    }
    if (rowIndex > index) return [row];
    return [
      {
        ...row,
        cells: row.cells.map((cellEntry) =>
          cellEntry.rowSpan > 1 && rowIndex + cellEntry.rowSpan - 1 >= index
            ? { ...cellEntry, rowSpan: cellEntry.rowSpan - 1 }
            : cellEntry,
        ),
      },
    ];
  });

  const rows = remainingRows.map((row, rowIndex) =>
    rowIndex === index
      ? { ...row, cells: [...row.cells, ...successorCells] }
      : row,
  );

  return { ok: true, value: { ...table, rows } };
};

export const deleteColumn = (
  table: TableBlock,
  index: number,
): Result<TableBlock, TableGridError> => {
  if (!Number.isInteger(index) || index < 0 || index >= table.columns.length) {
    return indexOutOfRange;
  }
  if (table.columns.length <= 1) {
    return { ok: false, error: { code: "LAST_COLUMN" } };
  }

  const columnIndices = new Map(
    table.columns.map(
      (column, columnIndex) => [column.id, columnIndex] as const,
    ),
  );
  const removedColumnId = table.columns[index]?.id;
  const successorColumnId = table.columns[index + 1]?.id;
  const columns = table.columns.filter(
    (_, columnIndex) => columnIndex !== index,
  );

  const rows = table.rows.map((row) => ({
    ...row,
    cells: row.cells.flatMap((cellEntry) => {
      if (cellEntry.columnId === removedColumnId) {
        if (cellEntry.columnSpan > 1 && successorColumnId !== undefined) {
          return [
            {
              ...cellEntry,
              columnId: successorColumnId,
              columnSpan: cellEntry.columnSpan - 1,
            },
          ];
        }
        return [];
      }

      const columnIndex = columnIndices.get(cellEntry.columnId);
      if (
        columnIndex !== undefined &&
        cellEntry.columnSpan > 1 &&
        columnIndex < index &&
        columnIndex + cellEntry.columnSpan - 1 >= index
      ) {
        return [{ ...cellEntry, columnSpan: cellEntry.columnSpan - 1 }];
      }
      return [cellEntry];
    }),
  }));

  return { ok: true, value: { ...table, columns, rows } };
};

const mergeBoundaryCrossed: Result<never, TableGridError> = {
  ok: false,
  error: { code: "MERGE_BOUNDARY_CROSSED" },
};

export const moveRow = (
  table: TableBlock,
  fromIndex: number,
  toIndex: number,
): Result<TableBlock, TableGridError> => {
  if (
    !Number.isInteger(fromIndex) ||
    fromIndex < 0 ||
    fromIndex >= table.rows.length ||
    !Number.isInteger(toIndex) ||
    toIndex < 0 ||
    toIndex >= table.rows.length
  ) {
    return indexOutOfRange;
  }
  if (fromIndex === toIndex) return { ok: true, value: table };

  const rows = [...table.rows];
  const [moved] = rows.splice(fromIndex, 1);
  if (moved === undefined) return indexOutOfRange;
  rows.splice(toIndex, 0, moved);

  const candidate = { ...table, rows };
  const validation = validateTableGrid(candidate);
  if (!validation.ok) return mergeBoundaryCrossed;
  return { ok: true, value: candidate };
};

export const moveColumn = (
  table: TableBlock,
  fromIndex: number,
  toIndex: number,
): Result<TableBlock, TableGridError> => {
  if (
    !Number.isInteger(fromIndex) ||
    fromIndex < 0 ||
    fromIndex >= table.columns.length ||
    !Number.isInteger(toIndex) ||
    toIndex < 0 ||
    toIndex >= table.columns.length
  ) {
    return indexOutOfRange;
  }
  if (fromIndex === toIndex) return { ok: true, value: table };

  const columns = [...table.columns];
  const [moved] = columns.splice(fromIndex, 1);
  if (moved === undefined) return indexOutOfRange;
  columns.splice(toIndex, 0, moved);

  const candidate = { ...table, columns };
  const validation = validateTableGrid(candidate);
  if (!validation.ok) return mergeBoundaryCrossed;
  return { ok: true, value: candidate };
};

export const mergeCells = (
  table: TableBlock,
  from: { row: number; column: number },
  to: { row: number; column: number },
): Result<TableBlock, TableGridError> => {
  const projected = projectTableGrid(table);
  if (!projected.ok) return projected;
  const grid = projected.value;

  if (!isRectangular(grid, from, to)) {
    return { ok: false, error: { code: "NOT_RECTANGULAR" } };
  }

  const rowFrom = Math.min(from.row, to.row);
  const rowTo = Math.max(from.row, to.row);
  const columnFrom = Math.min(from.column, to.column);
  const columnTo = Math.max(from.column, to.column);

  const anchor = grid.cellAt(rowFrom, columnFrom);
  if (anchor === undefined) {
    return { ok: false, error: { code: "NOT_RECTANGULAR" } };
  }
  const anchorCellId = anchor.cellId;

  const removedCellIds = new Set<string>();
  for (let row = rowFrom; row <= rowTo; row += 1) {
    for (let column = columnFrom; column <= columnTo; column += 1) {
      const occupant = grid.cellAt(row, column);
      if (
        occupant !== undefined &&
        occupant.anchorRow === row &&
        occupant.anchorColumn === column &&
        occupant.cellId !== anchorCellId
      ) {
        removedCellIds.add(occupant.cellId);
      }
    }
  }

  const rows = table.rows.map((row, rowIndex) => {
    if (rowIndex < rowFrom || rowIndex > rowTo) return row;
    return {
      ...row,
      cells: row.cells
        .filter((cellEntry) => !removedCellIds.has(cellEntry.id))
        .map((cellEntry) =>
          cellEntry.id === anchorCellId
            ? {
                ...cellEntry,
                rowSpan: rowTo - rowFrom + 1,
                columnSpan: columnTo - columnFrom + 1,
              }
            : cellEntry,
        ),
    };
  });

  return { ok: true, value: { ...table, rows } };
};

export const splitCell = (
  table: TableBlock,
  cellId: string,
  createId: IdFactory,
): Result<TableBlock, TableGridError> => {
  const columnIndices = new Map(
    table.columns.map((column, index) => [column.id, index] as const),
  );

  let anchorRowIndex = -1;
  let anchorColumnIndex = -1;
  let targetRowSpan = 1;
  let targetColumnSpan = 1;
  let found = false;

  for (const [rowIndex, row] of table.rows.entries()) {
    const target = row.cells.find((cellEntry) => cellEntry.id === cellId);
    if (target === undefined) continue;
    found = true;
    anchorRowIndex = rowIndex;
    targetRowSpan = target.rowSpan;
    targetColumnSpan = target.columnSpan;
    const columnIndex = columnIndices.get(target.columnId);
    anchorColumnIndex = columnIndex ?? -1;
    break;
  }

  if (!found || anchorColumnIndex === -1) {
    return { ok: false, error: { code: "CELL_NOT_FOUND", cellId } };
  }
  if (targetRowSpan <= 1 && targetColumnSpan <= 1) {
    return { ok: true, value: table };
  }

  const rows = table.rows.map((row, rowIndex) => {
    if (
      rowIndex < anchorRowIndex ||
      rowIndex >= anchorRowIndex + targetRowSpan
    ) {
      return row;
    }

    const newCells: TableCell[] = [];
    for (
      let columnIndex = anchorColumnIndex;
      columnIndex < anchorColumnIndex + targetColumnSpan;
      columnIndex += 1
    ) {
      if (rowIndex === anchorRowIndex && columnIndex === anchorColumnIndex) {
        continue;
      }
      const column = table.columns[columnIndex];
      if (column === undefined) continue;
      newCells.push(emptyCell(createId(), column.id));
    }

    if (rowIndex === anchorRowIndex) {
      return {
        ...row,
        cells: [
          ...row.cells.map((cellEntry) =>
            cellEntry.id === cellId
              ? { ...cellEntry, rowSpan: 1, columnSpan: 1 }
              : cellEntry,
          ),
          ...newCells,
        ],
      };
    }
    return { ...row, cells: [...row.cells, ...newCells] };
  });

  return { ok: true, value: { ...table, rows } };
};

export const validateColumnWidth = (
  width: number,
): Result<undefined, TableGridError> => {
  if (
    !Number.isInteger(width) ||
    width < MIN_COLUMN_WIDTH ||
    width > MAX_COLUMN_WIDTH
  ) {
    return { ok: false, error: { code: "COLUMN_WIDTH_OUT_OF_RANGE", width } };
  }
  return { ok: true, value: undefined };
};
