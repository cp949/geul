import type { MediaBlockKind } from "@cp949/geul-core";
import { useCallback, useEffect, useRef, useState } from "react";

import { extractNameFromUrl } from "./extract-name-from-url.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";

const filePanelButtonClassName = "geul-file-panel__button";

// useDismissOnOutsideOrEscape allow-list. SlashMenu/BlockSelectionToolbar와
// 같은 이유로 모듈 스코프 상수로 둔다(매 렌더 새 배열이면 그 훅의 effect가
// 리스너를 매 렌더 떼었다 다시 붙인다).
const FILE_PANEL_DISMISS_ALLOW_SELECTORS = [".geul-file-panel"] as const;

const kindLabel = (kind: MediaBlockKind): string =>
  kind.charAt(0).toUpperCase() + kind.slice(1);

type PanelPosition = { left: number; top: number };

type PanelState =
  | { mode: "closed" }
  | ({
      mode: "open";
      blockId: string;
      kind: MediaBlockKind;
      draft: string;
      rejected: boolean;
      /** 마지막으로 성공 적용된 이름 초깃값(추출 실패 시 URL 자체). 아직 제출 전이면 null. */
      appliedName: string | null;
    } & PanelPosition);

/**
 * 대상 미디어 블록의 렌더된 DOM(`[data-be-block-id]`, RD-002 DELTA-01)
 * bounding rect를 읽어 패널을 그 아래 앵커한다. LinkToolbar가 브라우저
 * Selection range로 좌표를 읽는 것과 달리 블록 자체를 selector로 찾는다 —
 * media 블록은 atom이라 텍스트 range가 아니라 NodeSelection이고, 이
 * selector는 RD-002가 부여한 계약이라 selection range 해석 없이도 항상
 * 존재한다.
 */
const readBlockBounds = (
  element: HTMLElement,
  blockId: string,
): PanelPosition | null => {
  const target = element.querySelector<HTMLElement>(
    `[data-be-block-id="${blockId}"]`,
  );
  if (target === null) return null;
  const rect = target.getBoundingClientRect();
  return { left: rect.left + rect.width / 2, top: rect.bottom };
};

/** 대상 블록 DOM을 못 찾았을 때(드문 경우)만 쓰는 임의 뷰포트 안쪽 좌표 — link-toolbar.tsx의 같은 이름 상수와 같은 이유. */
const FALLBACK_POSITION: PanelPosition = { left: 96, top: 48 };

/**
 * `url` 없는 빈 미디어 블록이 선택되면 자동으로 열려 URL 입력을 받는
 * 패널(spec §6.1, RD-003 DELTA-01). SlashMenu가 내부 자동 마운트하는
 * TableHandles·BlockSideMenu와 달리 최상위 export다 — 슬라이스3(upload)·
 * 슬라이스4(drag/drop)의 다른 생성 경로도 같은 패널을 열어야 해서
 * slash 결합을 전제하지 않는다(roadmap.md RD-003 포함 범위).
 *
 * 열림·닫힘 판정은 selection 기반 자체 상태 기계다 — `editor
 * .getSelectionMediaBlock()`(RD-003 DELTA-01 core 추가)이 core 진실
 * 원본이고, 이 컴포넌트는 그 결과를 selectionchange 등 네이티브 이벤트가
 * 일어날 때마다 다시 읽을 뿐 별도 열림 상태를 직접 소유하지 않는다
 * (LinkToolbar와 같은 아키텍처).
 */
