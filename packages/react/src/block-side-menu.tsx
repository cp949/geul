import { GripVertical, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  BLOCK_TYPE_OPTIONS,
  type BlockTypeOption,
} from "./block-type-options.js";
import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";

// 핸들은 드래그(재정렬)와 클릭(블록 메뉴) 두 동작을 모두 갖는다 — tooltip이
// 한쪽만 안내하면 나머지 동작의 발견성을 가리므로 라벨이 둘 다 기술한다.
const dragHandleLabel = "Drag to reorder, click for options";
const addBlockLabel = "Add block";

const dragHandleIcon = <GripVertical {...iconProps} />;
const addBlockIcon = <Plus {...iconProps} />;

type InsertionGuide = {
  beforeBlockId: string | null;
  left: number;
  top: number;
  width: number;
};

type DragState = {
  pointerId: number;
  sourceBlockId: string;
  startX: number;
  startY: number;
  hasDragged: boolean;
  cancelled: boolean;
  guide: InsertionGuide | null;
};

type BlockMenuState = {
  blockId: string;
  left: number;
  top: number;
};

type BlockSideMenuProps = {
  onBlockAdded: (blockId: string) => void;
};

// flex 센터링은 IconButton이 공통으로 제공한다.
const blockGutterButtonClassName =
  "geul:h-6 geul:w-6 geul:rounded geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:bg-[var(--be-color-surface,#fff)] geul:p-0 geul:text-[color:var(--be-color-text,#202124)]";

const blockMenuItemClassName =
  "geul:cursor-pointer geul:rounded geul:border-0 geul:bg-transparent geul:px-2 geul:py-1.5 geul:text-left geul:hover:bg-[var(--be-color-accent-muted,#e8f0fe)]";

// useDismissOnOutsideOrEscape allow-list. table-handles.tsx,
// table-selection-toolbar.tsx와 같은 이유로 모듈 스코프 상수로 둔다 —
// 매 렌더 새 배열을 넘기면 그 훅의 effect가 리스너를 매 렌더 떼었다
// 다시 붙인다.
const BLOCK_MENU_DISMISS_ALLOW_SELECTORS = [
  "[data-be-block-menu]",
  "[data-be-block-handle]",
] as const;

