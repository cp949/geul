import type { EditorController, MediaBlockKind } from "@cp949/geul-core";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  MoreHorizontal,
  X,
} from "lucide-react";
import {
  type FC,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { extractNameFromUrl } from "./extract-name-from-url.js";
import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { MenuItemButton } from "./menu-item-button.js";
import {
  FALLBACK_BLOCK_POSITION,
  readBlockTopRightBounds,
} from "./read-block-bounds.js";
import { useAnchoredSubmenu } from "./use-anchored-submenu.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { useSelectionRefresh } from "./use-selection-refresh.js";
import { useTableCommandFeedback } from "./use-table-command-feedback.js";

const mediaToolbarButtonClassName = "geul-media-toolbar__button";
// Replace의 Upload/Embed 팝업 카드 안쪽 탭·버튼 전용 — file-panel.tsx의
// filePanelButtonClassName과 같은 문자열이지만 코드는 공유하지 않는다(아래
// ToolbarState "replacing" 주석 참고). mediaToolbarButtonClassName(아이콘
// 버튼 전용, 1.75rem 정사각형 고정)과 달리 텍스트 버튼 크기를 그대로 쓴다.
const filePanelButtonClassName = "geul-file-panel__button";

// link-toolbar.tsx의 saveLinkIcon 등과 같은 이유로 모듈 top-level에서 한 번만
// 만든다 — 매 렌더 새 ReactElement를 만들지 않는다. Issue #203 RD-004
// DELTA-02 이후 view 모드 개별 버튼(rename/caption/preview/align/replace/
// download/delete)은 more 메뉴 안 텍스트 항목으로 옮겨 아이콘을 더는 쓰지
// 않는다(code-block-language-combobox.tsx의 more-menu 항목·
// block-side-menu-menu.tsx의 turn-into/delete 등과 같은 관례 — 메뉴 항목은
// 텍스트, 아이콘은 상시 노출 버튼 전용) — align row만 예외로 아이콘을 그대로
// 유지한다(block-side-menu-menu.tsx 정렬 행 선례, alignLeftIcon 등 참고).
const alignLeftIcon = <AlignLeft {...iconProps} />;
const alignCenterIcon = <AlignCenter {...iconProps} />;
const alignRightIcon = <AlignRight {...iconProps} />;
const saveIcon = <Check {...iconProps} />;
const cancelIcon = <X {...iconProps} />;
const moreIcon = <MoreHorizontal {...iconProps} />;

// more 메뉴 항목 공용 클래스(code-block-language-combobox.tsx
// codeBlockToolbarMoreMenuItemClassName과 같은 shape, media 쪽 이름만
// 바꿔 복제 — 01-계획.md 6절). align row는 이 클래스를 쓰지 않는다 — 그
// 항목만 block-side-menu-menu.tsx의 `.geul-cell-format-menu__align-row`/
// `__align-button`을 코드 복제 없이 그대로 재사용한다(같은 절 "결정").
const mediaToolbarMoreMenuItemClassName = "geul-media-toolbar__more-menu-item";

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
// `.geul-media-toolbar__more-menu`(Issue #203 RD-004 DELTA-02)도 같은
// 이유로 포함한다 — more-menu는 `.geul-media-toolbar` 안에 nest되지 않고
// 형제 오버레이로 렌더된다(code-block-language-combobox.tsx의
// CODE_BLOCK_TOOLBAR_ALLOW_SELECTORS가 `.geul-code-block-toolbar__more-menu`
// 를 포함하는 것과 같은 이유) — 빠뜨리면 more 트리거 재클릭이 자기 메뉴를
// "바깥 클릭"으로 오판정해 닫는다.
const MEDIA_TOOLBAR_DISMISS_ALLOW_SELECTORS = [
  ".geul-media-toolbar",
  ".geul-media-toolbar__more-menu",
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
// 각자 복제하는 관례와 일치). Replace에 Embed 탭을 더한 지금(2026-09-12,
// 사용자 지시 — "다시 업로드 및 Embed 탭이 있는 팝업")도 이 결정을
// 유지한다 — 두 컴포넌트의 selection 상태 기계 자체가 이미 다르게 갈라져
// 있어(이 컴포넌트는 url 있는 블록만, file-panel.tsx는 없는 블록만 연다)
// 상태 기계를 공유 추출할 실이익은 여전히 적다. 대신 시각 요소만
// 재사용한다 — 카드 CSS는 file-panel.tsx의 치수를 그대로 복제하고(아래
// `.geul-media-toolbar--replacing`), 탭·입력·버튼은 `.geul-file-panel__*`
// 클래스와 `dictionary.toolbar.filePanel.*` 문자열을 그대로 가져다 쓴다
// (이름이 그 컴포넌트에 묶이지 않은 범용 selector/문자열이라 그대로 쓸 수
// 있다).
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
      /** 기본값은 upload — file-panel.tsx의 Notion parity(2026-09-12)
       * 기본값과 맞춘다. */
      activeTab: "embed" | "upload";
      /** Embed 탭의 URL 입력 draft. */
      draft: string;
      /** Embed 탭에서 거부된 URL을 제출했는지(file-panel.tsx rejected와
       * 같은 계약). */
      rejected: boolean;
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

type MediaToolbarMoreMenu = {
  moreMenuOpen: boolean;
  toggleMoreMenu: () => void;
  closeMoreMenu: () => void;
};

// Issue #203 RD-004 DELTA-02(more 메뉴 도입) 이후 늘어난 12개의 산발적
// `setMoreMenuOpen(false)` 호출(01-계획.md "20260918-01-toolbar-exclusive-
// overlay")을 2곳으로 정리한다 — mode 자체가 view를 벗어나는 자동 close는
// MediaToolbar 본문의 `toolbarState.mode` 감시 useEffect(아래)가 전담하고,
// 같은 view 모드 안에서 메뉴 "자신"이 열고 닫히는 나머지 경로(블록 전환,
// 삭제, ceb86ab의 캔버스 재클릭)는 이 훅 하나에 모은다. 단일 소비처라
// (media-toolbar.tsx 안에서만 쓴다) 별도 파일로 추출하지 않는다
// (RD-003-DELTA-03.md와 같은 근거).
const useMediaToolbarMoreMenu = (
  element: HTMLElement | null,
): MediaToolbarMoreMenu => {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const toggleMoreMenu = useCallback(() => {
    setMoreMenuOpen((prev) => !prev);
  }, []);
  const closeMoreMenu = useCallback(() => {
    setMoreMenuOpen(false);
  }, []);

  // ceb86ab — more 메뉴가 열린 채로 같은 미디어 블록의 캔버스(이미지 본문
  // 등)를 다시 클릭해도 안 닫히던 버그(사용자 보고, 2026-09-16) 수정.
  // MEDIA_TOOLBAR_DISMISS_ALLOW_SELECTORS 기반 useDismissOnOutsideOrEscape는
  // `[data-geul-block-id]`를 allow-list에 둬 그 클릭을 "바깥 클릭 아님"으로
  // 넘기고, 뒤이은 updateFromSelection도 같은 blockId 재관측이라
  // moreMenuOpen을 그대로 두는 규칙(메뉴 안 Preview/정렬 버튼 클릭 재조회를
  // 지키기 위한 설계)이 있어, 두 경로가 겹치면 열린 메뉴가 있는 상태에서
  // 같은 블록의 캔버스를 다시 클릭해도 아무 효과가 없었다. 이 효과는 그
  // 두 경로와 별개로 pointerdown 대상만 보고, 메뉴 자기 자신(트리거·항목)
  // 이외의 모든 곳을 "메뉴만 닫는" 신호로 취급한다 — toolbar 전체
  // dismiss(dismissToolbar)는 건드리지 않는다.
  useEffect(() => {
    if (!moreMenuOpen || element === null) return;
    const ownerDocument = element.ownerDocument;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(".geul-media-toolbar") !== null ||
        target.closest(".geul-media-toolbar__more-menu") !== null
      ) {
        return;
      }
      setMoreMenuOpen(false);
    };
    ownerDocument.addEventListener("pointerdown", handlePointerDown);
    return () =>
      ownerDocument.removeEventListener("pointerdown", handlePointerDown);
  }, [moreMenuOpen, element]);

  return { moreMenuOpen, toggleMoreMenu, closeMoreMenu };
};

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
  // Issue #203 RD-004 DELTA-02 — view 모드 개별 버튼을 모은 `⋯` more
  // 메뉴의 열림 상태. `toolbarState.mode`와 별도로 둔다 — view 모드 자체는
  // 유지한 채(리사이즈·selection 재조회는 계속 진행) 메뉴만 여닫는다
  // (code-block-language-combobox.tsx moreMenuOpen과 같은 이유). 20260918-01
  // 리팩터(01-계획.md) 이후 close 결정은 useMediaToolbarMoreMenu(위)와 아래
  // toolbarState.mode 감시 useEffect 둘로만 모인다 — 그 외 지점은 이 훅이
  // 반환한 closeMoreMenu()만 호출한다.
  const { moreMenuOpen, toggleMoreMenu, closeMoreMenu } =
    useMediaToolbarMoreMenu(element);
  // 01-계획.md(20260918-01) — mode가 view를 벗어나는 모든 지점(rename/
  // caption/replacing 진입, dismissToolbar·updateFromSelection이 만드는
  // closed 포함)에서 메뉴를 닫는다. 각 전이 지점이 개별로
  // `setMoreMenuOpen(false)`를 부르던 것을 이 useEffect 하나로 모았다 —
  // 다시 view로 돌아올 때(cancelReplacing/finishEditing)는 mode가
  // non-view였던 동안 이미 false로 고정돼 있어(더보기 트리거 자체가 view
  // 모드에서만 렌더돼 그 사이 true로 바뀔 수 없다) 별도 처리가 필요 없다.
  useEffect(() => {
    if (toolbarState.mode !== "view") closeMoreMenu();
  }, [toolbarState.mode, closeMoreMenu]);
  // more 트리거 자신의 div — code-block-language-combobox.tsx
  // moreTriggerRef와 같은 이유(IconButton은 forwardRef가 아니라 ref를
  // 버튼 DOM에 곧바로 붙일 수 없다). shell의 rect가 곧 버튼의 rect여야
  // 아래 moreMenuAnchor 실측이 어긋나지 않는다.
  const moreTriggerRef = useRef<HTMLDivElement | null>(null);
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
  const replaceUrlInputRef = useRef<HTMLInputElement>(null);
  const { actionError, runCommand, clearActionError } =
    useTableCommandFeedback();

  const updateFromSelection = useCallback(() => {
    if (editingRef.current) return;
    if (element === null) {
      viewBlockIdRef.current = null;
      dismissedBlockIdRef.current = null;
      // mode가 "closed"로 바뀌면 위 toolbarState.mode 감시 useEffect가
      // moreMenu를 닫는다 — 여기서 직접 부르지 않는다(01-계획.md).
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

    // 다른 블록으로 전환됐으면 이전 블록에서 열려 있던 more 메뉴를 새
    // 블록까지 들고 오지 않는다 — 같은 블록을 계속 보고 있을 때는(재조회가
    // showPreview/textAlignment 등만 갱신) 열려 있던 메뉴를 그대로 둔다.
    // mode는 이 분기 전체에서 "view"로 유지되므로(또는 최초 진입) 위
    // 감시 useEffect가 반응하지 않는다 — 같은 view 모드 안에서 메뉴만
    // 닫는 경로라 useMediaToolbarMoreMenu의 closeMoreMenu를 직접 부른다.
    if (viewBlockIdRef.current !== media.blockId) closeMoreMenu();
    viewBlockIdRef.current = media.blockId;
    const bounds =
      readBlockTopRightBounds(element, media.blockId) ??
      FALLBACK_BLOCK_POSITION;
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
  }, [editor, element, closeMoreMenu]);

  useSelectionRefresh({ element, onUpdate: updateFromSelection });

  // 리사이즈 중 숨김(사용자 스크린샷 — 드래그 동안 toolbar가 드래그 시작
  // 시점 위치에 그대로 떠 이미지를 가린다). media-resize-handles.tsx가
  // element(에디터 마운트 루트, file-panel.tsx의 data-geul-file-panel-block-id
  // 와 같은 계약)에 드래그 중 `data-geul-media-resizing-block-id`를 쓴다 —
  // 그 컴포넌트의 pointerdown preventDefault가 이 드래그 시퀀스의 호환
  // mousedown/mouseup을 없애 useSelectionRefresh(위)로는 드래그 시작·종료
  // 어느 쪽도 못 잡으므로, 그 속성 변화만 MutationObserver로 직접
  // 지켜본다(두 컴포넌트는 여전히 서로를 모른다, RD-001 DELTA-02.md와 같은
  // 이유로 훅을 추출하지 않는다).
  const [resizingBlockId, setResizingBlockId] = useState<string | null>(null);
  useEffect(() => {
    if (element === null) {
      setResizingBlockId(null);
      return;
    }
    const readResizingBlockId = () =>
      element.getAttribute("data-geul-media-resizing-block-id");
    setResizingBlockId(readResizingBlockId());
    const observer = new MutationObserver(() => {
      setResizingBlockId(readResizingBlockId());
    });
    observer.observe(element, {
      attributeFilter: ["data-geul-media-resizing-block-id"],
      attributes: true,
    });
    return () => observer.disconnect();
  }, [element]);

  // 드래그가 끝나면(속성이 사라지면) bounds를 다시 읽어야 한다 — 리사이즈로
  // 미디어 크기가 바뀌면 topRight 앵커(readBlockTopRightBounds)도 함께
  // 움직여 드래그 시작 시점에 캐시해 둔 toolbarState.left/top이 더는 맞지
  // 않는다.
  // useLayoutEffect여야 한다(사용자 스크린샷 — useEffect였을 때 재표시
  // 순간 옛 위치가 한 프레임 보였다가 새 위치로 튀었다): resizingBlockId가
  // null로 바뀐 렌더는 아직 옛 toolbarState.left/top으로 커밋·페인트되고,
  // 그 다음에야 일반 useEffect(페인트 이후 실행)가 새 bounds로 다시 렌더해
  // 두 번째 페인트가 뒤따른다. useLayoutEffect는 커밋 직후·페인트 전에
  // 동기로 flush되므로 이 setState가 같은 페인트에 합쳐진다(브라우저가
  // 옛 위치를 그리지 않는다) — table-handles.tsx가 표 경계 재측정에 쓰는
  // 것과 같은 이유·같은 관례.
  const previousResizingBlockIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const previous = previousResizingBlockIdRef.current;
    previousResizingBlockIdRef.current = resizingBlockId;
    if (previous !== null && resizingBlockId === null) updateFromSelection();
  }, [resizingBlockId, updateFromSelection]);

  useEffect(() => {
    if (
      toolbarState.mode === "editingName" ||
      toolbarState.mode === "editingCaption"
    ) {
      inputRef.current?.focus();
    }
  }, [toolbarState.mode]);

  // 활성 탭이 정해질 때(최초 진입 포함, 탭 전환 클릭 포함) 그 탭의 입력에
  // 초점을 준다 — file-panel.tsx의 같은 이름 effect와 같은 이유·같은 모양
  // (2026-09-12, Embed 탭 추가).
  const replaceActiveTab =
    toolbarState.mode === "replacing" ? toolbarState.activeTab : null;
  useEffect(() => {
    if (replaceActiveTab === "upload") replaceFileInputRef.current?.focus();
    else if (replaceActiveTab === "embed") replaceUrlInputRef.current?.focus();
  }, [replaceActiveTab]);

  // Upload 성공(pending null)·Embed URL 적용 성공 공용 — url/name이 실제로
  // 바뀌었으므로 finishEditing처럼 로컬 캐시 값을 재사용하지 않고 core를
  // 다시 조회해 "view"로 돌아간다(RD-003-DELTA-03.md "결정"). 대기 중 이미
  // 다른 상태로 나갔으면(Cancel 등) 손대지 않는다 — updateFromSelection과
  // 같은 판정을 여기 인라인한다(updateFromSelection을 setState 콜백 안에서
  // 부르면 안 돼 직접 푼다).
  const finishReplacing = useCallback(
    (blockId: string) => {
      setToolbarState((prev) => {
        if (prev.mode !== "replacing" || prev.blockId !== blockId) return prev;
        editingRef.current = false;
        if (element === null) return { mode: "closed" };
        const media = editor.getSelectionMediaBlock();
        if (media === null || media.url === null || media.blockId !== blockId) {
          return { mode: "closed" };
        }
        const bounds =
          readBlockTopRightBounds(element, media.blockId) ??
          FALLBACK_BLOCK_POSITION;
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
    [editor, element],
  );

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
      finishReplacing(blockId);
    },
    [editor, dictionary.status.uploadCouldNotStart, finishReplacing],
  );

  const startReplacing = () => {
    if (toolbarState.mode !== "view") return;
    clearActionError();
    editingRef.current = true;
    // more 메뉴 항목에서 진입한다(Issue #203 RD-004 DELTA-02) — mode가
    // "replacing"으로 바뀌면 위 toolbarState.mode 감시 useEffect가 메뉴를
    // 닫는다(01-계획.md, 여기서 직접 부르지 않는다).
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
      activeTab: "upload",
      draft: "",
      rejected: false,
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

  const handleReplaceTabClick = (tab: "embed" | "upload") => {
    setToolbarState((prev) =>
      prev.mode === "replacing" ? { ...prev, activeTab: tab } : prev,
    );
  };

  // file-panel.tsx applyUrl과 같은 관례 — 마지막 path segment로 이름을
  // 추출해 저장한다(추출 실패는 setMediaBlockName을 호출하지 않는다).
  // 성공하면 startReplaceUpload 성공 분기와 같은 finishReplacing으로
  // view에 돌아간다.
  const applyReplaceUrl = () => {
    if (toolbarState.mode !== "replacing") return;
    const { blockId, draft } = toolbarState;
    const result = editor.commands.setMediaBlockUrl(blockId, draft);
    if (!result.ok) {
      setToolbarState((prev) =>
        prev.mode === "replacing" ? { ...prev, rejected: true } : prev,
      );
      return;
    }
    const extractedName = extractNameFromUrl(draft);
    if (extractedName !== null) {
      editor.commands.setMediaBlockName(blockId, extractedName);
    }
    finishReplacing(blockId);
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
    // moreMenu는 "replacing" 진입 시점에 이미 위 감시 useEffect로 닫혀
    // 있었고(더보기 트리거가 view 모드에서만 렌더돼 그 사이 다시 열릴 수
    // 없다) view로 돌아오는 지금 다시 부를 필요가 없다(01-계획.md).
    setToolbarState({ mode: "view", ...carryMediaInfo(toolbarState) });
    element?.ownerDocument.defaultView?.setTimeout(() => {
      editingRef.current = false;
    });
  };

  // outer 컨테이너(rename/caption/replacing이 view와 같은 코너에서 그대로
  // 펼치는 shell)를 블록 우상단에 앵커링한다(Issue #203 RD-004 DELTA-02,
  // 01-계획.md 6절 "선례 패턴" — code-block-language-combobox.tsx outer
  // toolbar의 topRight variant). `_media-toolbar.scss`의
  // `transform: translateX(-100%)`가 렌더된 박스를 왼쪽으로 밀어 우상단이
  // 이 좌표와 일치하게 만든다.
  const { menuRef, style } = useClampedMenuPosition(
    toolbarState.mode === "closed" ? 0 : toolbarState.left,
    toolbarState.mode === "closed" ? 0 : toolbarState.top,
    "topRight",
  );
  const focusEditor = useFocusEditor(element);

  // more-menu는 outer 컨테이너와 독립된 앵커를 쓴다 — view 모드에서 outer
  // 컨테이너 자체가 `⋯` 트리거 하나뿐이라 그 트리거의 렌더된 rect가 곧
  // 컨테이너 rect이지만, code-block-language-combobox.tsx와 같은 구조를
  // 그대로 유지해 트리거가 나중에 다른 버튼과 나란히 놓여도 깨지지 않게
  // 한다. PIT-0011 — 여기서는 앵커 좌표만 실측하고, 뷰포트 clamp 자체는
  // 아래 useClampedMenuPosition의 기존 ResizeObserver 재계산에 맡긴다(별도
  // 수동 재계산 로직을 새로 만들지 않는다).
  const viewLeft = toolbarState.mode === "view" ? toolbarState.left : null;
  const viewTop = toolbarState.mode === "view" ? toolbarState.top : null;
  // 트리거 rect 실측 + outer 컨테이너(menuRef) 리사이즈 보강(코드리뷰
  // 결함 2)은 useAnchoredSubmenu가 code-block-language-combobox.tsx와
  // 공유한다.
  const { anchor: moreMenuAnchor, recompute: recomputeMoreMenuAnchor } =
    useAnchoredSubmenu(moreTriggerRef, menuRef, moreMenuOpen);
  // 훅이 못 보는 재배치만 여기서 다시 잰다 — outer 컨테이너 크기 변화가
  // 아니라 selection 재조회로 toolbarState 자체(viewLeft/viewTop)가
  // 옮겨가는 경우다. 이 값의 이름·의미는 소비처마다 달라 훅 인자로 묶을 수
  // 없다.
  useLayoutEffect(() => {
    if (!moreMenuOpen) return;
    recomputeMoreMenuAnchor();
  }, [moreMenuOpen, viewLeft, viewTop, recomputeMoreMenuAnchor]);

  const { menuRef: moreMenuRef, style: moreMenuStyle } = useClampedMenuPosition(
    moreMenuAnchor?.left ?? 0,
    moreMenuAnchor?.top ?? 0,
    "topRight",
  );

  const dismissToolbar = useCallback(() => {
    dismissedBlockIdRef.current = viewBlockIdRef.current;
    editingRef.current = true;
    clearActionError();
    // mode가 "closed"로 바뀌면 위 toolbarState.mode 감시 useEffect가
    // moreMenu를 닫는다 — 여기서 직접 부르지 않는다(01-계획.md).
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

  // more 메뉴는 outer 컨테이너와 같은 dismiss 하나를 공유한다 — 별도
  // useDismissOnOutsideOrEscape 인스턴스를 두지 않는다. 처음엔 메뉴만
  // 닫는 계층적(nested) dismiss를 시도했으나, 실 Chromium 대상 e2e 다수가
  // "Escape/바깥 클릭 한 번이 view 모드 전체를 곧바로 닫는다"는 기존
  // 계약(01-계획.md 완료 조건 2)에 의존해 그 계약을 유지해야 했다 — 메뉴가
  // 열려 있어도 Escape/바깥 클릭 한 번으로 메뉴와 toolbar 전체가 함께
  // 닫힌다(dismissToolbar가 mode를 closed로 바꾸고, 위 toolbarState.mode
  // 감시 useEffect가 그 전이에 반응해 moreMenu도 함께 닫는다).
  // `.geul-media-toolbar__more-menu`를 MEDIA_TOOLBAR_DISMISS_ALLOW_SELECTORS
  // 에 포함해 두는 이유는 여전히 유효하다 — 메뉴 항목 클릭 자체(Preview/
  // 정렬처럼 메뉴를 안 닫는 토글 포함)가 "바깥 클릭"으로 오판정되는 것만
  // 막는다.
  useDismissOnOutsideOrEscape({
    active: toolbarState.mode === "view",
    element,
    allowSelectors: MEDIA_TOOLBAR_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissToolbar,
    onEscapeDismiss: dismissToolbarAndFocusEditor,
  });

  // more 메뉴가 열린 채로 같은 블록의 캔버스를 다시 클릭해도 안 닫히던
  // 버그(ceb86ab, 사용자 보고 2026-09-16)의 재현 pointerdown 감시는
  // useMediaToolbarMoreMenu(위)로 옮겼다 — moreMenuOpen과 별개로 이
  // toolbar 전체를 닫는 dismissToolbar는 여전히 여기 useDismissOnOutsideOrEscape가
  // 전담한다.

  if (toolbarState.mode === "closed") return null;
  // 지금 보여주는 바로 그 블록이 리사이즈 중이면 감춘다 — 다른 블록의
  // 리사이즈(예: 다른 미디어를 방금까지 드래그하던 잔여 상태)는 이
  // toolbar와 무관하다.
  if (toolbarState.blockId === resizingBlockId) return null;

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
    // moreMenu는 editingName/editingCaption 진입 시점에 이미 위 감시
    // useEffect로 닫혀 있었다 — view로 돌아오는 지금 다시 부를 필요가
    // 없다(01-계획.md, startEditingName/startEditingCaption 주석 참고).
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
    // more 메뉴 항목에서 진입한다(startReplacing과 같은 이유) — mode가
    // "editingName"으로 바뀌면 위 toolbarState.mode 감시 useEffect가 메뉴를
    // 닫는다(01-계획.md, 여기서 직접 부르지 않는다).
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
  // 패턴) — 실패하면 로컬 state를 건드리지 않아 aria-checked가 실제
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
  // aria-checked가 실제 문서 상태와 어긋나지 않는다.
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
    // code-block-language-combobox.tsx handleDelete와 같은 이유로 결과와
    // 무관하게 메뉴부터 닫는다 — 곧 사라질(성공 시) 또는 그대로 남을(실패
    // 시) 블록을 가리키는 메뉴를 열어 두지 않는다. mode는 이 호출 시점에
    // 여전히 "view"라(성공 시 updateFromSelection이 나중에 closed로
    // 바꾼다) 위 감시 useEffect가 반응하지 않는다 — 같은 view 모드 안에서
    // 메뉴만 닫는 경로라 closeMoreMenu를 직접 부른다.
    closeMoreMenu();
    runCommand(
      () => editor.commands.deleteBlock(toolbarState.blockId),
      updateFromSelection,
    );
  };

  const content = (
    <div
      aria-label={dictionary.toolbar.media.ariaLabel}
      className={
        toolbarState.mode === "replacing"
          ? "geul-media-toolbar geul-media-toolbar--replacing"
          : "geul-media-toolbar"
      }
      ref={menuRef}
      role="toolbar"
      style={style}
    >
      {/* Issue #203 RD-004 DELTA-02 — view 모드는 이제 `⋯` more 트리거
          하나뿐이다(과거 8개 control이 전부 아래 more-menu 항목으로
          옮겨갔다). 이 shell 자체가 outer 컨테이너(topRight)의 렌더된
          박스라 리사이즈로 블록이 아무리 좁아져도 트리거 하나 폭만
          차지한다 — 다음 블록과 겹치지 않는다(01-계획.md 완료 조건 1). */}
      {toolbarState.mode === "view" && (
        <div className="geul-media-toolbar__more-trigger" ref={moreTriggerRef}>
          <IconButton
            aria-expanded={moreMenuOpen}
            aria-haspopup="menu"
            className={mediaToolbarButtonClassName}
            icon={moreIcon}
            label={dictionary.toolbar.media.moreAriaLabel}
            onClick={toggleMoreMenu}
          />
        </div>
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
          {/* Upload/Embed 탭 + 우측 상단 닫기(X) — file-panel.tsx 카드와
              같은 구조(2026-09-12, 사용자 지시). 위 ToolbarState "replacing"
              주석 참고 — 시각 요소만 재사용하고 상태 기계는 이 컴포넌트가
              그대로 소유한다. */}
          <div className="geul-file-panel__header">
            <div
              aria-label={dictionary.toolbar.filePanel.sourceAriaLabel}
              className="geul-file-panel__tablist"
              role="tablist"
            >
              <button
                aria-selected={toolbarState.activeTab === "upload"}
                className={filePanelButtonClassName}
                onClick={() => handleReplaceTabClick("upload")}
                onMouseDown={(event) => event.preventDefault()}
                role="tab"
                type="button"
              >
                {dictionary.toolbar.filePanel.uploadTab}
              </button>
              <button
                aria-selected={toolbarState.activeTab === "embed"}
                className={filePanelButtonClassName}
                onClick={() => handleReplaceTabClick("embed")}
                onMouseDown={(event) => event.preventDefault()}
                role="tab"
                type="button"
              >
                {dictionary.toolbar.filePanel.embedTab}
              </button>
            </div>
            <IconButton
              className={mediaToolbarButtonClassName}
              icon={cancelIcon}
              label={dictionary.toolbar.media.cancel}
              onClick={cancelReplacing}
            />
          </div>
          {toolbarState.activeTab === "embed" && (
            <>
              <input
                aria-label={dictionary.toolbar.filePanel.urlInputAriaLabel.replace(
                  "{kind}",
                  dictionary.toolbar.kindNames[toolbarState.kind],
                )}
                className="geul-file-panel__url-input"
                onChange={(event) => {
                  if (toolbarState.mode !== "replacing") return;
                  setToolbarState({
                    ...toolbarState,
                    draft: event.currentTarget.value,
                    rejected: false,
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyReplaceUrl();
                  }
                }}
                placeholder={dictionary.toolbar.filePanel.urlInputPlaceholder.replace(
                  "{kind}",
                  dictionary.toolbar.kindNames[toolbarState.kind],
                )}
                ref={replaceUrlInputRef}
                type="text"
                value={toolbarState.draft}
              />
              <button
                aria-label={dictionary.toolbar.filePanel.saveUrl}
                className={`${filePanelButtonClassName} geul-file-panel__primary-button`}
                onClick={applyReplaceUrl}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                {dictionary.toolbar.filePanel.save.replace(
                  "{kind}",
                  dictionary.toolbar.kindNames[toolbarState.kind],
                )}
              </button>
              {toolbarState.rejected && (
                <span className="geul-media-toolbar__error" role="alert">
                  {dictionary.status.unsupportedMediaUrl}
                </span>
              )}
            </>
          )}
          {toolbarState.activeTab === "upload" && (
            <div className="geul-file-panel__upload">
              {/* 네이티브 file input은 시각적으로만 숨긴다 — file-panel.tsx
                  upload-input과 같은 이유(clip 기법, 접근성 트리 유지).
                  실제 클릭은 아래 전체폭 버튼이 대신 트리거한다. */}
              <input
                aria-label={dictionary.toolbar.media.replaceFileInputAriaLabel.replace(
                  "{kind}",
                  dictionary.toolbar.kindNames[toolbarState.kind],
                )}
                className="geul-file-panel__upload-input"
                disabled={toolbarState.upload.status === "uploading"}
                onChange={handleReplaceFileChange}
                ref={replaceFileInputRef}
                type="file"
              />
              {toolbarState.upload.status !== "uploading" && (
                <button
                  className={`${filePanelButtonClassName} geul-file-panel__upload-trigger`}
                  onClick={() => replaceFileInputRef.current?.click()}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  {dictionary.toolbar.filePanel.uploadButton}
                </button>
              )}
              {toolbarState.upload.status === "uploading" && (
                <p role="status">{dictionary.status.uploading}</p>
              )}
              {toolbarState.upload.status === "error" && (
                <>
                  <span className="geul-media-toolbar__error" role="alert">
                    {toolbarState.upload.message}
                  </span>
                  {toolbarState.heldFile !== null && (
                    <button
                      className={filePanelButtonClassName}
                      onClick={handleReplaceRetry}
                      onMouseDown={(event) => event.preventDefault()}
                      type="button"
                    >
                      {dictionary.toolbar.media.retry}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
      {actionError !== null && (
        <span className="geul-media-toolbar__error" role="alert">
          {actionError.code}
        </span>
      )}
    </div>
  );

  // Issue #203 RD-004 DELTA-02 — view 모드의 옛 8개 control이 이 메뉴 안
  // 텍스트 항목으로 옮겨왔다(code-block-language-combobox.tsx more-menu와
  // 같은 구조). Replace/Rename/Caption 항목은 클릭하면 outer 컨테이너
  // 자신을 다른 mode로 전환할 뿐 이 메뉴를 직접 렌더하지 않는다 — mode가
  // "view"를 벗어나는 순간 아래 조건이 거짓이 돼 자연히 사라진다(위
  // toolbarState.mode 감시 useEffect가 moreMenuOpen도 false로 되돌려 stale
  // 재오픈을 막는다, 위 주석 참고). Preview·정렬 항목은 클릭해도 메뉴를 닫지
  // 않는다 — 여러 상태를 이어서 토글할 수 있어야 한다(view 모드였을 때의
  // 기존 계약과 동일, 01-계획.md "범위 밖" — 새 시각 강조 CSS는 추가하지
  // 않는다). role="menuitemcheckbox" + aria-checked로 상태를 알린다 —
  // role="menuitem"은 aria-pressed를 지원하지 않는 role="button" 전용
  // 속성이라(WAI-ARIA 계약 위반, 리뷰 결함 1) menu-item-button.tsx 문서
  // 주석·table-handle-menu.tsx 헤더 토글과 같은 관례를 따른다.
  const moreMenu = toolbarState.mode === "view" && moreMenuOpen && (
    <div
      className="geul-media-toolbar__more-menu"
      data-block-id={toolbarState.blockId}
      ref={moreMenuRef}
      role="menu"
      style={moreMenuStyle}
    >
      {editor.isUploadEnabled() && (
        <MenuItemButton
          className={mediaToolbarMoreMenuItemClassName}
          onClick={startReplacing}
        >
          {dictionary.toolbar.media.replaceAriaLabel}
        </MenuItemButton>
      )}
      <MenuItemButton
        className={mediaToolbarMoreMenuItemClassName}
        onClick={startEditingName}
      >
        {dictionary.toolbar.media.rename}
      </MenuItemButton>
      <MenuItemButton
        className={mediaToolbarMoreMenuItemClassName}
        onClick={startEditingCaption}
      >
        {dictionary.toolbar.media.editCaptionAriaLabel}
      </MenuItemButton>
      {toolbarState.kind !== "file" && (
        <MenuItemButton
          aria-checked={toolbarState.showPreview === true}
          className={mediaToolbarMoreMenuItemClassName}
          onClick={toggleShowPreview}
          role="menuitemcheckbox"
        >
          {dictionary.toolbar.media.preview}
        </MenuItemButton>
      )}
      {(toolbarState.kind === "image" || toolbarState.kind === "video") && (
        // block-side-menu-menu.tsx 정렬 행 클래스를 코드 복제 없이 그대로
        // 재사용한다(01-계획.md 6절 "결정") — 4번째 해제(×) 버튼은 추가하지
        // 않는다: media는 같은 값 재클릭 시 해제하는 기존 setMediaAlignment
        // 시맨틱을 그대로 유지한다(계약 변경 없음).
        <div className="geul-cell-format-menu__align-row">
          <MenuItemButton
            aria-checked={toolbarState.textAlignment === "left"}
            aria-label={dictionary.toolbar.media.alignLeft}
            className="geul-cell-format-menu__align-button"
            onClick={() => setMediaAlignment("left")}
            role="menuitemcheckbox"
          >
            {alignLeftIcon}
          </MenuItemButton>
          <MenuItemButton
            aria-checked={toolbarState.textAlignment === "center"}
            aria-label={dictionary.toolbar.media.alignCenter}
            className="geul-cell-format-menu__align-button"
            onClick={() => setMediaAlignment("center")}
            role="menuitemcheckbox"
          >
            {alignCenterIcon}
          </MenuItemButton>
          <MenuItemButton
            aria-checked={toolbarState.textAlignment === "right"}
            aria-label={dictionary.toolbar.media.alignRight}
            className="geul-cell-format-menu__align-button"
            onClick={() => setMediaAlignment("right")}
            role="menuitemcheckbox"
          >
            {alignRightIcon}
          </MenuItemButton>
        </div>
      )}
      <MenuItemButton
        className={`${mediaToolbarMoreMenuItemClassName} geul-media-toolbar__more-menu-item--danger`}
        onClick={handleDelete}
      >
        {dictionary.toolbar.media.deleteAriaLabel}
      </MenuItemButton>
      {/* cross-origin url은 강제 다운로드를 보장하지 않는다(브라우저
          same-origin 정책, spec §6.3) — 링크가 열리기만 할 수도 있다.
          download 속성은 name이 없어도 항상 둔다 — 없으면 강제 다운로드
          힌트 자체가 사라져 평범한 네비게이션으로 바뀐다. Download는
          `<a>`라 MenuItemButton(<button> 전용) 대신 이 항목만 같은 시각
          계약을 직접 조립한다(role="menuitem" 명시 — role="menu" 안
          자식은 링크가 아니라 menuitem이어야 하는 ARIA 계약, 다른 항목들과
          같은 이유). */}
      <a
        className={mediaToolbarMoreMenuItemClassName}
        download={toolbarState.name ?? ""}
        href={toolbarState.url}
        onMouseDown={(event) => event.preventDefault()}
        role="menuitem"
      >
        {dictionary.toolbar.media.download}
      </a>
    </div>
  );

  const rendered = (
    <>
      {content}
      {moreMenu}
    </>
  );

  return portalTarget === null
    ? rendered
    : createPortal(rendered, portalTarget);
};
