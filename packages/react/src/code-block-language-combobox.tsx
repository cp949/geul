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

import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";

type LanguageOption = {
  id: string;
  language: string;
  label: string;
  aliases: readonly string[];
};

const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  {
    id: "text",
    language: "text",
    label: "Plain Text",
    aliases: ["plain text", "none"],
  },
  {
    id: "javascript",
    language: "javascript",
    label: "JavaScript",
    aliases: ["js"],
  },
  {
    id: "typescript",
    language: "typescript",
    label: "TypeScript",
    aliases: ["ts"],
  },
  { id: "html", language: "html", label: "HTML", aliases: [] },
  { id: "css", language: "css", label: "CSS", aliases: [] },
  { id: "json", language: "json", label: "JSON", aliases: [] },
  { id: "bash", language: "bash", label: "Bash", aliases: ["sh", "shell"] },
  { id: "python", language: "python", label: "Python", aliases: ["py"] },
  { id: "java", language: "java", label: "Java", aliases: [] },
  { id: "kotlin", language: "kotlin", label: "Kotlin", aliases: [] },
  { id: "sql", language: "sql", label: "SQL", aliases: [] },
  { id: "markdown", language: "markdown", label: "Markdown", aliases: ["md"] },
];

const LANGUAGE_COMBOBOX_ALLOW_SELECTORS = [
  ".geul-code-block-language",
] as const;

// combobox는 CodeBlock 바로 아래(anchor.top = rect.bottom)에 `position: fixed`로
// 뜬다 — 문서 흐름에 자리를 차지하지 않으므로, 다음 블록이 code block 바로
// 뒤에 있으면(trailing 빈 문단 등, 항상 있을 수 있는 배치다) combobox가 그
// 블록을 그대로 덮어 가리고 클릭도 막는다(실사용 회귀). CodeBlock 자신에
// margin-bottom을 주는 방식은 시도하지 않는다 — PM이 관리하는 블록 DOM에
// 외부에서 style을 직접 쓰면 PM의 DOMObserver가 "예상 밖 변경"으로 보고 그
// 노드를 다시 그려(교체) rect 측정도 margin도 함께 사라진다(실측 확인,
// jsdom 테스트에서 재현). 대신 아래로 펼치면 다음 블록을 덮을 때만 combobox
// 자신을 code block 위로 뒤집는다 — 읽기만 하고 PM DOM에는 쓰지 않는다.
const CODE_LANGUAGE_GAP_PX = 8;

type LanguageState = {
  blockId: string;
  committed: string;
  draft: string;
};