export const FilePanel = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [panelState, setPanelState] = useState<PanelState>({ mode: "closed" });
  // 패널이 열려 있는 동안(항상 "입력 중" 상태다 — url 없는 블록에서만
  // 열리므로 LinkToolbar의 "view" 모드에 해당하는 상태가 없다) 재유도를
  // 막는다. 그러지 않으면 입력창에 타이핑하며 발생하는 selectionchange(초점
  // 이동)가 draft를 지운다(link-toolbar.tsx의 editingRef와 같은 이유).
  const editingRef = useRef(false);
  // dismissPanel이 방금 닫은 blockId를 적어 둔다. 닫는 시점엔 PM selection
  // 자체가 안 바뀌므로(핵심 core state가 아니라 이 컴포넌트의 로컬
  // "닫힘" 결정일 뿐이다) editingRef의 setTimeout 창이 끝난 뒤 뒤늦게
  // 도착하는 selectionchange/mouseup(Playwright 병렬 실행처럼 CPU 경합이
  // 큰 환경에서 흔하다, slash-menu.tsx dismissedQueryRef와 같은 문제)이
  // 여전히 "같은 빈 블록"을 봐서 패널을 곧바로 재오픈시킨다(e2e 실측:
  // "바깥 클릭은 패널을 닫되..." 병렬 반복에서 재현). 이 ref로 "같은
  // blockId면 재오픈하지 않는다"를 시간이 아니라 상태로 고정한다 —
  // slash-menu.tsx의 dismissedQueryRef와 같은 해법이다.
  const dismissedBlockIdRef = useRef<string | null>(null);
  const openBlockIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updateFromSelection = () => {
      if (editingRef.current) return;
      if (element === null) {
        openBlockIdRef.current = null;
        dismissedBlockIdRef.current = null;
        setPanelState({ mode: "closed" });
        return;
      }

      const media = editor.getSelectionMediaBlock();
      if (media === null || media.url !== null) {
        // 실제로 다른 블록(또는 url이 채워진 블록)으로 선택이 옮겨갔다 —
        // 다음에 다시 이 blockId로 돌아오면 다시 열려야 하므로 잊는다.
        openBlockIdRef.current = null;
        dismissedBlockIdRef.current = null;
        setPanelState({ mode: "closed" });
        return;
      }
      if (dismissedBlockIdRef.current === media.blockId) return;

      openBlockIdRef.current = media.blockId;
      editingRef.current = true;
      const bounds =
        readBlockBounds(element, media.blockId) ?? FALLBACK_POSITION;
      setPanelState({
        mode: "open",
        blockId: media.blockId,
        kind: media.kind,
        draft: "",
        rejected: false,
        appliedName: null,
        left: bounds.left,
        top: bounds.top,
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
    if (panelState.mode === "open") inputRef.current?.focus();
  }, [panelState.mode]);

  const { menuRef, style } = useClampedMenuPosition(
    panelState.mode === "closed" ? 0 : panelState.left,
    panelState.mode === "closed" ? 0 : panelState.top,
    "centerBelow",
  );
  const focusEditor = useFocusEditor(element);

  const dismissPanel = useCallback(() => {
    dismissedBlockIdRef.current = openBlockIdRef.current;
    editingRef.current = true;
    setPanelState({ mode: "closed" });
    element?.ownerDocument.defaultView?.setTimeout(() => {
      editingRef.current = false;
    });
  }, [element]);
  // link-toolbar.tsx의 closeAndRestoreFocus와 같은 순서(focus 먼저, close
  // 나중) — 반대로 하면 실제 Chromium에서 초점이 편집기로 옮겨 붙지
  // 않는다(e2e 실측: media-file-panel.spec.ts "Escape는 패널을 닫고
  // 편집기로 초점을 되돌린다", jsdom 단위 테스트는 두 순서 다 통과해
  // e2e 없이는 못 잡는 차이다).
  const dismissPanelAndFocusEditor = useCallback(() => {
    focusEditor();
    dismissPanel();
  }, [dismissPanel, focusEditor]);

  useDismissOnOutsideOrEscape({
    active: panelState.mode === "open",
    element,
    allowSelectors: FILE_PANEL_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissPanel,
    onEscapeDismiss: dismissPanelAndFocusEditor,
  });

  if (panelState.mode === "closed") return null;

  const applyUrl = () => {
    if (panelState.mode !== "open") return;
    const result = editor.commands.setMediaBlockUrl(
      panelState.blockId,
      panelState.draft,
    );
    if (!result.ok) {
      setPanelState({ ...panelState, rejected: true });
      return;
    }
    // name 초깃값은 마지막 path segment에서 추출한다(spec §6.1). 추출
    // 실패는 setMediaBlockName을 호출하지 않는다 — media-block-extension.ts
    // renderHTML(RD-002)이 이미 name 없으면 url로 폴백해 렌더하므로, 여기서
    // "실패 시 URL 자체를 표시"를 다시 구현할 필요가 없다.
    const extractedName = extractNameFromUrl(panelState.draft);
    if (extractedName !== null) {
      editor.commands.setMediaBlockName(panelState.blockId, extractedName);
    }
    setPanelState({
      ...panelState,
      rejected: false,
      appliedName: extractedName ?? panelState.draft,
    });
  };

  return (
    <div
      aria-label="File panel"
      className="geul-file-panel"
      ref={menuRef}
      role="toolbar"
      style={style}
    >
      <input
        aria-label={`${kindLabel(panelState.kind)} URL`}
        onChange={(event) => {
          if (panelState.mode !== "open") return;
          setPanelState({
            ...panelState,
            draft: event.currentTarget.value,
            rejected: false,
          });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applyUrl();
          }
        }}
        ref={inputRef}
        type="text"
        value={panelState.draft}
      />
      <button
        aria-label="Save URL"
        className={filePanelButtonClassName}
        onClick={applyUrl}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        Save
      </button>
      <button
        aria-label="Close file panel"
        className={filePanelButtonClassName}
        onClick={dismissPanelAndFocusEditor}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        Close
      </button>
      {panelState.rejected && (
        <span className="geul-file-panel__error" role="alert">
          Unsupported media URL
        </span>
      )}
      {panelState.appliedName !== null && (
        <p className="geul-file-panel__name">Name: {panelState.appliedName}</p>
      )}
    </div>
  );
};
