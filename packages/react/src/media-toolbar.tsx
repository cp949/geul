import type { MediaBlockKind } from "@cp949/geul-core";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  FALLBACK_BLOCK_POSITION,
  readBlockBounds,
} from "./read-block-bounds.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { useTableCommandFeedback } from "./use-table-command-feedback.js";

const mediaToolbarButtonClassName = "geul-media-toolbar__button";
const dangerButtonClassName =
  "geul-media-toolbar__button geul-media-toolbar__button--danger";

// useDismissOnOutsideOrEscape allow-list. FilePanel/SlashMenu와 같은 이유로
// 모듈 스코프 상수로 둔다(매 렌더 새 배열이면 그 훅의 effect가 리스너를 매
// 렌더 떼었다 다시 붙인다).
//
// `[data-be-block-id]`(모든 블록의 공통 wrapper, RD-002 계약 — block-selection
// -toolbar.tsx도 같은 selector를 전체 블록 조회에 쓴다)를 포함하는 이유:
// 이 selector가 없으면 지금 toolbar가 표시 중인 바로 그 미디어 블록을 다시
// 클릭하는 것조차 "바깥 클릭"으로 오판정된다. pointerdown 시점엔 아직 그
// 클릭이 PM selection을 다시 그 블록으로 확정하기 전이라, dismissToolbar가
// 먼저 실행돼 dismissedBlockIdRef를 그 blockId로 세팅한다. 뒤이은 클릭의
// mouseup/selectionchange가 (선택이 실제로는 그대로거나 다시 같은 블록으로
// 온) media를 재조회해도 dismissedBlockIdRef가 같은 blockId라 재오픈이
// 막힌다 — 실측: 같은 블록 재클릭이 toolbar를 영영 못 여는 회귀(e2e
// --repeat-each 없이도 재현). 편집기 내부 클릭(다른 블록 포함)은 이
// selector로 전부 "바깥 아님" 처리하고, 그 뒤 실제 상태 반영은
// updateFromSelection(selectionchange/mouseup)에 맡긴다 — 편집기 완전
// 바깥(예: "Save JSON" 버튼)만 진짜 바깥 클릭으로 남는다.
// `[data-be-media-resize-handle]`(media-resize-handles.tsx)도 같은 이유로
// 포함한다: MediaResizeHandles는 app.tsx에서 이 toolbar와 형제로 마운트되고
// 자기 핸들을 `[data-be-block-id]` 밖의 fixed 오버레이로 그린다(리사이즈는
// 시각 좌표만 필요할 뿐 셀 텍스트처럼 편집기 DOM 안에 있을 이유가 없다).
// 이 selector가 없으면 핸들 드래그 시작 pointerdown 자체가 "바깥 클릭"으로
// 오판정돼 toolbar가 닫히고, 리사이즈가 selection을 바꾸지 않는 한
// dismissedBlockIdRef가 계속 같은 blockId를 가리켜 드래그가 끝난 뒤에도
// 재오픈이 막힌다(코드리뷰 발견, RD-001 DELTA-02 회귀 — data-be-* 속성
// 컨벤션을 쓴다, CSS 클래스명이 아니라 — `[data-be-block-id]`와 같은 이유로
// 스타일링과 무관한 구조 계약이다).
const MEDIA_TOOLBAR_DISMISS_ALLOW_SELECTORS = [
  ".geul-media-toolbar",
  "[data-be-block-id]",
  "[data-be-media-resize-handle]",
] as const;

const kindLabel = (kind: MediaBlockKind): string =>
  kind.charAt(0).toUpperCase() + kind.slice(1);

type ToolbarPosition = { left: number; top: number };

type MediaInfo = {
  blockId: string;
  kind: MediaBlockKind;
  url: string;
  name: string | null;
  caption: string | null;
};

// Upload 탭(file-panel.tsx, RD-003 DELTA-02)과 같은 모양이지만 코드는
// 공유하지 않는다 — RD-003-DELTA-03.md "결정"(사용처 2곳뿐이라 훅 추출
// 이득이 적다, 이 저장소의 두 파일이 이미 selection 상태 기계·kindLabel을
// 각자 복제하는 관례와 일치).
type UploadSubState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "error"; code: string; message: string };

type ToolbarState =
  | { mode: "closed" }
  | ({ mode: "view" } & MediaInfo & ToolbarPosition)
  | ({ mode: "editingName" | "editingCaption"; draft: string } & MediaInfo &
      ToolbarPosition)
  | ({
      mode: "replacing";
      upload: UploadSubState;
      /** retry가 파일 선택 대화상자를 다시 열지 않고 재사용할 원본 File. */
      heldFile: File | null;
    } & MediaInfo &
      ToolbarPosition);

