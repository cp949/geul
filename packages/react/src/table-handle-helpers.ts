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
//
// G-UI-003/ADR-0012: currentGeometry는 이제 page-relative다(readPageRect).
// 호출부가 pointer 이벤트의 clientX/clientY(viewport-relative)를 그대로
// 넘기면 스크롤된 페이지에서 좌표계가 어긋나 목표 인덱스가 틀린다 —
// 파라미터명을 pageX/pageY로 못박아 호출부가 event.pageX/pageY(page-relative)를
// 넘기게 강제한다.
export const computeReorderTargetIndex = (
  element: HTMLElement,
  current: ReorderState,
  pageX: number,
  pageY: number,
): number | null => {
  const currentGeometry = readGeometryFor(element, current.tableBlockId);
  if (currentGeometry === null) return null;

  if (current.kind === "row") {
    const { rows } = currentGeometry;
    const targetIndex = rows.findIndex(
      (row) => pageY < row.top + row.height / 2,
    );
    return targetIndex === -1 ? rows.length : targetIndex;
  }
  const { columns } = currentGeometry;
  const targetIndex = columns.findIndex(
    (column) => pageX < column.left + column.width / 2,
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

// Notion 참고(사용자 요청) — Add row/column 버튼은 표 전체가 아니라 가장
// 아래 행/가장 오른쪽 열 위에 있을 때만 보인다. hoverRowId·hoverColumnId는
// table-handles.tsx가 event.target에서 실제 가리키는 셀의 행·열 id를 그대로
// 읽어 넘긴다(geometry의 page-relative 좌표와 pointermove의 viewport-relative
// 좌표를 섞어 재계산할 필요가 없다). 병합 셀이 마지막 열/행을 덮으면 그
// 셀의 id는 자기 자신(anchor)의 id라 이 비교를 못 맞힐 수 있다 — 알려진
// 한계로 남긴다(별도 이슈 없음, 우선순위 낮음).
export const computeExpandButtonVisibility = (
  geometry: TableGeometry | null,
  hoverRowId: string | null,
  hoverColumnId: string | null,
): { showAddRow: boolean; showAddColumn: boolean } => {
  if (geometry === null) return { showAddRow: false, showAddColumn: false };
  const { rows, columns } = geometry;
  const lastRow = rows[rows.length - 1];
  const lastColumn = columns[columns.length - 1];
  return {
    showAddRow: lastRow !== undefined && hoverRowId === lastRow.rowId,
    showAddColumn:
      lastColumn !== undefined && hoverColumnId === lastColumn.columnId,
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
//
// G-UI-001과 G-UI-003의 경계: 이 메뉴(TableHandleMenu)는 오버레이 6종과
// 달리 dismissible이라 G-UI-001 범위에 남는다 — position: fixed +
// useClampedMenuPosition(뷰포트 기준 clamp)를 그대로 쓴다. 하지만
// geometry는 이제 page-relative다(readPageRect) — fixed+clamp가 기대하는
// viewport-relative로 되돌리려면 호출 시점 스크롤 오프셋을 다시 빼야
// 한다. scrollOffset이 0,0(스크롤 없음)이면 기존 값과 동일하다.
export const computeMenuPosition = (
  geometry: TableGeometry | null,
  menuState: HandleMenuState | null,
  scrollOffset: { x: number; y: number },
): MenuPosition | null => {
  if (menuState === null || geometry === null) return null;
  if (menuState.kind === "row") {
    const row = geometry.rows.find((entry) => entry.index === menuState.index);
    return row === undefined
      ? null
      : {
          left: geometry.left - scrollOffset.x,
          top: row.top + row.height - scrollOffset.y,
        };
  }
  const column = geometry.columns.find(
    (entry) => entry.index === menuState.index,
  );
  return column === undefined
    ? null
    : {
        left: column.left - scrollOffset.x,
        top: geometry.top - scrollOffset.y,
      };
};

// Issue #174 RD-003 — 표 그립 메뉴는 그립 버튼(table-handle-overlays.tsx,
// left: geometry.left - 24, top: geometry.top - 24, height 20px)의 바로
// 아래에 연다. geometry.tableBlockId가 tableGripMenuTableId와 다르면(다른
// 표로 활성이 넘어갔거나 표가 사라진 경우) null을 돌려줘 호출부가 메뉴를
// 렌더하지 않게 한다.
export const computeTableGripMenuPosition = (
  geometry: TableGeometry | null,
  tableGripMenuTableId: string | null,
  scrollOffset: { x: number; y: number },
): MenuPosition | null => {
  if (tableGripMenuTableId === null || geometry === null) return null;
  if (geometry.tableBlockId !== tableGripMenuTableId) return null;
  return {
    left: geometry.left - 24 - scrollOffset.x,
    top: geometry.top - 4 - scrollOffset.y,
  };
};
