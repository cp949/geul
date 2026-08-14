import { useCallback, useEffect, useRef, useState } from "react";

import {
  BLOCK_TYPE_OPTIONS,
  type BlockTypeOption,
} from "./block-type-options.js";
import { useEditor, useEditorMount } from "./use-editor.js";

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
        target.closest(".be-add-block-button") !== null ||
        target.closest(".be-block-handle") !== null ||
        target.closest(".be-block-menu") !== null
      ) {
        return;
      }

      const blockElement = target.closest<HTMLElement>("[data-be-block-id]");
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

  useEffect(() => {
    if (blockMenuState === null || element === null) return;
    const ownerDocument = element.ownerDocument;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".be-block-menu") !== null) return;
      if (target.closest(".be-block-handle") !== null) return;
      setBlockMenuState(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setBlockMenuState(null);
        focusEditor();
      }
    };

    ownerDocument.addEventListener("pointerdown", handlePointerDown);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [blockMenuState, element, focusEditor]);

  const hoverBounds = (() => {
    if (hoverBlockId === null || element === null) return null;
    const blockElement = element.querySelector<HTMLElement>(
      `[data-be-block-id="${hoverBlockId}"]`,
    );
    if (blockElement === null) return null;
    const rect = blockElement.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  })();

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
          className="be-block-gutter"
          style={{ left: hoverBounds.left, top: hoverBounds.top }}
        >
          <button
            aria-label="Drag to reorder"
            className="be-block-handle"
            onClick={(event) => handleHandleClick(event, hoverBlockId)}
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={(event) =>
              handlePointerDownOnHandle(event, hoverBlockId)
            }
            type="button"
          >
            ⠿
          </button>
          <button
            aria-label="Add block"
            className="be-add-block-button"
            onClick={handleAddBlockClick}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            +
          </button>
        </div>
      )}
      {dragState?.guide !== null && dragState?.guide !== undefined && (
        <div
          className="be-block-insertion-guide"
          style={{
            left: dragState.guide.left,
            top: dragState.guide.top,
            width: dragState.guide.width,
          }}
        />
      )}
      {blockMenuState !== null && (
        <div
          aria-label="Block menu"
          className="be-block-menu"
          role="menu"
          style={{ left: blockMenuState.left, top: blockMenuState.top }}
        >
          <p className="be-block-menu-section-label">Turn into</p>
          {BLOCK_TYPE_OPTIONS.map((option) => (
            <button
              className="be-block-menu-item"
              key={option.id}
              onClick={() => handleTurnInto(option)}
              onMouseDown={(event) => event.preventDefault()}
              role="menuitem"
              type="button"
            >
              {option.label}
            </button>
          ))}
          <hr className="be-block-menu-separator" />
          <button
            className="be-block-menu-item"
            onClick={handleDuplicate}
            onMouseDown={(event) => event.preventDefault()}
            role="menuitem"
            type="button"
          >
            Duplicate
          </button>
          <button
            className="be-block-menu-item be-block-menu-item-danger"
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
