import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "@cp949/geul-core";
import { GripHorizontal, GripVertical, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import {
  findTable,
  readGeometryFor,
  readTableColumnIds,
  type TableGeometry,
} from "./table-handle-geometry.js";
import { TableHandleMenu } from "./table-handle-menu.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import {
  resolveReopenAwareClick,
  useHandleReopenSuppression,
} from "./use-handle-reopen-suppression.js";
import { useMirroredState } from "./use-mirrored-state.js";
import { usePointerDragGesture } from "./use-pointer-drag-gesture.js";
import { usePointerHoverTarget } from "./use-pointer-hover-target.js";

// 핸들은 드래그(재정렬)와 클릭(행/열 메뉴) 두 동작을 갖는다 — 라벨이
// 한쪽만 안내하면 나머지 동작의 발견성을 가린다(block-side-menu와 같은 규칙).
const rowHandleLabel = "Drag to reorder row, click for options";
const columnHandleLabel = "Drag to reorder column, click for options";
const addRowLabel = "Add row";
const addColumnLabel = "Add column";

const rowHandleIcon = <GripVertical {...iconProps} />;
const columnHandleIcon = <GripHorizontal {...iconProps} />;
const addIcon = <Plus {...iconProps} />;

// touch-action: none — 터치 드래그를 브라우저 스크롤 제스처에 뺏기면
// pointercancel로 드래그가 중단된다(setPointerCapture는 이를 막지 못한다).
const handleButtonClassName = "geul-table-handle";
const expandButtonClassName = "geul-table-expand-button";

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

// usePointerHoverTarget에 넘기는 ignore-list. 자기 자신의 오버레이(핸들·
// 리사이즈 스트립·확장 버튼·메뉴) 위에서는 hover 대상을 다시 판정하지
// 않는다. 모듈 스코프 상수로 두는 이유는 위와 같다.
const TABLE_HOVER_IGNORE_SELECTORS = [
  "[data-be-table-row-handle]",
  "[data-be-table-column-handle]",
  "[data-be-table-resize-handle]",
  "[data-be-table-expand-row]",
  "[data-be-table-expand-column]",
  "[data-be-table-menu]",
] as const;

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

// usePointerDragGesture의 onMove 콜백에서 쓰는 순수 함수다. 원래는 그
// 4-listener 이펙트 안의 지역 함수였지만, 훅으로 옮기며 콜백이
// useCallback으로 안정화돼야 해서 element를 인자로 받는 모듈 스코프
// 함수로 뽑았다 — 로직 자체는 그대로다.
const computeReorderTargetIndex = (
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

const clampWidth = (width: number): number =>
  Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));

