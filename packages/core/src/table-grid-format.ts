import type { Result, TableBlock } from "@cp949/geul-model";
import {
  isCanonicalCellAlign,
  isCanonicalCellColor,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
} from "@cp949/geul-model";
import {
  indexOutOfRange,
  projectTableGrid,
  type TableCell,
  type TableCellTarget,
  type TableGridError,
} from "./table-grid.js";

// 헤더는 셀이 아니라 표 단위 플래그다(모델 headerRows/headerColumns: 0|1).
// 편집기는 이 값을 data-geul-header-* 속성으로 내보내고 CSS로 시각 구분한다.
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

type CellColorProperty = "textColor" | "backgroundColor";
type CellAlign = "left" | "center" | "right";
type CellFormatUpdate =
  | { property: CellColorProperty; value: string | null }
  | { property: "align"; value: CellAlign | null };

// 행/열/셀 id 목록 3가지 대상 전부를 "칠할 기준 셀 id 집합"으로 좁힌다.
// 행/열은 논리 격자 투영으로(G-TBL-001 — 병합 셀이 대상 행/열을 덮으면
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

// 색상/정렬 setter가 공유하는 본체. 값 검증(validate) → 대상 셀 id 해석 →
// 대상 셀만 순회하며 변경 여부 추적 → 불변 갱신까지 한 번에 처리한다.
// property별 검증 규칙만 validate 콜백으로 주입해 setCellColor/setCellAlign을
// 얇은 wrapper로 남긴다.
const setCellFormat = (
  table: TableBlock,
  target: TableCellTarget,
  update: CellFormatUpdate,
  validate: (value: string) => TableGridError | undefined,
): Result<TableBlock, TableGridError> => {
  if (update.value !== null) {
    const error = validate(update.value);
    if (error) return { ok: false, error };
  }

  const resolved = resolveTargetCellIds(table, target);
  if (!resolved.ok) return resolved;
  const targetCellIds = resolved.value;

  let changed = false;
  const rows = table.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cellEntry) => {
      if (!targetCellIds.has(cellEntry.id)) return cellEntry;
      const current =
        update.property === "align"
          ? (cellEntry.align ?? null)
          : (cellEntry[update.property] ?? null);
      if (current === update.value) return cellEntry;
      changed = true;
      return withCellFormat(cellEntry, update);
    }),
  }));

  if (!changed) return { ok: true, value: table };
  return { ok: true, value: { ...table, rows } };
};

export const setCellColor = (
  table: TableBlock,
  target: TableCellTarget,
  property: CellColorProperty,
  color: string | null,
): Result<TableBlock, TableGridError> =>
  setCellFormat(table, target, { property, value: color }, (value) =>
    isCanonicalCellColor(value)
      ? undefined
      : { code: "INVALID_COLOR", color: value },
  );

export const setCellAlign = (
  table: TableBlock,
  target: TableCellTarget,
  align: CellAlign | null,
): Result<TableBlock, TableGridError> =>
  setCellFormat(table, target, { property: "align", value: align }, (value) =>
    isCanonicalCellAlign(value)
      ? undefined
      : { code: "INVALID_ALIGN", align: value },
  );

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

// 정수 budget을 weights 비율대로 나누되 합계가 정확히 budget과 일치하도록
// 최대 잔여법(largest remainder)을 쓴다 — 단순 반올림은 합계가 어긋난다.
const distributeIntegerBudget = (
  weights: number[],
  budget: number,
): number[] => {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const raw = weights.map((weight) =>
    weightSum === 0 ? budget / weights.length : (budget * weight) / weightSum,
  );
  const floors = raw.map((value) => Math.floor(value));
  const allocated = floors.reduce((sum, value) => sum + value, 0);
  const remainder = budget - allocated;

  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floors];
  for (let k = 0; k < remainder; k += 1) {
    const target = order[k];
    if (target === undefined) break;
    result[target.index] = (result[target.index] ?? 0) + 1;
  }
  return result;
};

// 컨테이너 폭 하나에 맞춰 모든 컬럼 px 폭을 재분배한다. 기존 컬럼 간 비율을
// 유지하는 비례 배분이 기본이고, MIN/MAX_COLUMN_WIDTH를 벗어나는 컬럼은
// 클램프한 뒤 남은 폭을 나머지 컬럼에 반복 재배분한다(water-filling) —
// 컬럼 수 대비 컨테이너 폭이 물리적으로 불가능한 값이어도 각 컬럼은 항상
// 유효 범위 안에 머물고, 그 경우 합계가 컨테이너 폭과 어긋나는 것만 허용한다.
export const fitColumnsToContainerWidth = (
  table: TableBlock,
  containerWidth: number,
): Result<TableBlock, TableGridError> => {
  if (!Number.isInteger(containerWidth) || containerWidth <= 0) {
    return {
      ok: false,
      error: { code: "CONTAINER_WIDTH_INVALID", containerWidth },
    };
  }

  const columns = table.columns;
  if (columns.length === 0) {
    return { ok: true, value: table };
  }

  // 한 pass에서 여러 컬럼을 한꺼번에 클램프하면 안 된다 — 예를 들어 MAX
  // 초과 컬럼을 걷어내며 풀리는 여유폭이 동시에 평가 중인 MIN 미만 컬럼을
  // 구제할 수 있어서, 같은 snapshot으로 배치 판정하면 그 구제를 놓친다.
  // 매 반복마다 남은 컬럼만으로 비율·잔여폭을 새로 계산해 하나씩 클램프한다.
  const fixedWidths = new Map<number, number>();
  let unclamped = columns.map((_, index) => index);
  let remainingBudget = containerWidth;

  let progressed = true;
  while (progressed && unclamped.length > 0) {
    progressed = false;
    const weightSum = unclamped.reduce(
      (sum, index) => sum + columns[index]!.width,
      0,
    );

    for (const index of unclamped) {
      const weight = columns[index]!.width;
      const share =
        weightSum === 0
          ? remainingBudget / unclamped.length
          : (remainingBudget * weight) / weightSum;

      if (share < MIN_COLUMN_WIDTH) {
        fixedWidths.set(index, MIN_COLUMN_WIDTH);
        remainingBudget -= MIN_COLUMN_WIDTH;
        unclamped = unclamped.filter((i) => i !== index);
        progressed = true;
        break;
      }
      if (share > MAX_COLUMN_WIDTH) {
        fixedWidths.set(index, MAX_COLUMN_WIDTH);
        remainingBudget -= MAX_COLUMN_WIDTH;
        unclamped = unclamped.filter((i) => i !== index);
        progressed = true;
        break;
      }
    }
  }

  if (unclamped.length > 0) {
    const weights = unclamped.map((index) => columns[index]!.width);
    const allocated = distributeIntegerBudget(weights, remainingBudget);
    unclamped.forEach((index, k) => fixedWidths.set(index, allocated[k]!));
  }

  const nextColumns = columns.map((column, index) => ({
    ...column,
    width: fixedWidths.get(index) ?? column.width,
  }));

  const unchanged = nextColumns.every(
    (column, index) => column.width === columns[index]!.width,
  );
  if (unchanged) return { ok: true, value: table };

  return { ok: true, value: { ...table, columns: nextColumns } };
};
