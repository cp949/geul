import type { IdFactory, Result, TableBlock } from "@cp949/geul-model";
import { validateTableGrid } from "@cp949/geul-model";
import {
  columnIndexMap,
  DEFAULT_COLUMN_WIDTH,
  emptyCell,
  indexOutOfRange,
  type TableCell,
  type TableGridError,
} from "./table-grid.js";

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

  const columnIndices = columnIndexMap(table);
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

  const columnIndices = columnIndexMap(table);

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

  const columnIndices = columnIndexMap(table);
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
