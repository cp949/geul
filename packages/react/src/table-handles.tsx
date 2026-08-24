import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  parseTableColumns,
} from "@cp949/geul-core";
import { GripHorizontal, GripVertical, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { TableHandleMenu } from "./table-handle-menu.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";

// 핸들은 드래그(재정렬)와 클릭(행/열 메뉴) 두 동작을 갖는다 — 라벨이
// 한쪽만 안내하면 나머지 동작의 발견성을 가린다(block-side-menu와 같은 규칙).
const rowHandleLabel = "Drag to reorder row, click for options";
const columnHandleLabel = "Drag to reorder column, click for options";
const addRowLabel = "Add row";
const addColumnLabel = "Add column";

const rowHandleIcon = <GripVertical {...iconProps} />;
const columnHandleIcon = <GripHorizontal {...iconProps} />;
const addIcon = <Plus {...iconProps} />;

// geul:touch-none — 터치 드래그를 브라우저 스크롤 제스처에 뺏기면
// pointercancel로 드래그가 중단된다(setPointerCapture는 이를 막지 못한다).
const handleButtonClassName =
  "geul:h-5 geul:w-5 geul:touch-none geul:rounded geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:bg-[var(--be-color-surface,#fff)] geul:p-0 geul:text-[color:var(--be-color-text,#202124)]";
const expandButtonClassName =
  "geul:h-5 geul:w-5 geul:rounded geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:bg-[var(--be-color-surface,#fff)] geul:p-0 geul:text-[color:var(--be-color-text,#202124)]";

// 행/열 핸들(표 바깥 24px)과 빠른 확장 버튼(표 바깥 4~24px)을 포함하는
// hover 유지 여백. 이 여백 없이 hover를 즉시 해제하면 포인터가 표에서
// 핸들로 이동하는 도중 핸들이 언마운트된다.
const HANDLE_HOVER_MARGIN = 28;

// useDismissOnOutsideOrEscape에 넘기는 allow-list. 모듈 스코프 상수로 둔다 —
// 매 렌더 새 배열을 넘기면 그 훅의 effect가 리스너를 매 렌더 떼었다 다시 붙인다.
const TABLE_MENU_DISMISS_ALLOW_SELECTORS = [
  "[data-be-table-menu]",
  "[data-be-table-row-handle]",
  "[data-be-table-column-handle]",
] as const;

type RowGeometry = {
  rowId: string;
  index: number;
  top: number;
  height: number;
};
type ResizeSegment = { rowId: string; top: number; height: number };

// 한 행과 그 행 셀들의 화면 좌표. geometry를 읽을 때마다 행/셀마다
// getBoundingClientRect를 정확히 한 번만 호출하려고 먼저 모아둔다.
type CellBox = {
  columnId: string;
  spansColumns: boolean;
  left: number;
  right: number;
  width: number;
};
type RowBox = {
  rowId: string;
  top: number;
  height: number;
  cells: CellBox[];
};

type ColumnGeometry = {
  columnId: string;
  index: number;
  left: number;
  width: number;
  // 열 오른쪽 경계의 리사이즈 strip을 그릴 세로 구간들. 병합 셀이 경계를
  // 가로지르는 행은 제외한다(아래 readResizeSegments 참고) — 병합 셀
  // 내부를 strip이 덮으면 셀 클릭이 리사이즈 드래그로 가로채인다.
  resizeSegments: ResizeSegment[];
};

type TableGeometry = {
  tableBlockId: string;
  // 헤더는 표 단위 플래그다(모델 headerRows/headerColumns: 0|1) — 메뉴의
  // 체크 상태를 렌더 DOM에서 그대로 읽는다.
  headerRows: number;
  headerColumns: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  rows: RowGeometry[];
  columns: ColumnGeometry[];
};

// G-TBL-001: 열 순서·개수의 권위는 표에 렌더된 data-be-columns(모델
// table.columns와 같은 순서)다. columnId 문자열만 뽑아 쓴다.
// 속성 문자열의 해석은 model이 소유하고(Issue #75) DOM 접근만 여기 남는다.
// 해석 불가는 열 없음으로 접는다 — 핸들을 그리지 않으면 그만이고, 이
// 오버레이가 사용자에게 보고할 표면을 갖고 있지 않다.
const readTableColumnIds = (table: HTMLElement): string[] => {
  const parsed = parseTableColumns(table.getAttribute("data-be-columns"));
  return parsed.ok ? parsed.value.map((column) => column.id) : [];
};

type ColumnBound = { left: number; width: number };

// 첫 행만 보고 열 경계를 읽으면, 첫 행에 colspan>1 병합 셀이 있을 때
// 그 셀이 가리는 논리 열들의 경계를 아예 못 찾는다(핸들 개수가 실제
// 열 개수보다 적어짐). 모든 행을 훑어 각 열에서 처음 만나는 비병합
// (colspan 속성 없음) 셀의 rect를 그 열의 경계로 쓰고, 어느 행에서도
// 비병합 셀을 못 찾은 열(모든 행에서 병합된 열)은 이웃 열 경계 사이로
// 보간한다.
const readColumnBounds = (
  columnIds: string[],
  rowBoxes: RowBox[],
  tableRect: DOMRect,
): ColumnBound[] => {
  const boundById = new Map<string, ColumnBound>();
  for (const rowBox of rowBoxes) {
    for (const cellBox of rowBox.cells) {
      if (cellBox.spansColumns) continue;
      if (cellBox.columnId === "" || boundById.has(cellBox.columnId)) continue;
      boundById.set(cellBox.columnId, {
        left: cellBox.left,
        width: cellBox.width,
      });
    }
  }

  const known = columnIds.map((id) => boundById.get(id) ?? null);
  for (let index = 0; index < known.length; index += 1) {
    if (known[index] !== null) continue;
    let before = index - 1;
    while (before >= 0 && known[before] === null) before -= 1;
    let after = index + 1;
    while (after < known.length && known[after] === null) after += 1;
    const beforeBound = before >= 0 ? (known[before] ?? null) : null;
    const afterBound = after < known.length ? (known[after] ?? null) : null;
    const left =
      beforeBound !== null
        ? beforeBound.left + beforeBound.width
        : (afterBound?.left ?? tableRect.left);
    const right = afterBound !== null ? afterBound.left : tableRect.right;
    known[index] = { left, width: Math.max(0, right - left) };
  }

  return known.map((bound) => bound ?? { left: tableRect.left, width: 0 });
};

const RESIZE_BOUNDARY_EPSILON = 1;

// 열 경계 x좌표(boundaryX)가 각 행에서 실제 셀 경계인지 확인해, 병합 셀이
// 그 경계를 가로지르는 행은 strip 구간에서 뺀다. 병합 셀 위에 리사이즈
// strip을 그대로 덮으면(구 열 경계가 병합 셀 한가운데로 옮겨가) 셀
// 클릭이 리사이즈 드래그로 가로채여 캐럿을 놓을 수 없다(elementFromPoint
// 실측으로 확인) — 이 문제를 막기 위해 세로 구간을 행 단위로 쪼갠다.
const readResizeSegments = (
  rowBoxes: RowBox[],
  boundaryX: number,
): ResizeSegment[] =>
  rowBoxes
    .filter((rowBox) =>
      rowBox.cells.some(
        (cellBox) =>
          Math.abs(cellBox.right - boundaryX) <= RESIZE_BOUNDARY_EPSILON,
      ),
    )
    .map((rowBox) => ({
      rowId: rowBox.rowId,
      top: rowBox.top,
      height: rowBox.height,
    }));

// 행과 셀의 rect를 geometry 한 번당 한 번씩만 읽는다. 열 경계와 리사이즈
// 세그먼트가 각자 DOM을 다시 훑으면 getBoundingClientRect 호출이 열 수 x
// 셀 수로 늘어나 10,000셀 표(spec 13)의 드래그 프레임을 잡아먹는다.
const readRowBoxes = (rowElements: HTMLElement[]): RowBox[] =>
  rowElements.map((rowElement) => {
    const rowRect = rowElement.getBoundingClientRect();
    const cells = Array.from(
      rowElement.querySelectorAll<HTMLElement>("[data-be-column-id]"),
    ).map((cellElement) => {
      const rect = cellElement.getBoundingClientRect();
      return {
        columnId: cellElement.getAttribute("data-be-column-id") ?? "",
        spansColumns: cellElement.hasAttribute("colspan"),
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    });
    return {
      rowId: rowElement.getAttribute("data-be-row-id") ?? "",
      top: rowRect.top,
      height: rowRect.height,
      cells,
    };
  });

const readTableGeometry = (table: HTMLElement): TableGeometry | null => {
  const tableBlockId = table.getAttribute("data-be-block-id");
  if (tableBlockId === null) return null;

  const tableRect = table.getBoundingClientRect();
  const rowBoxes = readRowBoxes(
    Array.from(table.querySelectorAll<HTMLElement>("[data-be-row-id]")),
  );
  const rows: RowGeometry[] = rowBoxes.map((rowBox, index) => ({
    rowId: rowBox.rowId,
    index,
    top: rowBox.top,
    height: rowBox.height,
  }));

  const columnIds = readTableColumnIds(table);
  const bounds = readColumnBounds(columnIds, rowBoxes, tableRect);
  const columns: ColumnGeometry[] = columnIds.map((columnId, index) => {
    const bound = bounds[index] ?? { left: tableRect.left, width: 0 };
    return {
      columnId,
      index,
      left: bound.left,
      width: bound.width,
      resizeSegments: readResizeSegments(rowBoxes, bound.left + bound.width),
    };
  });

  return {
    tableBlockId,
    headerRows: Number(table.getAttribute("data-be-header-rows") ?? "0"),
    headerColumns: Number(table.getAttribute("data-be-header-columns") ?? "0"),
    left: tableRect.left,
    top: tableRect.top,
    right: tableRect.right,
    bottom: tableRect.bottom,
    rows,
    columns,
  };
};

const findTable = (
  element: HTMLElement,
  tableBlockId: string,
): HTMLElement | null =>
  Array.from(
    element.querySelectorAll<HTMLElement>("table[data-be-block-id]"),
  ).find(
    (candidate) => candidate.getAttribute("data-be-block-id") === tableBlockId,
  ) ?? null;

// colgroup col의 인라인 width는 renderHTML이 쓴 모델 열 너비다. 셀 rect는
// 콘텐츠가 렌더 너비를 강제로 벌리면 모델 값과 어긋나므로 리사이즈 시드로
// 쓰지 않는다.
const readColumnStyleWidth = (
  table: HTMLElement,
  index: number,
): number | null => {
  const col = table.querySelectorAll<HTMLElement>("colgroup col")[index];
  if (col === undefined) return null;
  const width = Number.parseFloat(col.style.width);
  return Number.isFinite(width) ? width : null;
};

const setColumnStyleWidth = (
  table: HTMLElement,
  index: number,
  width: number,
): void => {
  const col = table.querySelectorAll<HTMLElement>("colgroup col")[index];
  if (col !== undefined) col.style.width = `${width}px`;
};

type ReorderKind = "row" | "column";

type ReorderState = {
  kind: ReorderKind;
  pointerId: number;
  tableBlockId: string;
  // 억제 키의 기준(Option A, Issue #63). sourceIndex는 moveTableRow/
  // moveTableColumn 커맨드가 index를 받으므로 이동 계산에만 쓴다.
  sourceId: string;
  sourceIndex: number;
  hasDragged: boolean;
  cancelled: boolean;
  targetIndex: number | null;
};

type HandleMenuState = {
  kind: ReorderKind;
  tableBlockId: string;
  index: number;
};

type ResizeState = {
  pointerId: number;
  tableBlockId: string;
  columnIndex: number;
  startX: number;
  startWidth: number;
  currentWidth: number;
};

const clampWidth = (width: number): number =>
  Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));

