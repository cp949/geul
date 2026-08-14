import type { BlockTypeDescriptor } from "@cp949/geul-core";
import { useCallback, useEffect, useRef, useState } from "react";

import { useEditor, useEditorMount } from "./use-editor.js";

type MenuItem = {
  id: string;
  label: string;
  description: string;
  keywords: readonly string[];
  blockType: BlockTypeDescriptor;
};

const MENU_ITEMS: readonly MenuItem[] = [
  {
    id: "paragraph",
    label: "Text",
    description: "Plain paragraph text",
    keywords: ["text", "paragraph", "p"],
    blockType: { type: "paragraph" },
  },
  {
    id: "heading-1",
    label: "Heading 1",
    description: "Large section heading",
    keywords: ["heading", "h1", "title"],
    blockType: { type: "heading", level: 1 },
  },
  {
    id: "heading-2",
    label: "Heading 2",
    description: "Medium section heading",
    keywords: ["heading", "h2", "subtitle"],
    blockType: { type: "heading", level: 2 },
  },
  {
    id: "heading-3",
    label: "Heading 3",
    description: "Small section heading",
    keywords: ["heading", "h3"],
    blockType: { type: "heading", level: 3 },
  },
];

const parseSlashQuery = (text: string): string | null => {
  const match = /^\/(\S*)$/.exec(text);
  return match === null ? null : (match[1] ?? "");
};

const matchesQuery = (item: MenuItem, query: string): boolean => {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return (
    item.label.toLowerCase().includes(needle) ||
    item.keywords.some((keyword) => keyword.startsWith(needle))
  );
};

const filterItems = (query: string): MenuItem[] =>
  MENU_ITEMS.filter((item) => matchesQuery(item, query));

type MenuPosition = { left: number; top: number };

type MenuState = {
  blockId: string;
  query: string;
  highlightedIndex: number;
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
      if (target.closest(".be-add-block-button") !== null) return;

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

  const items = menuState === null ? [] : filterItems(menuState.query);

  const focusEditor = useCallback(() => {
    element?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
  }, [element]);

  const selectItem = useCallback(
    (item: MenuItem) => {
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

  return (
    <>
      {hoverBounds !== null && (
        <button
          aria-label="Add block"
          className="be-add-block-button"
          onClick={handleAddBlockClick}
          onMouseDown={(event) => event.preventDefault()}
          style={{ left: hoverBounds.left, top: hoverBounds.top }}
          type="button"
        >
          +
        </button>
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
