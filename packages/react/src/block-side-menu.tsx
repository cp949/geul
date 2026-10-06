import { GripVertical, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  computeDragGuide,
  computeGutterTopOffset,
  computeRangeMoveDragGuide,
  findBlockInTreeForDrag,
  findOwnRectBlockId,
  isBlockIdWithinBlockSelection,
  readBlockMenuAnchor,
} from "./block-side-menu-geometry.js";
import { BlockSideMenuMenu } from "./block-side-menu-menu.js";
import type {
  BlockMenuState,
  BlockSideMenuProps,
  DragState,
} from "./block-side-menu-types.js";
import { findElementByAttribute } from "./find-by-attribute.js";
import { useFixedPlacement } from "./fixed-placement.js";
import { isHiddenBlockElement } from "./hidden-block.js";
import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { useDismissibleOverlay } from "./use-dismissible-overlay.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useHandleKeyboardActivation } from "./use-handle-keyboard-activation.js";
import {
  resolveReopenAwareClick,
  useHandleReopenSuppression,
} from "./use-handle-reopen-suppression.js";
import { useHiddenBlockRefresh } from "./use-hidden-block-refresh.js";
import { useMirroredState } from "./use-mirrored-state.js";
import { usePointerDragGesture } from "./use-pointer-drag-gesture.js";
import { usePointerHoverTarget } from "./use-pointer-hover-target.js";

// 핸들은 드래그(재정렬)와 클릭(블록 메뉴) 두 동작을 모두 갖는다 — tooltip이
// 한쪽만 안내하면 나머지 동작의 발견성을 가리므로 라벨이 둘 다 기술한다.
const dragHandleIcon = <GripVertical {...iconProps} />;
const addBlockIcon = <Plus {...iconProps} />;

// flex 센터링은 IconButton이 공통으로 제공한다.
const blockGutterButtonClassName = "geul-block-gutter__button";

// 거터(드래그 핸들·add 버튼)는 _block-side-menu.scss의
// `transform: translate(-3.5rem, 0)`로 블록 왼쪽 56px 바깥에 뜬다(dy는
// 0 — clampAnchor `leftOfAnchor` 참고). 포인터가 블록에서
// 거터로 이동하는 도중(둘 중 어느 쪽도 아닌 빈 공간)에는 hover를 유지해야
// 한다 — 즉시 해제하면 이동 중에 거터가 먼저 사라져 클릭할 수 없다. 이
// 여백은 왼쪽 방향에만 쓴다(아래 판정) — table-handles.tsx의
// HANDLE_HOVER_MARGIN은 표를 4면 모두 감싸는 오버레이(위 열 그립, 아래
// add-row rail, 오른쪽 add-column rail)라 4방향 확장이 맞지만, 이 거터는
// 왼쪽 한 방향에만 있어 위/아래/오른쪽까지 늘리면 다음 블록(표 포함)으로
// 넘어간 뒤에도 이전 블록의 거터가 안 사라지는 dead-zone 역전 버그가
// 난다(사용자 스크린샷, 표가 문단 바로 아래일 때 재현).
const BLOCK_GUTTER_HOVER_MARGIN = 56;

// useDismissibleOverlay allow-list. 모듈 스코프 상수로 둔다.
// 소유자 셀렉터를 맨 앞에 둔다. 블록 메뉴와 media 메뉴가 같은
// `[data-geul-block-menu]`를 공유해서, focusOnOpen이 문서 순서상 첫 표면을
// 고르면 남의 메뉴일 수 있다. 소유자 셀렉터가 앞이면 자기 메뉴를 먼저 찾는다.
// 활성 항목이 없을 때는 그 첫 표면(패널)에 초점을 준다. 핸들이 앞이면 초점이
// 핸들에 남는다. 아래 두 셀렉터는 바깥 클릭 판정용이다.
const BLOCK_MENU_DISMISS_ALLOW_SELECTORS = [
  '[data-geul-block-menu][data-geul-menu-owner="block"]',
  "[data-geul-block-menu]",
  "[data-geul-block-handle]",
] as const;

