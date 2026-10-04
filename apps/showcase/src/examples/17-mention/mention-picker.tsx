import {
  handleMenuKeyDown,
  useClampedMenuPosition,
  useDismissibleOverlay,
  useEditor,
  useEditorElement,
  useFocusEditor,
} from "@cp949/geul-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * mention이 연결할 수 있는 모의 데이터 종류(Issue #210 "## 결정" D2) —
 * `user`/`document` 2종만 시연한다. `date`는 이번 예제 범위 밖이다.
 */
export type MentionTargetType = "user" | "document";

export type MentionOption = {
  id: string;
  targetType: MentionTargetType;
  targetId: string;
  label: string;
};

// mock 후보(하드코딩, Issue #210 "제외 범위" — 실제 사용자/문서 API 연동은
// 하지 않는다). "## 결정" D3 — user/document를 섹션으로 나누지 않고 단일
// 목록에 타입 라벨만 붙인다(slash-menu.tsx/emoji-picker.tsx에 카테고리
// 그룹 UI 선례가 없다, grep 확인).
const MENTION_OPTIONS: readonly MentionOption[] = [
  {
    id: "user-ada",
    targetType: "user",
    targetId: "user-ada-lovelace",
    label: "Ada Lovelace",
  },
  {
    id: "user-alan",
    targetType: "user",
    targetId: "user-alan-turing",
    label: "Alan Turing",
  },
  {
    id: "user-grace",
    targetType: "user",
    targetId: "user-grace-hopper",
    label: "Grace Hopper",
  },
  {
    id: "document-roadmap",
    targetType: "document",
    targetId: "doc-product-roadmap",
    label: "Product roadmap",
  },
  {
    id: "document-meeting",
    targetType: "document",
    targetId: "doc-meeting-notes",
    label: "Meeting notes",
  },
  {
    id: "document-spec",
    targetType: "document",
    targetId: "doc-api-spec",
    label: "API spec",
  },
];

// 바깥 pointerdown 판정에서 이 팝업 자신을 "바깥"으로 취급하지 않기 위한
// 셀렉터(`useDismissibleOverlay`의 `allowSelectors`). 이 예제는
// `packages/react`의 scss를 갖지 않으므로(showcase 로컬 컴포넌트) class명
// 대신 data attribute를 표식으로 쓴다. 매 렌더 새 배열이면 그 배열을 참조하는
// effect가 매번 리스너를 떼었다 붙이므로(emoji-picker.tsx/slash-menu.tsx와
// 동일 이유) 모듈 스코프 상수로 둔다.
const MENTION_PICKER_DISMISS_ALLOW_SELECTORS = [
  '[data-geul-mention-picker="true"]',
] as const;

/**
 * `@query` 캐럿-텍스트 트리거 감지. `emoji-picker.tsx`의 `parseEmojiQuery`와
 * 동일한 계약(블록 텍스트 전체가 트리거와 정확히 일치할 때만 연다)을 그대로
 * 따른다 — `insertCustomInlineContent`는 현재 selection(caret)에 삽입할
 * 뿐, caret 앞 부분 문자열만 지우는 offset 기반 range 삭제 API를 제공하지
 * 않는다(01-계획.md "## 결정" D1). 문장 중간(mid-sentence) 트리거는 이번
 * 예제 범위 밖이다.
 */
export const parseMentionQuery = (text: string): string | null => {
  const match = /^@(\S*)$/.exec(text);
  return match === null ? null : (match[1] ?? "");
};

const matchesMentionOption = (
  option: MentionOption,
  query: string,
): boolean => {
  if (query.length === 0) return true;
  return option.label.toLowerCase().includes(query.toLowerCase());
};

/** `slash-menu.tsx`의 `filterItems`/`emoji-picker.tsx`의 `filterEmojiOptions`와
 * 같은 "label 부분 일치" 계약. mention 후보는 keyword를 따로 갖지 않아
 * label만 본다. */
export const filterMentionOptions = (
  options: readonly MentionOption[],
  query: string,
): MentionOption[] =>
  options.filter((option) => matchesMentionOption(option, query));

type MenuPosition = { left: number; top: number };

type MenuState = {
  blockId: string;
  query: string;
  highlightedIndex: number;
} & MenuPosition;

