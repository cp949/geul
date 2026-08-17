import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "@cp949/geul-core";
import { GripHorizontal, GripVertical, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { useEditor, useEditorMount } from "./use-editor.js";

const rowHandleLabel = "Drag to reorder row";
const columnHandleLabel = "Drag to reorder column";
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

type RowGeometry = {
  rowId: string;
  index: number;
  top: number;
  height: number;
};
type ColumnGeometry = {
  columnId: string;
  index: number;
  left: number;
  width: number;
};

type TableGeometry = {
  tableBlockId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  rows: RowGeometry[];
  columns: ColumnGeometry[];
};

const readTableGeometry = (table: HTMLElement): TableGeometry | null => {
  const tableBlockId = table.getAttribute("data-be-block-id");
  if (tableBlockId === null) return null;

  const tableRect = table.getBoundingClientRect();
  const rowElements = Array.from(
    table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
  );
  const rows: RowGeometry[] = rowElements.map((rowElement, index) => {
    const rect = rowElement.getBoundingClientRect();
    return {
      rowId: rowElement.getAttribute("data-be-row-id") ?? "",
      index,
      top: rect.top,
      height: rect.height,
    };
  });

  const firstRow = rowElements[0];
  const cellElements =
    firstRow === undefined
      ? []
      : Array.from(
          firstRow.querySelectorAll<HTMLElement>("[data-be-column-id]"),
        );
  const columns: ColumnGeometry[] = cellElements.map((cellElement, index) => {
    const rect = cellElement.getBoundingClientRect();
    return {
      columnId: cellElement.getAttribute("data-be-column-id") ?? "",
      index,
      left: rect.left,
      width: rect.width,
    };
  });

  return {
    tableBlockId,
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
  sourceIndex: number;
  hasDragged: boolean;
  cancelled: boolean;
  targetIndex: number | null;
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
        target.closest("[data-be-table-expand-column]") !== null
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
    reorderState?.tableBlockId ?? resizeState?.tableBlockId ?? hoverTableId;
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

  const handlePointerDownOnReorderHandle = (
    event: React.PointerEvent<HTMLButtonElement>,
    kind: ReorderKind,
    tableBlockId: string,
    sourceIndex: number,
  ) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateReorderState({
      kind,
      pointerId: event.pointerId,
      tableBlockId,
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
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) =>
                handlePointerDownOnReorderHandle(
                  event,
                  "row",
                  geometry.tableBlockId,
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
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) =>
                handlePointerDownOnReorderHandle(
                  event,
                  "column",
                  geometry.tableBlockId,
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
          {geometry.columns.map((column) => (
            <div
              className="geul:fixed geul:z-10 geul:w-1 geul:touch-none geul:cursor-col-resize geul:bg-transparent"
              data-be-table-resize-handle=""
              key={`resize-${column.columnId}`}
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
                top: geometry.top,
                height: geometry.bottom - geometry.top,
              }}
            />
          ))}
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
    </>
  );
};
