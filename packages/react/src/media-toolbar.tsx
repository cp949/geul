import type { EditorController, MediaBlockKind } from "@cp949/geul-core";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Captions,
  Check,
  Download as DownloadIcon,
  Eye,
  LucideProvider,
  PenLine,
  Replace as ReplaceIcon,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import {
  FALLBACK_BLOCK_POSITION,
  readBlockBounds,
} from "./read-block-bounds.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { useSelectionRefresh } from "./use-selection-refresh.js";
import { useTableCommandFeedback } from "./use-table-command-feedback.js";

const mediaToolbarButtonClassName = "geul-media-toolbar__button";
const dangerButtonClassName =
  "geul-media-toolbar__button geul-media-toolbar__button--danger";

// link-toolbar.tsx의 saveLinkIcon 등과 같은 이유로 모듈 top-level에서 한 번만
// 만든다 — 매 렌더 새 ReactElement를 만들지 않는다. Download만 icon import를
// DownloadIcon으로 alias한다 — lucide-react의 Download와 이 파일 아래
// `dictionary.toolbar.media.download`(문자열) 이름이 겹쳐서다.
const replaceIcon = <ReplaceIcon {...iconProps} />;
const renameIcon = <PenLine {...iconProps} />;
const captionIcon = <Captions {...iconProps} />;
const previewIcon = <Eye {...iconProps} />;
const alignLeftIcon = <AlignLeft {...iconProps} />;
const alignCenterIcon = <AlignCenter {...iconProps} />;
const alignRightIcon = <AlignRight {...iconProps} />;
const deleteIcon = <Trash2 {...iconProps} />;
const saveIcon = <Check {...iconProps} />;
const cancelIcon = <X {...iconProps} />;
const retryIcon = <RotateCw {...iconProps} />;
const downloadIcon = <DownloadIcon {...iconProps} />;

// useDismissOnOutsideOrEscape allow-list. FilePanel/SlashMenu와 같은 이유로
// 모듈 스코프 상수로 둔다(매 렌더 새 배열이면 그 훅의 effect가 리스너를 매
// 렌더 떼었다 다시 붙인다).
//
// `[data-geul-block-id]`(모든 블록의 공통 wrapper, RD-002 계약 — block-selection
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
// `[data-geul-media-resize-handle]`(media-resize-handles.tsx)도 같은 이유로
// 포함한다: MediaResizeHandles는 app.tsx에서 이 toolbar와 형제로 마운트되고
// 자기 핸들을 `[data-geul-block-id]` 밖의 fixed 오버레이로 그린다(리사이즈는
// 시각 좌표만 필요할 뿐 셀 텍스트처럼 편집기 DOM 안에 있을 이유가 없다).
// 이 selector가 없으면 핸들 드래그 시작 pointerdown 자체가 "바깥 클릭"으로
// 오판정돼 toolbar가 닫히고, 리사이즈가 selection을 바꾸지 않는 한
// dismissedBlockIdRef가 계속 같은 blockId를 가리켜 드래그가 끝난 뒤에도
// 재오픈이 막힌다(코드리뷰 발견, RD-001 DELTA-02 회귀 — data-geul-* 속성
// 컨벤션을 쓴다, CSS 클래스명이 아니라 — `[data-geul-block-id]`와 같은 이유로
// 스타일링과 무관한 구조 계약이다).
const MEDIA_TOOLBAR_DISMISS_ALLOW_SELECTORS = [
  ".geul-media-toolbar",
  "[data-geul-block-id]",
  "[data-geul-media-resize-handle]",
] as const;

type ToolbarPosition = { left: number; top: number };

