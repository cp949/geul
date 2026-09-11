import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  findTable,
  readGeometryFor,
  readPageRect,
  readTableColumnIds,
  readTableRowIds,
  type TableGeometry,
} from "./table-handle-geometry.js";
import { TableHandleMenu } from "./table-handle-menu.js";
import { TableHandleOverlays } from "./table-handle-overlays.js";
import {
  HANDLE_HOVER_MARGIN,
  TABLE_HOVER_IGNORE_SELECTORS,
  TABLE_MENU_DISMISS_ALLOW_SELECTORS,
  TABLE_MENU_SELECTOR,
} from "./table-handle-constants.js";
import {
  clampWidth,
  computeExpandButtonVisibility,
  computeMenuPosition,
  computeReorderGuideRect,
  computeReorderTargetIndex,
  readColumnStyleWidth,
  setColumnStyleWidth,
} from "./table-handle-helpers.js";
import type {
  HandleMenuState,
  ReorderKind,
  ReorderState,
  ResizeState,
} from "./table-handle-types.js";
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
import { useSelectionRefresh } from "./use-selection-refresh.js";

// Issue #65: menuState.index만으로는 대상보다 앞선 행/열이 사라져 인덱스가
// 밀린 경우와 대상 자신이 사라진 경우를 구분할 수 없다. targetId(비어 있지
// 않은 경우)로 현재 DOM에서 대상의 위치를 다시 찾는다 — 없으면 index
// null(닫아야 함), 있으면 그 위치를 돌려준다(같은 값이면 재렌더 없이 그대로
// 쓰인다). 빈 targetId는 G-UI-002 fail-open이라 재조준을 시도하지 않고 기존
// 인덱스-범위 판정만 본다. 이 컴포넌트 밖에서 재사용하지 않아 모듈
// 스코프에 둔다(computeReorderTargetIndex와 달리 useCallback 안정화가
// 필요 없다 — effect 안에서 직접 부른다).
//
// Issue #65 항목7: 두 분기 모두 대상 판정에 readTableRowIds/readTableColumnIds로
// ids 배열을 한 번 읽는다 — 그 김에 ids.length도 count로 같이 돌려준다(새
// DOM 읽기를 추가하지 않는다). 호출부(reconcileMenuState)가 이 count로
// "대상 index는 그대로인데 행/열 개수만 늘었다"를 구분해 canDelete 재활성화를
// 트리거한다.
const resolveMenuTargetIndex = (
  menuState: HandleMenuState,
  table: HTMLElement,
): { index: number | null; count: number } => {
  if (menuState.targetId === "") {
    const ids =
      menuState.kind === "row"
        ? readTableRowIds(table)
        : readTableColumnIds(table);
    const count = ids.length;
    return { index: menuState.index < count ? menuState.index : null, count };
  }

  const ids =
    menuState.kind === "row"
      ? readTableRowIds(table)
      : readTableColumnIds(table);
  const nextIndex = ids.indexOf(menuState.targetId);
  return { index: nextIndex === -1 ? null : nextIndex, count: ids.length };
};

