import type {
  BlockTypeDescriptor,
  Dictionary,
  EditorController,
  MediaBlockKind,
} from "@cp949/geul-core";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { BlockSelectionToolbar } from "./block-selection-toolbar.js";
import { BlockSideMenu } from "./block-side-menu.js";
import {
  BLOCK_TYPE_OPTIONS,
  blockTypeText,
  getBlockTypeOptionsForSource,
} from "./block-type-options.js";
import { CodeBlockLanguageCombobox } from "./code-block-language-combobox.js";
import { TableHandles } from "./table-handles.js";
import { TableSelectionToolbar } from "./table-selection-toolbar.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";

const SLASH_MENU_DISMISS_ALLOW_SELECTORS = [".geul-slash-menu"] as const;
// Escape는 effect 등록 race가 없는 상시 element keydown listener가 소유한다.
const IGNORE_ESCAPE_DISMISS = () => {};
// `items` prop 기본값. 매 렌더 새 배열 리터럴이면 그 배열을 참조하는 effect
// 의존성 배열이 매 렌더 바뀐 걸로 보여 selectionchange 등 리스너를 매번
// 떼었다 다시 붙인다(SLASH_MENU_DISMISS_ALLOW_SELECTORS와 같은 이유) — 모듈
// 스코프 상수로 참조 안정성을 보장한다.
const NO_CUSTOM_ITEMS: readonly SlashMenuCustomItem[] = [];

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
    }
  // media 4종(file/image/video/audio)은 하나의 kind 태그를 공유하고
  // mediaKind로만 갈린다 — BLOCK_TYPE_OPTIONS 여러 항목이 kind:
  // "blockType" 하나를 공유하는 것과 같은 모양이다(RD-003 DELTA-01).
  | {
      kind: "insertMedia";
      mediaKind: MediaBlockKind;
      id: string;
      label: string;
      description: string;
      keywords: readonly string[];
    }
  // 소비자가 `items` prop으로 등록한 커스텀 아이템(RD-002 DELTA-01,
  // EXT-006). 원본 `SlashMenuCustomItem`을 `custom`에 그대로 들고 있다가
  // 선택 시 `onSelect`를 부른다 — `label`/`description`/`keywords`/`id`는
  // 렌더·필터링이 다른 kind와 동일하게 다루도록 공통 필드로 승격한다.
  | {
      kind: "custom";
      id: string;
      label: string;
      description: string;
      keywords: readonly string[];
      icon?: ReactNode;
      custom: SlashMenuCustomItem;
    };

/**
 * 소비자가 `SlashMenu`의 `items` prop으로 등록하는 커스텀 슬래시 아이템
 * (RD-002 DELTA-01, `EXT-006`). 기존 기본 목록 뒤에 추가만 되고 대체·제거는
 * 안 된다(spec). `onSelect`는 등록형 `commands` API가 아니라 그 자리에서
 * 실행되는 UI 클릭 핸들러라 `Result<T, EditorError>` 계약을 강제하지 않는다
 * (그릴링 결정, `_works/roadmap/roadmap.md` "Emoji picker 데이터 소스·트리거·
 * 컬럼 수" 절 참고 — 같은 세션에서 `SlashMenuItem`도 함께 확정).
 */