export const BlockSideMenu = ({ onBlockAdded }: BlockSideMenuProps) => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [blockMenuState, setBlockMenuState] = useState<BlockMenuState | null>(
    null,
  );
  const dragStateRef = useRef<DragState | null>(null);
  const suppressedHandleClickBlockIdRef = useRef<string | null>(null);
  const updateDragState = useCallback((next: DragState | null) => {
    dragStateRef.current = next;
    setDragState(next);
  }, []);
  const focusEditor = useCallback(() => {
    element?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
  }, [element]);

  useEffect(() => {
    if (element === null) return;
    const ownerDocument = element.ownerDocument;

    // 리스너를 element가 아닌 document에 둔다. gutter는 contenteditable
    // 바깥의 오버레이라서 element 안쪽에서만 hover를 추적하면 포인터가
    // 버튼으로 이동하는 순간 사라진다.
    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest("[data-be-add-block-button]") !== null ||
        target.closest("[data-be-block-handle]") !== null ||
        target.closest("[data-be-block-menu]") !== null
      ) {
        return;
      }

      // table은 자체 행/열 핸들(table-handles.tsx)을 가지므로 이 거터
      // 대상에서 제외한다 — 제외하지 않으면 두 오버레이의 gutter가 표의
      // 왼쪽 부근에서 겹쳐 렌더된다.
      const blockElement = target.closest<HTMLElement>(
        "[data-be-block-id]:not(table)",
      );
      setHoverBlockId(
        blockElement !== null && element.contains(blockElement)
          ? blockElement.getAttribute("data-be-block-id")
          : null,
      );
    };

    ownerDocument.addEventListener("pointermove", handlePointerMove);
    return () =>
      ownerDocument.removeEventListener("pointermove", handlePointerMove);
  }, [element]);

  const isDragging = dragState !== null;

  // 네이티브 drag는 CDP 자동화에서 OS 레벨로 제어권이 넘어가는 환경이
  // 있으므로 Pointer Event로 재정렬한다. 실제 drag 뒤 브라우저가 합성하는
  // click은 메뉴 열기로 해석하지 않는다.
  useEffect(() => {
    if (!isDragging || element === null) return;
    const ownerDocument = element.ownerDocument;

    const computeGuide = (clientY: number, current: DragState) => {
      const blockElements = Array.from(
        element.querySelectorAll<HTMLElement>("[data-be-block-id]"),
      );
      const ids = blockElements.map((candidate) =>
        candidate.getAttribute("data-be-block-id"),
      );
      const targetIndex = blockElements.findIndex((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return clientY < rect.top + rect.height / 2;
      });
      const sourceIndex = ids.indexOf(current.sourceBlockId);
      const effectiveTargetIndex =
        targetIndex === -1 ? ids.length : targetIndex;
      const isNoop =
        effectiveTargetIndex === sourceIndex ||
        effectiveTargetIndex === sourceIndex + 1;
      if (isNoop) return null;

      const guideElement =
        targetIndex === -1
          ? blockElements[blockElements.length - 1]
          : blockElements[targetIndex];
      if (guideElement === undefined) return null;

      const rect = guideElement.getBoundingClientRect();
      return {
        beforeBlockId: targetIndex === -1 ? null : (ids[targetIndex] ?? null),
        left: rect.left,
        top: targetIndex === -1 ? rect.bottom : rect.top,
        width: rect.width,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const current = dragStateRef.current;
      if (current === null || event.pointerId !== current.pointerId) return;
      if (current.cancelled) return;
      const hasDragged =
        current.hasDragged ||
        Math.hypot(
          event.clientX - current.startX,
          event.clientY - current.startY,
        ) >= 4;
      updateDragState({
        ...current,
        hasDragged,
        guide: hasDragged ? computeGuide(event.clientY, current) : null,
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = dragStateRef.current;
      if (current === null || event.pointerId !== current.pointerId) return;
      if (!current.cancelled && current.guide !== null) {
        editor.commands.moveBlockBefore(
          current.sourceBlockId,
          current.guide.beforeBlockId,
        );
      }
      if (current.hasDragged || current.cancelled) {
        suppressedHandleClickBlockIdRef.current = current.sourceBlockId;
      }
      updateDragState(null);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const current = dragStateRef.current;
      if (current === null || event.pointerId !== current.pointerId) return;
      if (current.hasDragged || current.cancelled) {
        suppressedHandleClickBlockIdRef.current = current.sourceBlockId;
      }
      updateDragState(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        const current = dragStateRef.current;
        if (current === null) return;
        updateDragState({ ...current, cancelled: true, guide: null });
      }
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
  }, [isDragging, element, editor, updateDragState]);

  // 블록 메뉴는 바깥 pointerdown과 Escape로 닫는다(PIT-0009: 키보드로
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

  const hoverBounds = (() => {
    if (hoverBlockId === null || element === null) return null;
    // 블록 id는 임의 문자열이라 attribute selector에 보간하면 따옴표·백슬래시에서
    // SyntaxError가 난다. computeGuide와 같은 속성값 비교로 찾는다.
    // (CSS.escape는 jsdom 테스트 환경에 없다.)
    const blockElement =
      Array.from(
        element.querySelectorAll<HTMLElement>("[data-be-block-id]"),
      ).find(
        (candidate) =>
          candidate.getAttribute("data-be-block-id") === hoverBlockId,
      ) ?? null;
    if (blockElement === null) return null;
    const rect = blockElement.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  })();

  const gutterClamp = useClampedMenuPosition(
    hoverBounds?.left ?? 0,
    hoverBounds?.top ?? 0,
    "leftOfAnchor",
  );
  const blockMenuClamp = useClampedMenuPosition(
    blockMenuState?.left ?? 0,
    blockMenuState?.top ?? 0,
  );

  const handleAddBlockClick = () => {
    if (hoverBlockId === null) return;
    const result = editor.commands.insertParagraphAfter(hoverBlockId);
    setHoverBlockId(null);
    if (result.ok) onBlockAdded(result.value.blockId);
  };

  const handlePointerDownOnHandle = (
    event: React.PointerEvent<HTMLButtonElement>,
    blockId: string,
  ) => {
    if (event.button !== 0) return;
    suppressedHandleClickBlockIdRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    setBlockMenuState(null);
    updateDragState({
      pointerId: event.pointerId,
      sourceBlockId: blockId,
      startX: event.clientX,
      startY: event.clientY,
      hasDragged: false,
      cancelled: false,
      guide: null,
    });
  };

  const handleHandleClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    blockId: string,
  ) => {
    const suppressedBlockId = suppressedHandleClickBlockIdRef.current;
    suppressedHandleClickBlockIdRef.current = null;
    if (event.detail !== 0 && suppressedBlockId === blockId) {
      return;
    }
    if (hoverBounds === null) return;
    setBlockMenuState((current) =>
      current !== null && current.blockId === blockId
        ? null
        : { blockId, left: hoverBounds.left, top: hoverBounds.top + 28 },
    );
  };

  const handleTurnInto = (item: BlockTypeOption) => {
    if (blockMenuState === null) return;
    editor.commands.setBlockType(blockMenuState.blockId, item.blockType);
    setBlockMenuState(null);
    focusEditor();
  };

  const handleDuplicate = () => {
    if (blockMenuState === null) return;
    editor.commands.duplicateBlock(blockMenuState.blockId);
    setBlockMenuState(null);
    focusEditor();
  };

  const handleDeleteBlock = () => {
    if (blockMenuState === null) return;
    editor.commands.deleteBlock(blockMenuState.blockId);
    setBlockMenuState(null);
    focusEditor();
  };

  return (
    <>
      {hoverBounds !== null && hoverBlockId !== null && (
        <div
          className="geul:fixed geul:z-10 geul:flex geul:gap-0.5 geul:[transform:translate(-3.5rem,0)]"
          ref={gutterClamp.menuRef}
          style={gutterClamp.style}
        >
          <IconButton
            className={`${blockGutterButtonClassName} geul:cursor-grab geul:active:cursor-grabbing`}
            data-be-block-handle=""
            icon={dragHandleIcon}
            label={dragHandleLabel}
            onClick={(event) => handleHandleClick(event, hoverBlockId)}
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={(event) =>
              handlePointerDownOnHandle(event, hoverBlockId)
            }
          />
          <IconButton
            className={`${blockGutterButtonClassName} geul:cursor-pointer`}
            data-be-add-block-button=""
            icon={addBlockIcon}
            label={addBlockLabel}
            onClick={handleAddBlockClick}
            onMouseDown={(event) => event.preventDefault()}
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
          className="geul:fixed geul:z-10 geul:h-0.5 geul:bg-[var(--be-color-accent,#1a73e8)] geul:pointer-events-none geul:[transform:translateY(-0.0625rem)]"
          data-be-block-insertion-guide=""
          style={{
            left: dragState.guide.left,
            top: dragState.guide.top,
            width: dragState.guide.width,
          }}
        />
      )}
      {/* max-h-[calc(100vh-1rem)] + overflow-y-auto: 클램프는 좌표만 접으므로
          뷰포트보다 큰 메뉴는 아래쪽 항목에 닿을 수 없다(PIT-0011 예방 규칙).
          1rem은 useClampedMenuPosition의 MENU_VIEWPORT_MARGIN 8px가 위·아래로
          두 번 들어간 값이라 클램프 결과와 정확히 맞물린다. R2에서 블록 타입
          목록이 늘면 일반 뷰포트에서도 넘친다. */}
      {blockMenuState !== null && (
        <div
          aria-label="Block menu"
          className="geul:fixed geul:z-10 geul:flex geul:max-h-[calc(100vh-1rem)] geul:w-40 geul:flex-col geul:gap-0.5 geul:overflow-y-auto geul:rounded-md geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:bg-[var(--be-color-surface,#fff)] geul:p-1 geul:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
          data-be-block-menu=""
          ref={blockMenuClamp.menuRef}
          role="menu"
          style={blockMenuClamp.style}
        >
          {/* text-[0.75rem]: text-xs는 line-height까지 방출해 구 CSS(font-size만
              지정, line-height 상속)와 달라진다 — font-size만 지정한다 */}
          <p className="geul:my-1 geul:mx-2 geul:text-[0.75rem] geul:text-[color:var(--be-color-text-muted,#5f6368)]">
            Turn into
          </p>
          {BLOCK_TYPE_OPTIONS.map((option) => (
            <button
              className={`${blockMenuItemClassName} geul:text-[color:var(--be-color-text,#202124)]`}
              key={option.id}
              onClick={() => handleTurnInto(option)}
              onMouseDown={(event) => event.preventDefault()}
              role="menuitem"
              type="button"
            >
              {option.label}
            </button>
          ))}
          {/* mx-0: preflight 미포함이라 UA의 margin-inline auto가 남으면
              flex column에서 hr이 0폭으로 붕괴한다 */}
          <hr className="geul:my-1 geul:mx-0 geul:border-0 geul:border-t geul:border-[color:var(--be-color-border,#dadce0)]" />
          <button
            className={`${blockMenuItemClassName} geul:text-[color:var(--be-color-text,#202124)]`}
            onClick={handleDuplicate}
            onMouseDown={(event) => event.preventDefault()}
            role="menuitem"
            type="button"
          >
            Duplicate
          </button>
          <button
            className={`${blockMenuItemClassName} geul:text-[color:var(--be-color-danger,#d93025)]`}
            onClick={handleDeleteBlock}
            onMouseDown={(event) => event.preventDefault()}
            role="menuitem"
            type="button"
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
};