export const TableHandles = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [hoverTableId, hoverTableIdRef, updateHoverTableId] = useMirroredState<
    string | null
  >(null);
  // Notion 참고(사용자 요청) — Add row/column 버튼 노출 판정 전용. 다른
  // 콜백이 동기적으로 최신값을 읽을 필요가 없어(hoverTableId와 달리 렌더
  // 소비만 있다) ref 미러링 없이 plain state로 둔다.
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [hoverColumnId, setHoverColumnId] = useState<string | null>(null);
  // Notion 참고(사용자 요청) — 마우스가 표 근처를 벗어나도 텍스트 커서가
  // 있는 행/열은 그립이 계속 보여야 한다(row/column-handle-bar의
  // hover-or-active 노출 조건, 둘 다 평소엔 완전히 숨겨져 있다). hoverRowId/
  // hoverColumnId와 달리 이건 포인터가 아니라 에디터 selection을 따라간다 —
  // Tiptap/ProseMirror가 없어도 읽을 수 있는 네이티브 Selection.anchorNode에서
  // 가장 가까운 [data-geul-row-id]/[data-geul-column-id]/
  // table[data-geul-block-id]를 찾는다(ADR-0002 경계 — react는 @tiptap/pm에
  // 의존할 수 없다, table-handle-geometry.ts가 이미 쓰는 DOM-속성-읽기와
  // 같은 방식). 다른 콜백이 동기적으로 최신값을 읽을 필요가 없어 ref
  // 미러링 없이 plain state로 둔다(hoverRowId와 같은 이유).
  const [selectionRowId, setSelectionRowId] = useState<string | null>(null);
  const [selectionColumnId, setSelectionColumnId] = useState<string | null>(
    null,
  );
  const [selectionTableId, setSelectionTableId] = useState<string | null>(
    null,
  );
  const updateSelectionTarget = useCallback(() => {
    const anchorNode = element?.ownerDocument.getSelection()?.anchorNode;
    // formatting-toolbar.tsx의 updateFromSelection과 같은 가드 — 선택이
    // 편집기 바깥(다른 input, url bar 등)이면 표 밖 커서를 표 안 커서로
    // 오검출하지 않는다.
    const anchorElement =
      element === null ||
      anchorNode === undefined ||
      anchorNode === null ||
      !element.contains(anchorNode)
        ? null
        : anchorNode instanceof Element
          ? anchorNode
          : anchorNode.parentElement;
    const rowElement =
      anchorElement?.closest<HTMLElement>("[data-geul-row-id]") ?? null;
    // data-geul-column-id는 셀(<td>) 자신에 붙는다 — cellElement.getAttribute
    // 값이 곧 table-handle-geometry.ts의 column.columnId다(readColumnBounds가
    // 같은 속성으로 cellBox.columnId를 읽는다).
    const columnElement =
      anchorElement?.closest<HTMLElement>("[data-geul-column-id]") ?? null;
    const tableElement =
      anchorElement?.closest<HTMLElement>("table[data-geul-block-id]") ??
      null;
    setSelectionRowId(rowElement?.getAttribute("data-geul-row-id") ?? null);
    setSelectionColumnId(
      columnElement?.getAttribute("data-geul-column-id") ?? null,
    );
    setSelectionTableId(
      tableElement?.getAttribute("data-geul-block-id") ?? null,
    );
  }, [element]);
  useSelectionRefresh({ element, onUpdate: updateSelectionTarget });
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

  // Issue #65 항목4: 무효화 재조준(아래 reconcileMenuState)이 부르는 자동
  // 닫힘 전용 콜백. 사용자의 물리적 클릭이 아니라는 점에서 바깥 클릭·Escape와
  // 구별되는 셋째 범주다(G-UI-001) — 같은 판단 기준("돌아갈 자연스러운
  // 초점 대상이 있는가")을 그대로 적용한다. 초점이 이미 메뉴 안에 있었다면
  // 메뉴가 사라지는 순간 갈 곳이 없어지므로(그대로 두면 브라우저가 <body>로
  // 떨어뜨린다) Escape처럼 편집기로 되돌리고, 메뉴 밖(편집기 포함, 다른
  // 엘리먼트 포함)에 있었다면 바깥 클릭처럼 그 위치를 존중해 건드리지
  // 않는다. onClose(메뉴 명령 성공 시 닫힘)는 이 조건부 없이 closeMenu를
  // 그대로 쓴다 — 항목4는 자동 닫힘만 다룬다(01-계획.md "범위 밖"). 마우스
  // 클릭 성공 경로는 preserveFocusOnMouseDown(icon-button.tsx)이 mousedown
  // 기본 동작을 막아 클릭 이전 초점을 그대로 유지하므로 클릭 시점 초점이
  // 항상 메뉴 안이라는 보장은 없다 — closeMenu가 무조건 focusEditor()를
  // 부르는 동작은 이 diff 이전부터 있던 것이라(변경 대상 아님) 여기서
  // 다시 판단하지 않는다.
  const closeMenuOnInvalidation = useCallback(() => {
    const activeElement = element?.ownerDocument.activeElement ?? null;
    const focusWasInMenu =
      activeElement instanceof Element &&
      activeElement.closest(TABLE_MENU_SELECTOR) !== null;
    setMenuState(null);
    if (focusWasInMenu) {
      focusEditor();
    }
  }, [element, focusEditor]);

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
        updateHoverTableId(candidate.getAttribute("data-geul-block-id"));
        // event.target은 실제로 커서 아래 있는 엘리먼트다(elementFromPoint
        // 결과) — geometry의 page-relative 좌표와 pointermove의
        // viewport-relative 좌표를 섞어 "이 좌표가 어느 행/열이냐"를 다시
        // 계산할 필요가 없다. 핸들·리사이즈 strip 등 자기 자신의
        // 오버레이 위에서는 이 분기 자체가 안 불린다(ignoreSelectors가
        // 그 target들을 앞에서 걸러 onCandidateChange를 스킵한다) — 그
        // 결과 Add row/column 버튼 위로 이동해도 직전 값이 그대로
        // 유지된다(의도, computeExpandButtonVisibility 주석 참고).
        const target = event.target;
        const rowElement =
          target instanceof Element
            ? target.closest<HTMLElement>("[data-geul-row-id]")
            : null;
        const cellElement =
          target instanceof Element
            ? target.closest<HTMLElement>("[data-geul-column-id]")
            : null;
        setHoverRowId(rowElement?.getAttribute("data-geul-row-id") ?? null);
        setHoverColumnId(
          cellElement?.getAttribute("data-geul-column-id") ?? null,
        );
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
          // 표 안은 아니지만(candidate === null) 여백 안 — hoverTableId는
          // 유지해야 그립으로 이동하는 도중 클러스터가 안 사라진다. 하지만
          // Add row/column rail은 이제 표 폭·높이 전체를 덮어 표 바로
          // 아래·오른쪽 여백에 다음 블록이 바짝 붙어 있으면 겹친다 — 그
          // 다음 블록 위로 마우스가 넘어간 뒤에도 hoverRowId/hoverColumnId가
          // 얼어붙은 채면 rail이 그 블록 위에 계속 떠 있는 것처럼 보인다
          // (버그 재현 스크린샷). target이 "다른" 블록(data-geul-block-id가
          // 있고 currentId와 다름)이면 여기서 지운다 — rail 자신(ignore
          // selector라 이 콜백 자체가 안 불린다)이나 표-rail 사이의 진짜
          // 빈 여백(어떤 블록에도 안 속함)은 여전히 유지돼 rail까지
          // 마우스가 무사히 도달한다.
          const target = event.target;
          const targetBlock =
            target instanceof Element
              ? target.closest<HTMLElement>("[data-geul-block-id]")
              : null;
          const targetBlockId = targetBlock?.getAttribute(
            "data-geul-block-id",
          );
          if (
            targetBlockId !== undefined &&
            targetBlockId !== null &&
            targetBlockId !== currentId
          ) {
            setHoverRowId(null);
            setHoverColumnId(null);
          }
          return;
        }
      }
      updateHoverTableId(null);
      setHoverRowId(null);
      setHoverColumnId(null);
    },
    [element, hoverTableIdRef, updateHoverTableId],
  );
  usePointerHoverTarget({
    element,
    ignoreSelectors: TABLE_HOVER_IGNORE_SELECTORS,
    entitySelector: "table[data-geul-block-id]",
    onCandidateChange: handleHoverCandidateChange,
  });

  // selectionTableId는 최후순위 fallback이다 — hover 중인 표가 있으면(또는
  // 드래그/리사이즈/메뉴가 진행 중이면) 그쪽이 우선한다. 마우스가 표
  // 여백(HANDLE_HOVER_MARGIN)을 완전히 벗어난 채 키보드만으로 커서가 표
  // 안에 남아 있을 때만 이 fallback이 클러스터를 계속 마운트시킨다(Notion
  // 참고, 사용자 요청) — 이 경로로 뜨면 행 그립뿐 아니라 열 그립·add row/
  // column rail·indent/outdent/select 버튼도 함께 뜬다(단일 activeTableId
  // 렌더 게이트를 공유하는 기존 구조 그대로, 새 게이트를 만들지 않는다).
  const activeTableId =
    reorderState?.tableBlockId ??
    resizeState?.tableBlockId ??
    menuState?.tableBlockId ??
    hoverTableId ??
    selectionTableId;
  const geometry =
    activeTableId === null || element === null
      ? null
      : readGeometryFor(element, activeTableId);
  // Indent/Outdent 비활성 판정은 core의 getBlockNestingActionState 한 곳을
  // 공유한다(formatting-toolbar.tsx와 같은 관용구, Issue #126).
  const tableNestingActions =
    geometry === null
      ? null
      : editor.getBlockNestingActionState(geometry.tableBlockId);
  const { showAddRow, showAddColumn } = computeExpandButtonVisibility(
    geometry,
    hoverRowId,
    hoverColumnId,
  );
  // 커서가 지금 그려지는 표(geometry.tableBlockId)와 다른 표에 있으면 무시한다
  // — hover가 다른 표를 가리키는 동안(위 activeTableId 우선순위) 그 표의
  // selectionRowId/selectionColumnId를 이 표 행/열에 잘못 매칭하지 않는다.
  const isSelectionInRenderedTable =
    geometry !== null && selectionTableId === geometry.tableBlockId;
  const activeRowId = isSelectionInRenderedTable ? selectionRowId : null;
  const activeColumnId = isSelectionInRenderedTable ? selectionColumnId : null;

  // 핸들 6종은 이제 position: absolute + page-relative 좌표라(G-UI-003)
  // 일반 페이지 스크롤에는 브라우저가 자동으로 따라와 재렌더가 필요
  // 없다. 창 크기 변경(반응형 레이아웃이 표 폭을 바꾸는 경우)만 geometry를
  // 다시 읽어야 한다. 다만 행/열 메뉴(table-handle-menu.tsx)는 G-UI-001의
  // position: fixed + 뷰포트 clamp를 그대로 쓰므로 스크롤할 때마다 다시
  // 계산해야 앵커를 따라간다 — 메뉴가 열려 있을 때만 스크롤 리스너를 켠다.
  useEffect(() => {
    if (element === null || activeTableId === null) return;
    const ownerDocument = element.ownerDocument;
    const view = ownerDocument.defaultView;
    const refreshGeometry = () => setGeometryVersion((version) => version + 1);

    view?.addEventListener("resize", refreshGeometry);
    if (menuState !== null) {
      ownerDocument.addEventListener("scroll", refreshGeometry, true);
    }
    return () => {
      view?.removeEventListener("resize", refreshGeometry);
      ownerDocument.removeEventListener("scroll", refreshGeometry, true);
    };
  }, [element, activeTableId, menuState]);

  // 위 geometry는 이 렌더 함수 본문에서 읽은 값이라, 같은 커밋에 딸려오는
  // DOM 변경(예: 표보다 앞선 형제가 줄바꿈으로 높이를 바꿔 표를 밀어내는
  // 경우, Issue #15)이 반영되기 전 레이아웃을 담는다 — React는 커밋을
  // 전부 적용한 뒤에야 브라우저가 레이아웃을 다시 계산하므로, 렌더 본문의
  // getBoundingClientRect는 항상 "이 렌더 이전" 위치다. 그 결과로 그려지는
  // absolute 오버레이(특히 열 추가 버튼 data-geul-table-expand-column, 재정렬
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
    // geometry는 이제 page-relative다(readPageRect) — 여기도 같은 변환을
    // 거쳐야 두 값이 같은 좌표계에서 비교된다. getBoundingClientRect()를
    // 그대로 비교하면 스크롤이 있는 페이지에서 항상 불일치로 판정돼 이
    // 이펙트가 매 렌더마다 setGeometryVersion을 올리는 무한 재렌더가 된다.
    const rect = readPageRect(table);
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
      // page-relative geometry와 같은 좌표계로 비교해야 한다(G-UI-003) —
      // clientX/clientY(viewport-relative)를 넘기면 스크롤된 페이지에서
      // 목표 인덱스가 어긋난다.
      const targetIndex = computeReorderTargetIndex(
        element,
        current,
        event.pageX,
        event.pageY,
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

  // 완료 조건 3(Issue #18, 재조준은 Issue #65): 메뉴가 열린 동안 대상
  // 행/열이 undo 등으로 사라지면(대상 자신이 사라지거나 표 블록 자체가
  // 사라지면) 메뉴를 자동으로 닫는다. geometry는 render마다 다시 읽지만,
  // 이 컴포넌트를 재렌더시키는 주체가 항상 있다는 보장이 없다(위
  // readFreshGeometry 주석 참고) — 재렌더에 기대지 않고 DOM을 직접
  // 관찰한다.
  //
  // 인덱스 범위만 보면, 대상보다 앞선 행/열이 사라져 인덱스가 밀린
  // 경우와 대상 자신이 사라진 경우를 구분하지 못한다(Issue #65 재리뷰 —
  // 조용한 데이터 손실). menuState.targetId(G-UI-002, ReorderState.sourceId와
  // 같은 결)로 대상을 재해석한다 — targetId가 현재 배열에 없으면 대상
  // 자신이 사라진 것이므로 닫고, 있고 위치가 바뀌었으면 인덱스만 갱신해
  // 재조준한다(닫지 않는다). targetId가 빈 문자열이면(fail-open, 서로 다른
  // 행/열이 같은 빈 id로 충돌할 수 있어) 기존처럼 인덱스 범위만 본다.
  //
  // Issue #65 항목7: 대상 index가 그대로인 채 행/열 개수만 늘어나는
  // 경로(예: 외부 controller가 onChange 재렌더를 걸지 않는 구성에서 다른
  // 코드가 행/열을 추가)는 위 두 분기 어디에도 안 걸린다 — 재조준할
  // index도 없고 닫을 이유도 없다. 하지만 렌더마다 다시 읽는 geometry가
  // canDelete(`geometry.rows.length > 1` 류, G-TBL-001)의 근거라, 이
  // 컴포넌트를 재렌더시키는 주체가 없으면 count가 늘어도 canDelete는
  // 낡은 값(false)에 머문다. count가 늘었을 때만(줄어드는 방향은 범위
  // 밖 — 기존 무효화·실패 알림 흐름이 이미 다룬다) 기존
  // setGeometryVersion 카운터를 올려 강제 재렌더시킨다 — geometry는 그
  // 재렌더에서 다시 DOM을 읽으므로 canDelete가 최신값을 반영한다. count
  // 비교 자체는 이 effect 인스턴스 안의 `knownCount` 클로저로만 하고
  // geometry를 직접 다시 읽지 않는다(Issue #18 재리뷰 항목5 경량화 유지 —
  // MutationObserver 콜백은 count만 본다).
  useEffect(() => {
    if (menuState === null || element === null) return;

    // observer 부착 전 최초 호출에서 baseline만 세운다 — 그 전에는 "이전
    // count"가 없어 비교 자체가 스퓨리어스 bump가 된다.
    let knownCount: number | null = null;

    const reconcileMenuState = () => {
      // 대상 표를 매번 다시 찾는다. 표 노드가 재생성되면 effect 시점에
      // 해석한 엘리먼트는 문서에서 떨어져 나가 낡은 개수를 계속 돌려준다.
      const table = findTable(element, menuState.tableBlockId);
      if (table === null) {
        closeMenuOnInvalidation();
        return;
      }

      const { count, index: nextIndex } = resolveMenuTargetIndex(
        menuState,
        table,
      );
      if (nextIndex === null) {
        closeMenuOnInvalidation();
        return;
      }
      if (nextIndex !== menuState.index) {
        // 재조준 — menuState 참조가 바뀌어 이 effect가 새 baseline으로
        // 다시 실행된다(knownCount도 자연히 리셋된다).
        setMenuState({ ...menuState, index: nextIndex });
        return;
      }
      if (knownCount !== null && count > knownCount) {
        setGeometryVersion((version) => version + 1);
      }
      knownCount = count;
    };

    // 이 effect가 붙기 전에 이미 무효화·재조준됐을 수도 있다 — 최초
    // 1회도 검사한다.
    reconcileMenuState();

    // 표 엘리먼트가 아니라 편집기 루트를 관찰한다. <table>에 직접 걸면
    // 그 노드가 통째로 제거될 때(제거는 부모의 childList mutation이라
    // 제거되는 노드 자신의 observer에는 오지 않는다) 콜백이 오지 않아
    // 메뉴가 죽은 표를 가리킨 채 남는다.
    const observer = new MutationObserver(reconcileMenuState);
    observer.observe(element, {
      attributeFilter: ["data-geul-columns"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [menuState, element, closeMenuOnInvalidation]);

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
        onOpen: () => setMenuState({ kind, tableBlockId, index, targetId: id }),
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

  const handleIndentTable = () => {
    const fresh = readFreshGeometry();
    if (fresh === null) return;
    // G-UI-004: aria-disabled는 disabled와 달리 클릭 이벤트를 막지 않는다 —
    // 명시적 가드로 비활성 상태의 클릭을 막는다. canIndent는 fresh 기준으로
    // 다시 계산한다(canIndentTable prop은 render 시점 geometry에서 나온 값이라
    // readFreshGeometry와 같은 이유로 낡을 수 있다).
    if (
      editor.getBlockNestingActionState(fresh.tableBlockId).canIndent !== true
    ) {
      return;
    }
    editor.commands.indentBlock(fresh.tableBlockId);
  };

  const handleOutdentTable = () => {
    const fresh = readFreshGeometry();
    if (fresh === null) return;
    if (
      editor.getBlockNestingActionState(fresh.tableBlockId).canOutdent !== true
    ) {
      return;
    }
    editor.commands.outdentBlock(fresh.tableBlockId);
  };

  // Issue #149 — 표 자신을 selectBlockRange(tableId, tableId)로 선택해
  // BlockSelectionToolbar(Delete·위/아래 이동)를 연다. Indent/Outdent와 같은
  // readFreshGeometry() → editor.commands.* 관용구를 그대로 따른다 — 표
  // 직접 duplicate는 여전히 core가 거절한다(범위 밖, 01-계획.md "결정").
  const handleSelectTable = () => {
    const fresh = readFreshGeometry();
    if (fresh === null) return;
    editor.commands.selectBlockRange(fresh.tableBlockId, fresh.tableBlockId);
  };

  const reorderGuideRect = computeReorderGuideRect(geometry, reorderState);

  // 메뉴 좌표를 click 시점에 고정하면 연 채로 스크롤/창 크기 변경 시
  // 앵커(핸들)와 어긋난다 — 핸들 자신처럼 매 렌더마다 geometry에서 다시
  // 계산한다(geometry는 resize·메뉴가 열린 동안의 scroll 시
  // geometryVersion을 통해 갱신된다). 메뉴는 G-UI-001의 fixed+clamp를
  // 그대로 쓰므로 page-relative geometry를 다시 viewport-relative로
  // 되돌리는 스크롤 오프셋을 함께 넘긴다.
  const menuPosition = computeMenuPosition(geometry, menuState, {
    x: element?.ownerDocument.defaultView?.scrollX ?? 0,
    y: element?.ownerDocument.defaultView?.scrollY ?? 0,
  });

  return (
    <>
      {geometry !== null && (
        <TableHandleOverlays
          activeColumnId={activeColumnId}
          activeRowId={activeRowId}
          canIndentTable={tableNestingActions?.canIndent === true}
          canOutdentTable={tableNestingActions?.canOutdent === true}
          geometry={geometry}
          onAddColumn={handleAddColumn}
          onAddRow={handleAddRow}
          onIndentTable={handleIndentTable}
          onOutdentTable={handleOutdentTable}
          onReorderHandleClick={handleReorderHandleClick}
          onReorderHandlePointerDown={handlePointerDownOnReorderHandle}
          onResizeHandlePointerDown={handlePointerDownOnResizeHandle}
          onSelectTable={handleSelectTable}
          reorderGuideRect={reorderGuideRect}
          showAddColumn={showAddColumn}
          showAddRow={showAddRow}
        />
      )}
      {menuState !== null && geometry !== null && menuPosition !== null && (
        <TableHandleMenu
          // Issue #65 재조준 발견: index를 key에 넣으면 재조준(같은 대상,
          // 다른 index)마다 컴포넌트가 remount돼 useTableCommandFeedback의
          // actionError(Issue #18 완료 조건 1)가 조용히 사라진다 — 대상
          // 전환(다른 targetId)에서는 여전히 remount로 이전 실패를 지워야
          // 하므로(위 "다른 행으로 메뉴 대상을 바로 전환하면..." 테스트)
          // index 대신 targetId로 키를 세운다. 빈 targetId는 G-UI-002
          // fail-open이라 이전과 같이 서로 다른 대상이 충돌할 수 있다.
          key={`${menuState.tableBlockId}-${menuState.kind}-${menuState.targetId}`}
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