type MediaInfo = {
  blockId: string;
  kind: MediaBlockKind;
  url: string;
  name: string | null;
  caption: string | null;
  // file은 null(preview 토글 자체가 없는 kind, getSelectionMediaBlock과 같은
  // 경계). image/video/audio는 실제 유효값(슬라이스5 RD-002 DELTA-02).
  showPreview: boolean | null;
  // image/video만 실제 유효값(Issue #154, MED-009) — audio/file은
  // 정렬 자체가 없는 kind라 null(showPreview와 반대 kind 집합,
  // getSelectionMediaBlock과 같은 경계).
  textAlignment: "left" | "center" | "right" | null;
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

// "closed" 외 4개 mode 전부가 이 9필드(MediaInfo 7개 + left/top)를 shape
// 그대로 캐리한다 — mode 전이마다 손으로 9개를 나열하면(구조분해+리턴
// 리터럴 이중) 필드가 늘 때마다(showPreview, textAlignment 이력) 같은 곳을
// 반복해서 고쳐야 한다(그릴링 C4, 2026-09-06). `{ ...prev, mode: X }`로
// 단순 spread하지 않는 이유: prev가 replacing/editingName 등이면 그 mode
// 전용 필드(upload/heldFile/draft)가 새 상태에 런타임으로 남는다 — 이
// 화이트리스트 추출이 그 누출을 막는다.
const carryMediaInfo = (
  prev: MediaInfo & ToolbarPosition,
  patch: Partial<MediaInfo> = {},
): MediaInfo & ToolbarPosition => ({
  blockId: prev.blockId,
  kind: prev.kind,
  url: prev.url,
  name: prev.name,
  caption: prev.caption,
  showPreview: prev.showPreview,
  textAlignment: prev.textAlignment,
  left: prev.left,
  top: prev.top,
  ...patch,
});

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
 * 이동을 막아 애초에 DOM 초점을 받지 않는다). image/video 전용 정렬
 * 버튼 3개(좌/중/우, Issue #154 MED-009)는 `toggleShowPreview`의
 * "성공 시에만 로컬 state 반영" 패턴을 재사용하고, 같은 값 재클릭은
 * 해제(`null`)한다(`setMediaAlignment` 주석 참고).
 */
/**
 * `formatting-toolbar.tsx`와 동일 계약 — `portalTarget`(RD-003 DELTA-03),
 * `component`(RD-001 DELTA-03) 참고.
 */
export type MediaToolbarProps = {
  portalTarget?: HTMLElement | null;
  component?: FC<{ editor: EditorController }>;
};

export const MediaToolbar = ({
  portalTarget = null,
  component: Component,
}: MediaToolbarProps = {}) => {
  const editor = useEditor();
  const dictionary = useDictionary();
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
    // File Panel이 URL 적용 결과를 보여주는 동안 같은 블록의 toolbar를
    // 활성화하면 Escape 하나가 두 overlay의 dismiss listener를 함께 태워
    // dismissedBlockIdRef를 오염시킨다. File Panel이 닫힌 뒤 다음 selection
    // refresh에서만 toolbar를 연다.
    if (
      element.getAttribute("data-geul-file-panel-block-id") === media.blockId
    ) {
      viewBlockIdRef.current = null;
      setToolbarState((prev) =>
        prev.mode === "closed" ? prev : { mode: "closed" },
      );
      return;
    }
    if (dismissedBlockIdRef.current === media.blockId) return;

    viewBlockIdRef.current = media.blockId;
    const bounds =
      readBlockBounds(element, media.blockId) ?? FALLBACK_BLOCK_POSITION;
    // media는 core 재조회 결과라 prev를 캐리하는 게 아니다 — carryMediaInfo의
    // 화이트리스트가 막으려는 "잉여 mode 필드 누출"이 애초에 없어(media는
    // 정확히 MediaInfo 7필드 shape) 단순 spread로 충분하다. url은 spread가
    // narrow 전 타입(string | null)을 그대로 들고 오므로 위 가드로 이미
    // 좁혀진 media.url을 다시 덮어써 string으로 맞춘다.
    setToolbarState({
      mode: "view",
      ...media,
      url: media.url,
      left: bounds.left,
      top: bounds.top,
    });
  }, [editor, element]);

  useSelectionRefresh({ element, onUpdate: updateFromSelection });

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
                  message: dictionary.status.uploadCouldNotStart,
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
        // updateFromSelection과 같은 이유로 단순 spread(+url 재대입) — media는
        // 잉여 필드가 없는 fresh MediaInfo다.
        return {
          mode: "view",
          ...media,
          url: media.url,
          left: bounds.left,
          top: bounds.top,
        };
      });
    },
    [editor, element, dictionary.status.uploadCouldNotStart],
  );

  const startReplacing = () => {
    if (toolbarState.mode !== "view") return;
    clearActionError();
    editingRef.current = true;
    const pending = editor.getMediaUploadState(toolbarState.blockId);
    const upload: UploadSubState =
      pending === "uploading"
        ? { status: "uploading" }
        : pending === null
          ? { status: "idle" }
          : { status: "error", code: pending.code, message: pending.message };
    setToolbarState({
      mode: "replacing",
      ...carryMediaInfo(toolbarState),
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
    editingRef.current = true;
    setToolbarState({ mode: "view", ...carryMediaInfo(toolbarState) });
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

  if (Component !== undefined) {
    const overridden = (
      <div
        aria-label={dictionary.toolbar.media.ariaLabel}
        className="geul-media-toolbar"
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
    editingRef.current = true;
    focusEditor();
    viewBlockIdRef.current = toolbarState.blockId;
    setToolbarState({
      mode: "view",
      ...carryMediaInfo(toolbarState, { name, caption }),
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
    setToolbarState({
      mode: "editingName",
      ...carryMediaInfo(toolbarState),
      draft: toolbarState.name ?? "",
    });
  };
  const startEditingCaption = () => {
    if (toolbarState.mode !== "view") return;
    clearActionError();
    editingRef.current = true;
    setToolbarState({
      mode: "editingCaption",
      ...carryMediaInfo(toolbarState),
      draft: toolbarState.caption ?? "",
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
  // image/video/audio 전용(kind !== "file"일 때만 렌더되는 버튼에서만
  // 호출된다, 아래 JSX 게이트). 성공하면 core를 다시 조회하지 않고
  // 반전값을 로컬 state에 바로 반영한다(applyName/applyCaption과 같은
  // 패턴) — 실패하면 로컬 state를 건드리지 않아 aria-pressed가 실제
  // 문서 상태와 어긋나지 않는다(슬라이스5 RD-002 DELTA-02).
  const toggleShowPreview = () => {
    if (toolbarState.mode !== "view" || toolbarState.showPreview === null) {
      return;
    }
    const { blockId, showPreview } = toolbarState;
    const next = !showPreview;
    runCommand(
      () => editor.commands.setMediaShowPreview(blockId, next),
      () =>
        setToolbarState((prev) =>
          prev.mode === "view" && prev.blockId === blockId
            ? { ...prev, showPreview: next }
            : prev,
        ),
    );
  };
  // image/video 전용(kind가 "image"|"video"일 때만 렌더되는 버튼 3개에서만
  // 호출된다, 아래 JSX 게이트 — Issue #154, MED-009). 같은 값 버튼을
  // 다시 클릭하면 해제(null)한다 — toggleInlineTextColor의 "같은 값
  // 재적용 시 해제" 관례와 동일(runInlineColorCommand 주석 참고). 성공하면
  // core를 다시 조회하지 않고 반영값을 로컬 state에 바로 넣는다
  // (toggleShowPreview와 같은 패턴) — 실패하면 로컬 state를 건드리지 않아
  // aria-pressed가 실제 문서 상태와 어긋나지 않는다.
  const setMediaAlignment = (align: "left" | "center" | "right") => {
    if (toolbarState.mode !== "view") return;
    const { blockId, textAlignment } = toolbarState;
    const next = textAlignment === align ? null : align;
    runCommand(
      () => editor.commands.setMediaTextAlignment(blockId, next),
      () =>
        setToolbarState((prev) =>
          prev.mode === "view" && prev.blockId === blockId
            ? { ...prev, textAlignment: next }
            : prev,
        ),
    );
  };
  const handleDelete = () => {
    if (toolbarState.mode !== "view") return;
    runCommand(
      () => editor.commands.deleteBlock(toolbarState.blockId),
      updateFromSelection,
    );
  };

  const content = (
    <div
      aria-label={dictionary.toolbar.media.ariaLabel}
      className="geul-media-toolbar"
      ref={menuRef}
      role="toolbar"
      style={style}
    >
      {toolbarState.mode === "view" && (
        <>
          {editor.isUploadEnabled() && (
            <IconButton
              className={mediaToolbarButtonClassName}
              icon={replaceIcon}
              label={dictionary.toolbar.media.replaceAriaLabel}
              onClick={startReplacing}
            />
          )}
          <IconButton
            className={mediaToolbarButtonClassName}
            icon={renameIcon}
            label={dictionary.toolbar.media.rename}
            onClick={startEditingName}
          />
          <IconButton
            className={mediaToolbarButtonClassName}
            icon={captionIcon}
            label={dictionary.toolbar.media.editCaptionAriaLabel}
            onClick={startEditingCaption}
          />
          {toolbarState.kind !== "file" && (
            <IconButton
              aria-pressed={toolbarState.showPreview === true}
              className={mediaToolbarButtonClassName}
              icon={previewIcon}
              label={dictionary.toolbar.media.preview}
              onClick={toggleShowPreview}
            />
          )}
          {(toolbarState.kind === "image" || toolbarState.kind === "video") && (
            <>
              <IconButton
                aria-pressed={toolbarState.textAlignment === "left"}
                className={mediaToolbarButtonClassName}
                icon={alignLeftIcon}
                label={dictionary.toolbar.media.alignLeft}
                onClick={() => setMediaAlignment("left")}
              />
              <IconButton
                aria-pressed={toolbarState.textAlignment === "center"}
                className={mediaToolbarButtonClassName}
                icon={alignCenterIcon}
                label={dictionary.toolbar.media.alignCenter}
                onClick={() => setMediaAlignment("center")}
              />
              <IconButton
                aria-pressed={toolbarState.textAlignment === "right"}
                className={mediaToolbarButtonClassName}
                icon={alignRightIcon}
                label={dictionary.toolbar.media.alignRight}
                onClick={() => setMediaAlignment("right")}
              />
            </>
          )}
          <IconButton
            className={dangerButtonClassName}
            icon={deleteIcon}
            label={dictionary.toolbar.media.deleteAriaLabel}
            onClick={handleDelete}
          />
          {/* cross-origin url은 강제 다운로드를 보장하지 않는다(브라우저
              same-origin 정책, spec §6.3) — 링크가 열리기만 할 수도 있다.
              download 속성은 name이 없어도 항상 둔다 — 없으면 강제 다운로드
              힌트 자체가 사라져 평범한 네비게이션으로 바뀐다. Download는
              `<a>`라 IconButton(<button> 전용) 대신 link-toolbar.tsx의 Open
              link와 같은 방식으로 같은 시각 계약만 직접 조립한다. */}
          <a
            aria-label={dictionary.toolbar.media.download}
            className={`geul-icon-button ${mediaToolbarButtonClassName}`}
            download={toolbarState.name ?? ""}
            href={toolbarState.url}
            onMouseDown={(event) => event.preventDefault()}
            title={dictionary.toolbar.media.download}
          >
            <LucideProvider>{downloadIcon}</LucideProvider>
          </a>
        </>
      )}
      {(toolbarState.mode === "editingName" ||
        toolbarState.mode === "editingCaption") && (
        <>
          <input
            aria-label={
              toolbarState.mode === "editingName"
                ? dictionary.toolbar.media.nameInputAriaLabel.replace(
                    "{kind}",
                    dictionary.toolbar.kindNames[toolbarState.kind],
                  )
                : dictionary.toolbar.media.captionInputAriaLabel.replace(
                    "{kind}",
                    dictionary.toolbar.kindNames[toolbarState.kind],
                  )
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
          <IconButton
            className={mediaToolbarButtonClassName}
            icon={saveIcon}
            label={
              toolbarState.mode === "editingName"
                ? dictionary.toolbar.media.saveNameAriaLabel
                : dictionary.toolbar.media.saveCaptionAriaLabel
            }
            onClick={
              toolbarState.mode === "editingName" ? applyName : applyCaption
            }
          />
          <IconButton
            className={mediaToolbarButtonClassName}
            icon={cancelIcon}
            label={dictionary.toolbar.media.cancel}
            onClick={cancelEditing}
          />
        </>
      )}
      {toolbarState.mode === "replacing" && (
        <>
          <input
            aria-label={dictionary.toolbar.media.replaceFileInputAriaLabel.replace(
              "{kind}",
              dictionary.toolbar.kindNames[toolbarState.kind],
            )}
            disabled={toolbarState.upload.status === "uploading"}
            onChange={handleReplaceFileChange}
            ref={replaceFileInputRef}
            type="file"
          />
          {toolbarState.upload.status === "uploading" && (
            <p role="status">{dictionary.status.uploading}</p>
          )}
          {toolbarState.upload.status === "error" && (
            <>
              <span className="geul-media-toolbar__error" role="alert">
                {toolbarState.upload.message}
              </span>
              {toolbarState.heldFile !== null && (
                <IconButton
                  className={mediaToolbarButtonClassName}
                  icon={retryIcon}
                  label={dictionary.toolbar.media.retry}
                  onClick={handleReplaceRetry}
                />
              )}
            </>
          )}
          <IconButton
            className={mediaToolbarButtonClassName}
            icon={cancelIcon}
            label={dictionary.toolbar.media.cancel}
            onClick={cancelReplacing}
          />
        </>
      )}
      {actionError !== null && (
        <span className="geul-media-toolbar__error" role="alert">
          {actionError.code}
        </span>
      )}
    </div>
  );

  return portalTarget === null ? content : createPortal(content, portalTarget);
};