export const TableHandles = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [hoverTableId, setHoverTableId] = useState<string | null>(null);
  const [reorderState, setReorderState] = useState<ReorderState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [menuState, setMenuState] = useState<HandleMenuState | null>(null);
  // 드래그로 끝난 제스처가 합성하는 click은 메뉴 열기로 해석하지 않는다
  // (block-side-menu와 같은 규칙).
  const suppressedHandleClickRef = useRef<string | null>(null);
  // 스크롤/리사이즈 시 geometry 재계산을 강제하기 위한 카운터.
  const [, setGeometryVersion] = useState(0);
  const hoverTableIdRef = useRef<string | null>(null);
  const reorderStateRef = useRef<ReorderState | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);

  const updateHoverTableId = useCallback((next: string | null) => {
    hoverTableIdRef.current = next;
    setHoverTableId(next);
  }, []);
  const updateReorderState = useCallback((next: ReorderState | null) => {
    reorderStateRef.current = next;
    setReorderState(next);
  }, []);
  const updateResizeState = useCallback((next: ResizeState | null) => {
    resizeStateRef.current = next;
    setResizeState(next);
  }, []);

  const focusEditor = useCallback(() => {
    element?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
  }, [element]);

  const closeMenu = useCallback(() => {
    setMenuState(null);
    focusEditor();
  }, [focusEditor]);

  // 메뉴는 바깥 pointerdown과 Escape로 닫는다(G-TST-001: 키보드로 닫는 UI는
  // 병렬 e2e로 검증한다). 실제 리스너 등록/해제는 useDismissOnOutsideOrEscape가
  // 소유한다 — table-selection-toolbar.tsx도 같은 훅을 쓴다(Issue #20).
  const dismissMenu = useCallback(() => setMenuState(null), []);
  useDismissOnOutsideOrEscape({
    active: menuState !== null,
    element,
    allowSelectors: TABLE_MENU_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissMenu,
    onEscapeDismiss: closeMenu,
  });

  // gutter가 표 바깥 오버레이라서, hover 추적을 element 안쪽에만 걸면
  // 포인터가 핸들로 이동하는 순간 표 hover가 풀린다(block-side-menu와 동일한 이유).
  useEffect(() => {
    if (element === null) return;
    const ownerDocument = element.ownerDocument;

    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest("[data-be-table-row-handle]") !== null ||
        target.closest("[data-be-table-column-handle]") !== null ||
        target.closest("[data-be-table-resize-handle]") !== null ||
        target.closest("[data-be-table-expand-row]") !== null ||
        target.closest("[data-be-table-expand-column]") !== null ||
        target.closest("[data-be-table-menu]") !== null
      ) {
        return;
      }

      const tableElement = target.closest<HTMLElement>(
        "table[data-be-block-id]",
      );
      if (tableElement !== null && element.contains(tableElement)) {
        updateHoverTableId(tableElement.getAttribute("data-be-block-id"));
        return;
      }

      // 핸들은 표 바깥에 떠 있으므로, 표 주변 여백(HANDLE_HOVER_MARGIN)을
      // 벗어나기 전에는 hover를 유지한다 — 즉시 해제하면 핸들로 이동하는
      // 도중 핸들이 사라진다.
      const currentId = hoverTableIdRef.current;
      if (currentId !== null) {
        const table = findTable(element, currentId);
        const rect = table?.getBoundingClientRect();
        if (
          rect !== undefined &&
          rect.width > 0 &&
          rect.height > 0 &&
          event.clientX >= rect.left - HANDLE_HOVER_MARGIN &&
          event.clientX <= rect.right + HANDLE_HOVER_MARGIN &&
          event.clientY >= rect.top - HANDLE_HOVER_MARGIN &&
          event.clientY <= rect.bottom + HANDLE_HOVER_MARGIN
        ) {
          return;
        }
      }
      updateHoverTableId(null);
    };

    ownerDocument.addEventListener("pointermove", handlePointerMove);
    return () =>
      ownerDocument.removeEventListener("pointermove", handlePointerMove);
  }, [element, updateHoverTableId]);

  const activeTableId =
    reorderState?.tableBlockId ??
    resizeState?.tableBlockId ??
    menuState?.tableBlockId ??
    hoverTableId;
  const geometry =
    activeTableId === null || element === null
      ? null
      : (() => {
          const table = findTable(element, activeTableId);
          return table === null ? null : readTableGeometry(table);
        })();

  // 핸들은 position: fixed라 스크롤/창 크기 변경 시 pointermove 없이도
  // 표와 어긋난다 — 재렌더를 강제해 geometry를 다시 읽는다.
  useEffect(() => {
    if (element === null || activeTableId === null) return;
    const ownerDocument = element.ownerDocument;
    const view = ownerDocument.defaultView;
    const refreshGeometry = () => setGeometryVersion((version) => version + 1);

    ownerDocument.addEventListener("scroll", refreshGeometry, true);
    view?.addEventListener("resize", refreshGeometry);
    return () => {
      ownerDocument.removeEventListener("scroll", refreshGeometry, true);
      view?.removeEventListener("resize", refreshGeometry);
    };
  }, [element, activeTableId]);

  const reorderActive = reorderState !== null;
  useEffect(() => {
    if (!reorderActive || element === null) return;
    const ownerDocument = element.ownerDocument;

    const computeTargetIndex = (
      current: ReorderState,
      clientX: number,
      clientY: number,
    ): number | null => {
      const table = findTable(element, current.tableBlockId);
      const currentGeometry = table === null ? null : readTableGeometry(table);
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

    const handlePointerMove = (event: PointerEvent) => {
      const current = reorderStateRef.current;
      if (current === null || event.pointerId !== current.pointerId) return;
      if (current.cancelled) return;
      const targetIndex = computeTargetIndex(
        current,
        event.clientX,
        event.clientY,
      );
      updateReorderState({ ...current, hasDragged: true, targetIndex });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = reorderStateRef.current;
      if (current === null || event.pointerId !== current.pointerId) return;

      if (!current.cancelled && current.targetIndex !== null) {
        const toIndex =
          current.targetIndex > current.sourceIndex
            ? current.targetIndex - 1
            : current.targetIndex;
        if (toIndex !== current.sourceIndex) {
          if (current.kind === "row") {
            editor.commands.moveTableRow(
              current.tableBlockId,
              current.sourceIndex,
              toIndex,
            );
          } else {
            editor.commands.moveTableColumn(
              current.tableBlockId,
              current.sourceIndex,
              toIndex,
            );
          }
        }
      }
      // 억제 키는 안정 식별자(rowId/columnId, Option A)라 커맨드 성공
      // 여부와 무관하다 — 핸들 버튼의 React key가 그 id라, 이동이 성공해
      // DOM이 재정렬되든 실패해(예: 병합 셀 경계) 그대로 남든 대상 핸들의
      // id는 안 바뀐다(G-UI-002 갱신, Issue #63). 빈 id(getAttribute(...)
      // ?? "" 폴백)는 서로 다른 행이 같은 키로 충돌하므로 억제를 걸지 않는다.
      if (current.hasDragged && current.sourceId !== "") {
        // 키에 tableBlockId가 없다 — reorderState는 컴포넌트 전역에 하나뿐이고
        // (동시에 두 드래그가 진행될 수 없다), pointerup 이후의 합성 click은
        // 오는 경우 setPointerCapture로 고정된 바로 그 버튼(=같은 표)으로
        // 되돌아온다. 그래서 kind+id만으로 다른 표의 같은 id를 가진 핸들과
        // 오검출되지 않는다. 표 여러 개를 다루는 e2e는 아직 없다.
        // 이 click이 항상 오지는 않는다 — 이 저장소가 관측한 Chromium은
        // 임계값을 넘는 드래그 뒤 click을 아예 합성하지 않는다(G-UI-002).
        // 그래서 여기 저장한 키는 handlePointerDownOnReorderHandle이
        // 다음 제스처 시작 시점에도 비운다.
        suppressedHandleClickRef.current = `${current.kind}-${current.sourceId}`;
      }
      updateReorderState(null);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const current = reorderStateRef.current;
      if (current === null || event.pointerId !== current.pointerId) return;
      updateReorderState(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const current = reorderStateRef.current;
      if (current === null) return;
      updateReorderState({ ...current, cancelled: true, targetIndex: null });
    };

    ownerDocument.addEventListener("pointermove", handlePointerMove);
    ownerDocument.addEventListener("pointerup", handlePointerUp);
    ownerDocument.addEventListener("pointercancel", handlePointerCancel);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("pointermove", handlePointerMove);
      ownerDocument.removeEventListener("pointerup", handlePointerUp);
      ownerDocument.removeEventListener("pointercancel", handlePointerCancel);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
    // reorderState 객체가 아닌 활성 여부에만 의존한다 — 객체에 의존하면
    // 드래그 중 매 pointermove마다 리스너 4개를 떼었다 다시 붙인다.
  }, [reorderActive, element, editor, updateReorderState]);

  const resizeActive = resizeState !== null;
  useEffect(() => {
    if (!resizeActive || element === null) return;
    const ownerDocument = element.ownerDocument;
    const view = ownerDocument.defaultView;
    let animationFrame: number | null = null;

    // 스펙 13절 성능 계약: pointer-move 동안에는 프레임 단위로 col 너비의
    // 시각만 갱신하고, 문서 커밋은 pointer-up에서 한 번만 한다.
    const scheduleVisualUpdate = () => {
      if (animationFrame !== null || view === null) return;
      animationFrame = view.requestAnimationFrame(() => {
        animationFrame = null;
        const current = resizeStateRef.current;
        if (current === null) return;
        const table = findTable(element, current.tableBlockId);
        if (table !== null) {
          setColumnStyleWidth(table, current.columnIndex, current.currentWidth);
        }
        // 경계 strip 위치 재계산을 위해 재렌더만 트리거한다.
        setResizeState(current);
      });
    };

    const restoreVisualWidth = (state: ResizeState) => {
      const table = findTable(element, state.tableBlockId);
      if (table !== null) {
        setColumnStyleWidth(table, state.columnIndex, state.startWidth);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const current = resizeStateRef.current;
      if (current === null || event.pointerId !== current.pointerId) return;
      const delta = event.clientX - current.startX;
      const nextWidth = clampWidth(current.startWidth + delta);
      if (nextWidth === current.currentWidth) return;
      resizeStateRef.current = { ...current, currentWidth: nextWidth };
      scheduleVisualUpdate();
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = resizeStateRef.current;
      if (current === null || event.pointerId !== current.pointerId) return;
      if (current.currentWidth !== current.startWidth) {
        editor.commands.resizeTableColumn(
          current.tableBlockId,
          current.columnIndex,
          current.currentWidth,
        );
      }
      updateResizeState(null);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const current = resizeStateRef.current;
      if (current === null || event.pointerId !== current.pointerId) return;
      restoreVisualWidth(current);
      updateResizeState(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const current = resizeStateRef.current;
      if (current === null) return;
      restoreVisualWidth(current);
      updateResizeState(null);
    };

    ownerDocument.addEventListener("pointermove", handlePointerMove);
    ownerDocument.addEventListener("pointerup", handlePointerUp);
    ownerDocument.addEventListener("pointercancel", handlePointerCancel);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      if (animationFrame !== null) view?.cancelAnimationFrame(animationFrame);
      ownerDocument.removeEventListener("pointermove", handlePointerMove);
      ownerDocument.removeEventListener("pointerup", handlePointerUp);
      ownerDocument.removeEventListener("pointercancel", handlePointerCancel);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [resizeActive, element, editor, updateResizeState]);

  // 완료 조건 3(Issue #18): 메뉴가 열린 동안 대상 행/열이 undo 등으로
  // 사라지면(인덱스가 더 이상 유효하지 않거나 표 블록 자체가 사라지면)
  // 메뉴를 자동으로 닫는다. geometry는 render마다 다시 읽지만, 이
  // 컴포넌트를 재렌더시키는 주체가 항상 있다는 보장이 없다(위
  // readFreshGeometry 주석 참고) — 재렌더에 기대지 않고 DOM을 직접
  // 관찰한다. 인덱스가 범위 안인지만 본다 — 범위 안에서 가리키는 행/열의
  // 정체성이 바뀌는 경우는 다루지 않는다(범위 밖, Issue #65).
  useEffect(() => {
    if (menuState === null || element === null) return;

    const isMenuTargetValid = () => {
      // 대상 표를 매번 다시 찾는다. 표 노드가 재생성되면 effect 시점에
      // 해석한 엘리먼트는 문서에서 떨어져 나가 낡은 개수를 계속 돌려준다.
      const table = findTable(element, menuState.tableBlockId);
      if (table === null) return false;
      // 유효성 판정에는 행/열 개수만 필요하다. readTableGeometry는 모든
      // 행·셀의 getBoundingClientRect를 도는데, NodeView가 갱신마다
      // data-be-columns를 다시 써서 mutation이 자주 오므로 그때마다 강제
      // 레이아웃을 유발한다.
      const count =
        menuState.kind === "row"
          ? table.querySelectorAll("[data-be-row-id]").length
          : readTableColumnIds(table).length;
      return menuState.index < count;
    };

    // 이 effect가 붙기 전에 이미 무효화됐을 수도 있다 — 최초 1회도 검사한다.
    if (!isMenuTargetValid()) {
      closeMenu();
      return;
    }

    // 표 엘리먼트가 아니라 편집기 루트를 관찰한다. <table>에 직접 걸면
    // 그 노드가 통째로 제거될 때(제거는 부모의 childList mutation이라
    // 제거되는 노드 자신의 observer에는 오지 않는다) 콜백이 오지 않아
    // 메뉴가 죽은 표를 가리킨 채 남는다.
    const observer = new MutationObserver(() => {
      if (!isMenuTargetValid()) closeMenu();
    });
    observer.observe(element, {
      attributeFilter: ["data-be-columns"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [menuState, element, closeMenu]);

  const handleReorderHandleClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    kind: ReorderKind,
    tableBlockId: string,
    id: string,
    index: number,
  ) => {
    const suppressed = suppressedHandleClickRef.current;
    suppressedHandleClickRef.current = null;
    // detail 0은 키보드 활성화다 — 드래그 억제는 포인터 click에만 적용한다.
    // 빈 id에 대한 별도 가드는 필요 없다 — pointerUp이 빈 id로는 애초에
    // 키를 세우지 않으므로(위 handlePointerUp) 이 비교는 자연히 거짓이다.
    if (event.detail !== 0 && suppressed === `${kind}-${id}`) return;
    setMenuState((current) =>
      current !== null && current.kind === kind && current.index === index
        ? null
        : { kind, tableBlockId, index },
    );
  };

  const handlePointerDownOnReorderHandle = (
    event: React.PointerEvent<HTMLButtonElement>,
    kind: ReorderKind,
    tableBlockId: string,
    sourceId: string,
    sourceIndex: number,
  ) => {
    if (event.button !== 0) return;
    // 억제 키는 뒤이은 click이 소비할 때만 비워진다 — 브라우저가 그 click을
    // 아예 합성하지 않으면(G-UI-002) 키가 남아, 나중에 같은 핸들을 진짜로
    // 클릭할 때 한 번 삼켜진다. 새 제스처를 시작하는 시점에 비운다
    // (block-side-menu.tsx의 handlePointerDownOnHandle과 같은 규칙).
    suppressedHandleClickRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    setMenuState(null);
    updateReorderState({
      kind,
      pointerId: event.pointerId,
      tableBlockId,
      sourceId,
      sourceIndex,
      hasDragged: false,
      cancelled: false,
      targetIndex: null,
    });
  };

  const handlePointerDownOnResizeHandle = (
    event: React.PointerEvent<HTMLDivElement>,
    tableBlockId: string,
    columnIndex: number,
    fallbackWidth: number,
  ) => {
    if (event.button !== 0) return;
    // pointerdown을 취소하면 호환 mousedown도 취소된다 — strip이 셀 텍스트
    // 가장자리를 덮고 있어, 막지 않으면 드래그가 네이티브 텍스트 선택을
    // 함께 끌고 다닌다.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const table = element === null ? null : findTable(element, tableBlockId);
    const startWidth =
      (table === null ? null : readColumnStyleWidth(table, columnIndex)) ??
      Math.round(fallbackWidth);
    updateResizeState({
      pointerId: event.pointerId,
      tableBlockId,
      columnIndex,
      startX: event.clientX,
      startWidth,
      currentWidth: startWidth,
    });
  };

  // 렌더 시점 geometry는 외부 controller 호스트처럼 onChange에 재렌더하지
  // 않는 구성에서 낡을 수 있다 — 클릭 시점에 DOM에서 다시 읽는다.
  const readFreshGeometry = (): TableGeometry | null => {
    if (geometry === null || element === null) return null;
    const table = findTable(element, geometry.tableBlockId);
    return table === null ? null : readTableGeometry(table);
  };

  const handleAddRow = () => {
    const fresh = readFreshGeometry();
    if (fresh === null) return;
    editor.commands.insertTableRow(fresh.tableBlockId, fresh.rows.length);
  };

  const handleAddColumn = () => {
    const fresh = readFreshGeometry();
    if (fresh === null) return;
    editor.commands.insertTableColumn(fresh.tableBlockId, fresh.columns.length);
  };

  const reorderGuideRect = (() => {
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
  })();

  // 메뉴 좌표를 click 시점에 고정하면 연 채로 스크롤/창 크기 변경 시
  // 앵커(핸들)와 어긋난다 — 핸들 자신처럼 매 렌더마다 geometry에서 다시
  // 계산한다(geometry는 scroll/resize 시 geometryVersion을 통해 갱신된다).
  const menuPosition = (() => {
    if (menuState === null || geometry === null) return null;
    if (menuState.kind === "row") {
      const row = geometry.rows.find(
        (entry) => entry.index === menuState.index,
      );
      return row === undefined
        ? null
        : { left: geometry.left, top: row.top + row.height };
    }
    const column = geometry.columns.find(
      (entry) => entry.index === menuState.index,
    );
    return column === undefined
      ? null
      : { left: column.left, top: geometry.top };
  })();

  return (
    <>
      {geometry !== null && (
        <>
          {geometry.rows.map((row) => (
            <IconButton
              className={`${handleButtonClassName} geul:cursor-grab geul:active:cursor-grabbing`}
              data-be-table-row-handle=""
              icon={rowHandleIcon}
              key={`row-${row.rowId}`}
              label={rowHandleLabel}
              onClick={(event) =>
                handleReorderHandleClick(
                  event,
                  "row",
                  geometry.tableBlockId,
                  row.rowId,
                  row.index,
                )
              }
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) =>
                handlePointerDownOnReorderHandle(
                  event,
                  "row",
                  geometry.tableBlockId,
                  row.rowId,
                  row.index,
                )
              }
              style={{
                position: "fixed",
                left: geometry.left - 24,
                top: row.top + row.height / 2 - 10,
              }}
            />
          ))}
          {geometry.columns.map((column) => (
            <IconButton
              className={`${handleButtonClassName} geul:cursor-grab geul:active:cursor-grabbing`}
              data-be-table-column-handle=""
              icon={columnHandleIcon}
              key={`column-${column.columnId}`}
              label={columnHandleLabel}
              onClick={(event) =>
                handleReorderHandleClick(
                  event,
                  "column",
                  geometry.tableBlockId,
                  column.columnId,
                  column.index,
                )
              }
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) =>
                handlePointerDownOnReorderHandle(
                  event,
                  "column",
                  geometry.tableBlockId,
                  column.columnId,
                  column.index,
                )
              }
              style={{
                position: "fixed",
                left: column.left + column.width / 2 - 10,
                top: geometry.top - 24,
              }}
            />
          ))}
          {geometry.columns.flatMap((column) =>
            column.resizeSegments.map((segment) => (
              <div
                className="geul:fixed geul:z-10 geul:w-1 geul:touch-none geul:cursor-col-resize geul:bg-transparent"
                data-be-table-resize-handle=""
                key={`resize-${column.columnId}-${segment.rowId}`}
                onPointerDown={(event) =>
                  handlePointerDownOnResizeHandle(
                    event,
                    geometry.tableBlockId,
                    column.index,
                    column.width,
                  )
                }
                style={{
                  left: column.left + column.width - 2,
                  top: segment.top,
                  height: segment.height,
                }}
              />
            )),
          )}
          <IconButton
            className={expandButtonClassName}
            data-be-table-expand-row=""
            icon={addIcon}
            label={addRowLabel}
            onClick={handleAddRow}
            onMouseDown={(event) => event.preventDefault()}
            style={{
              position: "fixed",
              left: geometry.left + (geometry.right - geometry.left) / 2 - 10,
              top: geometry.bottom + 4,
            }}
          />
          <IconButton
            className={expandButtonClassName}
            data-be-table-expand-column=""
            icon={addIcon}
            label={addColumnLabel}
            onClick={handleAddColumn}
            onMouseDown={(event) => event.preventDefault()}
            style={{
              position: "fixed",
              left: geometry.right + 4,
              top: geometry.top + (geometry.bottom - geometry.top) / 2 - 10,
            }}
          />
        </>
      )}
      {reorderGuideRect !== null && (
        <div
          className="geul:fixed geul:z-10 geul:bg-[var(--be-color-accent,#1a73e8)] geul:pointer-events-none"
          data-be-table-reorder-guide=""
          style={reorderGuideRect}
        />
      )}
      {menuState !== null && geometry !== null && menuPosition !== null && (
        <TableHandleMenu
          key={`${menuState.tableBlockId}-${menuState.kind}-${menuState.index}`}
          canDelete={
            menuState.kind === "row"
              ? geometry.rows.length > 1
              : geometry.columns.length > 1
          }
          headerEnabled={
            menuState.kind === "row"
              ? geometry.headerRows === 1
              : geometry.headerColumns === 1
          }
          headerToggleAvailable={menuState.index === 0}
          index={menuState.index}
          kind={menuState.kind}
          left={menuPosition.left}
          onClose={closeMenu}
          tableBlockId={menuState.tableBlockId}
          top={menuPosition.top}
        />
      )}
    </>
  );
};
