import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { EMOJI_OPTIONS, type EmojiOption } from "./emoji-picker-options.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";

export type { EmojiOption };

const EMOJI_PICKER_DISMISS_ALLOW_SELECTORS = [".geul-emoji-picker"] as const;
// Escape는 메뉴만 닫고 텍스트는 보존한다(SlashMenu와 동일 이유) — 실제 처리는
// element keydown 리스너가 소유한다.
const IGNORE_ESCAPE_DISMISS = () => {};

/**
 * grid 열 수. `_emoji-picker.scss`의 `.geul-emoji-picker__grid`
 * (`grid-template-columns: repeat(8, 1fr)`)와 값이 같아야 한다 — 어긋나면
 * 방향키 이동(아래 `moveHighlight`)과 실제 시각 배치가 안 맞는다
 * (roadmap.md "Emoji picker 데이터 소스·트리거·컬럼 수" 결정, 8열).
 */
const EMOJI_GRID_COLUMNS = 8;

/**
 * `:query` 캐럿-텍스트 트리거 감지. `slash-menu.tsx`의 `parseSlashQuery`와
 * 동일한 방식(블록 텍스트 전체가 트리거와 정확히 일치할 때만 연다)을 독자
 * 구현한다 — 두 파일이 서로 다른 트리거 문자(`/` vs `:`)와 필터링 대상을
 * 다뤄 공유 훅으로 추출하지 않는다(저장소 관례, `media-toolbar.tsx`/
 * `file-panel.tsx`의 "사용처 2곳뿐이라 훅 추출 이득이 적다" 전례와 동일 근거,
 * RD-004.md "포함 범위" 참고).
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

type MenuPosition = { left: number; top: number };

type MenuState = {
  blockId: string;
  query: string;
  highlightedIndex: number;
} & MenuPosition;

/** `slash-menu.tsx`의 동명 함수와 바이트 단위로 같다 — 캐럿 뒤 팝업 배치를
 * 위해 같은 방식으로 캐럿 rect를 읽는다. 두 파일이 서로 다른 트리거를 다뤄
 * 공유 훅으로 추출하지 않는다(파일 상단 주석과 같은 근거). */
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
 * `:` 트리거 grid emoji suggestion(RD-004, `UI-012`/`UI-013`). `SlashMenu`의
 * 캐럿-폴링·클램프 위치·바깥클릭/Escape dismiss 골격을 재사용하지만, `SlashMenu`가
 * 내부 자동 마운트하는 `BlockSideMenu`/`TableHandles` 같은 것이 없다 — 이
 * 팝업 하나만 렌더하는 독립 컴포넌트다.
 */
export const EmojiPicker = ({ portalTarget = null }: EmojiPickerProps = {}) => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const { menuRef, style } = useClampedMenuPosition(
    menuState?.left ?? 0,
    menuState?.top ?? 0,
  );
  const menuStateRef = useRef<MenuState | null>(null);
  menuStateRef.current = menuState;
  const focusEditor = useFocusEditor(element);
  // Escape로 닫힌 직후 지연된 selectionchange가 같은 텍스트로 재발생해
  // 방금 닫은 메뉴를 곧바로 재오픈하는 레이스 방지(SlashMenu와 동일 이유).
  const dismissedQueryRef = useRef<{ blockId: string; text: string } | null>(
    null,
  );

  const dismissMenu = useCallback(() => {
    const context = editor.getCaretBlockContext();
    dismissedQueryRef.current =
      context === null
        ? null
        : { blockId: context.blockId, text: context.text };
    setMenuState(null);
  }, [editor]);
  const dismissMenuAndFocusEditor = useCallback(() => {
    dismissMenu();
    focusEditor();
  }, [dismissMenu, focusEditor]);

  useEffect(() => {
    const updateFromCaret = () => {
      const context = editor.getCaretBlockContext();
      if (context === null) {
        dismissedQueryRef.current = null;
        setMenuState(null);
        return;
      }

      // CodeBlock 안의 `:foo`는 트리거가 아니라 보존할 코드다(SlashMenu와
      // 동일한 discriminator 우선 확인 이유).
      if (context.blockType.type === "codeBlock") {
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

      const query = parseEmojiQuery(context.text);
      if (query === null) {
        setMenuState(null);
        return;
      }

      const bounds = element === null ? null : readCaretBounds(element);
      setMenuState((current) => ({
        blockId: context.blockId,
        query,
        highlightedIndex:
          current !== null && current.blockId === context.blockId
            ? Math.min(
                current.highlightedIndex,
                Math.max(
                  filterEmojiOptions(EMOJI_OPTIONS, query).length - 1,
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
      : filterEmojiOptions(EMOJI_OPTIONS, menuState.query);

  const selectItem = useCallback(
    (item: EmojiOption) => {
      const current = menuStateRef.current;
      if (current === null) return;
      // 트리거가 블록 텍스트 전체와 일치할 때만 메뉴가 열리므로(parseEmojiQuery)
      // "블록 재작성"이 곧 "트리거 치환"이다(DELTA-01이 확정한 방식).
      editor.commands.setText(current.blockId, item.char);
      editor.setTextCursorPosition(current.blockId, "end");
      dismissedQueryRef.current = null;
      setMenuState(null);
      focusEditor();
    },
    [editor, focusEditor],
  );

  useDismissOnOutsideOrEscape({
    active: menuState !== null,
    element,
    allowSelectors: EMOJI_PICKER_DISMISS_ALLOW_SELECTORS,
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
      if (
        event.key === "ArrowRight" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowUp"
      ) {
        event.preventDefault();
        const delta =
          event.key === "ArrowRight"
            ? 1
            : event.key === "ArrowLeft"
              ? -1
              : event.key === "ArrowDown"
                ? EMOJI_GRID_COLUMNS
                : -EMOJI_GRID_COLUMNS;
        setMenuState((currentState) => {
          if (currentState === null) return null;
          const count = filterEmojiOptions(
            EMOJI_OPTIONS,
            currentState.query,
          ).length;
          return {
            ...currentState,
            highlightedIndex: moveHighlight(
              currentState.highlightedIndex,
              delta,
              count,
            ),
          };
        });
        return;
      }
      if (event.key === "Enter") {
        const currentItems = filterEmojiOptions(EMOJI_OPTIONS, current.query);
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

  const menuContent =
    menuState === null ? null : (
      <div
        aria-label="Emoji picker"
        className="geul-emoji-picker"
        ref={menuRef}
        role="listbox"
        style={style}
      >
        {items.length === 0 && (
          <p className="geul-emoji-picker__empty">No matches</p>
        )}
        <div className="geul-emoji-picker__grid">
          {items.map((item, index) => (
            <button
              aria-label={item.label}
              aria-selected={index === menuState.highlightedIndex}
              className="geul-emoji-picker__item"
              key={item.id}
              onClick={() => selectItem(item)}
              onPointerDown={(event) => event.preventDefault()}
              role="option"
              type="button"
            >
              {item.char}
            </button>
          ))}
        </div>
      </div>
    );

  if (menuContent === null) return null;
  return portalTarget === null
    ? menuContent
    : createPortal(menuContent, portalTarget);
};
