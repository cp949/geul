import { useId, useMemo } from "react";
import { createPortal } from "react-dom";

import { type MenuPosition, readCaretBounds } from "./caret-bounds.js";
import { EmojiGrid } from "./emoji-grid.js";
import { EMOJI_OPTIONS, type EmojiOption } from "./emoji-picker-options.js";
import { useFixedPlacement } from "./fixed-placement.js";
import { useActiveDescendant } from "./use-active-descendant.js";
import { useCaretTriggerPopup } from "./use-caret-trigger-popup.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";

export type { EmojiOption };

const EMOJI_PICKER_DISMISS_ALLOW_SELECTORS = [".geul-emoji-picker"] as const;

/**
 * grid 열 수. `_emoji-picker.scss`의 `.geul-emoji-picker__grid`
 * (`grid-template-columns: repeat(8, 1fr)`)와 값이 같아야 한다 — 어긋나면
 * 방향키 이동(아래 `moveHighlight`)과 실제 시각 배치가 안 맞는다
 * (roadmap.md "Emoji picker 데이터 소스·트리거·컬럼 수" 결정, 8열).
 */
const EMOJI_GRID_COLUMNS = 8;

/**
 * `:query` 캐럿-텍스트 트리거 감지. `slash-menu.tsx`의 `parseSlashQuery`와
 * 같은 방식(블록 텍스트 전체가 트리거와 정확히 일치할 때만 연다)이다. 열림
 * 판정과 닫기는 `useCaretTriggerPopup`이 맡고, 이 함수는 트리거 규칙만 소유한다.
 *
 * 블록 텍스트 전체 매치로 제한하는 이유는 필터링뿐 아니라 선택 시 삽입
 * 방식과도 맞물린다 — core에는 캐럿 앞 트리거 부분 문자열만 골라 치환하는
 * 오프셋 기반 공개 API가 없다(`editor-controller-types.ts`의 `commands`
 * 전체를 조사한 결과, `setText`는 블록 콘텐츠 전체를 갈아치우는 API고
 * `setTextCursorPosition`은 "start"/"end" 두 값만 받는다). 트리거가 블록
 * 텍스트 전체와 같으면 선택 시 `commands.setText(blockId, char)`로 블록을
 * 통째로 이모지 한 글자로 바꾸고 `setTextCursorPosition(blockId, "end")`
 * (commands가 아니라 controller 최상위 API)로 캐럿을 이모지 뒤에 놓을 수
 * 있다 — 부분 문자열 오프셋 계산이
 * 전혀 필요 없어진다(DELTA-02에서 이 삽입 로직을 구현할 때 그대로 재사용).
 */
export const parseEmojiQuery = (text: string): string | null => {
  const match = /^:(\S*)$/.exec(text);
  return match === null ? null : (match[1] ?? "");
};

const matchesEmojiQuery = (option: EmojiOption, query: string): boolean => {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return (
    option.label.toLowerCase().includes(needle) ||
    option.keywords.some((keyword) => keyword.startsWith(needle))
  );
};

/**
 * `slash-menu.tsx`의 `filterItems`와 같은 자리 — label 부분 일치 또는
 * keyword 접두 일치. emoji는 `SlashMenuItem`과 달리 소스 블록 타입에 따라
 * 후보 집합이 달라지지 않아(`filterItems(source, query, ...)`의 `source`에
 * 대응하는 매개변수가 없다) 옵션 배열과 쿼리만 받는다.
 */
export const filterEmojiOptions = (
  options: readonly EmojiOption[],
  query: string,
): EmojiOption[] =>
  options.filter((option) => matchesEmojiQuery(option, query));

// 캐럿 rect를 읽을 수 없는 채 열릴 때(편집기 밖 DOM 선택)의 첫 좌표.
// `slash-menu.tsx`의 같은 이름 상수와 값이 같다.
const FALLBACK_MENU_POSITION: MenuPosition = { left: 96, top: 48 };

/**
 * 방향키 이동. 8열 grid라 `SlashMenu`의 1차원 modulo wrap을 쓰면 좌우 개념이
 * 없어 부자연스럽다 — 네 방향 모두 경계에서 clamp한다(wrap 없음). 2차원
 * grid에서 1차원 modulo wrap은 예컨대 마지막 줄 중간 항목에서 아래쪽으로
 * 이동하면 첫 줄의 다른 열로 튀는 등 예측할 수 없는 위치로 가므로(RD-004
 * DELTA-02 계획 "키보드 네비게이션" 참고), "더 이상 그 방향으로 못 간다"는
 * clamp가 예측 가능하다.
 */
const moveHighlight = (current: number, delta: number, count: number): number =>
  Math.min(Math.max(current + delta, 0), Math.max(count - 1, 0));

