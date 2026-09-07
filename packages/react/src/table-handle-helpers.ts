import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "@cp949/geul-core";

import {
  readGeometryFor,
  type TableGeometry,
} from "./table-handle-geometry.js";
import type { HandleMenuState, ReorderState } from "./table-handle-types.js";

// colgroup col의 인라인 width는 renderHTML이 쓴 모델 열 너비다. 셀 rect는
// 콘텐츠가 렌더 너비를 강제로 벌리면 모델 값과 어긋나므로 리사이즈 시드로
// 쓰지 않는다.
export const readColumnStyleWidth = (
  table: HTMLElement,
  index: number,
): number | null => {
  const col = table.querySelectorAll<HTMLElement>("colgroup col")[index];
  if (col === undefined) return null;
  const width = Number.parseFloat(col.style.width);
  return Number.isFinite(width) ? width : null;
};

export const setColumnStyleWidth = (
  table: HTMLElement,
  index: number,
  width: number,
): void => {
  const col = table.querySelectorAll<HTMLElement>("colgroup col")[index];
  if (col !== undefined) col.style.width = `${width}px`;
};

// usePointerDragGesture의 onMove 콜백에서 쓰는 순수 함수다. 원래는 그
// 4-listener 이펙트 안의 지역 함수였지만, 훅으로 옮기며 콜백이
// useCallback으로 안정화돼야 해서 element를 인자로 받는 모듈 스코프
// 함수로 뽑았다 — 로직 자체는 그대로다.
export const computeReorderTargetIndex = (
  element: HTMLElement,
  current: ReorderState,
  clientX: number,
  clientY: number,
): number | null => {
  const currentGeometry = readGeometryFor(element, current.tableBlockId);
  if (currentGeometry === null) return null;

  if (current.kind === "row") {
    const { rows } = currentGeometry;
    const targetIndex = rows.findIndex(
      (row) => clientY < row.top + row.height / 2,
    );
    return targetIndex === -1 ? rows.length : targetIndex;
  }
  const { columns } = currentGeometry;
  const targetIndex = columns.findIndex(
    (column) => clientX < column.left + column.width / 2,
  );
  return targetIndex === -1 ? columns.length : targetIndex;
};

export const clampWidth = (width: number): number =>
  Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));

export type ReorderGuideRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// TableHandles 렌더 본문의 reorderGuideRect IIFE를 그대로 옮긴 순수 함수다.
// 드래그가 실제로 움직였고(hasDragged) 목표 인덱스가 잡혔을 때만 재정렬
// 가이드 위치를 계산한다 — table-handle-overlays.tsx는 이 결과만 받는다.
export const computeReorderGuideRect = (
  geometry: TableGeometry | null,
  reorderState: ReorderState | null,
): ReorderGuideRect | null => {
  if (
    geometry === null ||
    reorderState === null ||
    !reorderState.hasDragged ||
    reorderState.targetIndex === null
  ) {
    return null;
  }

  if (reorderState.kind === "row") {
    const { rows } = geometry;
    const target = rows[reorderState.targetIndex];
    const lastRow = rows[rows.length - 1];
    const top =
      target !== undefined
        ? target.top
        : (lastRow?.top ?? geometry.top) + (lastRow?.height ?? 0);
    return {
      left: geometry.left,
      top,
      width: geometry.right - geometry.left,
      height: 2,
    };
  }

  const { columns } = geometry;
  const target = columns[reorderState.targetIndex];
  const lastColumn = columns[columns.length - 1];
  const left =
    target !== undefined
      ? target.left
      : (lastColumn?.left ?? geometry.left) + (lastColumn?.width ?? 0);
  return {
    left,
    top: geometry.top,
    width: 2,
    height: geometry.bottom - geometry.top,
  };
};

export type MenuPosition = {
  left: number;
  top: number;
};

// TableHandles 렌더 본문의 menuPosition IIFE를 그대로 옮긴 순수 함수다.
// 메뉴 좌표를 click 시점에 고정하지 않고 매 렌더 geometry에서 다시
// 계산한다 — 열린 채로 스크롤/창 크기 변경이 일어나도 앵커(핸들)와
// 어긋나지 않는다.
export const computeMenuPosition = (
  geometry: TableGeometry | null,
  menuState: HandleMenuState | null,
): MenuPosition | null => {
  if (menuState === null || geometry === null) return null;
  if (menuState.kind === "row") {
    const row = geometry.rows.find((entry) => entry.index === menuState.index);
    return row === undefined
      ? null
      : { left: geometry.left, top: row.top + row.height };
  }
  const column = geometry.columns.find(
    (entry) => entry.index === menuState.index,
  );
  return column === undefined ? null : { left: column.left, top: geometry.top };
};
