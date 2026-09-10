import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  type CodeBlockLanguageOption,
  useCodeBlockLanguages,
} from "./code-block-language-option.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";

// spec §6(BLK-017), RD-002-DELTA-02(Issue #162) — `codeBlockLanguages`
// 미지정 시(`useCodeBlockLanguages()` === undefined) 쓰는 기본 12개.
// `id`가 commit되는 실제 language 값을 겸한다(공개
// `CodeBlockLanguageOption`과 동일 shape — 과거 내부 `language` 필드는
// 모든 항목에서 `id`와 항상 같은 값이었다).
const DEFAULT_LANGUAGE_OPTIONS: readonly CodeBlockLanguageOption[] = [
  { id: "text", label: "Plain Text", aliases: ["plain text", "none"] },
  { id: "javascript", label: "JavaScript", aliases: ["js"] },
  { id: "typescript", label: "TypeScript", aliases: ["ts"] },
  { id: "html", label: "HTML", aliases: [] },
  { id: "css", label: "CSS", aliases: [] },
  { id: "json", label: "JSON", aliases: [] },
  { id: "bash", label: "Bash", aliases: ["sh", "shell"] },
  { id: "python", label: "Python", aliases: ["py"] },
  { id: "java", label: "Java", aliases: [] },
  { id: "kotlin", label: "Kotlin", aliases: [] },
  { id: "sql", label: "SQL", aliases: [] },
  { id: "markdown", label: "Markdown", aliases: ["md"] },
];

// 트리거 버튼과 팝오버 둘 다 여기 포함한다 — 바깥 pointerdown 판정이
// `.closest()`로 두 셀렉터 아무 쪽에나 걸리면 "바깥"으로 보지 않는다.
// 트리거를 빼먹으면 팝오버가 열린 상태에서 트리거를 다시 클릭할 때
// pointerdown이 먼저 "바깥 클릭"으로 처리돼 버리고, 뒤이은 click의 토글
// 로직과 경합한다.
const LANGUAGE_COMBOBOX_ALLOW_SELECTORS = [
  ".geul-code-block-language-trigger",
  ".geul-code-block-language-popover",
] as const;

type LanguageState = {
  blockId: string;
  committed: string;
};

type AnchorPosition = { left: number; top: number };

const ZERO_ANCHOR: AnchorPosition = { left: 0, top: 0 };

