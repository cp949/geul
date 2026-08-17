import { useEffect, useRef, useState } from "react";

import { useEditor, useEditorMount } from "./use-editor.js";

const linkToolbarButtonClassName =
  "geul:cursor-pointer geul:rounded geul:border-0 geul:bg-transparent geul:whitespace-nowrap geul:px-1.5 geul:py-1 geul:text-[color:var(--be-color-text,#202124)]";

type ToolbarPosition = { left: number; top: number };

type ToolbarState =
  | { mode: "closed" }
  | ({ mode: "view"; href: string | null } & ToolbarPosition)
  | ({
      mode: "editing";
      href: string | null;
      draft: string;
      rejected: boolean;
    } & ToolbarPosition);

const readSelectionBounds = (element: HTMLElement): ToolbarPosition | null => {
  const selection = element.ownerDocument.getSelection();
  if (
    selection === null ||
    selection.rangeCount === 0 ||
    selection.anchorNode === null ||
    selection.focusNode === null ||
    !element.contains(selection.anchorNode) ||
    !element.contains(selection.focusNode)
  ) {
    return null;
  }

  const bounds = selection.getRangeAt(0).getBoundingClientRect?.() ?? {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  };
  const viewportWidth = element.ownerDocument.defaultView?.innerWidth ?? 0;
  const left = Math.min(
    Math.max(bounds.left + bounds.width / 2, 96),
    Math.max(viewportWidth - 96, 96),
  );
  // 서식 툴바(FormattingToolbar)는 선택 영역 위에 뜨므로,
  // 링크 툴바는 아래쪽에 배치해 두 툴바가 겹치지 않게 한다.
  return { left, top: bounds.top + bounds.height };
};

export const LinkToolbar = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [toolbarState, setToolbarState] = useState<ToolbarState>({
    mode: "closed",
  });
  const editingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updateFromSelection = () => {
      if (editingRef.current) return;
      if (element === null) {
        setToolbarState({ mode: "closed" });
        return;
      }

      const selection = element.ownerDocument.getSelection();
      const hasRange =
        selection !== null &&
        selection.rangeCount > 0 &&
        !selection.isCollapsed &&
        selection.anchorNode !== null &&
        selection.focusNode !== null &&
        element.contains(selection.anchorNode) &&
        element.contains(selection.focusNode);
      const activeLink = editor.getSelectionLink();

      if (!hasRange && activeLink === null) {
        setToolbarState({ mode: "closed" });
        return;
      }

      const bounds = readSelectionBounds(element) ?? { left: 96, top: 48 };
      setToolbarState({
        mode: "view",
        left: bounds.left,
        top: bounds.top,
        href: activeLink?.href ?? null,
      });
    };

    const ownerDocument = element?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    ownerDocument?.addEventListener("selectionchange", updateFromSelection);
    ownerDocument?.addEventListener("mouseup", updateFromSelection);
    ownerDocument?.addEventListener("keyup", updateFromSelection);
    ownerWindow?.addEventListener("scroll", updateFromSelection, true);
    ownerWindow?.addEventListener("resize", updateFromSelection);
    updateFromSelection();
    return () => {
      ownerDocument?.removeEventListener(
        "selectionchange",
        updateFromSelection,
      );
      ownerDocument?.removeEventListener("mouseup", updateFromSelection);
      ownerDocument?.removeEventListener("keyup", updateFromSelection);
      ownerWindow?.removeEventListener("scroll", updateFromSelection, true);
      ownerWindow?.removeEventListener("resize", updateFromSelection);
    };
  }, [editor, element]);

  useEffect(() => {
    if (toolbarState.mode === "editing") inputRef.current?.focus();
  }, [toolbarState.mode]);

  if (toolbarState.mode === "closed") return null;

  const startEditing = () => {
    editingRef.current = true;
    setToolbarState({
      mode: "editing",
      left: toolbarState.left,
      top: toolbarState.top,
      href: toolbarState.href,
      draft: toolbarState.mode === "view" ? (toolbarState.href ?? "") : "",
      rejected: false,
    });
  };

  const closeAndRestoreFocus = () => {
    editingRef.current = true;
    element?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
    setToolbarState({ mode: "closed" });
    element?.ownerDocument.defaultView?.setTimeout(() => {
      editingRef.current = false;
    });
  };

  const cancelEditing = () => closeAndRestoreFocus();

  const applyLink = () => {
    if (toolbarState.mode !== "editing") return;
    if (toolbarState.href === toolbarState.draft) {
      closeAndRestoreFocus();
      return;
    }
    const result = editor.commands.setLink(toolbarState.draft);
    if (result.ok) {
      closeAndRestoreFocus();
      return;
    }
    setToolbarState({ ...toolbarState, rejected: true });
  };

  const removeLink = () => {
    editor.commands.unsetLink();
    closeAndRestoreFocus();
  };

  return (
    <div
      aria-label="Link"
      className="geul:fixed geul:z-10 geul:flex geul:items-center geul:gap-1.5 geul:rounded-md geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:bg-[var(--be-color-surface,#fff)] geul:px-1.5 geul:py-1 geul:shadow-[0_1px_4px_rgba(0,0,0,0.15)] geul:[transform:translate(-50%,0.5rem)]"
      role="toolbar"
      style={{ left: toolbarState.left, top: toolbarState.top }}
    >
      {toolbarState.mode === "view" && toolbarState.href === null && (
        <button
          aria-label="Add link"
          className={linkToolbarButtonClassName}
          onClick={startEditing}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          Add link
        </button>
      )}
      {toolbarState.mode === "view" && toolbarState.href !== null && (
        <>
          <a
            aria-label="Open link"
            className={linkToolbarButtonClassName}
            href={toolbarState.href}
            onMouseDown={(event) => event.preventDefault()}
            rel="noreferrer"
            target="_blank"
          >
            Open link
          </a>
          <button
            aria-label="Edit link"
            className={linkToolbarButtonClassName}
            onClick={startEditing}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Edit link
          </button>
          <button
            aria-label="Remove link"
            className={linkToolbarButtonClassName}
            onClick={removeLink}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Remove link
          </button>
        </>
      )}
      {toolbarState.mode === "editing" && (
        <>
          <input
            aria-label="Link URL"
            className="geul:min-w-56 geul:rounded geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:px-1.5 geul:py-1"
            onChange={(event) => {
              if (toolbarState.mode !== "editing") return;
              setToolbarState({
                ...toolbarState,
                draft: event.currentTarget.value,
                rejected: false,
              });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
            }}
            ref={inputRef}
            type="text"
            value={toolbarState.draft}
          />
          <button
            aria-label="Save link"
            className={linkToolbarButtonClassName}
            onClick={applyLink}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Save link
          </button>
          <button
            aria-label="Cancel link edit"
            className={linkToolbarButtonClassName}
            onClick={cancelEditing}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Cancel
          </button>
          {toolbarState.rejected && (
            <span
              className="geul:text-xs geul:text-[color:var(--be-color-danger,#d93025)]"
              role="alert"
            >
              Unsupported link URL
            </span>
          )}
        </>
      )}
    </div>
  );
};
