import type { MediaBlockKind } from "@cp949/geul-core";
import { useCallback, useEffect, useRef, useState } from "react";

import { extractNameFromUrl } from "./extract-name-from-url.js";
import {
  FALLBACK_BLOCK_POSITION,
  readBlockBounds,
} from "./read-block-bounds.js";
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

// Upload 탭의 서브 상태(RD-003 DELTA-02). success/cancelled는 core pending
// 맵에서 구분하지 않으므로(spec §4.2, 둘 다 null) 여기서도 별도 상태를 두지
// 않는다 — 둘 다 "idle"로 수렴한다(RD-003-DELTA-02.md "결정" 3).
type UploadSubState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "error"; code: string; message: string };

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
      /** 기본값은 항상 "embed" — uploadFile 등록 여부가 기본 활성 탭을
       * 바꾸지 않는다(RD-003-DELTA-02.md "결정" 2). */
      activeTab: "embed" | "upload";
      upload: UploadSubState;
      /** retry가 파일 선택 대화상자를 다시 열지 않고 재사용할 원본 File.
       * 패널이 닫혔다 다시 열리면(로컬 state 전부 소실) null로 되돌아간다 —
       * 그 경우 시딩된 error는 보여주되 Retry는 숨긴다(결정 5). */
      heldFile: File | null;
    } & PanelPosition);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        readBlockBounds(element, media.blockId) ?? FALLBACK_BLOCK_POSITION;
      // Upload 탭 초깃값 시딩(RD-003-DELTA-02.md "결정" 5) — 이전에 이
      // 블록에서 실패해 error pending이 남아 있으면 재오픈 즉시 그 에러를
      // 보여준다. uploadFile 미등록이면 pending 자체를 조회하지 않는다
      // (호출해도 항상 null이지만, 등록 여부와 무관한 호출을 피한다).
      const pending = editor.isUploadEnabled()
        ? editor.getMediaUploadState(media.blockId)
        : null;
      const upload: UploadSubState =
        pending === "uploading"
          ? { status: "uploading" }
          : pending === null
            ? { status: "idle" }
            : { status: "error", code: pending.code, message: pending.message };
      setPanelState({
        mode: "open",
        blockId: media.blockId,
        kind: media.kind,
        draft: "",
        rejected: false,
        appliedName: null,
        activeTab: "embed",
        upload,
        heldFile: null,
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

  // 탭 전환(Upload 클릭)으로만 발동한다 — 최초 열림은 위 effect가 이미
  // 처리한다(기본 활성 탭은 항상 embed). panelState.mode 하나로는 탭
  // 전환을 못 잡으므로 activeTab을 별도 원시값 의존성으로 뽑아 쓴다.
  const activeTab = panelState.mode === "open" ? panelState.activeTab : null;
  useEffect(() => {
    if (activeTab === "upload") fileInputRef.current?.focus();
  }, [activeTab]);

  // Upload/Embed 공용 — 파일 선택 직후와 retry 둘 다 이 함수로 들어온다
  // (RD-003.md "결정" — Promise를 직접 await해 loading→성공/실패/취소를
  // 로컬 state로 반영, getMediaUploadState는 열릴 때 초깃값 시딩용으로만
  // 쓴다). 성공/취소는 pending이 둘 다 null이라 구분하지 않는다(결정 3).
  const startUpload = useCallback(
    async (blockId: string, file: File) => {
      setPanelState((prev) =>
        prev.mode === "open" && prev.blockId === blockId
          ? { ...prev, heldFile: file, upload: { status: "uploading" } }
          : prev,
      );
      const result = await editor.commands.uploadMediaFile(blockId, file);
      setPanelState((prev) => {
        if (prev.mode !== "open" || prev.blockId !== blockId) return prev;
        if (!result.ok) {
          // 사전조건 실패(BLOCK_NOT_FOUND·COMMAND_NOT_APPLICABLE 등)만
          // 여기로 온다 — 콜백이 실제 정착한 뒤의 성공/실패/취소는 항상
          // ok:true라 아래 getMediaUploadState 분기가 담당한다.
          return {
            ...prev,
            upload: {
              status: "error",
              code: result.error.code,
              message: "Upload could not start.",
            },
          };
        }
        const pending = editor.getMediaUploadState(blockId);
        if (pending === "uploading") return prev;
        if (pending === null) {
          return { ...prev, upload: { status: "idle" }, heldFile: null };
        }
        return {
          ...prev,
          upload: {
            status: "error",
            code: pending.code,
            message: pending.message,
          },
        };
      });
    },
    [editor],
  );

  const handleFileChange = (event: { currentTarget: HTMLInputElement }) => {
    if (panelState.mode !== "open") return;
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (file === null) return;
    void startUpload(panelState.blockId, file);
  };

  const handleRetry = () => {
    if (panelState.mode !== "open" || panelState.heldFile === null) return;
    void startUpload(panelState.blockId, panelState.heldFile);
  };

  const handleCancel = () => {
    if (panelState.mode !== "open") return;
    editor.commands.cancelMediaUpload(panelState.blockId);
  };

  const handleTabClick = (tab: "embed" | "upload") => {
    setPanelState((prev) =>
      prev.mode === "open" ? { ...prev, activeTab: tab } : prev,
    );
  };

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

  // 등록 여부는 마운트 시점에 고정된다(EditorProvider "결정") — 렌더마다
  // 다시 불러도 값은 안정적이다. 미등록이면 tablist 자체를 렌더링하지
  // 않는다(RD-003-DELTA-02.md "결정" 1) — 기존 13개 단일 모드 테스트가
  // 그대로 통과해야 한다.
  const uploadEnabled = editor.isUploadEnabled();
  const showEmbedTab = !uploadEnabled || panelState.activeTab === "embed";
  const showUploadTab = uploadEnabled && panelState.activeTab === "upload";

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
      {uploadEnabled && (
        <div
          aria-label="Media source"
          className="geul-file-panel__tablist"
          role="tablist"
        >
          <button
            aria-selected={panelState.activeTab === "embed"}
            className={filePanelButtonClassName}
            onClick={() => handleTabClick("embed")}
            onMouseDown={(event) => event.preventDefault()}
            role="tab"
            type="button"
          >
            Embed
          </button>
          <button
            aria-selected={panelState.activeTab === "upload"}
            className={filePanelButtonClassName}
            onClick={() => handleTabClick("upload")}
            onMouseDown={(event) => event.preventDefault()}
            role="tab"
            type="button"
          >
            Upload
          </button>
        </div>
      )}
      {showEmbedTab && (
        <>
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
          {panelState.rejected && (
            <span className="geul-file-panel__error" role="alert">
              Unsupported media URL
            </span>
          )}
          {panelState.appliedName !== null && (
            <p className="geul-file-panel__name">
              Name: {panelState.appliedName}
            </p>
          )}
        </>
      )}
      {showUploadTab && (
        <div className="geul-file-panel__upload">
          <input
            aria-label={`${kindLabel(panelState.kind)} file`}
            disabled={panelState.upload.status === "uploading"}
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
          {panelState.upload.status === "uploading" && (
            <>
              <p role="status">Uploading…</p>
              <button
                className={filePanelButtonClassName}
                onClick={handleCancel}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                Cancel
              </button>
            </>
          )}
          {panelState.upload.status === "error" && (
            <>
              <span className="geul-file-panel__error" role="alert">
                {panelState.upload.message}
              </span>
              {panelState.heldFile !== null && (
                <button
                  className={filePanelButtonClassName}
                  onClick={handleRetry}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  Retry
                </button>
              )}
            </>
          )}
        </div>
      )}
      <button
        aria-label="Close file panel"
        className={filePanelButtonClassName}
        onClick={dismissPanelAndFocusEditor}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        Close
      </button>
    </div>
  );
};
