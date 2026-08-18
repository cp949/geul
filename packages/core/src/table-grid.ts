import type { TabularData } from "@cp949/geul-io";
import type {
  IdFactory,
  Result,
  TableBlock,
  TableGridValidationError,
} from "@cp949/geul-model";
import {
  isCanonicalCellAlign,
  isCanonicalCellColor,
  MAX_COLUMN_WIDTH,
  MAX_TABLE_LOGICAL_CELLS,
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

// 헤더는 셀이 아니라 표 단위 플래그다(모델 headerRows/headerColumns: 0|1).
// 편집기는 이 값을 data-be-header-* 속성으로 내보내고 CSS로 시각 구분한다.
export const toggleHeaderRow = (
  table: TableBlock,
): Result<TableBlock, TableGridError> => ({
  ok: true,
  value: { ...table, headerRows: table.headerRows === 1 ? 0 : 1 },
});

export const toggleHeaderColumn = (
  table: TableBlock,
): Result<TableBlock, TableGridError> => ({
  ok: true,
  value: { ...table, headerColumns: table.headerColumns === 1 ? 0 : 1 },
});

export type TableCellTarget =
  | { kind: "row"; index: number }
  | { kind: "column"; index: number }
  | { kind: "cells"; cellIds: readonly string[] };

type CellColorProperty = "textColor" | "backgroundColor";
type CellAlign = "left" | "center" | "right";
type CellFormatUpdate =
  | { property: CellColorProperty; value: string | null }
  | { property: "align"; value: CellAlign | null };

// 행/열/셀 id 목록 3가지 대상 전부를 "칠할 기준 셀 id 집합"으로 좁힌다.
// 행/열은 논리 격자 투영으로(PIT-0004 — 병합 셀이 대상 행/열을 덮으면
// 함께 포함), 셀 id 목록은 실제 존재하는 id인지만 확인한다.
const resolveTargetCellIds = (
  table: TableBlock,
  target: TableCellTarget,
): Result<Set<string>, TableGridError> => {
  if (target.kind === "cells") {
    const allCellIds = new Set(
      table.rows.flatMap((row) => row.cells.map((cellEntry) => cellEntry.id)),
    );
    const targetCellIds = new Set<string>();
    for (const cellId of target.cellIds) {
      if (!allCellIds.has(cellId)) {
        return { ok: false, error: { code: "CELL_NOT_FOUND", cellId } };
      }
      targetCellIds.add(cellId);
    }
    return { ok: true, value: targetCellIds };
  }

  const limit =
    target.kind === "row" ? table.rows.length : table.columns.length;
  if (
    !Number.isInteger(target.index) ||
    target.index < 0 ||
    target.index >= limit
  ) {
    return indexOutOfRange;
  }

  const projected = projectTableGrid(table);
  if (!projected.ok) return projected;
  const grid = projected.value;

  const targetCellIds = new Set<string>();
  const span = target.kind === "row" ? grid.columnCount : grid.rowCount;
  for (let index = 0; index < span; index += 1) {
    const occupant =
      target.kind === "row"
        ? grid.cellAt(target.index, index)
        : grid.cellAt(index, target.index);
    if (occupant !== undefined) targetCellIds.add(occupant.cellId);
  }
  return { ok: true, value: targetCellIds };
};

// 셀 서식 하나만 바꾸고 나머지 필드는 그대로 보존한다. null은
// optional 저장 필드의 키 자체를 제거한다.
const withCellFormat = (
  cellEntry: TableCell,
  update: CellFormatUpdate,
): TableCell => {
  const next = { ...cellEntry };
  if (update.value === null) {
    delete next[update.property];
    return next;
  }
  if (update.property === "align") next.align = update.value;
  else next[update.property] = update.value;
  return next;
};

export const setCellColor = (
  table: TableBlock,
  target: TableCellTarget,
  property: CellColorProperty,
  color: string | null,
): Result<TableBlock, TableGridError> => {
  if (color !== null && !isCanonicalCellColor(color)) {
    return { ok: false, error: { code: "INVALID_COLOR", color } };
  }

  const resolved = resolveTargetCellIds(table, target);
  if (!resolved.ok) return resolved;
  const targetCellIds = resolved.value;

  let changed = false;
  const rows = table.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cellEntry) => {
      if (!targetCellIds.has(cellEntry.id)) return cellEntry;
      if ((cellEntry[property] ?? null) === color) return cellEntry;
      changed = true;
      return withCellFormat(cellEntry, { property, value: color });
    }),
  }));

  if (!changed) return { ok: true, value: table };
  return { ok: true, value: { ...table, rows } };
};