export const TableHandles = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [hoverTableId, hoverTableIdRef, updateHoverTableId] = useMirroredState<
    string | null
  >(null);
  const [reorderState, reorderStateRef, updateReorderState] =
    useMirroredState<ReorderState | null>(null);
  const [resizeState, resizeStateRef, updateResizeState] =
    useMirroredState<ResizeState | null>(null);
  const [menuState, setMenuState] = useState<HandleMenuState | null>(null);
  // 드래그 종료 후 합성 click 억제 + pointerdown 스냅샷 기반 재오픈 판정 —
  // block-side-menu.tsx와 같은 상태 머신을 공유한다(Issue #52).
  const reopenSuppression = useHandleReopenSuppression();
  // 스크롤/리사이즈 시 geometry 재계산을 강제하기 위한 카운터.
  const [, setGeometryVersion] = useState(0);

  const focusEditor = useFocusEditor(element);

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
  // 포인터가 핸들로 이동하는 순간 표 hover가 풀린다(block-side-menu와
  // 동일한 이유) — 리스너 등록/해제는 usePointerHoverTarget이 소유한다.
  const handleHoverCandidateChange = useCallback(
    (candidate: HTMLElement | null, event: PointerEvent) => {
      if (candidate !== null) {
        updateHoverTableId(candidate.getAttribute("data-be-block-id"));
        return;
      }

      // 핸들은 표 바깥에 떠 있으므로, 표 주변 여백(HANDLE_HOVER_MARGIN)을
      // 벗어나기 전에는 hover를 유지한다 — 즉시 해제하면 핸들로 이동하는
      // 도중 핸들이 사라진다. usePointerHoverTarget은 candidate만 알 뿐
      // 이 히스테리시스를 모른다 — table-handles.tsx 전용 판단이라 콜백
      // 안에 남긴다.
      const currentId = hoverTableIdRef.current;
      if (currentId !== null && element !== null) {
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
    },
    [element, hoverTableIdRef, updateHoverTableId],
  );
  usePointerHoverTarget({
    element,
    ignoreSelectors: TABLE_HOVER_IGNORE_SELECTORS,
    entitySelector: "table[data-be-block-id]",
    onCandidateChange: handleHoverCandidateChange,
  });

  const activeTableId =
    reorderState?.tableBlockId ??
    resizeState?.tableBlockId ??
    menuState?.tableBlockId ??
    hoverTableId;
  const geometry =
    activeTableId === null || element === null
      ? null
      : readGeometryFor(element, activeTableId);

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

  // 위 geometry는 이 렌더 함수 본문에서 읽은 값이라, 같은 커밋에 딸려오는
  // DOM 변경(예: 표보다 앞선 형제가 줄바꿈으로 높이를 바꿔 표를 밀어내는
  // 경우, Issue #15)이 반영되기 전 레이아웃을 담는다 — React는 커밋을
  // 전부 적용한 뒤에야 브라우저가 레이아웃을 다시 계산하므로, 렌더 본문의
  // getBoundingClientRect는 항상 "이 렌더 이전" 위치다. 그 결과로 그려지는
  // fixed 오버레이(특히 열 추가 버튼 data-be-table-expand-column, 재정렬
  // 핸들)가 표 실제 경계와 최대 한 렌더만큼 어긋나, 실제 마지막 열 셀
  // 클릭을 가로챌 수 있다. commit 직후(useLayoutEffect는 paint 전에
  // 동기로 flush된다)에 표의 실제 경계를 다시 재서 달라지면 한 번 더
  // 렌더한다 — 사용자는 어긋난 프레임을 보지 않는다(G-UI-001). 표 자체의
  // outer rect만 싼값에 비교한다 — 개별 열 폭까지 매 렌더 두 번씩
  // 대조하면 드래그 프레임(scheduleResizeVisualUpdate, spec 13)과 같은 비용을
  // 지불하게 된다. 드래그 중(reorderState/resizeState)에는 건너뛴다 — 그
  // 경로는 이미 pointermove/frame마다 readTableGeometry를 직접 다시
  // 읽어(computeReorderTargetIndex, scheduleResizeVisualUpdate) 이 문제에서 자유롭고,
  // 여기서 또 재면 10,000셀 표의 드래그 프레임 예산을 두 배로 만든다.
  // react-hooks/exhaustive-deps는 [activeTableId, element, geometry,
  // reorderState, resizeState]를 넣으라고 제안하지만, 그 목록에 없는 다른
  // 렌더(예: 위 형제의 줄바꿈)가 만든 레이아웃 어긋남은 그러면 못 잡아
  // Issue #15가 되돌아온다 — 매 렌더 뒤 실행이 의도다(위 설명).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (
      activeTableId === null ||
      element === null ||
      geometry === null ||
      reorderState !== null ||
      resizeState !== null
    ) {
      return;
    }
    const table = findTable(element, activeTableId);
    if (table === null) return;
    const rect = table.getBoundingClientRect();
    if (
      rect.left === geometry.left &&
      rect.top === geometry.top &&
      rect.right === geometry.right &&
      rect.bottom === geometry.bottom
    ) {
      return;
    }
    setGeometryVersion((version) => version + 1);
  });

  const reorderActive = reorderState !== null;

  const handleReorderMove = useCallback(
    (event: PointerEvent) => {
      if (element === null) return;
      const current = reorderStateRef.current;
      if (current === null) return;
      const targetIndex = computeReorderTargetIndex(
        element,
        current,
        event.clientX,
        event.clientY,
      );
      updateReorderState({ ...current, hasDragged: true, targetIndex });
    },
    [element, reorderStateRef, updateReorderState],
  );

  const handleReorderUp = useCallback(() => {
    const current = reorderStateRef.current;
    if (current === null) return;

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
      reopenSuppression.markSuppressed(`${current.kind}-${current.sourceId}`);
    }
    updateReorderState(null);
  }, [editor, reorderStateRef, updateReorderState, reopenSuppression]);

  const handleReorderCancel = useCallback(() => {
    if (reorderStateRef.current === null) return;
    updateReorderState(null);
  }, [reorderStateRef, updateReorderState]);

  const handleReorderEscape = useCallback((): null | true => {
    const current = reorderStateRef.current;
    if (current === null) return null;
    updateReorderState({ ...current, cancelled: true, targetIndex: null });
    return true;
  }, [reorderStateRef, updateReorderState]);

  usePointerDragGesture({
    active: reorderActive,
    element,
    pointerId: reorderState?.pointerId ?? null,
    onMove: handleReorderMove,
    onUp: handleReorderUp,
    onCancel: handleReorderCancel,
    onEscape: handleReorderEscape,
  });

  const resizeActive = resizeState !== null;
  // scheduleResizeVisualUpdate가 예약하는 rAF 핸들. 원래는 4-listener
  // 이펙트의 지역 변수였지만, 콜백을 usePointerDragGesture에 넘기려면
  // useCallback으로 안정화해야 해서 컴포넌트 스코프 ref로 옮겼다 — 아래
  // 별도 effect가 이 ref를 보고 리사이즈 종료/언마운트 시 예약을 취소한다.
  const resizeAnimationFrameRef = useRef<number | null>(null);

  // 스펙 13절 성능 계약: pointer-move 동안에는 프레임 단위로 col 너비의
  // 시각만 갱신하고, 문서 커밋은 pointer-up에서 한 번만 한다.
  const scheduleResizeVisualUpdate = useCallback(() => {
    if (element === null) return;
    const view = element.ownerDocument.defaultView;
    if (resizeAnimationFrameRef.current !== null || view === null) return;
    resizeAnimationFrameRef.current = view.requestAnimationFrame(() => {
      resizeAnimationFrameRef.current = null;
      const current = resizeStateRef.current;
      if (current === null) return;
      const table = findTable(element, current.tableBlockId);
      if (table !== null) {
        setColumnStyleWidth(table, current.columnIndex, current.currentWidth);
      }
      // 경계 strip 위치 재계산을 위해 재렌더만 트리거한다. current는 이미
      // resizeStateRef.current라 updateResizeState의 ref 재대입은 no-op이고
      // setState만 실질적으로 작동한다.
      updateResizeState(current);
    });
  }, [element, resizeStateRef, updateResizeState]);

  const restoreResizeVisualWidth = useCallback(
    (state: ResizeState) => {
      if (element === null) return;
      const table = findTable(element, state.tableBlockId);
      if (table !== null) {
        setColumnStyleWidth(table, state.columnIndex, state.startWidth);
      }
    },
    [element],
  );

  const handleResizeMove = useCallback(
    (event: PointerEvent) => {
      const current = resizeStateRef.current;
      if (current === null) return;
      const delta = event.clientX - current.startX;
      const nextWidth = clampWidth(current.startWidth + delta);
      if (nextWidth === current.currentWidth) return;
      resizeStateRef.current = { ...current, currentWidth: nextWidth };
      scheduleResizeVisualUpdate();
    },
    [resizeStateRef, scheduleResizeVisualUpdate],
  );

  const handleResizeUp = useCallback(() => {
    const current = resizeStateRef.current;
    if (current === null) return;
    if (current.currentWidth !== current.startWidth) {
      editor.commands.resizeTableColumn(
        current.tableBlockId,
        current.columnIndex,
        current.currentWidth,
      );
    }
    updateResizeState(null);
  }, [editor, resizeStateRef, updateResizeState]);

  const handleResizeCancel = useCallback(() => {
    const current = resizeStateRef.current;
    if (current === null) return;
    restoreResizeVisualWidth(current);
    updateResizeState(null);
  }, [resizeStateRef, restoreResizeVisualWidth, updateResizeState]);

  const handleResizeEscape = useCallback((): null => {
    const current = resizeStateRef.current;
    if (current === null) return null;
    restoreResizeVisualWidth(current);
    updateResizeState(null);
    return null;
  }, [resizeStateRef, restoreResizeVisualWidth, updateResizeState]);

  usePointerDragGesture({
    active: resizeActive,
    element,
    pointerId: resizeState?.pointerId ?? null,
    onMove: handleResizeMove,
    onUp: handleResizeUp,
    onCancel: handleResizeCancel,
    onEscape: handleResizeEscape,
  });

  // 리사이즈가 끝나거나(커밋/취소/Escape) 언마운트되면 예약된 rAF를 반드시
  // 취소한다 — 취소하지 않으면 이미 끝난 제스처의 낡은 currentWidth로
  // col.style.width를 나중에 되돌려 쓴다.
  useEffect(() => {
    return () => {
      const frame = resizeAnimationFrameRef.current;
      if (frame === null || element === null) return;
      resizeAnimationFrameRef.current = null;
      element.ownerDocument.defaultView?.cancelAnimationFrame(frame);
    };
  }, [resizeActive, element]);

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
    // 억제 비교는 안정 id(kind-id, 이동 성공 여부와 무관), 재오픈 비교는
    // 위치 index(kind-index) — 두 축이 다를 수 있어 별도 키로 넘긴다
    // (useHandleReopenSuppression 참고). 빈 id에 대한 별도 가드는 필요
    // 없다 — pointerUp이 빈 id로는 애초에 억제 키를 세우지 않는다.
    resolveReopenAwareClick(
      reopenSuppression,
      event,
      {
        suppressionKey: `${kind}-${id}`,
        reopenKey: `${kind}-${index}`,
        isCurrentlyOpen:
          menuState !== null &&
          menuState.kind === kind &&
          menuState.index === index,
      },
      {
        onOpen: () => setMenuState({ kind, tableBlockId, index }),
        onClose: closeMenu,
      },
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
    reopenSuppression.onPointerDown(
      menuState !== null &&
        menuState.kind === kind &&
        menuState.index === sourceIndex
        ? `${kind}-${sourceIndex}`
        : null,
    );
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
    return readGeometryFor(element, geometry.tableBlockId);
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
              className={handleButtonClassName}
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
              className={handleButtonClassName}
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
                className="geul-table-resize-handle"
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
          className="geul-table-reorder-guide"
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
