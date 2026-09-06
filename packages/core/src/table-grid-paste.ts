import type { TabularData } from "@cp949/geul-io";
import type { IdFactory, Result, TableBlock } from "@cp949/geul-model";
import { validateTableGrid, validateTableSize } from "@cp949/geul-model";
import {
  columnIndexMap,
  DEFAULT_COLUMN_WIDTH,
  emptyCell,
  indexOutOfRange,
  type TableCell,
  type TableGridError,
} from "./table-grid.js";

// 표 밖 붙여넣기(새 표 생성)와 표 안 덮어쓰기가 공유하는 유일한 격자 연산.
// 확장은 덮어쓰기 사각형 밖의 좌표에만 빈 셀을 채우는 단일 패스 벌크
// 생성이고(끝 삽입 상당이라 기존 span과 절대 교차하지 않는다 — G-TBL-001),
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
  // 위반 종류(TOO_MANY_COLUMNS/TOO_MANY_CELLS) 판정 권위는 model에 있다 —
  // 두 상수가 언젠가 갈라져도 core가 곱셈만으로 재구현해 열-수 상한을
  // 놓치지 않도록 model.validateTableSize에 위임한다.
  if (
    validateTableSize({ columnCount: requiredColumns, rowCount: requiredRows })
  ) {
    return { ok: false, error: { code: "CELL_LIMIT_EXCEEDED" } };
  }

  const overwriteColumnEnd = anchor.column + data.columnCount;
  const overwriteRowEnd = anchor.row + data.rows.length;

  // 끝 삽입은 기존 span과 절대 교차하지 않는다(스팬은 표 경계를 넘지
  // 못한다) — insertRow/insertColumn을 행/열마다 반복 호출하면 호출마다 표
  // 전체를 재구성해 셀 복사량이 목표 크기의 제곱에 비례한다. 추가 열과
  // 행을 한 번에 만들어 붙이되, 덮어쓰기 사각형 안의 좌표는 어차피 아래
  // 덮어쓰기 패스가 전량 폐기하고 붙여넣은 셀로 채우므로 만들지 않는다
  // (표 밖 경로의 buildPasteTableSkeleton과 같은 원칙, Issue #31).
  const insideOverwrite = (rowIndex: number, columnIndex: number): boolean =>
    rowIndex >= anchor.row &&
    rowIndex < overwriteRowEnd &&
    columnIndex >= anchor.column &&
    columnIndex < overwriteColumnEnd;

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
        : table.rows.map((row, rowIndex) => ({
            ...row,
            cells: [
              ...row.cells,
              ...appendedColumns
                .filter(
                  (_, appendedIndex) =>
                    !insideOverwrite(
                      rowIndex,
                      table.columns.length + appendedIndex,
                    ),
                )
                .map((column) => emptyCell(createId(), column.id)),
            ],
          }));
    const appendedRows = Array.from(
      { length: requiredRows - table.rows.length },
      (_, appendedIndex) => ({
        id: createId(),
        cells: columns
          .filter(
            (_, columnIndex) =>
              !insideOverwrite(table.rows.length + appendedIndex, columnIndex),
          )
          .map((column) => emptyCell(createId(), column.id)),
      }),
    );
    expanded = { ...table, columns, rows: [...widenedRows, ...appendedRows] };
  }
  const columnIndexById = columnIndexMap(expanded);

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