export const setCellAlign = (
  table: TableBlock,
  target: TableCellTarget,
  align: CellAlign | null,
): Result<TableBlock, TableGridError> => {
  if (align !== null && !isCanonicalCellAlign(align)) {
    return { ok: false, error: { code: "INVALID_ALIGN", align } };
  }

  const resolved = resolveTargetCellIds(table, target);
  if (!resolved.ok) return resolved;
  const targetCellIds = resolved.value;

  let changed = false;
  const rows = table.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cellEntry) => {
      if (!targetCellIds.has(cellEntry.id)) return cellEntry;
      if ((cellEntry.align ?? null) === align) return cellEntry;
      changed = true;
      return withCellFormat(cellEntry, { property: "align", value: align });
    }),
  }));

  if (!changed) return { ok: true, value: table };
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

export const resizeColumn = (
  table: TableBlock,
  index: number,
  width: number,
): Result<TableBlock, TableGridError> => {
  if (!Number.isInteger(index) || index < 0 || index >= table.columns.length) {
    return indexOutOfRange;
  }

  const validated = validateColumnWidth(width);
  if (!validated.ok) return validated;

  // no-op이면 입력 표를 그대로 반환한다 — 호출자는 참조 동일성으로
  // 트랜잭션 생략 여부를 판단한다(moveRow/moveColumn과 같은 계약).
  if (table.columns[index]?.width === width) {
    return { ok: true, value: table };
  }

  const columns = table.columns.map((column, columnIndex) =>
    columnIndex === index ? { ...column, width } : column,
  );
  return { ok: true, value: { ...table, columns } };
};

