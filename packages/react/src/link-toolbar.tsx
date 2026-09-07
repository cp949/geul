import type { EditorController } from "@cp949/geul-core";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { useSelectionRefresh } from "./use-selection-refresh.js";

const linkToolbarButtonClassName = "geul-link-toolbar__button";

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

/**
 * 선택 영역의 화면 좌표를 읽지 못했을 때 쓰는 임의의 뷰포트 안쪽 좌표다.
 * 활성 링크는 있는데 DOM selection이 에디터 밖에 있는 드문 경우에만 쓰인다.
 * 정확한 값에는 의미가 없다 — 최종 위치는 `useClampedMenuPosition`이 어차피
 * 뷰포트 안으로 접어 넣으므로 화면 왼쪽 위 어딘가면 충분하다.
 */
const UNREADABLE_SELECTION_POSITION: ToolbarPosition = { left: 96, top: 48 };

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
  // 서식 툴바(FormattingToolbar)는 선택 영역 위에 뜨므로,
  // 링크 툴바는 아래쪽에 배치해 두 툴바가 겹치지 않게 한다.
  return {
    left: bounds.left + bounds.width / 2,
    top: bounds.top + bounds.height,
  };
};

/**
 * `formatting-toolbar.tsx`와 동일 계약 — `portalTarget`(RD-003 DELTA-02),
 * `component`(RD-001 DELTA-02) 참고.
 */
export type LinkToolbarProps = {
  portalTarget?: HTMLElement | null;
  component?: FC<{ editor: EditorController }>;
};

export const LinkToolbar = ({
  portalTarget = null,
  component: Component,
}: LinkToolbarProps = {}) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const [toolbarState, setToolbarState] = useState<ToolbarState>({
    mode: "closed",
  });
  const editingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateFromSelection = useCallback(() => {
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

    const bounds =
      readSelectionBounds(element) ?? UNREADABLE_SELECTION_POSITION;
    setToolbarState({
      mode: "view",
      left: bounds.left,
      top: bounds.top,
      href: activeLink?.href ?? null,
    });
  }, [editor, element]);

  useSelectionRefresh({ element, onUpdate: updateFromSelection });

  useEffect(() => {
    if (toolbarState.mode === "editing") inputRef.current?.focus();
  }, [toolbarState.mode]);

  const { menuRef, style } = useClampedMenuPosition(
    toolbarState.mode === "closed" ? 0 : toolbarState.left,
    toolbarState.mode === "closed" ? 0 : toolbarState.top,
    "centerBelow",
  );
  const focusEditor = useFocusEditor(element);

  if (toolbarState.mode === "closed") return null;

  if (Component !== undefined) {
    const overridden = (
      <div
        aria-label={dictionary.toolbar.link.ariaLabel}
        className="geul-link-toolbar"
        ref={menuRef}
        role="toolbar"
        style={style}
      >
        <Component editor={editor} />
      </div>
    );
    return portalTarget === null
      ? overridden
      : createPortal(overridden, portalTarget);
  }

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
    focusEditor();
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

  const content = (
    <div
      aria-label={dictionary.toolbar.link.ariaLabel}
      className="geul-link-toolbar"
      ref={menuRef}
      role="toolbar"
      style={style}
    >
      {toolbarState.mode === "view" && toolbarState.href === null && (
        <button
          aria-label={dictionary.toolbar.link.addLink}
          className={linkToolbarButtonClassName}
          onClick={startEditing}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          {dictionary.toolbar.link.addLink}
        </button>
      )}
      {toolbarState.mode === "view" && toolbarState.href !== null && (
        <>
          <a
            aria-label={dictionary.toolbar.link.openLink}
            className={linkToolbarButtonClassName}
            href={toolbarState.href}
            onMouseDown={(event) => event.preventDefault()}
            rel="noreferrer"
            target="_blank"
          >
            {dictionary.toolbar.link.openLink}
          </a>
          <button
            aria-label={dictionary.toolbar.link.editLink}
            className={linkToolbarButtonClassName}
            onClick={startEditing}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            {dictionary.toolbar.link.editLink}
          </button>
          <button
            aria-label={dictionary.toolbar.link.removeLink}
            className={linkToolbarButtonClassName}
            onClick={removeLink}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            {dictionary.toolbar.link.removeLink}
          </button>
        </>
      )}
      {toolbarState.mode === "editing" && (
        <>
          <input
            aria-label={dictionary.toolbar.link.urlInputAriaLabel}
            className="geul-link-toolbar__input"
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
            aria-label={dictionary.toolbar.link.saveLink}
            className={linkToolbarButtonClassName}
            onClick={applyLink}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            {dictionary.toolbar.link.saveLink}
          </button>
          <button
            aria-label={dictionary.toolbar.link.cancelAriaLabel}
            className={linkToolbarButtonClassName}
            onClick={cancelEditing}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            {dictionary.toolbar.link.cancel}
          </button>
          {toolbarState.rejected && (
            <span className="geul-link-toolbar__error" role="alert">
              {dictionary.status.unsupportedLinkUrl}
            </span>
          )}
        </>
      )}
    </div>
  );

  return portalTarget === null ? content : createPortal(content, portalTarget);
};
