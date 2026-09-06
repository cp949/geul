import type { IdFactory, Result, TableBlock } from "@cp949/geul-model";
import {
  columnIndexMap,
  emptyCell,
  isRectangular,
  projectTableGrid,
  type TableCell,
  type TableGridError,
} from "./table-grid.js";

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

  // 범위를 이미 그 셀 하나가 정확히 덮고 있으면 바꿀 것이 없다. 입력 표를
  // 참조 그대로 돌려줘야 호출자가 no-op을 알아보고 트랜잭션을 만들지 않는다
  // (moveRow/resizeColumn/splitCell과 같은 규약).
  const anchorEntry = table.rows[rowFrom]?.cells.find(
    (cellEntry) => cellEntry.id === anchorCellId,
  );
  if (
    removedCellIds.size === 0 &&
    anchorEntry !== undefined &&
    anchorEntry.rowSpan === rowTo - rowFrom + 1 &&
    anchorEntry.columnSpan === columnTo - columnFrom + 1
  ) {
    return { ok: true, value: table };
  }

  // 사라지는 셀의 내용은 기준 셀 뒤에 논리 좌표 순서(행 우선)로 이어붙인다.
  // 병합이 사용자 텍스트를 조용히 지우면 안 된다 — 비어 있지 않은 조각
  // 사이에만 공백 run을 넣는다(빈 셀은 공백을 만들지 않는다).
  const contentById = new Map<string, TableCell["content"]>(
    table.rows.flatMap((row) =>
      row.cells.map((cellEntry) => [cellEntry.id, cellEntry.content] as const),
    ),
  );
  const mergedContent: TableCell["content"] = [];
  for (const cellId of [anchorCellId, ...removedCellIds]) {
    const part = contentById.get(cellId) ?? [];
    if (part.length === 0) continue;
    if (mergedContent.length > 0) mergedContent.push({ text: " " });
    mergedContent.push(...part);
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
                content: mergedContent,
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
  const columnIndices = columnIndexMap(table);

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