// 표 밖 붙여넣기(새 표 생성)와 표 안 덮어쓰기가 공유하는 유일한 격자 연산.
// 확장은 기존 insertRow/insertColumn을 끝에 반복 호출해 처리하고(끝 삽입은
// 기존 span과 절대 교차하지 않는다 — PIT-0004, 새 격자 계산 코드 없음),
// 덮어쓰기 결과가 유효한지는 기존 validateTableGrid로 검증한다(겹침 탐지
// 로직을 새로 안 쓴다).
export const pasteInto = (
  table: TableBlock,
  anchor: { row: number; column: number },
  data: TabularData,
  createId: IdFactory,
): Result<TableBlock, TableGridError> => {
  if (
    !Number.isInteger(anchor.row) ||
    anchor.row < 0 ||
    !Number.isInteger(anchor.column) ||
    anchor.column < 0
  ) {
    return indexOutOfRange;
  }
  if (data.rows.length === 0 || data.columnCount === 0) {
    return { ok: true, value: table };
  }

  // 확장 후 최종 표 크기는 기존 표 크기와 붙여넣기가 요구하는 크기 중
  // 큰 쪽이다(insertRow/insertColumn은 표를 줄이지 않는다) — 셀 한도
  // 검사는 이 최종 크기를 기준으로 해야 한다. 붙여넣기 영역만 계산하면
  // 기존 표가 더 넓은/긴 경우 최종 셀 수를 과소평가해 한도를 우회한다.
  const requiredRows = Math.max(
    table.rows.length,
    anchor.row + data.rows.length,
  );
  const requiredColumns = Math.max(
    table.columns.length,
    anchor.column + data.columnCount,
  );
  if (requiredRows * requiredColumns > MAX_TABLE_LOGICAL_CELLS) {
    return { ok: false, error: { code: "CELL_LIMIT_EXCEEDED" } };
  }

  // 끝 삽입은 기존 span과 절대 교차하지 않는다(스팬은 표 경계를 넘지
  // 못한다) — insertRow/insertColumn을 행/열마다 반복 호출하면 호출마다 표
  // 전체를 재구성해 셀 복사량이 목표 크기의 제곱에 비례한다. 추가 열과
  // 행을 한 번에 만들어 붙인다(Issue #31).
  let expanded = table;
  if (
    requiredRows > table.rows.length ||
    requiredColumns > table.columns.length
  ) {
    const appendedColumns = Array.from(
      { length: requiredColumns - table.columns.length },
      () => ({ id: createId(), width: DEFAULT_COLUMN_WIDTH }),
    );
    const columns = [...table.columns, ...appendedColumns];
    const widenedRows =
      appendedColumns.length === 0
        ? table.rows
        : table.rows.map((row) => ({
            ...row,
            cells: [
              ...row.cells,
              ...appendedColumns.map((column) =>
                emptyCell(createId(), column.id),
              ),
            ],
          }));
    const appendedRows = Array.from(
      { length: requiredRows - table.rows.length },
      () => ({
        id: createId(),
        cells: columns.map((column) => emptyCell(createId(), column.id)),
      }),
    );
    expanded = { ...table, columns, rows: [...widenedRows, ...appendedRows] };
  }

  const overwriteColumnEnd = anchor.column + data.columnCount;
  const overwriteRowEnd = anchor.row + data.rows.length;
  const columnIndexById = new Map(
    expanded.columns.map((column, index) => [column.id, index] as const),
  );

  const rows = expanded.rows.map((row, rowIndex) => {
    if (rowIndex < anchor.row || rowIndex >= overwriteRowEnd) return row;

    // 덮어쓰기 열 범위와 겹치지 않는 기존 셀만 남긴다. 왼쪽에 남는 셀과
    // 오른쪽에 남는 셀을 나눠 붙여넣은 셀을 열 순서대로(왼쪽→붙여넣기→
    // 오른쪽) 끼워 넣는다 — 소비자가 cells 배열 순서를 열 순서로 신뢰할
    // 수 있게 유지한다.
    const survivorsBefore: TableCell[] = [];
    const survivorsAfter: TableCell[] = [];
    for (const cellEntry of row.cells) {
      const columnIndex = columnIndexById.get(cellEntry.columnId);
      if (columnIndex === undefined) {
        survivorsAfter.push(cellEntry);
        continue;
      }
      const overlaps =
        columnIndex < overwriteColumnEnd &&
        columnIndex + cellEntry.columnSpan > anchor.column;
      if (overlaps) continue;
      if (columnIndex < anchor.column) survivorsBefore.push(cellEntry);
      else survivorsAfter.push(cellEntry);
    }

    const pastedRow = data.rows[rowIndex - anchor.row];
    const pastedCells: TableCell[] = (pastedRow?.cells ?? []).map((source) => {
      const column = expanded.columns[anchor.column + source.columnIndex];
      return {
        id: createId(),
        columnId: column?.id ?? "",
        rowSpan: source.rowSpan,
        columnSpan: source.columnSpan,
        content: source.content,
        ...(source.textColor === undefined
          ? {}
          : { textColor: source.textColor }),
        ...(source.backgroundColor === undefined
          ? {}
          : { backgroundColor: source.backgroundColor }),
        ...(source.align === undefined ? {} : { align: source.align }),
      };
    });

    return {
      ...row,
      cells: [...survivorsBefore, ...pastedCells, ...survivorsAfter],
    };
  });

  const candidate = { ...expanded, rows };
  const validation = validateTableGrid(candidate);
  if (!validation.ok) {
    return { ok: false, error: { code: "PASTE_MERGE_CONFLICT" } };
  }
  return { ok: true, value: candidate };
};
