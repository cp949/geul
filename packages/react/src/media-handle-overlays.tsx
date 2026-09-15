import { GripVertical, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { computeDragGuide } from "./block-side-menu-geometry.js";
import { BlockSideMenuMenu } from "./block-side-menu-menu.js";
import type { BlockMenuState, DragState } from "./block-side-menu-types.js";
import { findElementByAttribute } from "./find-by-attribute.js";
import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { readPageRect } from "./table-handle-geometry.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useFocusEditor } from "./use-focus-editor.js";
import {
  resolveReopenAwareClick,
  useHandleReopenSuppression,
} from "./use-handle-reopen-suppression.js";
import { useMirroredState } from "./use-mirrored-state.js";
import { usePointerDragGesture } from "./use-pointer-drag-gesture.js";
import { usePointerHoverTarget } from "./use-pointer-hover-target.js";

// 그립·plus 버튼 자체는 새로 만들지 않는다 — block-side-menu.tsx의
// .geul-block-gutter__button과 --drag/--add modifier를 그대로 재사용한다.
// 이 파일이 신설하는 CSS는 컨테이너(.geul-media-handle-overlay) 하나뿐이다
// (_media-handle-overlays.scss).
const dragHandleIcon = <GripVertical {...iconProps} />;
const addBlockIcon = <Plus {...iconProps} />;
const mediaGutterButtonClassName = "geul-block-gutter__button";

// media rect(readPageRect) 왼쪽에서 이만큼 뺀 자리에 그립·plus를 띄운다.
// block-side-menu.tsx의 BLOCK_GUTTER_HOVER_MARGIN(56px, 고정 gutter의
// translate(-3.5rem,0)과 짝을 이루는 값)과 같은 값을 쓴다 — 버튼 2개(그립+
// plus, gap 포함) 폭이 그 파일과 같아 시각적으로 어색하지 않다. 히스테리시스
// 여백(아래 handleHoverCandidateChange)도 같은 값을 공유한다: 포인터가
// media에서 이 오버레이로 이동하는 도중(왼쪽 방향) hover가 풀리면 안 된다는
// 이유가 동일해서다.
const MEDIA_HANDLE_OFFSET_PX = 56;

// `readPageRect(hoverElement)`가 읽던 hoverElement는 `data-geul-media-kind`
// div, 즉 항상 블록 전체 폭(예: paragraph와 같은 content 폭)인 래퍼다.
// image/video는 기본이 가운데 정렬(`margin: 0 auto`, _media-resize-handles.scss)
// 이라 실제 렌더된 <img>/<video>는 그 래퍼 안에서 안쪽으로 들어와 있다 —
// 래퍼 rect를 그대로 쓰면 그립·plus가 이미지 실제 왼쪽 모서리에서 수십~
// 수백 px 떨어진 자리(래퍼의 왼쪽 끝)에 뜬다(Notion 캡처 대조로 발견,
// 2026-09-13). media-resize-handles.tsx의 findMediaElement와 같은 이유로
// 래퍼가 아니라 실제 시각 요소를 찾아야 한다 — 다만 그 함수는 리사이즈
// 대상인 img/video만 찾고, 여기는 4종 전부(+ showPreview:false·file의
// <a>)를 찾아야 해서 별도로 둔다. 빈 media(source 없음)는 시각 자식이
// 없으므로(media-block-extension.ts) null이면 호출부가 래퍼로 폴백한다 —
// 빈 상태의 래퍼 자체가 보이는 placeholder 카드라 그 폴백이 곧 정답이다.
export const findMediaVisualElement = (
  wrapper: HTMLElement,
): HTMLElement | null =>
  wrapper.querySelector<HTMLElement>(
    ":scope > img, :scope > video, :scope > audio, :scope > a",
  );

// usePointerHoverTarget ignore-list. block-side-menu.tsx의
// BLOCK_HOVER_IGNORE_SELECTORS와 같은 값 — 같은 속성을 재사용하는 버튼이라
// (data-geul-block-handle 등) 그 파일의 이유가 그대로 적용된다. 모듈 스코프
// 상수로 두는 이유도 같다(usePointerHoverTarget의 effect가 매 렌더 리스너를
// 떼었다 다시 붙이지 않도록).
const MEDIA_HOVER_IGNORE_SELECTORS = [
  "[data-geul-add-block-button]",
  "[data-geul-block-handle]",
  "[data-geul-block-menu]",
] as const;

// useDismissOnOutsideOrEscape allow-list. block-side-menu.tsx의
// BLOCK_MENU_DISMISS_ALLOW_SELECTORS와 같은 이유로 모듈 스코프 상수로 둔다.
const MEDIA_MENU_DISMISS_ALLOW_SELECTORS = [
  "[data-geul-block-menu]",
  "[data-geul-block-handle]",
] as const;

export type MediaHandleOverlaysProps = {
  onBlockAdded: (blockId: string) => void;
};

/**
 * media(image/video/audio/file) 전용 그립·plus 오버레이(Issue #187 RD-001
 * DELTA-01). block-side-menu.tsx의 공용 gutter와 달리 `position: fixed` +
 * 고정 오프셋이 아니라 `readPageRect(mediaElement)`로 실측한 위치에
 * `position: absolute`로 뜬다 — 들여쓰기 depth가 쌓여도 버튼이 화면 밖으로
 * 밀리지 않는다(table-handles.tsx·media-resize-handles.tsx와 같은 근거,
 * G-UI-003/ADR-0012).
 *
 * 그립은 클릭 시 기존 `BlockSideMenuMenu`를 재사용해 열고(Turn into/Indent/
 * Outdent 등 — 신규 메뉴 없음), pointerdown 드래그로 단일 블록 재정렬을
 * 한다(그릴링 결정 — 공용 gutter가 depth 0 media에 오늘 제공하는 기능을
 * 조용히 없애지 않는다, `RD-001.md` "결정"). range-select/range-move(블록
 * 다중 선택 상태의 그립 재드래그)는 이 DELTA 범위 밖이다.
 *
 * `slash-menu.tsx` 마운트(SlashMenu가 BlockSideMenu/TableHandles처럼 자동
 * 마운트)와 공용 gutter의 media 제외는 DELTA-02, e2e는 DELTA-03이 잇는다.
 */
export const MediaHandleOverlays = ({
  onBlockAdded,
}: MediaHandleOverlaysProps) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const [hoverBlockId, hoverBlockIdRef, updateHoverBlockId] = useMirroredState<
    string | null
  >(null);
  const [dragState, dragStateRef, updateDragState] =
    useMirroredState<DragState | null>(null);
  const [menuState, setMenuState] = useState<BlockMenuState | null>(null);
  // 드래그 종료 후 합성 click 억제 + pointerdown 스냅샷 기반 재오픈 판정 —
  // block-side-menu.tsx와 같은 상태 머신을 공유한다(Issue #52).
  const reopenSuppression = useHandleReopenSuppression();
  const focusEditor = useFocusEditor(element);

  // 리스너를 element가 아닌 document에 둔다 — 오버레이가 contenteditable
  // 바깥이라 element 안쪽에서만 hover를 추적하면 포인터가 버튼으로 이동하는
  // 순간 사라진다(block-side-menu.tsx와 같은 이유).
  const handleHoverCandidateChange = useCallback(
    (candidate: HTMLElement | null, event: PointerEvent) => {
      if (candidate !== null) {
        updateHoverBlockId(candidate.getAttribute("data-geul-block-id"));
        return;
      }

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
          event.clientX >= rect.left - MEDIA_HANDLE_OFFSET_PX &&
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
    entitySelector: "[data-geul-media-kind]",
    ignoreSelectors: MEDIA_HOVER_IGNORE_SELECTORS,
    onCandidateChange: handleHoverCandidateChange,
  });

  const isDragging = dragState !== null;

  // 재정렬만 다룬다(단일 블록) — range-select/range-move는 제외 범위.
  const handleDragMove = useCallback(
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

      if (!hasDragged) {
        updateDragState({ ...current, hasDragged });
        return;
      }
      updateDragState({
        ...current,
        hasDragged,
        guide: computeDragGuide(element, event.clientY, current),
      });
    },
    [element, dragStateRef, updateDragState],
  );

  const handleDragUp = useCallback(() => {
    const current = dragStateRef.current;
    if (current === null) return;
    if (!current.cancelled && current.guide !== null) {
      editor.commands.moveBlockBefore(
        current.sourceBlockId,
        current.guide.beforeBlockId,
      );
    }
    if (current.hasDragged || current.cancelled) {
      reopenSuppression.markSuppressed(current.sourceBlockId);
    }
    updateDragState(null);
  }, [editor, dragStateRef, updateDragState, reopenSuppression]);

  const handleDragCancel = useCallback(() => {
    const current = dragStateRef.current;
    if (current === null) return;
    if (current.hasDragged || current.cancelled) {
      reopenSuppression.markSuppressed(current.sourceBlockId);
    }
    updateDragState(null);
  }, [dragStateRef, updateDragState, reopenSuppression]);

  const handleDragEscape = useCallback(
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
    onMove: handleDragMove,
    onUp: handleDragUp,
    onCancel: handleDragCancel,
    onEscape: handleDragEscape,
  });

  const dismissMenu = useCallback(() => setMenuState(null), []);
  const closeMenu = useCallback(() => {
    setMenuState(null);
    focusEditor();
  }, [focusEditor]);
  useDismissOnOutsideOrEscape({
    active: menuState !== null,
    allowSelectors: MEDIA_MENU_DISMISS_ALLOW_SELECTORS,
    element,
    onEscapeDismiss: closeMenu,
    onOutsideDismiss: dismissMenu,
  });

  // block-side-menu.tsx의 refreshBlockMenuGeometry와 같은 이유·같은 패턴
  // (Issue #187 RD-001 DELTA-03) — 열린 메뉴가 스크롤·리사이즈 중에도
  // media 블록을 따라가게 한다. DELTA-01은 열 때만 위치를 계산하고 이
  // 리스너를 이식하지 않아 스크롤하면 메뉴가 클릭 시점 좌표에 멈춰
  // 있었다(e2e 실측 발견). top 공식(rect.top + 28)은 handleHandleClick의
  // open 계산과 반드시 같아야 한다 — computeGutterTopOffset은 쓰지 않는다
  // (media의 첫 자식은 heading이 될 수 없어 항상 0을 반환, block-side-menu
  // 쪽과 결과가 같지만 media는 애초에 그 개념이 없어 직접 호출하지
  // 않는다).
  useEffect(() => {
    if (element === null) return;
    const ownerWindow = element.ownerDocument.defaultView;
    if (ownerWindow === null) return;

    const refreshMenuGeometry = () => {
      setMenuState((current) => {
        if (current === null) return null;
        const blockElement = findElementByAttribute(
          element,
          null,
          "data-geul-block-id",
          current.blockId,
        );
        if (blockElement === null) return current;
        // overlayRect·onOpen과 같은 이유로 래퍼가 아니라 실제 시각 요소를
        // 앵커로 쓴다.
        const anchorElement =
          findMediaVisualElement(blockElement) ?? blockElement;
        const rect = anchorElement.getBoundingClientRect();
        const left = rect.left;
        const top = rect.top + 28;
        return current.left === left && current.top === top
          ? current
          : { ...current, left, top };
      });
    };

    ownerWindow.addEventListener("scroll", refreshMenuGeometry, true);
    ownerWindow.addEventListener("resize", refreshMenuGeometry);
    return () => {
      ownerWindow.removeEventListener("scroll", refreshMenuGeometry, true);
      ownerWindow.removeEventListener("resize", refreshMenuGeometry);
    };
  }, [element]);

  const hoverElement =
    hoverBlockId === null || element === null
      ? null
      : findElementByAttribute(
          element,
          null,
          "data-geul-block-id",
          hoverBlockId,
        );
  const overlayRect =
    hoverElement === null
      ? null
      : readPageRect(findMediaVisualElement(hoverElement) ?? hoverElement);

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
    event.preventDefault();
    reopenSuppression.onPointerDown(
      menuState !== null && menuState.blockId === blockId ? blockId : null,
    );
    event.currentTarget.setPointerCapture(event.pointerId);
    setMenuState(null);
    updateDragState({
      pointerId: event.pointerId,
      sourceBlockId: blockId,
      startX: event.clientX,
      startY: event.clientY,
      hasDragged: false,
      cancelled: false,
      guide: null,
      mode: "reorder",
      rangeSelectCandidateBlockId: null,
      rangeSelection: null,
    });
  };

  const handleHandleClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    blockId: string,
  ) => {
    resolveReopenAwareClick(
      reopenSuppression,
      event,
      {
        suppressionKey: blockId,
        reopenKey: blockId,
        isCurrentlyOpen: menuState !== null && menuState.blockId === blockId,
      },
      {
        onClose: closeMenu,
        onOpen: () => {
          if (hoverElement === null) return;
          // 메뉴(BlockSideMenuMenu)는 useClampedMenuPosition을 통해
          // viewport-relative(position: fixed) 좌표를 기대한다 —
          // readPageRect(page-relative, absolute용)를 그대로 넘기면 스크롤된
          // 문서에서 엉뚱한 위치에 뜬다. 클릭 시점에 getBoundingClientRect()를
          // 별도로 다시 읽는다(block-side-menu.tsx의 hoverBounds와 동일 계산).
          // overlayRect와 같은 이유로 래퍼가 아니라 실제 시각 요소를 앵커로
          // 쓴다 — 그립이 이미지 옆에 뜨는데 메뉴만 래퍼 왼쪽에서 열리면
          // 버튼과 메뉴가 서로 멀어진다.
          const anchorElement =
            findMediaVisualElement(hoverElement) ?? hoverElement;
          const rect = anchorElement.getBoundingClientRect();
          setMenuState({ blockId, left: rect.left, top: rect.top + 28 });
        },
      },
    );
  };

  return (
    <>
      {overlayRect !== null && hoverBlockId !== null && (
        <div
          className="geul-media-handle-overlay"
          style={{
            left: overlayRect.left - MEDIA_HANDLE_OFFSET_PX,
            top: overlayRect.top,
          }}
        >
          <IconButton
            className={`${mediaGutterButtonClassName} geul-block-gutter__button--drag`}
            data-geul-block-handle=""
            icon={dragHandleIcon}
            label={dictionary.handle.dragBlock}
            onClick={(event) => handleHandleClick(event, hoverBlockId)}
            onPointerDown={(event) =>
              handlePointerDownOnHandle(event, hoverBlockId)
            }
          />
          <IconButton
            className={`${mediaGutterButtonClassName} geul-block-gutter__button--add`}
            data-geul-add-block-button=""
            icon={addBlockIcon}
            label={dictionary.handle.addBlock}
            onClick={handleAddBlockClick}
          />
        </div>
      )}
      {/* block-side-menu.tsx가 쓰는 것과 같은 클래스 — 드래그 중인 블록이
          놓일 위치를 보여주는 시각 표시(pointer-events-none)다. 동시에
          활성일 수 있는 드래그는 하나뿐이라 두 컴포넌트가 각자 렌더해도
          충돌하지 않는다. */}
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
      {menuState !== null && (
        <BlockSideMenuMenu
          blockId={menuState.blockId}
          left={menuState.left}
          onClose={closeMenu}
          top={menuState.top}
        />
      )}
    </>
  );
};
