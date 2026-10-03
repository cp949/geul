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

import {
  type FixedPlacementAnchor,
  useFixedPlacement,
} from "./fixed-placement.js";
import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { handleMenuKeyDown } from "./menu-keyboard.js";
import {
  rangeBoundariesEqual,
  useDismissSuppression,
} from "./use-dismiss-suppression.js";
import { useDismissibleOverlay } from "./use-dismissible-overlay.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
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

// useDismissibleOverlay allow-list. 툴바 자신을 넣는다 — 안 그러면
// Open/Edit/Remove·Save/Cancel 버튼 pointerdown이 "바깥 클릭"으로 잡혀 버튼
// 자신의 onClick보다 먼저 툴바를 지운다(formatting-toolbar.tsx
// TOOLBAR_DISMISS_ALLOW_SELECTORS와 같은 이유). view와 editing 모드가 같은
// 셀렉터를 쓴다. URL input의 Escape는 입력이 툴바 안이라 module이 건너뛰고
// input 자신의 keydown(handleMenuKeyDown → cancelEditing)이 처리한다
// (Issue #233 RD-003 DELTA-02).
const LINK_TOOLBAR_DISMISS_ALLOW_SELECTORS = [".geul-link-toolbar"] as const;

type ToolbarState =
  | { mode: "closed" }
  | { mode: "view"; href: string | null }
  | {
      mode: "editing";
      href: string | null;
      draft: string;
      rejected: boolean;
    };

/**
 * 선택 영역의 화면 좌표를 읽지 못했을 때 쓰는 임의의 뷰포트 안쪽 좌표다.
 * 활성 링크는 있는데 DOM selection이 에디터 밖에 있는 드문 경우에만 쓰인다.
 * 정확한 값에는 의미가 없다 — 최종 위치는 `useFixedPlacement`가 어차피
 * 뷰포트 안으로 접어 넣으므로 화면 왼쪽 위 어딘가면 충분하다.
 */
const UNREADABLE_SELECTION_POSITION: FixedPlacementAnchor = {
  left: 96,
  top: 48,
};

/**
 * 자기 에디터 안에 있는 selection의 Range를 읽는다. collapsed 여부는 묻지
 * 않는다 — 링크 툴바는 collapsed caret(기존 링크 안)로도 뜨므로, 이 Range를
 * dismiss-suppression 키(useDismissSuppression<Range>)로도 재사용한다.
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

/**
 * 선택 Range 아래 중앙에 앵커할 좌표를 읽는다. 서식 툴바(FormattingToolbar)는
 * 선택 영역 위에 뜨므로 링크 툴바는 아래쪽에 배치해 두 툴바가 겹치지 않게 한다.
 *
 * Range가 없으면(DOM selection이 편집기 밖) 고정 대체 좌표다. rect를 읽을 수
 * 없으면 `null`이다. `getBoundingClientRect`가 없는 환경이거나, 연결이 끊긴
 * Range거나, 노드가 교체돼 Range가 접혀 rect가 0이 된 경우다. 이때
 * `useFixedPlacement`가 마지막 좌표를 유지한다.
 *
 * 편집 모드에서는 DOM selection이 입력으로 옮겨가 라이브 selection을 읽을 수
 * 없다. 그래서 라이브 selection이 아니라 열 때 보관한 Range를 읽는다.
 */
