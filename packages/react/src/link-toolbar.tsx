import type { EditorController } from "@cp949/geul-core";
import {
  Check,
  ExternalLink,
  LucideProvider,
  Pencil,
  Unlink,
  X,
} from "lucide-react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { useRangeDismissSuppression } from "./use-range-dismiss-suppression.js";
import { useSelectionRefresh } from "./use-selection-refresh.js";

// formatting-toolbar.tsx의 indentIcon/outdentIcon과 같은 이유로 모듈
// top-level에서 한 번만 만든다 — 매 렌더 새 ReactElement를 만들지 않는다.
const saveLinkIcon = <Check {...iconProps} />;
const cancelLinkIcon = <X {...iconProps} />;
const openLinkIcon = <ExternalLink {...iconProps} />;
const editLinkIcon = <Pencil {...iconProps} />;
const removeLinkIcon = <Unlink {...iconProps} />;

const linkToolbarButtonClassName = "geul-link-toolbar__button";
// IconButton과 같은 시각 계약(icon-button.tsx)이지만 Open link는 `<a>`라
// IconButton(<button> 전용) 대신 직접 조립한다 — href/target/rel로 실제
// 새 탭 열기·우클릭 컨텍스트 메뉴(링크 복사 등)를 유지해야 해서 button+
// window.open으로 대체할 수 없다.
const linkToolbarIconButtonClassName =
  "geul-icon-button geul-link-toolbar__icon-button";

// view 모드 툴바 자신을 allow-list에 넣는다 — 안 그러면 Open/Edit/Remove
// 버튼 pointerdown이 "바깥 클릭"으로 잡혀 버튼 자신의 onClick보다 먼저
// 툴바를 지운다(formatting-toolbar.tsx TOOLBAR_DISMISS_ALLOW_SELECTORS와
// 같은 이유). editing 모드는 이 훅을 쓰지 않는다 — URL input이 자기
// keydown에서 Escape를 이미 처리한다(cancelEditing).
const LINK_TOOLBAR_DISMISS_ALLOW_SELECTORS = [".geul-link-toolbar"] as const;

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

/**
 * 자기 에디터 안에 있는 selection의 Range를 읽는다. collapsed 여부는 묻지
 * 않는다 — 링크 툴바는 collapsed caret(기존 링크 안)로도 뜨므로, 이 Range를
 * dismiss-suppression 키(useRangeDismissSuppression)로도 재사용한다.
 */
const readSelectionRangeInElement = (element: HTMLElement): Range | null => {
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
  return selection.getRangeAt(0);
};

const readSelectionBounds = (element: HTMLElement): ToolbarPosition | null => {
  const range = readSelectionRangeInElement(element);
  if (range === null) return null;

  const bounds = range.getBoundingClientRect?.() ?? {
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
  // view 모드는 selection·caret 관측만으로 뜬다 — Escape로 닫아도
  // selectionchange/scroll/keyup 재관측이 같은 상태를 되살릴 수 있어
  // dismiss-suppression이 필요하다(G-UI-001, formatting-toolbar.tsx와 같은
  // 훅). 이 Range는 collapsed caret(기존 링크 안)도 포함한다 —
  // readSelectionRangeInElement가 collapsed 여부를 묻지 않는 이유.
  const currentRangeRef = useRef<Range | null>(null);
  const dismissSuppression = useRangeDismissSuppression();

  const updateFromSelection = useCallback(() => {
    if (editingRef.current) return;
    if (element === null) {
      setToolbarState({ mode: "closed" });
      dismissSuppression.clear();
      return;
    }

    const currentRange = readSelectionRangeInElement(element);
    const hasRange = currentRange !== null && !currentRange.collapsed;
    const activeLink = editor.getSelectionLink();

    if (!hasRange && activeLink === null) {
      setToolbarState({ mode: "closed" });
      dismissSuppression.clear();
      return;
    }

    // codeBlock의 schema는 marks: ""라 link도 적용 불가하다
    // (formatting-toolbar.tsx의 같은 가드 참고, Issue #173 QA).
    if (editor.getSelectionBlockType()?.blockType.type === "codeBlock") {
      setToolbarState({ mode: "closed" });
      dismissSuppression.clear();
      return;
    }

    // 미디어 블록 선택은 non-collapsed Range를 만들어 위 hasRange 판정을
    // 통과한다 — 텍스트가 없는 노드라 link도 적용 불가하다(formatting-
    // toolbar.tsx의 같은 가드와 같은 이유, MediaToolbar가 전담).
    if (editor.getSelectionMediaBlock() !== null) {
      setToolbarState({ mode: "closed" });
      dismissSuppression.clear();
      return;
    }

    if (
      currentRange !== null &&
      dismissSuppression.isSuppressed(currentRange)
    ) {
      return;
    }
    dismissSuppression.clear();
    currentRangeRef.current = currentRange?.cloneRange() ?? null;

    const bounds =
      readSelectionBounds(element) ?? UNREADABLE_SELECTION_POSITION;
    setToolbarState({
      mode: "view",
      left: bounds.left,
      top: bounds.top,
      href: activeLink?.href ?? null,
    });
  }, [editor, element, dismissSuppression]);

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

  // view 모드도 G-UI-001을 따른다(formatting-toolbar.tsx와 같은 훅). 바깥
  // pointerdown은 자연히 selection을 collapse해 updateFromSelection이 이미
  // 닫아주는 경우가 많으므로 onOutsideDismiss는 방어적 안전망이고 초점은
  // 옮기지 않는다. Escape는 돌아갈 selection이 없으니 초점을 편집기로
  // 되돌리고 dismissSuppression에 기록해 재관측 재오픈을 막는다. editing
  // 모드는 active에서 뺀다 — URL input이 자기 Escape를 이미 처리한다.
  const closeViewOnEscape = useCallback(() => {
    dismissSuppression.dismiss(currentRangeRef.current);
    focusEditor();
    setToolbarState({ mode: "closed" });
  }, [dismissSuppression, focusEditor]);
  const dismissViewOutside = useCallback(() => {
    dismissSuppression.clear();
    setToolbarState({ mode: "closed" });
  }, [dismissSuppression]);
  useDismissOnOutsideOrEscape({
    active: toolbarState.mode === "view",
    element,
    allowSelectors: LINK_TOOLBAR_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissViewOutside,
    onEscapeDismiss: closeViewOnEscape,
  });

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
            className={linkToolbarIconButtonClassName}
            href={toolbarState.href}
            onMouseDown={(event) => event.preventDefault()}
            rel="noreferrer"
            target="_blank"
            title={dictionary.toolbar.link.openLink}
          >
            <LucideProvider>{openLinkIcon}</LucideProvider>
          </a>
          <IconButton
            className="geul-link-toolbar__icon-button"
            icon={editLinkIcon}
            label={dictionary.toolbar.link.editLink}
            onClick={startEditing}
          />
          <IconButton
            className="geul-link-toolbar__icon-button"
            icon={removeLinkIcon}
            label={dictionary.toolbar.link.removeLink}
            onClick={removeLink}
          />
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
          <IconButton
            className="geul-link-toolbar__icon-button"
            icon={saveLinkIcon}
            label={dictionary.toolbar.link.saveLink}
            onClick={applyLink}
          />
          <IconButton
            className="geul-link-toolbar__icon-button"
            icon={cancelLinkIcon}
            label={dictionary.toolbar.link.cancelAriaLabel}
            onClick={cancelEditing}
          />
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