// usePointerHoverTarget ignore-list. table-handles.tsx와 같은 이유로
// 모듈 스코프 상수로 둔다.
const BLOCK_HOVER_IGNORE_SELECTORS = [
  "[data-geul-add-block-button]",
  "[data-geul-block-handle]",
  "[data-geul-block-menu]",
] as const;

// 열린 메뉴 상태. `viaKeyboard`는 `focusOnOpen`으로 module에 넘기는 값이다.
// `BlockMenuState`는 media-handle-overlays.tsx와 공유하므로 여기서 확장한다.
type OpenBlockMenuState = BlockMenuState & { viaKeyboard: boolean };

export const BlockSideMenu = ({ onBlockAdded }: BlockSideMenuProps) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const [hoverBlockId, hoverBlockIdRef, updateHoverBlockId] = useMirroredState<
    string | null
  >(null);
  const [dragState, dragStateRef, updateDragState] =
    useMirroredState<DragState | null>(null);
  const [blockMenuState, setBlockMenuState] =
    useState<OpenBlockMenuState | null>(null);
  // 핸들 keydown이 세우고 click(onOpen 판정 전)이나 pointerdown이 지운다.
  const keyboardActivation = useHandleKeyboardActivation();
  // 드래그 종료 후 합성 click 억제 + pointerdown 스냅샷 기반 재오픈 판정 —
  // table-handles.tsx와 같은 상태 머신을 공유한다(Issue #52).
  const reopenSuppression = useHandleReopenSuppression();

  // 리스너를 element가 아닌 document에 둔다. gutter는 contenteditable
  // 바깥의 오버레이라서 element 안쪽에서만 hover를 추적하면 포인터가
  // 버튼으로 이동하는 순간 사라진다 — 등록/해제는 usePointerHoverTarget이
  // 소유한다.
  const handleHoverCandidateChange = useCallback(
    (candidate: HTMLElement | null, event: PointerEvent) => {
      // table은 자체 행/열 핸들(table-handles.tsx)을, media는 전용
      // 오버레이(media-handle-overlays.tsx, Issue #187 RD-001 DELTA-03)를
      // 가지므로 이 거터 대상에서 제외한다. entitySelector의 `.closest()`가
      // 아니라 여기서 거른다 — `:not(table):not([data-geul-media-kind])`를
      // entitySelector에 넣으면(DELTA-02가 그렇게 했었다) 중첩된(들여쓴)
      // table·media 위에서 `.closest()`가 그 블록 자신은 건너뛰고 조상
      // 블록까지 타고 올라가 버린다(실측 발견: 들여쓴 media를 hover하면
      // 조상 블록의 거터가 media 옆에 함께 떠 그립 버튼이 2개로 보였다) —
      // 최근접 블록을 먼저 찾은 뒤(entitySelector는 `[data-geul-block-id]`만
      // 본다) 여기서 "그 블록 자체가 제외 대상인가"만 판정해야 조상으로
      // 새지 않는다.
      const eligibleCandidate =
        candidate !== null &&
        candidate.tagName !== "TABLE" &&
        !candidate.hasAttribute("data-geul-media-kind")
          ? candidate
          : null;
      if (eligibleCandidate !== null) {
        updateHoverBlockId(
          eligibleCandidate.getAttribute("data-geul-block-id"),
        );
        return;
      }

      // 거터는 블록 왼쪽(BLOCK_GUTTER_HOVER_MARGIN)에만 뜨므로, 그 여백을
      // 벗어나기 전에는 hover를 유지한다 — table-handles.tsx의 hover
      // 히스테리시스와 같은 이유(usePointerHoverTarget이 candidate만 알 뿐
      // 이 판단은 모른다, 호출부 전용 판단이라 콜백 안에 남긴다). 세로축은
      // 블록 자신의 rect(top~bottom)를 그대로 쓴다 — 위/아래로도 여백을
      // 주면 다음/이전 블록(표 포함) 쪽으로 넘어간 뒤에도 이 블록의 거터가
      // 계속 떠 있는다(BLOCK_GUTTER_HOVER_MARGIN 선언부 주석 참고).
      const currentId = hoverBlockIdRef.current;
      if (currentId !== null && element !== null) {
        const blockElement = findElementByAttribute(
          element,
          null,
          "data-geul-block-id",
          currentId,
        );
        const rect = blockElement?.getBoundingClientRect();
        if (
          rect !== undefined &&
          rect.width > 0 &&
          rect.height > 0 &&
          event.clientX >= rect.left - BLOCK_GUTTER_HOVER_MARGIN &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        ) {
          return;
        }
      }
      updateHoverBlockId(null);
    },
    [element, hoverBlockIdRef, updateHoverBlockId],
  );
  usePointerHoverTarget({
    element,
    ignoreSelectors: BLOCK_HOVER_IGNORE_SELECTORS,
    // table·media 제외는 여기(CSS selector)가 아니라
    // handleHoverCandidateChange가 판정한다 — 위 주석 참고.
    entitySelector: "[data-geul-block-id]",
    onCandidateChange: handleHoverCandidateChange,
  });

  const isDragging = dragState !== null;

  // 네이티브 drag는 CDP 자동화에서 OS 레벨로 제어권이 넘어가는 환경이
  // 있으므로 Pointer Event로 재정렬한다. 실제 drag 뒤 브라우저가 합성하는
  // click은 메뉴 열기로 해석하지 않는다. pointerId 게이트, listener
  // 등록/해제, keydown(Escape) 분기는 usePointerDragGesture가 맡는다
  // (table-handles.tsx의 재정렬·리사이즈와 같은 훅).
  const handleBlockDragMove = useCallback(
    (event: PointerEvent) => {
      if (element === null) return;
      const current = dragStateRef.current;
      if (current === null) return;
      const hasDragged =
        current.hasDragged ||
        Math.hypot(
          event.clientX - current.startX,
          event.clientY - current.startY,
        ) >= 4;

      // 클릭으로 해석될 짧은 이동(조건8)에는 어떤 새 판정도 발동하지 않는다
      // — hasDragged가 false인 동안은 guide/후보를 그대로 null로 둔다.
      if (!hasDragged) {
        updateDragState({ ...current, hasDragged });
        return;
      }

      // range-move: pointerdown 시점에 이미 결정된 모드다(조건4). 이동 내내
      // 유지되며, 가이드만 범위 기준 no-op 판정으로 다시 계산한다(조건6).
      if (current.mode === "range-move") {
        const guide =
          current.rangeSelection === null
            ? null
            : computeRangeMoveDragGuide(
                element,
                event.clientY,
                current.rangeSelection.fromBlockId,
                current.rangeSelection.toBlockId,
              );
        updateDragState({ ...current, hasDragged, guide });
        return;
      }

      // reorder 진입점: own-rect hover 대상이 실제(트리) 인접 형제면 기존
      // 재정렬 guide를 그대로 쓰고(조건1·1a), 인접하지 않은 같은 부모 형제면
      // range-select 후보로 전환하며(조건2), 다른 부모거나 hover 대상이
      // 없으면 기존 computeDragGuide 폴백을 유지한다(조건3).
      const documentBlocks = editor.getDocument().blocks;
      const hoveredBlockId = findOwnRectBlockId(element, event.clientY);
      const sourceLocation = findBlockInTreeForDrag(
        documentBlocks,
        current.sourceBlockId,
      );
      const hoveredLocation =
        hoveredBlockId === null
          ? null
          : findBlockInTreeForDrag(documentBlocks, hoveredBlockId);
      const isSameParentNonAdjacentSibling =
        hoveredBlockId !== null &&
        hoveredBlockId !== current.sourceBlockId &&
        hoveredLocation !== null &&
        sourceLocation !== null &&
        hoveredLocation.siblings === sourceLocation.siblings &&
        Math.abs(hoveredLocation.index - sourceLocation.index) !== 1;

      updateDragState(
        isSameParentNonAdjacentSibling
          ? {
              ...current,
              hasDragged,
              mode: "range-select",
              guide: null,
              rangeSelectCandidateBlockId: hoveredBlockId,
            }
          : {
              ...current,
              hasDragged,
              mode: "reorder",
              guide: computeDragGuide(element, event.clientY, current),
              rangeSelectCandidateBlockId: null,
            },
      );
    },
    [element, dragStateRef, updateDragState, editor],
  );

  const handleBlockDragUp = useCallback(() => {
    const current = dragStateRef.current;
    if (current === null) return;
    if (!current.cancelled) {
      if (current.mode === "range-move") {
        if (current.guide !== null) {
          editor.commands.moveSelectedBlocksBefore(current.guide.beforeBlockId);
        }
      } else if (current.mode === "range-select") {
        if (current.rangeSelectCandidateBlockId !== null) {
          editor.commands.selectBlockRange(
            current.sourceBlockId,
            current.rangeSelectCandidateBlockId,
          );
        }
      } else if (current.guide !== null) {
        editor.commands.moveBlockBefore(
          current.sourceBlockId,
          current.guide.beforeBlockId,
        );
      }
    }
    if (current.hasDragged || current.cancelled) {
      reopenSuppression.markSuppressed(current.sourceBlockId);
    }
    updateDragState(null);
  }, [editor, dragStateRef, updateDragState, reopenSuppression]);

  const handleBlockDragCancel = useCallback(() => {
    const current = dragStateRef.current;
    if (current === null) return;
    if (current.hasDragged || current.cancelled) {
      reopenSuppression.markSuppressed(current.sourceBlockId);
    }
    updateDragState(null);
  }, [dragStateRef, updateDragState, reopenSuppression]);

  const handleBlockDragEscape = useCallback(
    (event: KeyboardEvent): true => {
      event.preventDefault();
      const current = dragStateRef.current;
      if (current !== null) {
        updateDragState({ ...current, cancelled: true, guide: null });
      }
      return true;
    },
    [dragStateRef, updateDragState],
  );

  usePointerDragGesture({
    active: isDragging,
    element,
    pointerId: dragState?.pointerId ?? null,
    onMove: handleBlockDragMove,
    onUp: handleBlockDragUp,
    onCancel: handleBlockDragCancel,
    onEscape: handleBlockDragEscape,
  });

  // 블록 메뉴는 바깥 pointerdown과 Escape로 닫는다(G-TST-001: 키보드로
  // 닫는 UI는 병렬 e2e로 검증한다). 리스너, reason별 초점 복귀, Escape
  // LIFO, 키보드 열림 초점은 useDismissibleOverlay가 소유한다(Issue #233).
  // 항목 클릭·트리거 재클릭 닫힘은 `close("trigger")`로 편집기에 초점을
  // 돌린다.
  const close = useDismissibleOverlay({
    open: blockMenuState !== null,
    element,
    allowSelectors: BLOCK_MENU_DISMISS_ALLOW_SELECTORS,
    onClose: () => setBlockMenuState(null),
    focusOnOpen: blockMenuState?.viaKeyboard ?? false,
    // 열린 채 다른 블록 핸들로 다시 열면 payload만 바뀐다. 메뉴가 key로
    // 재마운트돼 초점을 잃으므로 대상이 바뀔 때 초점을 다시 준다.
    focusKey: blockMenuState?.blockId,
  });
  const closeFromTrigger = useCallback(() => close("trigger"), [close]);
  const closeFromInvalidated = useCallback(() => close("invalidated"), [close]);

  // 대상 블록이 사라지면 닫는다(`invalidated`). 외부 controller command의
  // 삭제는 internal·external 마운트 모두에서 `editor.subscribe`로만 알 수
  // 있다. listener는 틱만 올린다 — Tiptap `transaction` emit이 세션 문서
  // 갱신보다 앞서 listener 안의 `getDocument()`는 한 단계 낡은 문서를
  // 읽는다. 존재 판정은 커밋 뒤 effect가 한다.
  const openBlockId = blockMenuState?.blockId ?? null;
  const [documentTick, setDocumentTick] = useState(0);
  useEffect(() => {
    if (openBlockId === null) return;
    return editor.subscribe(() => setDocumentTick((tick) => tick + 1));
  }, [editor, openBlockId]);
  useEffect(() => {
    if (openBlockId === null) return;
    if (findBlockInTreeForDrag(editor.getDocument().blocks, openBlockId)) {
      // 접힘이 대상 블록을 가려도 닫는다. 보이지 않는 블록에 Turn into·Delete가
      // 나가지 않게 한다(Issue #280).
      const openBlockElement =
        element === null
          ? null
          : findElementByAttribute(
              element,
              null,
              "data-geul-block-id",
              openBlockId,
            );
      if (
        openBlockElement === null ||
        !isHiddenBlockElement(openBlockElement)
      ) {
        return;
      }
    }
    close("invalidated");
    // documentTick은 값을 읽지 않는 재실행 트리거다. openBlockId는 열자마자
    // 같은 batch에서 삭제된 대상을 열린 직후 한 번 확인한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentTick, openBlockId]);

  // 열린 블록 메뉴의 앵커. 열 때와 스크롤·resize 재측정이 같은 reader를
  // 거친다(Issue #234). 블록이 DOM에 없으면 `null`이라 마지막 좌표를 유지한다.
  const readBlockMenuAnchorOf = (blockId: string) => {
    if (element === null) return null;
    const blockElement = findElementByAttribute(
      element,
      null,
      "data-geul-block-id",
      blockId,
    );
    if (blockElement === null) return null;
    // 접힌 toggle이 가린 블록은 rect가 0x0이다. 메뉴가 그 좌표로 옮겨 가지
    // 않게 마지막 좌표를 유지한다(Issue #280).
    if (isHiddenBlockElement(blockElement)) return null;
    return readBlockMenuAnchor(
      blockElement,
      computeGutterTopOffset(blockElement),
    );
  };

  // 거터 그립의 앵커. 렌더마다 읽고 스크롤·resize에서 `useFixedPlacement`가 다시
  // 읽는다. 열린 메뉴가 스크롤을 따라갈 때 그립이 옛 좌표에 남지 않게 한다
  // (Issue #234).
  const readHoverAnchor = () => {
    if (hoverBlockId === null || element === null) return null;
    const blockElement = findElementByAttribute(
      element,
      null,
      "data-geul-block-id",
      hoverBlockId,
    );
    if (blockElement === null) return null;
    // 접힌 toggle이 가린 블록은 rect가 0x0이라 거터가 화면 구석에 뜬다. `null`이면
    // `hoverBounds`가 `null`이라 거터가 내려간다(Issue #280).
    if (isHiddenBlockElement(blockElement)) return null;
    const rect = blockElement.getBoundingClientRect();
    // heading은 line-height가 버튼보다 커 top 그대로면 버튼이 첫 줄
    // 위쪽으로 쏠린다 — computeGutterTopOffset 참고(block-side-menu-geometry.ts).
    return {
      left: rect.left,
      top: rect.top + computeGutterTopOffset(blockElement),
    };
  };
  const hoverBounds = readHoverAnchor();

  // hover 중인 블록이 포인터 이동 없이 접힘에 가려질 수 있다(undo, 외부 command).
  // 숨김 여부가 바뀔 때만 렌더를 강제한다(Issue #280).
  useHiddenBlockRefresh(editor, element, hoverBlockId);

  // 거터는 `position: fixed`라 안쪽 스크롤 컨테이너가 잘라내지 못한다. 블록이
  // 영역 밖으로 나가면 숨긴다(Issue #267). viewport clamp가 박스를 영역 안으로
  // 끌어올 수 있어 앵커 점과 박스를 함께 본다(`clipBox`).
  // - 드래그 중은 면제한다. 숨기면 pointer capture를 잃는다.
  // - 블록 메뉴를 연 블록의 거터는 면제한다. 메뉴만 남고 거터만 숨는 상태를 막는다.
  // - hover가 다른 블록으로 옮겨 가면 그 거터는 판정한다(G-UI-003).
  const gutterClamp = useFixedPlacement({
    open: hoverBounds !== null,
    element,
    readAnchor: readHoverAnchor,
    clampAnchor: "leftOfAnchor",
    ...(hoverBounds === null ? {} : { fallbackAnchor: hoverBounds }),
    clip: true,
    clipBox: true,
    clipExempt:
      dragState !== null ||
      (blockMenuState !== null && blockMenuState.blockId === hoverBlockId),
  });

  const handleAddBlockClick = () => {
    if (hoverBlockId === null) return;
    const result = editor.commands.insertParagraphAfter(hoverBlockId);
    updateHoverBlockId(null);
    if (result.ok) onBlockAdded(result.value.blockId);
  };

  const handlePointerDownOnHandle = (
    event: React.PointerEvent<HTMLButtonElement>,
    blockId: string,
  ) => {
    if (event.button !== 0) return;
    // 실기기 터치에서 핸들을 누르고 움직이면 브라우저가 스크롤 제스처로
    // 판단해 pointercancel로 드래그를 끊을 수 있다 — table-handles의
    // 재정렬 핸들에는 없지만(스크롤 방향과 재정렬 방향이 겹치지 않아
    // 실사용 위험이 낮음) 블록 gutter는 문서 전체 세로 스크롤과 드래그
    // 방향이 겹쳐 spec §9.2가 방어적 수정으로 명시 승인했다.
    event.preventDefault();
    keyboardActivation.reset();
    reopenSuppression.onPointerDown(
      blockMenuState !== null && blockMenuState.blockId === blockId
        ? blockId
        : null,
    );
    event.currentTarget.setPointerCapture(event.pointerId);
    setBlockMenuState(null);

    // 이미 blockSelection이 있고 그 범위 안 blockId의 handle을 눌렀다면
    // "범위 이동"으로 시작한다(조건4) — 아니면 기존과 같은 단일 재정렬
    // 진입점("reorder")이다.
    const existingSelection = editor.getBlockSelection();
    const isRangeMove =
      existingSelection !== null &&
      isBlockIdWithinBlockSelection(
        editor.getDocument().blocks,
        existingSelection,
        blockId,
      );

    // range-move만 propagation을 끊는다. BlockSelectionToolbar의
    // useDismissibleOverlay가 document pointerdown을 "바깥 클릭"으로
    // 판정해 clearBlockSelection을 먼저 실행하면, 뒤이은
    // moveSelectedBlocksBefore가 core에서 getBlockSelection()===null을
    // 만나 COMMAND_NOT_APPLICABLE로 거절된다(e2e 실측 발견, Issue #38
    // 슬라이스7 DELTA-05 즉시 리뷰 MAJOR-1). 범위 밖 blockId의 handle
    // pointerdown(평범한 재정렬 진입점)은 여기서 걸러지지 않으므로 여전히
    // "바깥"으로 전파돼 stale 선택을 지운다(DELTA-04 완료 조건 8 보존) —
    // allow-list로는 이 둘을 구분할 수 없어(handle은 블록마다가 아니라
    // hover 중인 블록 하나에만 있는 공용 버튼) 호출부에서 조건부로 끊는다.
    if (isRangeMove) event.stopPropagation();

    updateDragState({
      pointerId: event.pointerId,
      sourceBlockId: blockId,
      startX: event.clientX,
      startY: event.clientY,
      hasDragged: false,
      cancelled: false,
      guide: null,
      mode: isRangeMove ? "range-move" : "reorder",
      rangeSelectCandidateBlockId: null,
      rangeSelection: isRangeMove ? existingSelection : null,
    });
  };

  const handleHandleClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    blockId: string,
  ) => {
    // suppressionKey/reopenKey 둘 다 blockId다 — 블록은 별도 위치 축이
    // 없다(table-handles.tsx의 index와 달리). 트리거 버튼도 onMouseDown
    // preventDefault라 초점을 받지 않는다 — 재클릭 닫기에는 바깥 클릭과
    // 달리 "돌아갈 다른 목적지"가 없다. Escape와 같은 그룹으로 다뤄
    // close("trigger")(초점 복구 포함)를 재사용한다(G-UI-001, Issue #52).
    const viaKeyboard = keyboardActivation.consume();
    resolveReopenAwareClick(
      reopenSuppression,
      event,
      {
        suppressionKey: blockId,
        reopenKey: blockId,
        isCurrentlyOpen:
          blockMenuState !== null && blockMenuState.blockId === blockId,
      },
      {
        onOpen: () => {
          if (hoverBounds === null) return;
          setBlockMenuState({ blockId, viaKeyboard });
        },
        onClose: closeFromTrigger,
      },
    );
  };

  return (
    <>
      {hoverBounds !== null && hoverBlockId !== null && (
        <div
          className="geul-block-gutter"
          ref={gutterClamp.menuRef}
          style={gutterClamp.style}
        >
          <IconButton
            className={`${blockGutterButtonClassName} geul-block-gutter__button--drag`}
            data-geul-block-handle=""
            icon={dragHandleIcon}
            label={dictionary.handle.dragBlock}
            onClick={(event) => handleHandleClick(event, hoverBlockId)}
            onKeyDown={keyboardActivation.onKeyDown}
            onPointerDown={(event) =>
              handlePointerDownOnHandle(event, hoverBlockId)
            }
          />
          <IconButton
            className={`${blockGutterButtonClassName} geul-block-gutter__button--add`}
            data-geul-add-block-button=""
            icon={addBlockIcon}
            label={dictionary.handle.addBlock}
            onClick={handleAddBlockClick}
          />
        </div>
      )}
      {/* 드롭 가이드 라인은 클릭 대상이 아니라 드래그 중인 블록이 놓일
          위치를 그대로 보여주는 시각 표시다(pointer-events-none).
          useClampedMenuPosition으로 접어 넣으면 실제 삽입 지점과 라인이
          어긋나 사용자에게 잘못된 위치를 알려주므로, 이 오버레이는
          PIT-0011 클램프 마이그레이션 대상에서 제외한다(#43). */}
      {dragState?.guide !== null && dragState?.guide !== undefined && (
        <div
          className="geul-block-insertion-guide"
          data-geul-block-insertion-guide=""
          style={{
            left: dragState.guide.left,
            top: dragState.guide.top,
            width: dragState.guide.width,
          }}
        />
      )}
      {blockMenuState !== null && (
        <BlockSideMenuMenu
          blockId={blockMenuState.blockId}
          element={element}
          // 대상이 바뀌면 다시 마운트한다. 메뉴가 열 때의 block type을 lazy
          // init으로 붙들어 두므로, 키가 없으면 이전 대상의 type이 남는다.
          key={blockMenuState.blockId}
          onClose={closeFromTrigger}
          onInvalidated={closeFromInvalidated}
          owner="block"
          readAnchor={() => readBlockMenuAnchorOf(blockMenuState.blockId)}
        />
      )}
    </>
  );
};