export type SlashMenuCustomItem = {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  icon?: ReactNode;
  onSelect: (editor: EditorController) => void;
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

// spec §3.1 순서(file/image/video/audio)를 그대로 따른다.
const FILE_SLASH_ITEM: SlashMenuItem = {
  kind: "insertMedia",
  mediaKind: "file",
  id: "file",
  label: "File",
  description: "Insert a file",
  keywords: ["file", "attachment", "document"],
};
const IMAGE_SLASH_ITEM: SlashMenuItem = {
  kind: "insertMedia",
  mediaKind: "image",
  id: "image",
  label: "Image",
  description: "Insert an image",
  keywords: ["image", "picture", "photo"],
};
const VIDEO_SLASH_ITEM: SlashMenuItem = {
  kind: "insertMedia",
  mediaKind: "video",
  id: "video",
  label: "Video",
  description: "Insert a video",
  keywords: ["video", "movie", "clip"],
};
const AUDIO_SLASH_ITEM: SlashMenuItem = {
  kind: "insertMedia",
  mediaKind: "audio",
  id: "audio",
  label: "Audio",
  description: "Insert an audio file",
  keywords: ["audio", "sound", "music"],
};

const getSlashMenuItems = (
  source: BlockTypeDescriptor,
  customItems: readonly SlashMenuCustomItem[],
): readonly SlashMenuItem[] => [
  ...getBlockTypeOptionsForSource(source).map((option) => ({
    kind: "blockType" as const,
    ...option,
  })),
  TABLE_SLASH_ITEM,
  DIVIDER_SLASH_ITEM,
  FILE_SLASH_ITEM,
  IMAGE_SLASH_ITEM,
  VIDEO_SLASH_ITEM,
  AUDIO_SLASH_ITEM,
  ...customItems.map((custom): SlashMenuItem => ({
    kind: "custom",
    id: custom.id,
    label: custom.label,
    description: custom.description ?? "",
    keywords: custom.keywords ?? [],
    icon: custom.icon,
    custom,
  })),
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
  customItems: readonly SlashMenuCustomItem[],
): SlashMenuItem[] =>
  getSlashMenuItems(source, customItems).filter((item) =>
    matchesQuery(item, query),
  );

// spec §8(EXT-009), RD-002-DELTA-03 — 렌더 텍스트를 kind별로 dictionary에서
// 읽는다. 검색(matchesQuery/filterItems)은 위 고정 영어 label·keywords를
// 그대로 쓴다 — 이 함수는 그쪽을 건드리지 않는다(DELTA-02·03 공통 결정).
const slashMenuItemText = (
  dictionary: Dictionary,
  item: SlashMenuItem,
): { label: string; description: string } => {
  switch (item.kind) {
    case "blockType":
      return blockTypeText(dictionary, item.id);
    case "insertTable":
      return dictionary.slashMenu.table;
    case "insertDivider":
      return dictionary.slashMenu.divider;
    case "insertMedia":
      return dictionary.slashMenu[item.mediaKind];
    case "custom":
      return { label: item.label, description: item.description };
  }
};

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
  // 캐럿이 빈 블록(자식이 <br class="ProseMirror-trailingBreak"> 하나뿐인
  // 문단) 안에 있으면 Range의 경계가 텍스트 노드가 아니라 엘리먼트+offset이라
  // Chromium이 getBoundingClientRect()로 (0,0,0,0)을 돌려준다 — 실측 확인,
  // QA-086. 이때는 캐럿을 담은 엘리먼트 자신의 rect(항상 레이아웃된 실제
  // 위치)로 대체한다.
  if (bounds.height === 0) {
    const anchorElement =
      selection.anchorNode.nodeType === Node.ELEMENT_NODE
        ? (selection.anchorNode as Element)
        : selection.anchorNode.parentElement;
    const elementRect = anchorElement?.getBoundingClientRect();
    if (elementRect !== undefined && elementRect.height > 0) {
      return { left: elementRect.left, top: elementRect.bottom };
    }
  }
  return { left: bounds.left, top: bounds.top + bounds.height };
};

/**
 * DELTA-01(`formatting-toolbar.tsx`)과 동일 계약 — `portalTarget` 참고.
 * 이 컴포넌트가 내부 자동 마운트하는 `BlockSideMenu`/`CodeBlockLanguageCombobox`/
 * `TableHandles`/`TableSelectionToolbar`/`BlockSelectionToolbar`(중복 마운트
 * 방지, spec §6.1)는 각자 독립된 오버레이라 이 prop과 무관하다 — `portalTarget`은
 * 슬래시 명령 팝업 자신에만 적용한다(RD-003-DELTA-05.md "범위 판단").
 *
 * `items`는 소비자가 등록한 커스텀 아이템이다(RD-002 DELTA-01, `EXT-006`).
 * 기존 기본 목록 뒤에 추가만 되고 대체·제거는 안 된다.
 */
