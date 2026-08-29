import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { findElementByAttribute } from "./find-by-attribute.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";
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

type LanguageState = {
  blockId: string;
  committed: string;
  draft: string;
};

type AnchorPosition = { left: number; top: number };

/** CodeBlock language 편집에 필요한 상태·명령·dismiss 동작을 한곳에 소유한다. */
export const CodeBlockLanguageCombobox = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const focusEditor = useFocusEditor(element);
  const [languageState, setLanguageState] = useState<LanguageState | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorPosition>({ left: 0, top: 0 });
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
      const block = findElementByAttribute(
        element,
        null,
        "data-be-block-id",
        blockId,
      );
      if (block === null) return;
      const rect = block.getBoundingClientRect();
      setAnchor((current) =>
        current.left === rect.left && current.top === rect.bottom
          ? current
          : { left: rect.left, top: rect.bottom },
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
  const { menuRef, style } = useClampedMenuPosition(anchor.left, anchor.top);

  if (languageState === null) return null;

  return (
    <div
      className="geul-code-block-language"
      data-block-id={languageState.blockId}
      ref={menuRef}
      style={style}
    >
      <label className="geul-code-block-language__label">
        <span>Code language</span>
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
          aria-label="Code language suggestions"
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
              <span>{option.label}</span>
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
