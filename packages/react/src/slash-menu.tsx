import type {
  Dictionary,
  EditorController,
  EditorLifecycle,
  SelectionQuery,
  MediaBlockKind,
} from "@cp949/geul-core";
import { type ReactNode, useEffect, useId } from "react";
import { createPortal } from "react-dom";

import { BlockSelectionToolbar } from "./block-selection-toolbar.js";
import { BlockSideMenu } from "./block-side-menu.js";
import {
  BLOCK_TYPE_OPTIONS,
  blockTypeText,
  getBlockTypeChoices,
} from "./block-type-options.js";
import { CalloutIconPicker } from "./callout-icon-picker.js";
import { type MenuPosition, readCaretBounds } from "./caret-bounds.js";
import { CodeBlockCaptions } from "./code-block-captions.js";
import { CodeBlockLanguageCombobox } from "./code-block-language-combobox.js";
import { useFixedPlacement } from "./fixed-placement.js";
import { IframeLoadStatus } from "./iframe-load-status.js";
import { MediaCaptions } from "./media-captions.js";
import { MediaHandleOverlays } from "./media-handle-overlays.js";
import { TableHandles } from "./table-handles.js";
import { TableSelectionToolbar } from "./table-selection-toolbar.js";
import { useCaretTriggerPopup } from "./use-caret-trigger-popup.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";

const SLASH_MENU_DISMISS_ALLOW_SELECTORS = [".geul-slash-menu"] as const;
// `items` prop 기본값. 매 렌더 새 배열 리터럴이면 참조가 매번 바뀐다 — 모듈
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
// iframe(CUS-001~004, spec docs/specs/2026-09-19-iframe-block-design.md §5)은
// media 5번째 kind다. spec 144행의 별도 `{kind:"insertIframe", ...}` 태그는
// 쓰지 않는다 — 슬래시커맨드 자체가 어느 kind든 URL을 묻지 않고 빈 블록만
// 만드는 selectItem()의 기존 동작(RD-004 DELTA-04 readiness 재확인)이라
// `insertMedia`에 `mediaKind:"iframe"`을 추가하는 것으로 다른 media 4종과
// 완전히 같은 경로를 그대로 탄다.
const IFRAME_SLASH_ITEM: SlashMenuItem = {
  kind: "insertMedia",
  mediaKind: "iframe",
  id: "iframe",
  label: "Iframe",
  description: "Embed an external page",
  keywords: ["iframe", "embed", "website", "page"],
};

// spec §4.4(EXT-004), RD-002-DELTA-01(Issue #189) — enabledBlockTypes로
// deny된 타입은 SlashMenu 목록에서도 사라진다. "custom"(소비자 등록 항목,
// EXT-006)은 enabledBlockTypes가 다루는 기존 14종과 무관해 항상 활성이다.
const isSlashMenuItemEnabled = (
  item: SlashMenuItem,
  editor: EditorLifecycle,
): boolean => {
  switch (item.kind) {
    case "blockType":
      // getBlockTypeChoices가 끈 타입을 이미 뺐다.
      return true;
    case "insertTable":
      return editor.isBlockTypeEnabled("table");
    case "insertDivider":
      return editor.isBlockTypeEnabled("divider");
    case "insertMedia":
      return editor.isBlockTypeEnabled(item.mediaKind);
    case "custom":
      return true;
  }
};

const getSlashMenuItems = (
  blockId: string,
  customItems: readonly SlashMenuCustomItem[],
  editor: EditorLifecycle & SelectionQuery,
): readonly SlashMenuItem[] =>
  (
    [
      // core가 거절하는 변환(자식 있는 블록의 Code 등)은 항목에서 뺀다
      // (Issue #245). 선택은 clearContent로 변환하므로 같은 옵션으로
      // 질의한다.
      ...getBlockTypeChoices(editor, { blockId }, { clearContent: true })
        .filter(({ blocker }) => blocker === null)
        .map(({ option }) => ({
          kind: "blockType" as const,
          ...option,
        })),
      TABLE_SLASH_ITEM,
      DIVIDER_SLASH_ITEM,
      FILE_SLASH_ITEM,
      IMAGE_SLASH_ITEM,
      VIDEO_SLASH_ITEM,
      AUDIO_SLASH_ITEM,
      IFRAME_SLASH_ITEM,
      ...customItems.map((custom): SlashMenuItem => ({
        kind: "custom",
        id: custom.id,
        label: custom.label,
        description: custom.description ?? "",
        keywords: custom.keywords ?? [],
        icon: custom.icon,
        custom,
      })),
    ] satisfies SlashMenuItem[]
  ).filter((item) => isSlashMenuItemEnabled(item, editor));