/** `emoji-picker.tsx`/`slash-menu.tsx`의 동명 함수와 동일 계약 — 캐럿 뒤
 * 팝업 배치를 위해 같은 방식으로 캐럿 rect를 읽는다. 빈 블록에서
 * getBoundingClientRect()가 (0,0,0,0)을 돌려주는 Chromium 케이스(QA-086)도
 * 같은 방식으로 우회한다. */
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
 * 브라우저 DOM selection이 접힌 캐럿일 때 그 캐럿이 속한 블록의 id. 편집기 밖,
 * 범위 선택, 블록 컨테이너 밖(atom 블록 선택 등)이면 `null`이다.
 *
 * `editor.getCaretBlockContext()`는 쓰지 않는다. 키보드로 블록을 옮긴 직후에는
 * ProseMirror가 `selectionchange`를 비동기로 반영해 이전 블록을 돌려준다.
 * DOM selection은 그때 이미 새 위치를 가리킨다. 블록 id는 `renderHTML`이 내는
 * `data-geul-block-id`로 읽는다(G-EDT-003).
 */
const readDomCaretBlockId = (element: HTMLElement): string | null => {
  const selection = element.ownerDocument.getSelection();
  if (selection === null || !selection.isCollapsed) return null;
  const anchorNode = selection.anchorNode;
  if (anchorNode === null || !element.contains(anchorNode)) return null;
  const anchorElement =
    anchorNode.nodeType === Node.ELEMENT_NODE
      ? (anchorNode as Element)
      : anchorNode.parentElement;
  return (
    anchorElement
      ?.closest("[data-geul-block-id]")
      ?.getAttribute("data-geul-block-id") ?? null
  );
};

const targetTypeLabel = (targetType: MentionTargetType): string =>
  targetType === "user" ? "User" : "Document";

/**
 * `@` 트리거 mention 후보 popup(Issue #210) — `customInlineContent`
 * (`EXT-002`) 확장 지점을 시연하는 showcase 전용 컴포넌트다. geul
 * 자신은 mention 대상(사용자/문서) 목록을 소유하지 않으므로 `packages/react`
 * 공개 컴포넌트(EmojiPicker/SlashMenu와 같은 급)가 아니라 이 예제 폴더
 * 로컬 컴포넌트로만 존재한다(이슈 본문 결정).
 *
 * `EmojiPicker`의 캐럿-폴링·클램프 위치·바깥클릭/Escape dismiss 골격을
 * 그대로 재사용한다 — `@cp949/geul-react`가 공개하는
 * `useEditorElement`/`useFocusEditor`/`useClampedMenuPosition`/
 * `useDismissibleOverlay`가 그 배선이다(01-계획.md "## 결정" D4).
 */