/**
 * `url`이 있는 미디어 블록을 선택하면 나타나는 편집 toolbar(spec §6.2,
 * §6.3 다운로드 부분, RD-004 DELTA-01). `url` 없는 블록은 `FilePanel`이
 * 담당하고(RD-003) 이 toolbar는 열리지 않는다 — 두 컴포넌트는
 * `getSelectionMediaBlock().url` 값으로 상호 배타적이다.
 *
 * `file-panel.tsx`와 같은 selection 기반 상태 기계(`getSelectionMediaBlock()`
 * 이 core 진실 원본, 로컬 상태는 selectionchange 등 네이티브 이벤트마다
 * 다시 검증), 같은 `dismissedBlockIdRef` 재오픈 방지(G-UI-001 — "닫은
 * 상태의 안정 key를 ref에 기록하고 같은 상태의 재관측만 무시한다"), 같은
 * focus-then-close 순서를 그대로 재사용한다. rename/caption 편집 입력은
 * `link-toolbar.tsx`의 draft/Save/Cancel 상태 기계(값이 바뀌지 않았으면
 * 명령을 생략)를 재사용한다. delete는 `block-selection-toolbar.tsx`처럼
 * `useTableCommandFeedback`으로 `Result` 실패를 처리한다 — 성공 뒤 focus를
 * 옮기지 않는 것도 그 전례와 같다(view 모드 버튼은 mousedown에서 초점
 * 이동을 막아 애초에 DOM 초점을 받지 않는다).
 */
