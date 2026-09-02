import type { BlockTypeDescriptor } from "@cp949/geul-core";
import { useCallback, useEffect, useRef, useState } from "react";

import { BlockSelectionToolbar } from "./block-selection-toolbar.js";
import { BlockSideMenu } from "./block-side-menu.js";
import {
  BLOCK_TYPE_OPTIONS,
  getBlockTypeOptionsForSource,
} from "./block-type-options.js";
import { CodeBlockLanguageCombobox } from "./code-block-language-combobox.js";
import { TableHandles } from "./table-handles.js";
import { TableSelectionToolbar } from "./table-selection-toolbar.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";

const SLASH_MENU_DISMISS_ALLOW_SELECTORS = [".geul-slash-menu"] as const;
// Escape는 effect 등록 race가 없는 상시 element keydown listener가 소유한다.
const IGNORE_ESCAPE_DISMISS = () => {};

const parseSlashQuery = (text: string): string | null => {
  const match = /^\/(\S*)$/.exec(text);
  return match === null ? null : (match[1] ?? "");
};

// 표 삽입은 setBlockType로 표현할 수 없는 별도 동작(현재 블록을 표로 바꾸는 게
// 아니라 뒤에 표를 새로 삽입)이라, block-type-options.ts의 BLOCK_TYPE_OPTIONS와는
// 분리된 kind로 다룬다. BlockSideMenu의 "Turn into" 목록은 BLOCK_TYPE_OPTIONS만
// 그대로 쓰므로 표 항목이 섞여 들어가지 않는다.
type SlashMenuItem =
  | ({ kind: "blockType" } & (typeof BLOCK_TYPE_OPTIONS)[number])
  | {
      kind: "insertTable";
      id: string;
      label: string;
      description: string;
      keywords: readonly string[];
    }
  | {
      kind: "insertDivider";
      id: string;
      label: string;
      description: string;
      keywords: readonly string[];
    };

const TABLE_SLASH_ITEM: SlashMenuItem = {
  kind: "insertTable",
  id: "table",
  label: "Table",
  description: "Insert a table",
  keywords: ["table", "grid"],
};

const DIVIDER_SLASH_ITEM: SlashMenuItem = {
  kind: "insertDivider",
  id: "divider",
  label: "Divider",
  description: "Insert a horizontal divider",
  keywords: ["divider", "hr", "separator"],
};

const getSlashMenuItems = (
  source: BlockTypeDescriptor,
): readonly SlashMenuItem[] => [
  ...getBlockTypeOptionsForSource(source).map((option) => ({
    kind: "blockType" as const,
    ...option,
  })),
  TABLE_SLASH_ITEM,
  DIVIDER_SLASH_ITEM,
];

const matchesQuery = (item: SlashMenuItem, query: string): boolean => {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return (
    item.label.toLowerCase().includes(needle) ||
    item.keywords.some((keyword) => keyword.startsWith(needle))
  );
};

const filterItems = (
  source: BlockTypeDescriptor,
  query: string,
): SlashMenuItem[] =>
  getSlashMenuItems(source).filter((item) => matchesQuery(item, query));

type MenuPosition = { left: number; top: number };