export const MentionPicker = () => {
  const editor = useEditor();
  const element = useEditorElement();
  const menuId = useId();
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const { menuRef, style } = useClampedMenuPosition(
    menuState?.left ?? 0,
    menuState?.top ?? 0,
  );
  const menuStateRef = useRef<MenuState | null>(null);
  menuStateRef.current = menuState;
  const focusEditor = useFocusEditor(element);
  // Escape로 닫힌 직후 지연된 selectionchange가 같은 텍스트로 재발생해
  // 방금 닫은 메뉴를 곧바로 재오픈하는 레이스 방지(emoji-picker.tsx/
  // slash-menu.tsx와 동일 이유).
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

      // CodeBlock 안의 "@foo"는 트리거가 아니라 보존할 코드다
      // (emoji-picker.tsx와 동일한 discriminator 우선 확인 이유).
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

      const query = parseMentionQuery(context.text);
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
                  filterMentionOptions(MENTION_OPTIONS, query).length - 1,
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
    // selectionchange는 즉시 한 번, 매크로태스크 뒤 한 번 더 읽는다(Issue #247,
    // slash-menu.tsx·emoji-picker.tsx의 Issue #229와 같은 이유).
    // ProseMirror의 DOMObserver는 state 갱신마다 자기 selectionchange 리스너를
    // 떼었다 다시 붙여 항상 이 리스너보다 뒤에 호출된다. 즉시 읽기는 이동 직전
    // 낡은 state.selection을 본다. 캐럿이 `@query` 블록을 벗어난 이동은 즉시
    // 읽기에서 열린 채 남고 재통지가 없다. 뒤늦은 읽기는 PM flush가 끝난 최신
    // state를 본다. 즉시 읽기는 남긴다. 기존 동기 반응을 바꾸지 않는다.
    let deferredUpdateTimeout: number | null = null;
    const onSelectionChange = () => {
      updateFromCaret();
      if (ownerWindow === undefined || ownerWindow === null) return;
      if (deferredUpdateTimeout !== null) {
        ownerWindow.clearTimeout(deferredUpdateTimeout);
      }
      deferredUpdateTimeout = ownerWindow.setTimeout(() => {
        deferredUpdateTimeout = null;
        updateFromCaret();
      }, 0);
    };
    ownerDocument?.addEventListener("selectionchange", onSelectionChange);
    ownerDocument?.addEventListener("input", updateFromCaret);
    ownerWindow?.addEventListener("scroll", updateFromCaret, true);
    ownerWindow?.addEventListener("resize", updateFromCaret);
    updateFromCaret();
    return () => {
      ownerDocument?.removeEventListener("selectionchange", onSelectionChange);
      if (deferredUpdateTimeout !== null) {
        ownerWindow?.clearTimeout(deferredUpdateTimeout);
      }
      ownerDocument?.removeEventListener("input", updateFromCaret);
      ownerWindow?.removeEventListener("scroll", updateFromCaret, true);
      ownerWindow?.removeEventListener("resize", updateFromCaret);
    };
  }, [editor, element]);

  const items =
    menuState === null
      ? []
      : filterMentionOptions(MENTION_OPTIONS, menuState.query);

  // aria-activedescendant는 실제 포커스를 쥔 편집기 contenteditable에
  // 설정한다(slash-menu.tsx와 동일 조회 — 이 컴포넌트 자신은 초점을 갖지
  // 않는다, caret은 계속 편집기에 머무른다).
  const highlightedItem =
    menuState === null ? undefined : items[menuState.highlightedIndex];
  const activeOptionId =
    highlightedItem === undefined
      ? undefined
      : `${menuId}-${highlightedItem.id}`;

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
    (item: MentionOption) => {
      const current = menuStateRef.current;
      if (current === null) return;
      // 트리거가 블록 텍스트 전체와 일치할 때만 메뉴가 열리므로
      // (parseMentionQuery), 블록을 비운 뒤 그 자리에 mention atom을 넣는
      // 것이 곧 "트리거 치환"이다(emoji-picker.tsx의 setText(char) + end
      // 커서 배치와 동일 방식). insertCustomInlineContent는 현재
      // selection(caret)에 삽입하므로 setText로 블록을 비운 직후 caret이
      // 그 자리에 남아 있어야 한다.
      editor.commands.setText(current.blockId, "");
      editor.setTextCursorPosition(current.blockId, "end");
      const inserted = editor.commands.insertCustomInlineContent("mention", {
        targetType: item.targetType,
        targetId: item.targetId,
        label: item.label,
      });
      // insertCustomInlineContent는 Result<void, EditorError>를 반환한다
      // (packages/react/README.md의 InsertMentionButton 예제와 동일 계약).
      // 실패하면 위에서 이미 비운 블록 텍스트("@query")를 그대로 되돌린다
      // — 그러지 않으면 트랜잭션 거절 시 사용자 입력이 조용히 사라진다
      // (IMPL-REVIEW-01 F1).
      if (!inserted.ok) {
        console.error(inserted.error);
        // 복원된 "@query" 텍스트를 곧바로 새 트리거로 재인식해 메뉴가
        // 재오픈되지 않도록 dismissMenu()와 동일한 가드를 남긴다(위
        // updateFromCaret의 dismissedQueryRef 대조 로직 — G-UI-001).
        const restoredText = `@${current.query}`;
        editor.commands.setText(current.blockId, restoredText);
        editor.setTextCursorPosition(current.blockId, "end");
        dismissedQueryRef.current = {
          blockId: current.blockId,
          text: restoredText,
        };
      } else {
        // 삽입 성공 시 블록 텍스트가 mention atom으로 바뀌므로 dismiss
        // 가드가 필요 없다(기존과 동일).
        dismissedQueryRef.current = null;
      }
      setMenuState(null);
      focusEditor();
    },
    [editor, focusEditor],
  );

  // Escape는 메뉴만 닫고 입력한 "@query" 텍스트는 보존한다(EmojiPicker/
  // SlashMenu와 동일 계약). element의 상시 keydown 리스너가 먼저 닫고, 편집기
  // 안에서 막힌 Escape는 이 훅도 한 번 더 닫는다. `dismissMenu`가 멱등이라
  // 이중 호출이 무해하다.
  useDismissibleOverlay({
    open: menuState !== null,
    element,
    allowSelectors: MENTION_PICKER_DISMISS_ALLOW_SELECTORS,
    onClose: dismissMenu,
  });

  useEffect(() => {
    if (element === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const current = menuStateRef.current;
      if (current === null) return;

      // IME → Escape → Enter 반복 → 수식 키 → 이동·확정 순서와 `preventDefault`는
      // handleMenuKeyDown이 소유한다(Issue #211, #227, #230, #247). 후보가 0건인
      // Enter도 module이 막고 확정만 건너뛴다.
      handleMenuKeyDown(event, {
        escape: dismissMenuAndFocusEditor,
        navigate: (key) => {
          if (key !== "ArrowDown" && key !== "ArrowUp") return false;
          const step = key === "ArrowDown" ? 1 : -1;
          setMenuState((currentState) => {
            if (currentState === null) return null;
            const count = Math.max(
              filterMentionOptions(MENTION_OPTIONS, currentState.query).length,
              1,
            );
            return {
              ...currentState,
              highlightedIndex:
                (currentState.highlightedIndex + step + count) % count,
            };
          });
          return true;
        },
        activate: () => {
          // 키보드로 `@query` 블록을 떠난 직후의 Enter는 확정하지 않는다.
          // PM state는 이동 직후 낡아 selectionchange 재읽기도 이 keydown보다
          // 늦을 수 있다. DOM selection이 같은 블록의 접힌 캐럿이 아니면
          // (다른 블록, 범위 선택, 블록 밖) 메뉴만 닫는다.
          // handleMenuKeyDown이 이미 막았으므로 이 Enter는 문서를 바꾸지 않는다.
          if (readDomCaretBlockId(element) !== current.blockId) {
            setMenuState(null);
            return;
          }
          const item = filterMentionOptions(MENTION_OPTIONS, current.query)[
            current.highlightedIndex
          ];
          if (item !== undefined) selectItem(item);
        },
      });
    };

    element.addEventListener("keydown", handleKeyDown, true);
    return () => element.removeEventListener("keydown", handleKeyDown, true);
  }, [dismissMenuAndFocusEditor, element, selectItem]);

  if (menuState === null) return null;

  return (
    <div
      aria-label="Mention picker"
      data-geul-mention-picker="true"
      ref={menuRef}
      role="listbox"
      style={{
        ...style,
        position: "fixed",
        zIndex: 20,
        minWidth: "12rem",
        maxHeight: "16rem",
        overflowY: "auto",
        boxSizing: "border-box",
        border: "1px solid #d0d0d0",
        borderRadius: "0.375rem",
        background: "#ffffff",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
        padding: "0.25rem",
      }}
    >
      {items.length === 0 && (
        <p style={{ margin: "0.25rem", color: "#666666" }}>No matches</p>
      )}
      {items.map((item, index) => (
        <button
          aria-selected={index === menuState.highlightedIndex}
          id={`${menuId}-${item.id}`}
          key={item.id}
          onClick={() => selectItem(item)}
          onPointerDown={(event) => event.preventDefault()}
          role="option"
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            padding: "0.375rem 0.5rem",
            border: "none",
            borderRadius: "0.25rem",
            background:
              index === menuState.highlightedIndex ? "#eef2ff" : "transparent",
            cursor: "pointer",
            textAlign: "left",
          }}
          type="button"
        >
          <span>{item.label}</span>
          <span style={{ fontSize: "0.75rem", color: "#888888" }}>
            {targetTypeLabel(item.targetType)}
          </span>
        </button>
      ))}
    </div>
  );
};