const readRangeAnchor = (range: Range | null): FixedPlacementAnchor | null => {
  if (range === null) return UNREADABLE_SELECTION_POSITION;
  if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
    return null;
  }
  const bounds = range.getBoundingClientRect?.();
  if (bounds === undefined || (bounds.width === 0 && bounds.height === 0)) {
    return null;
  }
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
  const dismissSuppression = useDismissSuppression<Range>(rangeBoundariesEqual);

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

    // 표 CellSelection(여러 셀 드래그 선택)도 non-collapsed Range를 만들어
    // 위 hasRange 판정을 통과한다 — table-selection-toolbar.tsx가 이미 같은
    // 선택을 다루므로 여기서 또 열리면 두 툴바가 겹친다. 병합된 셀 안의
    // 정상 텍스트 선택은 막지 않는다(formatting-toolbar.tsx의 같은 가드와
    // 같은 이유, isCellRangeSelected() 주석 참고).
    if (editor.isCellRangeSelected()) {
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

    setToolbarState({
      mode: "view",
      href: activeLink?.href ?? null,
    });
  }, [editor, element, dismissSuppression]);

  useSelectionRefresh({ element, onUpdate: updateFromSelection });

  useEffect(() => {
    if (toolbarState.mode === "editing") inputRef.current?.focus();
  }, [toolbarState.mode]);

  // 앵커는 열 때 보관한 Range(`currentRangeRef`)의 rect다. 열린 동안 스크롤마다
  // 다시 읽는다. 편집 모드는 `updateFromSelection`이 `editingRef`로 막혀도
  // 위치는 이 훅이 따라간다. clip은 앵커가 스크롤 컨테이너의 보이는 영역 밖이면
  // 숨긴다. 숨겨도 입력의 초점과 draft는 남는다(`visibility`만 바꾼다).
  const { menuRef, style } = useFixedPlacement({
    open: toolbarState.mode !== "closed",
    element,
    readAnchor: () => readRangeAnchor(currentRangeRef.current),
    clampAnchor: "centerBelow",
    clip: true,
  });
  const focusEditor = useFocusEditor(element);

  // 편집 모드를 닫는다. editingRef를 true로 세워 닫힌 직후 selectionchange가
  // updateFromSelection으로 view를 되살리지 못하게 하고, 다음 매크로태스크에
  // 푼다. 풀지 않으면 updateFromSelection이 영구히 막힌다. `restoreFocus`가
  // false면 초점은 건드리지 않는다. useDismissibleOverlay가 이미 정리했다.
  // closeAndRestoreFocus·onClose가 쓰므로 훅 호출 앞에 둔다.
  const closeEditingMode = useCallback(
    (restoreFocus: boolean) => {
      editingRef.current = true;
      if (restoreFocus) focusEditor();
      setToolbarState({ mode: "closed" });
      element?.ownerDocument.defaultView?.setTimeout(() => {
        editingRef.current = false;
      });
    },
    [element, focusEditor],
  );

  // 링크 툴바의 view와 편집 모드 닫힘은 useDismissibleOverlay가 소유한다
  // (G-UI-001, Issue #233 RD-003 DELTA-02). 열림은 view와 편집 모드 모두다.
  // view↔편집 전환은 `open`이 true로 유지돼 스택 위치가 바뀌지 않는다.
  // `onClose`는 현재 mode와 reason으로 가른다. module이 최신 `onClose`를 ref로
  // 읽으므로 렌더마다 새 함수여도 된다.
  // - view·escape: 같은 selection의 재관측 재오픈을 막으려 억제를 기록한다.
  //   초점은 module이 편집기로 되돌린다.
  // - view·outside: 편집기 안 클릭은 selection을 collapse해 updateFromSelection이
  //   먼저 닫는 경우가 많다. 서식 툴바 버튼 클릭처럼 selection이 유지되는
  //   바깥 pointerdown도 이 경로로 닫는다. 옛 훅도 같았다. 억제는 기록하지
  //   않는다.
  // - editing: 초안을 버리고 닫는다. 억제는 기록하지 않는다(cancelEditing과
  //   같다). editingRef 규칙은 closeEditingMode가 소유한다.
  // 이 호출은 early return 앞에 둔다. 훅은 조건부로 부를 수 없다.
  useDismissibleOverlay({
    open: toolbarState.mode === "view" || toolbarState.mode === "editing",
    element,
    allowSelectors: LINK_TOOLBAR_DISMISS_ALLOW_SELECTORS,
    onClose: (reason) => {
      if (toolbarState.mode === "editing") {
        if (reason === "outside") dismissSuppression.clear();
        closeEditingMode(false);
        return;
      }
      if (reason === "escape") {
        dismissSuppression.dismiss(currentRangeRef.current);
      } else {
        dismissSuppression.clear();
      }
      setToolbarState({ mode: "closed" });
    },
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
      href: toolbarState.href,
      draft: toolbarState.mode === "view" ? (toolbarState.href ?? "") : "",
      rejected: false,
    });
  };

  const closeAndRestoreFocus = () => closeEditingMode(true);

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
              // IME 가드·Escape·Enter 반복 억제·preventDefault는
              // handleMenuKeyDown이 소유한다(Issue #230). 조합 중 Escape는
              // module이 건너뛰어 편집을 취소하지 않는다.
              handleMenuKeyDown(event, {
                activate: applyLink,
                escape: cancelEditing,
              });
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