type MenuState = {
  blockId: string;
  sourceBlockType: BlockTypeDescriptor;
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
  const { menuRef, style } = useClampedMenuPosition(
    menuState?.left ?? 0,
    menuState?.top ?? 0,
  );
  // 메뉴가 열릴 때(menuState: null → non-null)만 keydown 리스너를 붙이면,
  // "/head" 마지막 글자 입력으로 setMenuState가 실행된 뒤 이 effect가
  // 커밋되기 전에 Escape가 도착하는 레이스가 있었다(React 18+의 useEffect는
  // paint 이후 비동기로 실행되고, CPU가 몰리는 Playwright 병렬 실행에서
  // 지연이 커진다). 리스너를 element가 존재하는 동안 항상 붙여두고, 매
  // keydown마다 ref로 최신 menuState를 읽어 열려 있을 때만 처리한다.
  const menuStateRef = useRef<MenuState | null>(null);
  menuStateRef.current = menuState;
  const focusEditor = useFocusEditor(element);
  // hover-open("+" 버튼)은 실제 slash 문자 없이도 메뉴를 열어야 하므로,
  // 어느 blockId가 그렇게 명시적으로 열렸는지 추적해 빈 텍스트에서도
  // selectionchange 폴링이 메뉴를 즉시 닫지 않게 한다.
  const explicitOpenBlockIdRef = useRef<string | null>(null);
  // Escape는 메뉴 UI만 닫을 뿐 입력된 "/query" 텍스트는 지우지 않는다.
  // selectionchange는 브라우저가 지연·재발생시킬 수 있어(특히 빠른 연속
  // 입력 직후), Escape로 닫힌 직후 같은 텍스트로 재발생한 selectionchange가
  // 방금 닫은 메뉴를 곧바로 재오픈하는 레이스가 있었다(Playwright 병렬
  // 실행에서만 간헐 재현). 닫을 때의 blockId+텍스트를 기억해두고, 텍스트가
  // 실제로 바뀌기 전까지는 같은 쿼리로 재오픈하지 않는다.
  const dismissedQueryRef = useRef<{ blockId: string; text: string } | null>(
    null,
  );
  const dismissMenu = useCallback(() => {
    const context = editor.getCaretBlockContext();
    dismissedQueryRef.current =
      context === null
        ? null
        : { blockId: context.blockId, text: context.text };
    explicitOpenBlockIdRef.current = null;
    setMenuState(null);
  }, [editor]);
  const dismissMenuAndFocusEditor = useCallback(() => {
    dismissMenu();
    focusEditor();
  }, [dismissMenu, focusEditor]);

  const openMenuAt = (
    blockId: string,
    sourceBlockType: BlockTypeDescriptor,
    query: string,
  ) => {
    explicitOpenBlockIdRef.current = query.length === 0 ? blockId : null;
    dismissedQueryRef.current = null;
    const bounds = element === null ? null : readCaretBounds(element);
    setMenuState((current) => ({
      blockId,
      sourceBlockType,
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
        dismissedQueryRef.current = null;
        setMenuState(null);
        return;
      }

      // CodeBlock source는 슬래시 명령 입력이 아니라 그대로 보존할 코드다.
      // 텍스트 shape만 보면 paragraph의 "/query"와 구분할 수 없으므로 core가
      // 제공하는 blockType discriminator를 먼저 확인한다.
      if (context.blockType.type === "codeBlock") {
        explicitOpenBlockIdRef.current = null;
        dismissedQueryRef.current = null;
        setMenuState(null);
        return;
      }

      const dismissed = dismissedQueryRef.current;
      if (
        dismissed !== null &&
        dismissed.blockId === context.blockId &&
        dismissed.text === context.text
      ) {
        return;
      }
      if (dismissed !== null) dismissedQueryRef.current = null;

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
        sourceBlockType: context.blockType,
        query: resolvedQuery,
        highlightedIndex:
          current !== null && current.blockId === context.blockId
            ? Math.min(
                current.highlightedIndex,
                Math.max(
                  filterItems(context.blockType, resolvedQuery).length - 1,
                  0,
                ),
              )
            : 0,
        left: bounds?.left ?? current?.left ?? 96,
        top: bounds?.top ?? current?.top ?? 48,
      }));
    };

    const ownerDocument = element?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    ownerDocument?.addEventListener("selectionchange", updateFromCaret);
    ownerDocument?.addEventListener("input", updateFromCaret);
    ownerWindow?.addEventListener("scroll", updateFromCaret, true);
    ownerWindow?.addEventListener("resize", updateFromCaret);
    updateFromCaret();
    return () => {
      ownerDocument?.removeEventListener("selectionchange", updateFromCaret);
      ownerDocument?.removeEventListener("input", updateFromCaret);
      ownerWindow?.removeEventListener("scroll", updateFromCaret, true);
      ownerWindow?.removeEventListener("resize", updateFromCaret);
    };
  }, [editor, element]);

  const items =
    menuState === null
      ? []
      : filterItems(menuState.sourceBlockType, menuState.query);

  const selectItem = useCallback(
    (item: SlashMenuItem) => {
      const current = menuStateRef.current;
      if (current === null) return;
      if (item.kind === "blockType") {
        editor.commands.setBlockType(current.blockId, item.blockType, {
          clearContent: true,
        });
      } else if (item.kind === "insertTable") {
        editor.commands.insertTable(
          current.blockId,
          { rows: 3, columns: 3 },
          { clearAfterBlockText: true },
        );
      } else {
        editor.commands.insertDivider(current.blockId, {
          clearAfterBlockText: true,
        });
      }
      explicitOpenBlockIdRef.current = null;
      dismissedQueryRef.current = null;
      setMenuState(null);
      focusEditor();
    },
    [editor, focusEditor],
  );

  useDismissOnOutsideOrEscape({
    active: menuState !== null,
    element,
    allowSelectors: SLASH_MENU_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissMenu,
    onEscapeDismiss: IGNORE_ESCAPE_DISMISS,
  });

  useEffect(() => {
    if (element === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const current = menuStateRef.current;
      if (current === null) return;

      if (event.key === "Escape") {
        event.preventDefault();
        dismissMenuAndFocusEditor();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMenuState((currentState) => {
          if (currentState === null) return null;
          const count = Math.max(
            filterItems(currentState.sourceBlockType, currentState.query)
              .length,
            1,
          );
          return {
            ...currentState,
            highlightedIndex: (currentState.highlightedIndex + 1) % count,
          };
        });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMenuState((currentState) => {
          if (currentState === null) return null;
          const count = Math.max(
            filterItems(currentState.sourceBlockType, currentState.query)
              .length,
            1,
          );
          return {
            ...currentState,
            highlightedIndex:
              (currentState.highlightedIndex - 1 + count) % count,
          };
        });
        return;
      }
      if (event.key === "Enter") {
        const currentItems = filterItems(
          current.sourceBlockType,
          current.query,
        );
        const item = currentItems[current.highlightedIndex];
        if (item !== undefined) {
          event.preventDefault();
          selectItem(item);
        }
      }
    };

    element.addEventListener("keydown", handleKeyDown, true);
    return () => element.removeEventListener("keydown", handleKeyDown, true);
  }, [dismissMenuAndFocusEditor, element, selectItem]);

  return (
    <>
      <BlockSideMenu
        onBlockAdded={(blockId) =>
          openMenuAt(blockId, { type: "paragraph" }, "")
        }
      />
      <CodeBlockLanguageCombobox />
      <TableHandles />
      <TableSelectionToolbar />
      <BlockSelectionToolbar />
      {menuState !== null && (
        <div
          aria-label="Slash menu"
          className="geul-slash-menu"
          ref={menuRef}
          role="listbox"
          style={style}
        >
          {items.length === 0 && (
            <p className="geul-slash-menu__empty">No matches</p>
          )}
          {items.map((item, index) => (
            <button
              aria-selected={index === menuState.highlightedIndex}
              className="geul-slash-menu__item"
              key={item.id}
              onClick={() => selectItem(item)}
              onPointerDown={(event) => event.preventDefault()}
              role="option"
              type="button"
            >
              <span className="geul-slash-menu__item-label">{item.label}</span>
              <span className="geul-slash-menu__item-description">
                {item.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
};