export type SlashMenuProps = {
  portalTarget?: HTMLElement | null;
  items?: readonly SlashMenuCustomItem[];
};

export const SlashMenu = ({
  portalTarget = null,
  items: customItems = NO_CUSTOM_ITEMS,
}: SlashMenuProps = {}) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const menuId = useId();
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
                  filterItems(context.blockType, resolvedQuery, customItems)
                    .length - 1,
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
  }, [customItems, editor, element]);

  const items =
    menuState === null
      ? []
      : filterItems(menuState.sourceBlockType, menuState.query, customItems);

  // 강조된 옵션의 id. code-block-language-combobox.tsx와 동일 패턴
  // (menuId + 옵션 고유 id) — 아래 aria-activedescendant effect와 옵션
  // 버튼의 id 둘 다 이 값에서 파생해 접두사가 어긋나지 않는다.
  const highlightedItem =
    menuState === null ? undefined : items[menuState.highlightedIndex];
  const activeOptionId =
    highlightedItem === undefined
      ? undefined
      : `${menuId}-${highlightedItem.id}`;

  // aria-activedescendant는 실제 포커스를 쥔 요소(호출부)에 설정해야 한다.
  // 이 컴포넌트가 초점을 갖지 않으므로(캐럿은 계속 편집기에 머무름) 대상은
  // menuRef가 아니라 element 안의 실제 contenteditable이다 — EditorContent의
  // host div(role="textbox")는 그 자신이 아니라 PM이 만드는 자식이다
  // (use-focus-editor.ts와 동일 조회, G-TST-001).
  useEffect(() => {
    const editable = element?.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    );
    if (!editable || activeOptionId === undefined) return;
    editable.setAttribute("aria-activedescendant", activeOptionId);
    return () => {
      editable.removeAttribute("aria-activedescendant");
    };
  }, [activeOptionId, element]);

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
      } else if (item.kind === "insertMedia") {
        editor.commands.insertMediaBlock(current.blockId, item.mediaKind, {
          clearAfterBlockText: true,
        });
      } else if (item.kind === "custom") {
        item.custom.onSelect(editor);
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
            filterItems(
              currentState.sourceBlockType,
              currentState.query,
              customItems,
            ).length,
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
            filterItems(
              currentState.sourceBlockType,
              currentState.query,
              customItems,
            ).length,
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
          customItems,
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
  }, [customItems, dismissMenuAndFocusEditor, element, selectItem]);

  const menuContent =
    menuState === null ? null : (
      <div
        aria-label={dictionary.slashMenu.ariaLabel}
        className="geul-slash-menu"
        ref={menuRef}
        role="listbox"
        style={style}
      >
        {items.length === 0 && (
          <p className="geul-slash-menu__empty">
            {dictionary.slashMenu.noMatches}
          </p>
        )}
        {items.map((item, index) => {
          const { label, description } = slashMenuItemText(dictionary, item);
          return (
            <button
              aria-selected={index === menuState.highlightedIndex}
              className="geul-slash-menu__item"
              id={`${menuId}-${item.id}`}
              key={item.id}
              onClick={() => selectItem(item)}
              onPointerDown={(event) => event.preventDefault()}
              role="option"
              type="button"
            >
              {item.kind === "custom" && item.icon !== undefined && (
                <span className="geul-slash-menu__item-icon">{item.icon}</span>
              )}
              <span className="geul-slash-menu__item-label">{label}</span>
              <span className="geul-slash-menu__item-description">
                {description}
              </span>
            </button>
          );
        })}
      </div>
    );

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
      {menuContent !== null &&
        (portalTarget === null
          ? menuContent
          : createPortal(menuContent, portalTarget))}
    </>
  );
};
