import { GripVertical, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  computeDragGuide,
  computeRangeMoveDragGuide,
  findBlockInTreeForDrag,
  findOwnRectBlockId,
  isBlockIdWithinBlockSelection,
} from "./block-side-menu-geometry.js";
import { BlockSideMenuMenu } from "./block-side-menu-menu.js";
import type {
  BlockMenuState,
  BlockSideMenuProps,
  DragState,
} from "./block-side-menu-types.js";
import { findElementByAttribute } from "./find-by-attribute.js";
import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import {
  resolveReopenAwareClick,
  useHandleReopenSuppression,
} from "./use-handle-reopen-suppression.js";
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
// 0 — useClampedMenuPosition의 leftOfAnchor 참고). 포인터가 블록에서
// 거터로 이동하는 도중(둘 중 어느 쪽도 아닌 빈 공간)에는 hover를 유지해야
// 한다 — 즉시 해제하면 이동 중에 거터가 먼저 사라져 클릭할 수 없다. 이
// 여백은 왼쪽 방향에만 쓴다(아래 판정) — table-handles.tsx의
// HANDLE_HOVER_MARGIN은 표를 4면 모두 감싸는 오버레이(위 열 그립, 아래
// add-row rail, 오른쪽 add-column rail)라 4방향 확장이 맞지만, 이 거터는
// 왼쪽 한 방향에만 있어 위/아래/오른쪽까지 늘리면 다음 블록(표 포함)으로
// 넘어간 뒤에도 이전 블록의 거터가 안 사라지는 dead-zone 역전 버그가
// 난다(사용자 스크린샷, 표가 문단 바로 아래일 때 재현).
const BLOCK_GUTTER_HOVER_MARGIN = 56;

// useDismissOnOutsideOrEscape allow-list. table-handles.tsx,
// table-selection-toolbar.tsx와 같은 이유로 모듈 스코프 상수로 둔다 —
// 매 렌더 새 배열을 넘기면 그 훅의 effect가 리스너를 매 렌더 떼었다
// 다시 붙인다.
const BLOCK_MENU_DISMISS_ALLOW_SELECTORS = [
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

export const BlockSideMenu = ({ onBlockAdded }: BlockSideMenuProps) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const [hoverBlockId, hoverBlockIdRef, updateHoverBlockId] = useMirroredState<
    string | null
  >(null);
  const [dragState, dragStateRef, updateDragState] =
    useMirroredState<DragState | null>(null);
  const [blockMenuState, setBlockMenuState] = useState<BlockMenuState | null>(
    null,
  );
  // 드래그 종료 후 합성 click 억제 + pointerdown 스냅샷 기반 재오픈 판정 —
  // table-handles.tsx와 같은 상태 머신을 공유한다(Issue #52).
  const reopenSuppression = useHandleReopenSuppression();
  const focusEditor = useFocusEditor(element);

  // 리스너를 element가 아닌 document에 둔다. gutter는 contenteditable
  // 바깥의 오버레이라서 element 안쪽에서만 hover를 추적하면 포인터가
  // 버튼으로 이동하는 순간 사라진다 — 등록/해제는 usePointerHoverTarget이
  // 소유한다.
  const handleHoverCandidateChange = useCallback(
    (candidate: HTMLElement | null, event: PointerEvent) => {
      if (candidate !== null) {
        updateHoverBlockId(candidate.getAttribute("data-geul-block-id"));
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
    // table은 자체 행/열 핸들(table-handles.tsx)을 가지므로 이 거터
    // 대상에서 제외한다 — 제외하지 않으면 두 오버레이의 gutter가 표의
    // 왼쪽 부근에서 겹쳐 렌더된다.
    entitySelector: "[data-geul-block-id]:not(table)",
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
  // 닫는 UI는 병렬 e2e로 검증한다). 리스너 등록/해제는
  // useDismissOnOutsideOrEscape가 소유한다 — table-handles.tsx,
  // table-selection-toolbar.tsx와 같은 훅이다(Issue #20, #45).
  const dismissBlockMenu = useCallback(() => setBlockMenuState(null), []);
  const closeBlockMenu = useCallback(() => {
    setBlockMenuState(null);
    focusEditor();
  }, [focusEditor]);
  useDismissOnOutsideOrEscape({
    active: blockMenuState !== null,
    element,
    allowSelectors: BLOCK_MENU_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissBlockMenu,
    onEscapeDismiss: closeBlockMenu,
  });

  useEffect(() => {
    if (element === null) return;
    const ownerWindow = element.ownerDocument.defaultView;
    if (ownerWindow === null) return;

    const refreshBlockMenuGeometry = () => {
      setBlockMenuState((current) => {
        if (current === null) return null;
        const blockElement = findElementByAttribute(
          element,
          null,
          "data-geul-block-id",
          current.blockId,
        );
        if (blockElement === null) return current;
        const rect = blockElement.getBoundingClientRect();
        const left = rect.left;
        const top = rect.top + 28;
        return current.left === left && current.top === top
          ? current
          : { ...current, left, top };
      });
    };

    ownerWindow.addEventListener("scroll", refreshBlockMenuGeometry, true);
    ownerWindow.addEventListener("resize", refreshBlockMenuGeometry);
    return () => {
      ownerWindow.removeEventListener("scroll", refreshBlockMenuGeometry, true);
      ownerWindow.removeEventListener("resize", refreshBlockMenuGeometry);
    };
  }, [element]);

  const hoverBounds = (() => {
    if (hoverBlockId === null || element === null) return null;
    const blockElement = findElementByAttribute(
      element,
      null,
      "data-geul-block-id",
      hoverBlockId,
    );
    if (blockElement === null) return null;
    const rect = blockElement.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  })();

  const gutterClamp = useClampedMenuPosition(
    hoverBounds?.left ?? 0,
    hoverBounds?.top ?? 0,
    "leftOfAnchor",
  );

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
    // useDismissOnOutsideOrEscape가 document pointerdown을 "바깥 클릭"으로
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
    // closeBlockMenu(초점 복구 포함)를 재사용한다(G-UI-001, Issue #52).
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
          setBlockMenuState({
            blockId,
            left: hoverBounds.left,
            top: hoverBounds.top + 28,
          });
        },
        onClose: closeBlockMenu,
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
          left={blockMenuState.left}
          onClose={closeBlockMenu}
          top={blockMenuState.top}
        />
      )}
    </>
  );
};
