import { useCallback, useEffect, useRef, useState } from "react";

import {
  BLOCK_TYPE_OPTIONS,
  type BlockTypeOption,
} from "./block-type-options.js";
import { useEditor, useEditorMount } from "./use-editor.js";

const parseSlashQuery = (text: string): string | null => {
  const match = /^\/(\S*)$/.exec(text);
  return match === null ? null : (match[1] ?? "");
};

const matchesQuery = (item: BlockTypeOption, query: string): boolean => {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return (
    item.label.toLowerCase().includes(needle) ||
    item.keywords.some((keyword) => keyword.startsWith(needle))
  );
};

const filterItems = (query: string): BlockTypeOption[] =>
  BLOCK_TYPE_OPTIONS.filter((item) => matchesQuery(item, query));

type MenuPosition = { left: number; top: number };

type MenuState = {
  blockId: string;
  query: string;
  highlightedIndex: number;
} & MenuPosition;

type InsertionGuide = {
  beforeBlockId: string | null;
  left: number;
  top: number;
  width: number;
};

type DragState = {
  sourceBlockId: string;
  guide: InsertionGuide | null;
};

type BlockMenuState = {
  blockId: string;
} & MenuPosition;

const readCaretBounds = (element: HTMLElement): MenuPosition | null => {
  const selection = element.ownerDocument.getSelection();
  if (
    selection === null ||
    selection.rangeCount === 0 ||
    selection.anchorNode === null ||
    !element.contains(selection.anchorNode)
  ) {
    return null;
  }
  const bounds = selection.getRangeAt(0).getBoundingClientRect?.() ?? {
    left: 0,
    top: 0,
    height: 0,
  };
  return { left: bounds.left, top: bounds.top + bounds.height };
};

