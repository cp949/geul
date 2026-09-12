import type { EditorController, MediaBlockKind } from "@cp949/geul-core";
import { X } from "lucide-react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { extractNameFromUrl } from "./extract-name-from-url.js";
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

const filePanelButtonClassName = "geul-file-panel__button";
const closeIcon = <X {...iconProps} />;

// useDismissOnOutsideOrEscape allow-list. SlashMenu/BlockSelectionToolbar와
// 같은 이유로 모듈 스코프 상수로 둔다(매 렌더 새 배열이면 그 훅의 effect가
// 리스너를 매 렌더 떼었다 다시 붙인다).
const FILE_PANEL_DISMISS_ALLOW_SELECTORS = [".geul-file-panel"] as const;

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
/**
 * `formatting-toolbar.tsx`와 동일 계약 — `portalTarget`(RD-003 DELTA-04),
 * `component`(RD-001 DELTA-04) 참고.
 */
export type FilePanelProps = {
  portalTarget?: HTMLElement | null;
  component?: FC<{ editor: EditorController }>;
};

export const FilePanel = ({
  portalTarget = null,
  component: Component,
}: FilePanelProps = {}) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const [panelState, setPanelState] = useState<PanelState>({ mode: "closed" });
  const openPanelBlockId =
    panelState.mode === "open" ? panelState.blockId : null;
  // dismissPanel 직후의 재오픈 경합(아래 dismissedBlockIdRef 주석)에서만
  // 쓴다 — link-toolbar.tsx와 달리 이 컴포넌트는 "열려 있는 동안 전부
  // 재관측을 억제"하지 않는다(예전엔 그렇게 했다가 QA-067에서 회귀로
  // 드러났다: undo로 블록이 사라져도 재관측이 영영 억제돼 패널이 고아
  // 상태로 남았다 — 키보드만 쓰는 undo에는 dismissPanel을 타는 outside-
  // click/Escape가 없어 억제가 풀릴 계기가 없었다). 입력창 타이핑 중
  // selectionchange가 draft를 지우는 문제는 아래 open 분기의 멱등성
  // (같은 blockId면 상태를 새로 만들지 않고 그대로 반환)으로 대신
  // 막는다 — 재관측 자체를 막지 않고, 관측 결과가 "달라지지 않았다"를
  // 직접 판정한다.
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

  const updateFromSelection = useCallback(() => {
    if (editingRef.current) return;
    if (element === null) {
      openBlockIdRef.current = null;
      dismissedBlockIdRef.current = null;
      setPanelState((prev) =>
        prev.mode === "closed" ? prev : { mode: "closed" },
      );
      return;
    }

    const media = editor.getSelectionMediaBlock();
    if (media === null) {
      openBlockIdRef.current = null;
      dismissedBlockIdRef.current = null;
      setPanelState((prev) =>
        prev.mode === "closed" ? prev : { mode: "closed" },
      );
      return;
    }
    // 드래그·드롭/paste가 uploadFile 콜백 없이 만든 로컬 프리뷰(ADR 0015)는
    // url이 계속 null이지만 이미 화면에 이미지가 보인다 — url===null만으로
    // "빈 블록"이라 판정하면(RD-003 DELTA-01은 로컬 프리뷰보다 먼저 나온
    // 설계라 이 경우를 몰랐다) 이 panel이 방금 보인 이미지 위에 곧바로
    // 열려 겹쳐 보인다(사용자 보고, 2026-09-11 — "드래그&드롭하면 UI가
    // 깨진다"). getPendingLocalPreviews()(core, 이미 존재하는 pull API)로
    // 이 블록이 로컬 프리뷰를 갖고 있는지 확인해 url이 있는 경우와 동일하게
    // 취급한다.
    const hasLocalPreview = editor
      .getPendingLocalPreviews()
      .some((preview) => preview.blockId === media.blockId);
    if (media.url !== null || hasLocalPreview) {
      // 이 panel이 소유한 블록에 URL을 적용한 경우 이름·업로드 결과를 계속
      // 보여준다. URL 적용이 만든 selectionchange가 panel을 먼저 닫으면 같은
      // 이벤트에서 MediaToolbar도 활성화돼 Escape 하나가 두 overlay를 함께
      // dismiss하는 경합이 생긴다. 다른 채워진 블록으로 선택이 이동한 경우만
      // 닫는다.
      if (openBlockIdRef.current === media.blockId) return;
      openBlockIdRef.current = null;
      dismissedBlockIdRef.current = null;
      setPanelState((prev) =>
        prev.mode === "closed" ? prev : { mode: "closed" },
      );
      return;
    }
    if (dismissedBlockIdRef.current === media.blockId) return;

    openBlockIdRef.current = media.blockId;
    const bounds =
      readBlockBounds(element, media.blockId) ?? FALLBACK_BLOCK_POSITION;
    // Upload 탭 초깃값 시딩(RD-003-DELTA-02.md "결정" 5) — 이전에 이
    // 블록에서 실패해 error pending이 남아 있으면 재오픈 즉시 그 에러를
    // 보여준다. uploadFile 미등록이면 pending 자체를 조회하지 않는다
    // (호출해도 항상 null이지만, 등록 여부와 무관한 호출을 피한다).
    const uploadEnabled = editor.isUploadEnabled();
    const pending = uploadEnabled
      ? editor.getMediaUploadState(media.blockId)
      : null;
    const upload: UploadSubState =
      pending === "uploading"
        ? { status: "uploading" }
        : pending === null
          ? { status: "idle" }
          : { status: "error", code: pending.code, message: pending.message };
    setPanelState((prev) => {
      // 이미 같은 블록에 열려 있다 — draft/activeTab/heldFile 등 진행
      // 중인 로컬 상태를 재관측이 되돌리면 안 된다(QA-067, 위 editingRef
      // 주석 참고). bounds/upload는 이미 계산했지만 버린다 — 매 재관측마다
      // 다시 구하는 비용은 다른 selection 기반 컴포넌트(formatting-
      // toolbar.tsx 등)와 같은 수준이라 특별히 아끼지 않는다.
      if (prev.mode === "open" && prev.blockId === media.blockId) return prev;
      return {
        mode: "open",
        blockId: media.blockId,
        kind: media.kind,
        draft: "",
        rejected: false,
        appliedName: null,
        // 기본 활성 탭(2026-09-12, Notion parity) — Upload 옵션이 있으면
        // Upload가 기본이다. RD-003-DELTA-02.md "결정 2"(항상 Embed
        // 기본)를 사용자 지시로 번복한다 — uploadFile 등록 여부가 이제는
        // "기본값 변경" 신호로 다뤄진다. 등록 안 됐으면(단일 Embed 모드)
        // embed 외에 탭 자체가 없어 예전 동작 그대로다.
        activeTab: uploadEnabled ? "upload" : "embed",
        upload,
        heldFile: null,
        left: bounds.left,
        top: bounds.top,
      };
    });
  }, [editor, element]);

  useSelectionRefresh({ element, onUpdate: updateFromSelection });

  useEffect(() => {
    if (element === null) return;
    if (openPanelBlockId === null) {
      element.removeAttribute("data-geul-file-panel-block-id");
    } else {
      element.setAttribute("data-geul-file-panel-block-id", openPanelBlockId);
    }
    return () => element.removeAttribute("data-geul-file-panel-block-id");
  }, [element, openPanelBlockId]);

  // 활성 탭이 정해질 때(최초 열림 포함, 탭 전환 클릭 포함) 그 탭의 입력에
  // 초점을 준다. 기본 활성 탭(2026-09-12, Notion parity — RD-003-DELTA-02
  // "결정 2" 번복)이 uploadEnabled 여부로 갈리므로(위 updateFromSelection)
  // 최초 열림도 탭 전환과 같은 "activeTab이 정해짐" 사건이라 이 effect
  // 하나로 둘 다 커버한다. panelState.mode만으로는 탭 전환을 못 잡으므로
  // activeTab을 별도 원시값 의존성으로 뽑아 쓴다.
  const activeTab = panelState.mode === "open" ? panelState.activeTab : null;
  useEffect(() => {
    if (activeTab === "upload") fileInputRef.current?.focus();
    else if (activeTab === "embed") inputRef.current?.focus();
  }, [activeTab]);

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
      if (!result.ok) {
        // 사전조건 실패(BLOCK_NOT_FOUND·COMMAND_NOT_APPLICABLE 등)만
        // 여기로 온다 — 콜백이 실제 정착한 뒤의 성공/실패/취소는 항상
        // ok:true라 아래 getMediaUploadState 분기가 담당한다.
        setPanelState((prev) =>
          prev.mode === "open" && prev.blockId === blockId
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
      if (pending === null) {
        // 업로드 성공(취소 포함 — pending 둘 다 null이라 구분하지 않는다,
        // 결정 3) — 패널을 자동으로 닫는다(2026-09-12, 사용자 지시). 예전엔
        // idle로 돌아가 재업로드 가능 상태를 유지했지만(RD-003-DELTA-02.md
        // "결정" 3 — 이번 지시로 번복한다), 성공한 이미지 위에 빈 Upload
        // 패널이 계속 남는 문제가 실사용에서 보고됐다. Close 버튼·Escape와
        // 같은 dismissPanel 경로를 그대로 타 MediaToolbar와의 dismiss
        // 경합(Issue #165)을 새로 만들지 않는다. openBlockIdRef 불일치는
        // 그사이 패널이 다른 블록으로 옮겨갔거나 이미 닫혔다는 뜻이라
        // 손대지 않는다.
        if (openBlockIdRef.current === blockId) dismissPanelAndFocusEditor();
        return;
      }
      setPanelState((prev) =>
        prev.mode === "open" && prev.blockId === blockId
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
    },
    [editor, dictionary.status.uploadCouldNotStart, dismissPanelAndFocusEditor],
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

  useDismissOnOutsideOrEscape({
    active: panelState.mode === "open",
    element,
    allowSelectors: FILE_PANEL_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissPanel,
    onEscapeDismiss: dismissPanelAndFocusEditor,
  });

  if (panelState.mode === "closed") return null;

  if (Component !== undefined) {
    const overridden = (
      <div
        aria-label={dictionary.toolbar.filePanel.ariaLabel}
        className="geul-file-panel"
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

  const content = (
    <div
      aria-label={dictionary.toolbar.filePanel.ariaLabel}
      className="geul-file-panel"
      ref={menuRef}
      role="toolbar"
      style={style}
    >
      <div className="geul-file-panel__header">
        {uploadEnabled && (
          <div
            aria-label={dictionary.toolbar.filePanel.sourceAriaLabel}
            className="geul-file-panel__tablist"
            role="tablist"
          >
            {/* Upload가 첫 번째 탭(2026-09-12, 사용자 지시) — 기본
                활성 탭(activeTab 초깃값, 위 updateFromSelection)과 탭
                순서를 일치시킨다. */}
            <button
              aria-selected={panelState.activeTab === "upload"}
              className={filePanelButtonClassName}
              onClick={() => handleTabClick("upload")}
              onMouseDown={(event) => event.preventDefault()}
              role="tab"
              type="button"
            >
              {dictionary.toolbar.filePanel.uploadTab}
            </button>
            <button
              aria-selected={panelState.activeTab === "embed"}
              className={filePanelButtonClassName}
              onClick={() => handleTabClick("embed")}
              onMouseDown={(event) => event.preventDefault()}
              role="tab"
              type="button"
            >
              {dictionary.toolbar.filePanel.embedTab}
            </button>
          </div>
        )}
        {/* 닫기는 아이콘 전용 버튼으로 패널 우측 상단에 고정한다
            (2026-09-12, 사용자 지시 — 기존 하단 텍스트 버튼 대체).
            aria-label은 기존 closeAriaLabel을 그대로 쓰고(테스트
            계약 유지), close 문구는 title(hover tooltip)로 재사용한다. */}
        <IconButton
          className={`${filePanelButtonClassName} geul-file-panel__close-button`}
          icon={closeIcon}
          label={dictionary.toolbar.filePanel.closeAriaLabel}
          onClick={dismissPanelAndFocusEditor}
          title={dictionary.toolbar.filePanel.close}
        />
      </div>
      {showEmbedTab && (
        <>
          <input
            aria-label={dictionary.toolbar.filePanel.urlInputAriaLabel.replace(
              "{kind}",
              dictionary.toolbar.kindNames[panelState.kind],
            )}
            className="geul-file-panel__url-input"
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
            placeholder={dictionary.toolbar.filePanel.urlInputPlaceholder.replace(
              "{kind}",
              dictionary.toolbar.kindNames[panelState.kind],
            )}
            ref={inputRef}
            type="text"
            value={panelState.draft}
          />
          <button
            aria-label={dictionary.toolbar.filePanel.saveUrl}
            className={`${filePanelButtonClassName} geul-file-panel__primary-button`}
            onClick={applyUrl}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            {dictionary.toolbar.filePanel.save.replace(
              "{kind}",
              dictionary.toolbar.kindNames[panelState.kind],
            )}
          </button>
          {panelState.rejected && (
            <span className="geul-file-panel__error" role="alert">
              {dictionary.status.unsupportedMediaUrl}
            </span>
          )}
          {panelState.appliedName !== null && (
            <p className="geul-file-panel__name">
              {dictionary.toolbar.filePanel.namePrefix}
              {panelState.appliedName}
            </p>
          )}
          {/* Notion parity(2026-09-12) 안내문 — 장식용, rejected/appliedName처럼
              상태 전이를 만들지 않는다. */}
          <p className="geul-file-panel__caption">
            {dictionary.toolbar.filePanel.embedCaption.replace(
              "{kind}",
              dictionary.toolbar.kindNames[panelState.kind],
            )}
          </p>
        </>
      )}
      {showUploadTab && (
        <div className="geul-file-panel__upload">
          {/* 네이티브 file input은 시각적으로만 숨긴다(display:none이
              아니다 — Testing Library의 getByLabelText/role 쿼리와
              스크린리더 접근 트리에 계속 남아야 한다). 실제 클릭은 아래
              전체폭 버튼이 대신 트리거한다(Notion parity, 2026-09-12). */}
          <input
            aria-label={dictionary.toolbar.filePanel.fileInputAriaLabel.replace(
              "{kind}",
              dictionary.toolbar.kindNames[panelState.kind],
            )}
            className="geul-file-panel__upload-input"
            disabled={panelState.upload.status === "uploading"}
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
          {/* uploading 중엔 숨긴다 — 네이티브 input도 이 동안 disabled라
              같은 조건을 쓴다. idle/error 둘 다 보여야 한다(error에서도
              "새 파일 선택"이 가능해야 하는 기존 계약, RD-003-DELTA-02.md
              "결정 5"). */}
          {panelState.upload.status !== "uploading" && (
            <button
              className={`${filePanelButtonClassName} geul-file-panel__upload-trigger`}
              onClick={() => fileInputRef.current?.click()}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              {dictionary.toolbar.filePanel.uploadButton}
            </button>
          )}
          {panelState.upload.status === "uploading" && (
            <>
              <p role="status">{dictionary.status.uploading}</p>
              <button
                className={filePanelButtonClassName}
                onClick={handleCancel}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                {dictionary.toolbar.filePanel.cancel}
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
                  {dictionary.toolbar.filePanel.retry}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  return portalTarget === null ? content : createPortal(content, portalTarget);
};