const matchesQuery = (item: SlashMenuItem, query: string): boolean => {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return (
    item.label.toLowerCase().includes(needle) ||
    item.keywords.some((keyword) => keyword.startsWith(needle))
  );
};

const filterItems = (
  blockId: string,
  query: string,
  customItems: readonly SlashMenuCustomItem[],
  editor: EditorLifecycle & SelectionQuery,
): SlashMenuItem[] =>
  getSlashMenuItems(blockId, customItems, editor).filter((item) =>
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

// 캐럿 rect를 읽을 수 없는 채 열릴 때(편집기 밖 DOM 선택)의 첫 좌표.
const FALLBACK_MENU_POSITION: MenuPosition = { left: 96, top: 48 };

/**
 * DELTA-01(`formatting-toolbar.tsx`)과 동일 계약 — `portalTarget` 참고.
 * 이 컴포넌트가 내부 자동 마운트하는 `BlockSideMenu`/`CodeBlockLanguageCombobox`/
 * `CodeBlockCaptions`/`TableHandles`/`TableSelectionToolbar`/
 * `BlockSelectionToolbar`(중복 마운트
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
  const focusEditor = useFocusEditor(element);
  // 열림 판정·재오픈 억제·keydown 배선·닫기는 useCaretTriggerPopup이 소유한다.
  // "+" 버튼 열기는 popup.open(blockId, "")로 빈 텍스트에서도 열림을 유지한다.
  const popup = useCaretTriggerPopup({
    parseQuery: parseSlashQuery,
    getItemCount: ({ blockId, query }) =>
      filterItems(blockId, query, customItems, editor).length,
    navigate: (key, current) => {
      if (key !== "ArrowDown" && key !== "ArrowUp") return null;
      const step = key === "ArrowDown" ? 1 : -1;
      const count = Math.max(
        filterItems(current.blockId, current.query, customItems, editor).length,
        1,
      );
      return (current.highlightedIndex + step + count) % count;
    },
    onActivate: (current) => {
      const item = filterItems(
        current.blockId,
        current.query,
        customItems,
        editor,
      )[current.highlightedIndex];
      if (item !== undefined) selectItem(item, current);
    },
    allowSelectors: SLASH_MENU_DISMISS_ALLOW_SELECTORS,
  });
  const { state: menuState, refresh } = popup;
  // `items`가 바뀌면 후보 수가 달라질 수 있다. 옵션 콜백은 참조가 안정적이라
  // 훅의 열림 판정 effect가 다시 돌지 않으므로 여기서 강조 위치를 다시 맞춘다.
  // 닫혀 있으면 refresh는 아무것도 하지 않는다.
  useEffect(() => {
    refresh();
  }, [customItems, refresh]);
  // 배치는 열림 판정과 분리한다(Issue #234). 열림 상태는 좌표를 보관하지 않고
  // 이 훅이 렌더마다 캐럿 rect를 다시 읽는다. 캐럿이 편집기 밖이면 마지막 좌표를 유지한다.
  const { menuRef, style } = useFixedPlacement({
    open: menuState !== null,
    element,
    readAnchor: () => (element === null ? null : readCaretBounds(element)),
    fallbackAnchor: FALLBACK_MENU_POSITION,
  });

  const items =
    menuState === null
      ? []
      : filterItems(menuState.blockId, menuState.query, customItems, editor);

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

  const selectItem = (item: SlashMenuItem, current: { blockId: string }) => {
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
    popup.close();
    focusEditor();
  };

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
              onClick={() => selectItem(item, menuState)}
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
      <BlockSideMenu onBlockAdded={(blockId) => popup.open(blockId, "")} />
      <CodeBlockLanguageCombobox />
      <CodeBlockCaptions />
      <TableHandles onBlockAdded={(blockId) => popup.open(blockId, "")} />
      <MediaHandleOverlays
        onBlockAdded={(blockId) => popup.open(blockId, "")}
      />
      <IframeLoadStatus />
      <CalloutIconPicker />
      <MediaCaptions />
      <TableSelectionToolbar />
      <BlockSelectionToolbar />
      {menuContent !== null &&
        (portalTarget === null
          ? menuContent
          : createPortal(menuContent, portalTarget))}
    </>
  );
};