export const MediaToolbar = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [toolbarState, setToolbarState] = useState<ToolbarState>({
    mode: "closed",
  });
  // 편집(rename/caption) 중 selectionchange 등에 의한 재조회를 막는다 —
  // 그러지 않으면 입력 중 발생하는 selectionchange가 draft를 지운다
  // (link-toolbar.tsx/file-panel.tsx와 같은 이유).
  const editingRef = useRef(false);
  // 현재 view/editing 중인 blockId. dismissToolbar가 상태 클로저 없이
  // 최신 값을 읽기 위해 ref로 따로 둔다(file-panel.tsx openBlockIdRef와
  // 같은 이유 — dismissToolbar를 `[element]`만으로 안정된 참조로 유지한다).
  const viewBlockIdRef = useRef<string | null>(null);
  // dismissToolbar가 방금 닫은 blockId. 같은 blockId의 재관측을 무시해
  // Escape/바깥 클릭 직후 뒤늦게 도착하는 이벤트의 재오픈을 막는다
  // (G-UI-001, file-panel.tsx dismissedBlockIdRef와 같은 문제·같은 해법).
  const dismissedBlockIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const { actionError, runCommand, clearActionError } =
    useTableCommandFeedback();

  const updateFromSelection = useCallback(() => {
    if (editingRef.current) return;
    if (element === null) {
      viewBlockIdRef.current = null;
      dismissedBlockIdRef.current = null;
      setToolbarState({ mode: "closed" });
      return;
    }

    const media = editor.getSelectionMediaBlock();
    if (media === null || media.url === null) {
      viewBlockIdRef.current = null;
      dismissedBlockIdRef.current = null;
      setToolbarState({ mode: "closed" });
      return;
    }
    if (dismissedBlockIdRef.current === media.blockId) return;

    viewBlockIdRef.current = media.blockId;
    const bounds =
      readBlockBounds(element, media.blockId) ?? FALLBACK_BLOCK_POSITION;
    setToolbarState({
      mode: "view",
      blockId: media.blockId,
      kind: media.kind,
      url: media.url,
      name: media.name,
      caption: media.caption,
      left: bounds.left,
      top: bounds.top,
    });
  }, [editor, element]);

  useEffect(() => {
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
  }, [updateFromSelection, element]);

  useEffect(() => {
    if (
      toolbarState.mode === "editingName" ||
      toolbarState.mode === "editingCaption"
    ) {
      inputRef.current?.focus();
    }
  }, [toolbarState.mode]);

  useEffect(() => {
    if (toolbarState.mode === "replacing") replaceFileInputRef.current?.focus();
  }, [toolbarState.mode]);

  // Upload/Replace 공용 — 파일 선택 직후와 retry 둘 다 이 함수로 들어온다
  // (RD-003.md "결정" 그대로 — Promise를 직접 await해 loading→성공/실패/
  // 취소를 로컬 state로 반영, file-panel.tsx startUpload와 같은 패턴).
  const startReplaceUpload = useCallback(
    async (blockId: string, file: File) => {
      setToolbarState((prev) =>
        prev.mode === "replacing" && prev.blockId === blockId
          ? { ...prev, heldFile: file, upload: { status: "uploading" } }
          : prev,
      );
      const result = await editor.commands.replaceMediaBlockFile(blockId, file);
      if (!result.ok) {
        // 사전조건 실패만 여기로 온다 — 콜백이 실제 정착한 뒤의 성공/실패/
        // 취소는 항상 ok:true라 아래 getMediaUploadState 분기가 담당한다.
        setToolbarState((prev) =>
          prev.mode === "replacing" && prev.blockId === blockId
            ? {
                ...prev,
                upload: {
                  status: "error",
                  code: result.error.code,
                  message: "Upload could not start.",
                },
              }
            : prev,
        );
        return;
      }
      const pending = editor.getMediaUploadState(blockId);
      if (pending === "uploading") return;
      if (pending !== null) {
        setToolbarState((prev) =>
          prev.mode === "replacing" && prev.blockId === blockId
            ? {
                ...prev,
                upload: {
                  status: "error",
                  code: pending.code,
                  message: pending.message,
                },
              }
            : prev,
        );
        return;
      }
      // 성공 — url/name이 실제로 바뀌었으므로 finishEditing처럼 로컬 캐시
      // 값을 재사용하지 않고 core를 다시 조회해 "view"로 돌아간다(RD-003-
      // DELTA-03.md "결정"). 대기 중 이미 다른 상태로 나갔으면(Cancel 등)
      // 손대지 않는다 — updateFromSelection과 같은 판정을 여기 인라인한다
      // (updateFromSelection을 setState 콜백 안에서 부르면 안 돼 직접 푼다).
      setToolbarState((prev) => {
        if (prev.mode !== "replacing" || prev.blockId !== blockId) return prev;
        editingRef.current = false;
        if (element === null) return { mode: "closed" };
        const media = editor.getSelectionMediaBlock();
        if (media === null || media.url === null || media.blockId !== blockId) {
          return { mode: "closed" };
        }
        const bounds =
          readBlockBounds(element, media.blockId) ?? FALLBACK_BLOCK_POSITION;
        return {
          mode: "view",
          blockId: media.blockId,
          kind: media.kind,
          url: media.url,
          name: media.name,
          caption: media.caption,
          left: bounds.left,
          top: bounds.top,
        };
      });
    },
    [editor, element],
  );

  const startReplacing = () => {
    if (toolbarState.mode !== "view") return;
    clearActionError();
    editingRef.current = true;
    const { blockId, kind, url, name, caption, left, top } = toolbarState;
    const pending = editor.getMediaUploadState(blockId);
    const upload: UploadSubState =
      pending === "uploading"
        ? { status: "uploading" }
        : pending === null
          ? { status: "idle" }
          : { status: "error", code: pending.code, message: pending.message };
    setToolbarState({
      mode: "replacing",
      blockId,
      kind,
      url,
      name,
      caption,
      left,
      top,
      upload,
      heldFile: null,
    });
  };

  const handleReplaceFileChange = (event: {
    currentTarget: HTMLInputElement;
  }) => {
    if (toolbarState.mode !== "replacing") return;
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (file === null) return;
    void startReplaceUpload(toolbarState.blockId, file);
  };

  const handleReplaceRetry = () => {
    if (toolbarState.mode !== "replacing" || toolbarState.heldFile === null) {
      return;
    }
    void startReplaceUpload(toolbarState.blockId, toolbarState.heldFile);
  };

  // uploading 중이면 먼저 abort하고, 상태와 무관하게 교체 전 값(로컬에
  // 이미 아는 값)으로 즉시 view로 돌아간다 — cancelEditing과 같은 방식
  // (core를 다시 조회하지 않는다, 교체가 실제로 반영된 적이 없어서다).
  const cancelReplacing = () => {
    if (toolbarState.mode !== "replacing") return;
    if (toolbarState.upload.status === "uploading") {
      editor.commands.cancelMediaUpload(toolbarState.blockId);
    }
    const { blockId, kind, url, name, caption, left, top } = toolbarState;
    editingRef.current = true;
    setToolbarState({
      mode: "view",
      blockId,
      kind,
      url,
      name,
      caption,
      left,
      top,
    });
    element?.ownerDocument.defaultView?.setTimeout(() => {
      editingRef.current = false;
    });
  };

  const { menuRef, style } = useClampedMenuPosition(
    toolbarState.mode === "closed" ? 0 : toolbarState.left,
    toolbarState.mode === "closed" ? 0 : toolbarState.top,
    "centerBelow",
  );
  const focusEditor = useFocusEditor(element);

  const dismissToolbar = useCallback(() => {
    dismissedBlockIdRef.current = viewBlockIdRef.current;
    editingRef.current = true;
    clearActionError();
    setToolbarState({ mode: "closed" });
    element?.ownerDocument.defaultView?.setTimeout(() => {
      editingRef.current = false;
    });
  }, [element, clearActionError]);
  // file-panel.tsx dismissPanelAndFocusEditor와 같은 순서(focus 먼저,
  // close 나중) — 반대로 하면 실제 Chromium에서 Escape 뒤 초점 복원이
  // 실패한다(RD-003 e2e 실측, 같은 원인이라 이 컴포넌트도 미리 같은 순서를
  // 지킨다).
  const dismissToolbarAndFocusEditor = useCallback(() => {
    focusEditor();
    dismissToolbar();
  }, [dismissToolbar, focusEditor]);

  useDismissOnOutsideOrEscape({
    active: toolbarState.mode === "view",
    element,
    allowSelectors: MEDIA_TOOLBAR_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissToolbar,
    onEscapeDismiss: dismissToolbarAndFocusEditor,
  });

  if (toolbarState.mode === "closed") return null;

  // rename/caption 편집을 마치고 view로 돌아간다. 편집 중 알아낸 blockId/
  // kind/url은 그대로 두고 name/caption만 호출부가 넘긴 값으로 갱신한다 —
  // core를 다시 조회하지 않는다(취소는 편집 전 값을, 저장 성공은 방금 적용한
  // draft를 그대로 안다). editingRef를 짧게 세워 이 전환이 만드는 focus 이동이
  // 리스너의 재조회와 경합하지 않게 한다(file-panel.tsx closeAndRestoreFocus류
  // 와 같은 여유).
  const finishEditing = (name: string | null, caption: string | null) => {
    if (
      toolbarState.mode !== "editingName" &&
      toolbarState.mode !== "editingCaption"
    ) {
      return;
    }
    const { blockId, kind, url, left, top } = toolbarState;
    editingRef.current = true;
    focusEditor();
    viewBlockIdRef.current = blockId;
    setToolbarState({
      mode: "view",
      blockId,
      kind,
      url,
      name,
      caption,
      left,
      top,
    });
    element?.ownerDocument.defaultView?.setTimeout(() => {
      editingRef.current = false;
    });
  };

  const cancelEditing = () => {
    if (
      toolbarState.mode !== "editingName" &&
      toolbarState.mode !== "editingCaption"
    ) {
      return;
    }
    clearActionError();
    finishEditing(toolbarState.name, toolbarState.caption);
  };

  const startEditingName = () => {
    if (toolbarState.mode !== "view") return;
    clearActionError();
    editingRef.current = true;
    const { blockId, kind, url, name, caption, left, top } = toolbarState;
    setToolbarState({
      mode: "editingName",
      blockId,
      kind,
      url,
      name,
      caption,
      left,
      top,
      draft: name ?? "",
    });
  };
  const startEditingCaption = () => {
    if (toolbarState.mode !== "view") return;
    clearActionError();
    editingRef.current = true;
    const { blockId, kind, url, name, caption, left, top } = toolbarState;
    setToolbarState({
      mode: "editingCaption",
      blockId,
      kind,
      url,
      name,
      caption,
      left,
      top,
      draft: caption ?? "",
    });
  };

  const applyName = () => {
    if (toolbarState.mode !== "editingName") return;
    const { blockId, draft, caption, name } = toolbarState;
    if (draft === (name ?? "")) {
      cancelEditing();
      return;
    }
    runCommand(
      () => editor.commands.setMediaBlockName(blockId, draft),
      () => finishEditing(draft, caption),
    );
  };
  const applyCaption = () => {
    if (toolbarState.mode !== "editingCaption") return;
    const { blockId, draft, name, caption } = toolbarState;
    if (draft === (caption ?? "")) {
      cancelEditing();
      return;
    }
    runCommand(
      () => editor.commands.setMediaBlockCaption(blockId, draft),
      () => finishEditing(name, draft),
    );
  };
  const handleDelete = () => {
    if (toolbarState.mode !== "view") return;
    runCommand(
      () => editor.commands.deleteBlock(toolbarState.blockId),
      updateFromSelection,
    );
  };

  return (
    <div
      aria-label="Media toolbar"
      className="geul-media-toolbar"
      ref={menuRef}
      role="toolbar"
      style={style}
    >
      {toolbarState.mode === "view" && (
        <>
          {editor.isUploadEnabled() && (
            <button
              aria-label="Replace file"
              className={mediaToolbarButtonClassName}
              onClick={startReplacing}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              Replace
            </button>
          )}
          <button
            aria-label="Rename"
            className={mediaToolbarButtonClassName}
            onClick={startEditingName}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Rename
          </button>
          <button
            aria-label="Edit caption"
            className={mediaToolbarButtonClassName}
            onClick={startEditingCaption}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Caption
          </button>
          <button
            aria-label="Delete media block"
            className={dangerButtonClassName}
            onClick={handleDelete}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Delete
          </button>
          {/* cross-origin url은 강제 다운로드를 보장하지 않는다(브라우저
              same-origin 정책, spec §6.3) — 링크가 열리기만 할 수도 있다.
              download 속성은 name이 없어도 항상 둔다 — 없으면 강제 다운로드
              힌트 자체가 사라져 평범한 네비게이션으로 바뀐다. */}
          <a
            aria-label="Download"
            className={mediaToolbarButtonClassName}
            download={toolbarState.name ?? ""}
            href={toolbarState.url}
            onMouseDown={(event) => event.preventDefault()}
          >
            Download
          </a>
        </>
      )}
      {(toolbarState.mode === "editingName" ||
        toolbarState.mode === "editingCaption") && (
        <>
          <input
            aria-label={
              toolbarState.mode === "editingName"
                ? `${kindLabel(toolbarState.kind)} name`
                : `${kindLabel(toolbarState.kind)} caption`
            }
            onChange={(event) => {
              if (
                toolbarState.mode !== "editingName" &&
                toolbarState.mode !== "editingCaption"
              ) {
                return;
              }
              setToolbarState({
                ...toolbarState,
                draft: event.currentTarget.value,
              });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (toolbarState.mode === "editingName") applyName();
                else applyCaption();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                // 이 입력의 Escape는 편집만 취소하고 view로 돌아간다 — 전파를
                // 막지 않으면 같은 물리 키 이벤트가 document까지 올라가
                // `useDismissOnOutsideOrEscape`(view 모드에서만 active)의
                // keydown 리스너에 닿는다. cancelEditing이 이미 view로
                // 전환해 그 훅이 재활성화된 상태라 같은 이벤트가 toolbar
                // 전체를 곧바로 닫혀버리게 만든다(실측).
                event.stopPropagation();
                cancelEditing();
              }
            }}
            ref={inputRef}
            type="text"
            value={toolbarState.draft}
          />
          <button
            aria-label={
              toolbarState.mode === "editingName" ? "Save name" : "Save caption"
            }
            className={mediaToolbarButtonClassName}
            onClick={
              toolbarState.mode === "editingName" ? applyName : applyCaption
            }
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Save
          </button>
          <button
            aria-label="Cancel"
            className={mediaToolbarButtonClassName}
            onClick={cancelEditing}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Cancel
          </button>
        </>
      )}
      {toolbarState.mode === "replacing" && (
        <>
          <input
            aria-label={`${kindLabel(toolbarState.kind)} file`}
            disabled={toolbarState.upload.status === "uploading"}
            onChange={handleReplaceFileChange}
            ref={replaceFileInputRef}
            type="file"
          />
          {toolbarState.upload.status === "uploading" && (
            <p role="status">Uploading…</p>
          )}
          {toolbarState.upload.status === "error" && (
            <>
              <span className="geul-media-toolbar__error" role="alert">
                {toolbarState.upload.message}
              </span>
              {toolbarState.heldFile !== null && (
                <button
                  className={mediaToolbarButtonClassName}
                  onClick={handleReplaceRetry}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  Retry
                </button>
              )}
            </>
          )}
          <button
            aria-label="Cancel"
            className={mediaToolbarButtonClassName}
            onClick={cancelReplacing}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Cancel
          </button>
        </>
      )}
      {actionError !== null && (
        <span className="geul-media-toolbar__error" role="alert">
          {actionError.code}
        </span>
      )}
    </div>
  );
};