export type EmojiPickerProps = {
  /**
   * DELTA-01(`formatting-toolbar.tsx`)/RD-003과 동일 계약 — 지정 시
   * `createPortal`로 그 요소 하위에 렌더하고, 미지정 시 기존 inline 렌더를
   * 유지한다.
   */
  portalTarget?: HTMLElement | null;
};

/**
 * `:` 트리거 grid emoji suggestion(RD-004, `UI-012`/`UI-013`). `SlashMenu`와
 * 같은 `useCaretTriggerPopup` 훅 위에 서지만, `SlashMenu`가
 * 내부 자동 마운트하는 `BlockSideMenu`/`TableHandles` 같은 것이 없다 — 이
 * 팝업 하나만 렌더하는 독립 컴포넌트다.
 */
export const EmojiPicker = ({ portalTarget = null }: EmojiPickerProps = {}) => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const menuId = useId();
  const focusEditor = useFocusEditor(element);
  // 열림 판정·재오픈 억제·keydown 배선·닫기는 useCaretTriggerPopup이 소유한다.
  const popup = useCaretTriggerPopup({
    parseQuery: parseEmojiQuery,
    getItemCount: ({ query }) =>
      filterEmojiOptions(EMOJI_OPTIONS, query).length,
    navigate: (key, current) => {
      if (
        key !== "ArrowRight" &&
        key !== "ArrowLeft" &&
        key !== "ArrowDown" &&
        key !== "ArrowUp"
      ) {
        return null;
      }
      const delta =
        key === "ArrowRight"
          ? 1
          : key === "ArrowLeft"
            ? -1
            : key === "ArrowDown"
              ? EMOJI_GRID_COLUMNS
              : -EMOJI_GRID_COLUMNS;
      return moveHighlight(
        current.highlightedIndex,
        delta,
        filterEmojiOptions(EMOJI_OPTIONS, current.query).length,
      );
    },
    onActivate: (current) => {
      const item = filterEmojiOptions(EMOJI_OPTIONS, current.query)[
        current.highlightedIndex
      ];
      if (item !== undefined) selectItem(item, current);
    },
    allowSelectors: EMOJI_PICKER_DISMISS_ALLOW_SELECTORS,
  });
  const { state: menuState } = popup;
  // 배치는 열림 판정과 분리한다(Issue #234). 열림 상태는 좌표를 보관하지 않고
  // 이 훅이 렌더마다 캐럿 rect를 다시 읽는다. 캐럿이 편집기 밖이면 마지막 좌표를 유지한다.
  const { menuRef, style } = useFixedPlacement({
    open: menuState !== null,
    element,
    readAnchor: () => (element === null ? null : readCaretBounds(element)),
    fallbackAnchor: FALLBACK_MENU_POSITION,
  });

  // scroll마다 이 컴포넌트가 다시 렌더된다(useFixedPlacement). query가 같으면 같은
  // 배열을 돌려줘 EmojiGrid가 565개 버튼 목록을 건너뛰게 한다.
  const query = menuState?.query ?? null;
  const items = useMemo(
    () => (query === null ? [] : filterEmojiOptions(EMOJI_OPTIONS, query)),
    [query],
  );

  // 강조 옵션 id. 옵션 버튼 id(EmojiGrid `idPrefix`)와 같은 menuId에서 파생해
  // 접두사가 어긋나지 않는다. 후보가 없으면 undefined라 속성을 달지 않는다.
  const highlightedItem =
    menuState === null ? undefined : items[menuState.highlightedIndex];
  useActiveDescendant(
    element,
    highlightedItem === undefined
      ? undefined
      : `${menuId}-${highlightedItem.id}`,
  );

  const selectItem = (item: EmojiOption, current: { blockId: string }) => {
    // 트리거가 블록 텍스트 전체와 일치할 때만 메뉴가 열리므로(parseEmojiQuery)
    // "블록 재작성"이 곧 "트리거 치환"이다(DELTA-01이 확정한 방식).
    editor.commands.setText(current.blockId, item.char);
    editor.setTextCursorPosition(current.blockId, "end");
    popup.close();
    focusEditor();
  };

  const menuContent =
    menuState === null ? null : (
      <EmojiGrid
        ariaLabel="Emoji picker"
        emptyMessage="No matches"
        highlightedIndex={menuState.highlightedIndex}
        idPrefix={menuId}
        items={items}
        menuRef={menuRef}
        onSelect={(item) => selectItem(item, menuState)}
        style={style}
      />
    );

  if (menuContent === null) return null;
  return portalTarget === null
    ? menuContent
    : createPortal(menuContent, portalTarget);
};