/** CodeBlock language 편집에 필요한 상태·명령·dismiss 동작을 한곳에 소유한다. */
export const CodeBlockLanguageCombobox = () => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const focusEditor = useFocusEditor(element);
  const [languageState, setLanguageState] = useState<LanguageState | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [anchor, setAnchor] = useState<AnchorPosition>(ZERO_ANCHOR);
  // spec §6(BLK-017), RD-002-DELTA-02(Issue #162) — 지정하면 완전
  // 교체(enabledBlockTypes와 동일 패턴), 안 하면 기본 12개.
  const configuredLanguages = useCodeBlockLanguages();
  const languageOptions = configuredLanguages ?? DEFAULT_LANGUAGE_OPTIONS;
  const languageStateRef = useRef(languageState);
  languageStateRef.current = languageState;
  const listboxId = `${useId()}-code-language-listbox`;
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const readActiveCodeBlock = useCallback(() => {
    const selection = editor.getSelectionBlockType();
    if (selection?.blockType.type !== "codeBlock") return null;
    return {
      blockId: selection.blockId,
      value: selection.blockType.language ?? "text",
    };
  }, [editor]);

  // blockId는 따옴표·백슬래시를 포함할 수 있어(테스트로 고정) CSS
  // attribute selector 문자열을 직접 조립하지 않는다 — 전부 순회하며
  // `getAttribute` 동등 비교로만 찾는다.
  const updateAnchor = useCallback(
    (blockId: string) => {
      if (element === null) return;
      const blockElements = Array.from(
        element.querySelectorAll<HTMLElement>("[data-geul-block-id]"),
      );
      const block = blockElements.find(
        (candidate) => candidate.getAttribute("data-geul-block-id") === blockId,
      );
      if (block === undefined) return;
      const rect = block.getBoundingClientRect();
      // 트리거를 코드블록 우상단에 앵커링한다(topRight) — 코드블록 DOM
      // 자체에는 아무것도 쓰지 않는다(PM DOMObserver가 예상 밖 변경으로
      // 보고 노드를 재생성하는 걸 피한다).
      setAnchor((current) =>
        current.left === rect.right && current.top === rect.top
          ? current
          : { left: rect.right, top: rect.top },
      );
    },
    [element],
  );

  useEffect(() => {
    const updateFromSelection = () => {
      const active = readActiveCodeBlock();
      if (active === null) {
        setLanguageState(null);
        setOpen(false);
        setSearch("");
        return;
      }

      updateAnchor(active.blockId);
      const previous = languageStateRef.current;
      if (previous === null || previous.blockId !== active.blockId) {
        // 새 블록으로 전환(또는 최초 진입) — 팝오버를 닫고 검색을 버린다.
        setLanguageState({ blockId: active.blockId, committed: active.value });
        setOpen(false);
        setSearch("");
        return;
      }
      if (previous.committed !== active.value) {
        setLanguageState({ blockId: active.blockId, committed: active.value });
      }
      // 같은 블록이고 committed 값도 그대로면 아무 것도 바꾸지 않는다 —
      // 팝오버가 열려 있었으면 열린 채, 검색어도 그대로 유지한다.
    };

    const ownerDocument = element?.ownerDocument;
    ownerDocument?.addEventListener("selectionchange", updateFromSelection);
    ownerDocument?.addEventListener("input", updateFromSelection);
    updateFromSelection();
    return () => {
      ownerDocument?.removeEventListener(
        "selectionchange",
        updateFromSelection,
      );
      ownerDocument?.removeEventListener("input", updateFromSelection);
    };
  }, [element, readActiveCodeBlock, updateAnchor]);

  useEffect(() => {
    const ownerWindow = element?.ownerDocument.defaultView;
    if (ownerWindow === undefined || ownerWindow === null) return;
    const updateAnchorFromCurrentBlock = () => {
      const current = languageStateRef.current;
      if (current !== null) updateAnchor(current.blockId);
    };

    ownerWindow.addEventListener("scroll", updateAnchorFromCurrentBlock, true);
    ownerWindow.addEventListener("resize", updateAnchorFromCurrentBlock);
    return () => {
      ownerWindow.removeEventListener(
        "scroll",
        updateAnchorFromCurrentBlock,
        true,
      );
      ownerWindow.removeEventListener("resize", updateAnchorFromCurrentBlock);
    };
  }, [element, updateAnchor]);

  const cancel = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  const dismissWithFocus = useCallback(() => {
    cancel();
    focusEditor();
  }, [cancel, focusEditor]);

  useDismissOnOutsideOrEscape({
    active: open,
    element,
    allowSelectors: LANGUAGE_COMBOBOX_ALLOW_SELECTORS,
    onOutsideDismiss: cancel,
    onEscapeDismiss: dismissWithFocus,
  });

  const commit = useCallback(
    (value: string) => {
      const current = languageStateRef.current;
      if (current === null) return;
      const result = editor.commands.setBlockType(current.blockId, {
        type: "codeBlock",
        language: value,
      });
      if (!result.ok) return;

      const active = readActiveCodeBlock();
      if (active !== null && active.blockId === current.blockId) {
        setLanguageState({ blockId: active.blockId, committed: active.value });
      }
      setOpen(false);
      setSearch("");
      focusEditor();
    },
    [editor, focusEditor, readActiveCodeBlock],
  );

  const openPopover = () => {
    setSearch("");
    setOpen(true);
  };

  const handleTriggerClick = () => {
    if (open) {
      cancel();
      return;
    }
    openPopover();
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.currentTarget.value);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    commit(event.currentTarget.value);
  };

  const needle = search.toLocaleLowerCase();
  const suggestions = languageOptions.filter((option) =>
    needle.length === 0
      ? true
      : [option.id, option.label, ...(option.aliases ?? [])].some((value) =>
          value.toLocaleLowerCase().includes(needle),
        ),
  );
  // 필터 결과의 첫 항목을 자동 활성화하면 unknown 검색어가 부분 일치한 known
  // option으로 읽히지만 Enter는 raw 검색어를 commit하는 ARIA 불일치가 생긴다.
  // canonical/label/alias가 정확히 일치할 때만 해당 option을 활성화한다.
  // 검색어가 비어 있으면(팝오버를 막 연 상태) 현재 committed 언어를 기본
  // 활성 항목으로 삼는다 — 네이티브 select가 현재 값을 미리 강조하는 것과
  // 같은 관례다. 체크마크(aria-selected)와는 다른 신호라 서로 간섭하지
  // 않는다.
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const activeSuggestion = suggestions.find((option) =>
    search.length === 0
      ? option.id === languageState?.committed
      : option.id === search ||
        (option.aliases ?? []).some(
          (alias) => alias.toLocaleLowerCase() === normalizedSearch,
        ),
  );
  const activeOptionId =
    activeSuggestion !== undefined
      ? `${listboxId}-${activeSuggestion.id}`
      : undefined;

  const matchOption = (value: string) =>
    languageOptions.find((option) => option.id === value);

  const displayLabel = (value: string): string => {
    const match = matchOption(value);
    if (match === undefined) return value;
    return match.id === "text"
      ? dictionary.codeLanguage.plainText
      : match.label;
  };

  // 트리거 버튼을 코드블록 우상단에 앵커링한다(RD-001의 topRight variant).
  const { menuRef: triggerRef, style: triggerStyle } = useClampedMenuPosition(
    anchor.left,
    anchor.top,
    "topRight",
  );

  // 팝오버는 트리거 버튼 자신의 렌더된 rect를 앵커로 쓴다 — 코드블록이
  // 아니라 트리거 아래로 펼친다. 트리거 위치(anchor)가 바뀌면(스크롤·리사이즈)
  // 다시 실측한다. jsdom에는 ResizeObserver가 없어 단위 테스트는 이 재실행에
  // 기댄다(use-clamped-menu-position.ts와 같은 제약).
  const [popoverAnchor, setPopoverAnchor] = useState<AnchorPosition | null>(
    null,
  );
  useLayoutEffect(() => {
    if (!open) {
      setPopoverAnchor(null);
      return;
    }
    const node = triggerRef.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    setPopoverAnchor((current) =>
      current !== null &&
      current.left === rect.right &&
      current.top === rect.bottom
        ? current
        : { left: rect.right, top: rect.bottom },
    );
  }, [open, triggerRef, anchor.left, anchor.top]);

  const { menuRef: popoverRef, style: popoverStyle } = useClampedMenuPosition(
    popoverAnchor?.left ?? 0,
    popoverAnchor?.top ?? 0,
    "topRight",
  );

  useEffect(() => {
    if (open) searchInputRef.current?.focus();
  }, [open]);

  if (languageState === null) return null;

  return (
    <>
      {/* 위치 계산(useClampedMenuPosition)이 `menuRef`를 div 기준으로
          잡는다 — 실제 버튼은 안쪽에 두고 이 div는 순수 위치 shell로만
          쓴다(padding 없이 버튼 크기에 꼭 맞춘다, popoverAnchor 실측이
          이 div의 rect를 그대로 버튼 경계로 쓴다). */}
      <div
        className="geul-code-block-language-trigger"
        data-block-id={languageState.blockId}
        ref={triggerRef}
        style={triggerStyle}
      >
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={dictionary.codeLanguage.label}
          onClick={handleTriggerClick}
          type="button"
        >
          {displayLabel(languageState.committed)}
        </button>
      </div>
      {open && (
        <div
          className="geul-code-block-language-popover"
          data-block-id={languageState.blockId}
          ref={popoverRef}
          style={popoverStyle}
        >
          <input
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={true}
            aria-label={dictionary.codeLanguage.searchPlaceholder}
            className="geul-code-block-language-popover__search"
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder={dictionary.codeLanguage.searchPlaceholder}
            ref={searchInputRef}
            role="combobox"
            value={search}
          />
          <div
            aria-label={dictionary.codeLanguage.suggestionsAriaLabel}
            className="geul-code-block-language-popover__suggestions"
            id={listboxId}
            role="listbox"
          >
            {suggestions.map((option) => (
              <button
                aria-selected={option.id === languageState.committed}
                className="geul-code-block-language-popover__option"
                data-active={
                  activeOptionId === `${listboxId}-${option.id}`
                    ? ""
                    : undefined
                }
                id={`${listboxId}-${option.id}`}
                key={option.id}
                onClick={() => commit(option.id)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                <span className="geul-code-block-language-popover__option-label">
                  <span
                    aria-hidden="true"
                    className="geul-code-block-language-popover__check"
                  >
                    {option.id === languageState.committed ? "✓" : ""}
                  </span>
                  {option.id === "text"
                    ? dictionary.codeLanguage.plainText
                    : option.label}
                </span>
                <span className="geul-code-block-language-popover__aliases">
                  {[option.id, ...(option.aliases ?? [])].join(", ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