export const SlashMenu = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [blockMenuState, setBlockMenuState] = useState<BlockMenuState | null>(
    null,
  );
  // dragover/drop 핸들러는 드래그가 시작될 때 한 번만 등록되므로, 이후
  // dragover마다 갱신되는 최신 가이드 상태는 state가 아닌 ref로 읽는다.
  const dragStateRef = useRef<DragState | null>(null);
  const updateDragState = useCallback((next: DragState | null) => {
    dragStateRef.current = next;
    setDragState(next);
  }, []);
  // hover-open("+" 버튼)은 실제 slash 문자 없이도 메뉴를 열어야 하므로,
  // 어느 blockId가 그렇게 명시적으로 열렸는지 추적해 빈 텍스트에서도
  // selectionchange 폴링이 메뉴를 즉시 닫지 않게 한다.
  const explicitOpenBlockIdRef = useRef<string | null>(null);

  const openMenuAt = (blockId: string, query: string) => {
    explicitOpenBlockIdRef.current = query.length === 0 ? blockId : null;
    const bounds = element === null ? null : readCaretBounds(element);
    setMenuState((current) => ({
      blockId,
      query,
      highlightedIndex: 0,
      left: bounds?.left ?? current?.left ?? 96,
      top: bounds?.top ?? current?.top ?? 48,
    }));
  };

  useEffect(() => {
    const updateFromCaret = () => {
      const context = editor.getCaretBlockContext();
      if (context === null) {
        explicitOpenBlockIdRef.current = null;
        setMenuState(null);
        return;
      }

      const query = parseSlashQuery(context.text);
      const isExplicitEmptyOpen =
        context.text.length === 0 &&
        explicitOpenBlockIdRef.current === context.blockId;
      const resolvedQuery = query ?? (isExplicitEmptyOpen ? "" : null);

      if (resolvedQuery === null) {
        explicitOpenBlockIdRef.current = null;
        setMenuState(null);
        return;
      }

      const bounds = element === null ? null : readCaretBounds(element);
      setMenuState((current) => ({
        blockId: context.blockId,
        query: resolvedQuery,
        highlightedIndex:
          current !== null && current.blockId === context.blockId
            ? Math.min(
                current.highlightedIndex,
                Math.max(filterItems(resolvedQuery).length - 1, 0),
              )
            : 0,
        left: bounds?.left ?? current?.left ?? 96,
        top: bounds?.top ?? current?.top ?? 48,
      }));
    };

    const ownerDocument = element?.ownerDocument;
    ownerDocument?.addEventListener("selectionchange", updateFromCaret);
    ownerDocument?.addEventListener("input", updateFromCaret);
    updateFromCaret();
    return () => {
      ownerDocument?.removeEventListener("selectionchange", updateFromCaret);
      ownerDocument?.removeEventListener("input", updateFromCaret);
    };
  }, [editor, element]);

  useEffect(() => {
    if (element === null) return;
    const ownerDocument = element.ownerDocument;

    // 리스너를 element가 아닌 document에 둔다: "+" 버튼은 element(에디터
    // contenteditable) 밖의 오버레이라서, element 안쪽에만 리스너를 걸면
    // 포인터가 블록에서 버튼으로 이동하는 순간 element 경계를 벗어나
    // hover 상태가 즉시 꺼져 버튼을 클릭하기 전에 사라진다.
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

  // 블록 재정렬은 네이티브 HTML5 drag-and-drop 대신 Pointer Event로
  // 직접 구현한다. 네이티브 drag는 OS 레벨로 제어권이 넘어가 CDP 기반
  // 자동화(Playwright)에서 dragover 이후 입력이 전달되지 않고 멈추는
  // 환경이 있어(테스트로 확인) 표 열 너비 조절과 같은 방식으로 통일했다.
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
      if (current === null) return;
      updateDragState({
        ...current,
        guide: computeGuide(event.clientY, current),
      });
    };

    const handlePointerUp = () => {
      const current = dragStateRef.current;
      if (current?.guide) {
        editor.commands.moveBlockBefore(
          current.sourceBlockId,
          current.guide.beforeBlockId,
        );
      }
      updateDragState(null);
    };

    const handlePointerCancel = () => updateDragState(null);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        updateDragState(null);
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

    const closeMenu = () => setBlockMenuState(null);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".be-block-menu") !== null) return;
      if (target.closest(".be-block-handle") !== null) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };

    ownerDocument.addEventListener("pointerdown", handlePointerDown);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [blockMenuState, element]);

  const items = menuState === null ? [] : filterItems(menuState.query);

  const focusEditor = useCallback(() => {
    element?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
  }, [element]);

  const selectItem = useCallback(
    (item: BlockTypeOption) => {
      if (menuState === null) return;
      editor.commands.setBlockType(menuState.blockId, item.blockType, {
        clearContent: true,
      });
      explicitOpenBlockIdRef.current = null;
      setMenuState(null);
      focusEditor();
    },
    [editor, menuState, focusEditor],
  );

  useEffect(() => {
    if (menuState === null || element === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        explicitOpenBlockIdRef.current = null;
        setMenuState(null);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMenuState((current) => {
          if (current === null) return null;
          const count = Math.max(filterItems(current.query).length, 1);
          return {
            ...current,
            highlightedIndex: (current.highlightedIndex + 1) % count,
          };
        });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMenuState((current) => {
          if (current === null) return null;
          const count = Math.max(filterItems(current.query).length, 1);
          return {
            ...current,
            highlightedIndex: (current.highlightedIndex - 1 + count) % count,
          };
        });
        return;
      }
      if (event.key === "Enter") {
        const currentItems = filterItems(menuState.query);
        const item = currentItems[menuState.highlightedIndex];
        if (item !== undefined) {
          event.preventDefault();
          selectItem(item);
        }
      }
    };

    element.addEventListener("keydown", handleKeyDown, true);
    return () => element.removeEventListener("keydown", handleKeyDown, true);
  }, [menuState, element, selectItem]);

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
    if (!result.ok) return;
    openMenuAt(result.value.blockId, "");
  };

  const handlePointerDownOnHandle = (
    event: React.PointerEvent<HTMLButtonElement>,
    blockId: string,
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setBlockMenuState(null);
    updateDragState({ sourceBlockId: blockId, guide: null });
  };

  const handleHandleClick = (blockId: string) => {
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
            onClick={() => handleHandleClick(hoverBlockId)}
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
      {menuState !== null && (
        <div
          aria-label="Slash menu"
          className="be-slash-menu"
          role="listbox"
          style={{ left: menuState.left, top: menuState.top }}
        >
          {items.length === 0 && (
            <p className="be-slash-menu-empty">No matches</p>
          )}
          {items.map((item, index) => (
            <button
              aria-selected={index === menuState.highlightedIndex}
              className="be-slash-menu-item"
              key={item.id}
              onClick={() => selectItem(item)}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
              type="button"
            >
              <span className="be-slash-menu-item-label">{item.label}</span>
              <span className="be-slash-menu-item-description">
                {item.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
};