type AnchorPosition = {
  left: number;
  top: number;
  bottom: number;
  /** 다음 형제 블록의 top. 없으면(마지막 블록) null — 뒤집기 판단에만 쓴다. */
  nextTop: number | null;
};

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
  const [anchor, setAnchor] = useState<AnchorPosition>({
    left: 0,
    top: 0,
    bottom: 0,
    nextTop: null,
  });
  const [comboboxHeight, setComboboxHeight] = useState(0);
  const dirtyRef = useRef(false);
  const languageStateRef = useRef(languageState);
  languageStateRef.current = languageState;
  const listboxId = `${useId()}-code-language-listbox`;

  const readActiveCodeBlock = useCallback(() => {
    const selection = editor.getSelectionBlockType();
    if (selection?.blockType.type !== "codeBlock") return null;
    return {
      blockId: selection.blockId,
      value: selection.blockType.language ?? "text",
    };
  }, [editor]);

  const updateAnchor = useCallback(
    (blockId: string) => {
      if (element === null) return;
      const blockElements = Array.from(
        element.querySelectorAll<HTMLElement>("[data-geul-block-id]"),
      );
      const index = blockElements.findIndex(
        (candidate) => candidate.getAttribute("data-geul-block-id") === blockId,
      );
      const block = index === -1 ? null : blockElements[index];
      if (block === undefined || block === null) return;
      const rect = block.getBoundingClientRect();
      // 다음 형제 블록(예: trailing 빈 문단)의 top만 읽는다 — 뒤집을지
      // 판단하는 데만 쓰고 그 블록에도 아무것도 쓰지 않는다.
      const next = blockElements[index + 1];
      const nextTop = next === undefined ? null : next.getBoundingClientRect().top;
      setAnchor((current) =>
        current.left === rect.left &&
        current.top === rect.top &&
        current.bottom === rect.bottom &&
        current.nextTop === nextTop
          ? current
          : { left: rect.left, top: rect.top, bottom: rect.bottom, nextTop },
      );
    },
    [element],
  );

  useEffect(() => {
    const updateFromSelection = () => {
      const active = readActiveCodeBlock();
      if (active === null) {
        dirtyRef.current = false;
        setOpen(false);
        setLanguageState(null);
        return;
      }

      updateAnchor(active.blockId);
      setLanguageState((current) => {
        if (current?.blockId === active.blockId && dirtyRef.current) {
          return current;
        }
        dirtyRef.current = false;
        if (
          current?.blockId === active.blockId &&
          current.committed === active.value &&
          current.draft === active.value
        ) {
          return current;
        }
        return {
          blockId: active.blockId,
          committed: active.value,
          draft: active.value,
        };
      });
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

  const cancelDraft = useCallback(() => {
    dirtyRef.current = false;
    setLanguageState((current) =>
      current === null ? null : { ...current, draft: current.committed },
    );
    setOpen(false);
  }, []);

  const dismissWithFocus = useCallback(() => {
    cancelDraft();
    focusEditor();
  }, [cancelDraft, focusEditor]);

  useDismissOnOutsideOrEscape({
    active: open,
    element,
    allowSelectors: LANGUAGE_COMBOBOX_ALLOW_SELECTORS,
    onOutsideDismiss: cancelDraft,
    onEscapeDismiss: dismissWithFocus,
  });

  const commit = useCallback(
    (draft: string) => {
      const current = languageStateRef.current;
      if (current === null) return;
      const result = editor.commands.setBlockType(current.blockId, {
        type: "codeBlock",
        language: draft,
      });
      if (!result.ok) return;

      const active = readActiveCodeBlock();
      if (active !== null && active.blockId === current.blockId) {
        dirtyRef.current = false;
        setLanguageState({
          blockId: active.blockId,
          committed: active.value,
          draft: active.value,
        });
      }
      setOpen(false);
      focusEditor();
    },
    [editor, focusEditor, readActiveCodeBlock],
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const draft = event.currentTarget.value;
    dirtyRef.current = true;
    setLanguageState((current) =>
      current === null ? null : { ...current, draft },
    );
    setOpen(true);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    commit(event.currentTarget.value);
  };

  const draft = languageState?.draft ?? "";
  const needle = draft.toLocaleLowerCase();
  const suggestions = LANGUAGE_OPTIONS.filter((option) =>
    needle.length === 0
      ? true
      : [option.language, option.label, ...option.aliases].some((value) =>
          value.toLocaleLowerCase().includes(needle),
        ),
  );
  // 필터 결과의 첫 항목을 자동 활성화하면 unknown draft가 부분 일치한 known
  // option으로 읽히지만 Enter는 raw draft를 commit하는 ARIA 불일치가 생긴다.
  // canonical/display/alias가 정확히 일치할 때만 해당 option을 활성화한다.
  const normalizedDraft = draft.trim().toLocaleLowerCase();
  const activeSuggestion = suggestions.find(
    (option) =>
      option.language === draft ||
      option.aliases.some(
        (alias) => alias.toLocaleLowerCase() === normalizedDraft,
      ),
  );
  const activeOptionId =
    open && activeSuggestion !== undefined
      ? `${listboxId}-${activeSuggestion.id}`
      : undefined;
  // 아래로 펼쳤을 때 다음 블록(trailing 빈 문단 등)을 combobox 높이가
  // 덮으면 code block 위로 뒤집는다. comboboxHeight는 이전 렌더의 실측값이라
  // 첫 렌더는 0(뒤집지 않음)으로 시작하고, 실측 뒤 필요하면 한 번 더 렌더해
  // 뒤집는다 — useClampedMenuPosition의 "그리고 나서 보정" 패턴과 같다.
  const placeAbove =
    anchor.nextTop !== null &&
    anchor.bottom + CODE_LANGUAGE_GAP_PX + comboboxHeight > anchor.nextTop;
  const { menuRef, style } = useClampedMenuPosition(
    anchor.left,
    placeAbove ? anchor.top : anchor.bottom,
    placeAbove ? "aboveLeft" : "topLeft",
  );

  // 높이 실측은 combobox 자신의 DOM만 읽는다 — PM이 관리하는 블록 DOM에는
  // 아무것도 쓰지 않는다(위 CODE_LANGUAGE_GAP_PX 주석 참고). open·suggestions
  // 의존성은 draft 입력으로 목록이 열리고 닫히며 높이가 바뀌는 경우를 잡는다
  // (jsdom에는 ResizeObserver가 없어 단위 테스트는 이 의존성 재실행에
  // 기댄다 — use-clamped-menu-position.ts와 같은 제약).
  useLayoutEffect(() => {
    const node = menuRef.current;
    if (node === null) {
      setComboboxHeight(0);
      return;
    }
    const measure = () => {
      const next = node.getBoundingClientRect().height;
      setComboboxHeight((current) => (current === next ? current : next));
    };
    measure();

    const ownerWindow = node.ownerDocument.defaultView;
    if (
      ownerWindow === null ||
      typeof ownerWindow.ResizeObserver !== "function"
    ) {
      return;
    }
    const observer = new ownerWindow.ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [menuRef, languageState?.blockId, open, suggestions.length]);

  if (languageState === null) return null;

  return (
    <div
      className={
        placeAbove
          ? "geul-code-block-language geul-code-block-language--above"
          : "geul-code-block-language"
      }
      data-block-id={languageState.blockId}
      ref={menuRef}
      style={style}
    >
      <label className="geul-code-block-language__label">
        <span>{dictionary.codeLanguage.label}</span>
        <input
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          className="geul-code-block-language__input"
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          role="combobox"
          value={languageState.draft}
        />
      </label>
      {open && (
        <div
          aria-label={dictionary.codeLanguage.suggestionsAriaLabel}
          className="geul-code-block-language__suggestions"
          id={listboxId}
          role="listbox"
        >
          {suggestions.map((option) => (
            <button
              aria-selected={activeOptionId === `${listboxId}-${option.id}`}
              className="geul-code-block-language__option"
              id={`${listboxId}-${option.id}`}
              key={option.id}
              onClick={() => commit(option.language)}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
              type="button"
            >
              <span>
                {option.id === "text"
                  ? dictionary.codeLanguage.plainText
                  : option.label}
              </span>
              <span className="geul-code-block-language__aliases">
                {[option.language, ...option.aliases].join(", ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
