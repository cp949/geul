import type {
  AudioBlock,
  FileBlock,
  ImageBlock,
  VideoBlock,
} from "@cp949/geul-core";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  getMediaCaptionEditingSnapshot,
  setMediaCaptionEditing,
  useMediaCaptionEditing,
} from "./media-caption-editing-store.js";
import { findMediaVisualElement } from "./media-handle-overlays.js";
import { readPageRect } from "./table-handle-geometry.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { useMirroredState } from "./use-mirrored-state.js";
import { usePointerHoverTarget } from "./use-pointer-hover-target.js";
import { useSelectionRefresh } from "./use-selection-refresh.js";

type MediaKind = "file" | "image" | "video" | "audio";

const isMediaKind = (value: string | null): value is MediaKind =>
  value === "file" ||
  value === "image" ||
  value === "video" ||
  value === "audio";

type MediaCaptionInstance = {
  blockId: string;
  kind: MediaKind;
  rect: DOMRect;
  textAlignment: "left" | "center" | "right" | null;
};

// 8rem — 그릴링 결정(2026-09-16, Q8). 리사이즈로 이미지가 아주 좁아져도
// caption 박스(따라서 편집 textarea)가 한 글자씩 줄줄이 끊기지 않을 하한선.
const MEDIA_CAPTION_MIN_WIDTH_PX = 128;

// 이 오버레이 자신(표시 버튼·편집 textarea·빈 캡션 추가 버튼)이 전부
// data-geul-media-caption을 공유한다(_editor.scss 톤 규칙 재사용, 아래
// import 참고) — pointermove가 이 위로 올라가도 hover가 풀리면 안 된다.
const MEDIA_CAPTION_HOVER_IGNORE_SELECTORS = [
  "[data-geul-media-caption]",
] as const;

/**
 * media(image/video/audio/file) 캡션 클릭-즉시-편집 오버레이(2026-09-16,
 * Notion 스타일 요청 — 그릴링 Q1~Q8). `code-block-captions.tsx`와 같은
 * 구조(hover 게이트 없이 caption 값이 있거나 편집 중인 인스턴스를 전부
 * 렌더 대상으로 삼음, 편집 상태는 모듈 store)를 따르되 두 지점이 다르다:
 *
 * 1. **빈 캡션의 진입점이 hover 게이트다**(Q2 — "placeholder가 공간을
 *    차지해서는 안 된다"). codeBlock은 이 경우를 toolbar 버튼·more 메뉴로
 *    푸는데 media는 Notion처럼 media 위에 마우스가 있을 때만 뜨는 "캡션
 *    추가" 버튼을 추가로 원했다. `MediaHandleOverlays`(그립·plus)와 같은
 *    `[data-geul-media-kind]` 대상을 또 hover-tracking하지만, 그 파일을
 *    건드리지 않고 이 컴포넌트가 독자적인 `usePointerHoverTarget` 인스턴스를
 *    쓴다 — 두 오버레이는 관심사가 달라(왼쪽 그립 vs 아래쪽 caption) 상태
 *    공유의 이점이 없고, 각자 완결된 파일로 두는 편이 검토·롤백 단위를
 *    작게 유지한다(그립 오버레이가 이미 드래그·메뉴로 충분히 복잡하다).
 *
 * 2. **캡션이 이미지 폭에 맞춰 폭을 갖는다**(Q3 — Notion의 maxWidth 대신
 *    실제 width, `MEDIA_CAPTION_MIN_WIDTH_PX` 하한). 순수 CSS
 *    `width:fit-content` 그리드 트릭은 실측(2026-09-16, 로컬 브라우저
 *    테스트)에서 캡션 텍스트가 길면 트랙이 이미지 폭을 넘어 늘어나는
 *    결함이 있었다(overflow-wrap:anywhere로도 못 막음 — max-content
 *    계산이 wrap 가능성을 반영하지 않는다) — 그래서 여기는 media-resize-
 *    handles.tsx와 같이 실측 rect 기반으로 직접 계산한다.
 *
 * caption을 담는 core의 실제 DOM(`[data-geul-media-caption]`,
 * media-block-extension.ts captionChildren)은 이 오버레이가 표시·편집을
 * 전담하므로 에디터에서는 CSS로 숨긴다(_media-captions.scss) — codeBlock은
 * 애초에 이 DOM을 core가 내지 않아 숨길 필요가 없었던 것과 대비된다. export/
 * 미리보기(packages/io)는 이 오버레이와 완전히 별개 경로라 영향 없다
 * (ADR-0002).
 *
 * Shift+Enter로 실제 줄바꿈을 넣을 수 있어(Q3) `<textarea>`를 쓴다 —
 * `code-block-captions.tsx`의 `<input>`과 다른 지점이다. 높이는
 * `autoResizeTextarea`가 `scrollHeight` 기반으로 늘린다(Notion처럼 스크롤
 * 없이 자라남).
 */
export const MediaCaptions = () => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const focusEditor = useFocusEditor(element);
  const editing = useMediaCaptionEditing();
  const [, setTick] = useState(0);
  const cancelledRef = useRef(false);
  const [hoverBlockId, , updateHoverBlockId] = useMirroredState<string | null>(
    null,
  );
  // blockId -> 이 컴포넌트가 렌더한 오버레이(.geul-media-caption) DOM.
  // 아래 useLayoutEffect가 이 실측 높이를 core의 real caption DOM(spacer,
  // _media-captions.scss 참고)에 되먹여 문서 flow가 caption 자리를
  // 예약하게 한다.
  const overlayNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const refresh = useCallback(() => setTick((tick) => tick + 1), []);
  useSelectionRefresh({ element, onUpdate: refresh });

  // caption 오버레이는 core의 real caption DOM 밖(별도 서브트리)에 그려져
  // 문서 flow에 자기 높이를 반영하지 못한다(2026-09-16, 버그 수정 — 캡션이
  // 길어져도 블록 사이 간격이 안 늘고 다음 블록과 겹쳤다는 사용자 보고).
  // core가 hidden(visibility:hidden)으로 남겨 둔 real caption DOM을
  // spacer로 재사용해 이 오버레이의 실측 높이를 매 렌더 직후 되먹인다 —
  // display 상태뿐 아니라 편집 중 textarea가 자라나는 경우도 같은 경로로
  // 반영된다(autoResizeTextarea가 오버레이 높이를 바꾸면 다음 렌더에서 이
  // effect가 다시 돈다). committedCaption이 애초에 빈 값이면 core가 real
  // caption DOM 자체를 안 내므로(captionChildren) spacer가 없다 — 그 경우는
  // 되먹일 대상이 없어 건너뛴다(Q2: 빈 캡션은 hover-add 버튼뿐, 애초에
  // 공간을 예약하지 않는 설계 그대로).
  useLayoutEffect(() => {
    if (element === null) return;
    for (const [blockId, overlayNode] of overlayNodesRef.current) {
      const wrapper = element.querySelector<HTMLElement>(
        `[data-geul-media-kind][data-geul-block-id="${blockId}"]`,
      );
      const spacer =
        wrapper?.querySelector<HTMLElement>(
          ":scope > [data-geul-media-caption]",
        ) ?? null;
      if (spacer === null) continue;
      spacer.style.height = `${overlayNode.offsetHeight}px`;
    }
  });

  const handleHoverCandidateChange = useCallback(
    (candidate: HTMLElement | null) => {
      updateHoverBlockId(candidate?.getAttribute("data-geul-block-id") ?? null);
    },
    [updateHoverBlockId],
  );

  usePointerHoverTarget({
    element,
    entitySelector: "[data-geul-media-kind]",
    ignoreSelectors: MEDIA_CAPTION_HOVER_IGNORE_SELECTORS,
    onCandidateChange: handleHoverCandidateChange,
  });

  // unmount 시 공유 store를 비운다 — code-block-caption-editing-store.ts와
  // 같은 이유(다음 마운트가 이 인스턴스가 열어 둔 편집 상태를 이어받지
  // 않는다).
  useEffect(() => {
    return () => setMediaCaptionEditing(null);
  }, []);

  // Escape로 취소했으면 onBlur가 이어서 실행되더라도 커밋하지 않는다.
  // draft가 committed 값과 같으면 명령을 호출하지 않는다(불필요한 history
  // 항목 방지) — code-block-captions.tsx의 commit과 동일 이유.
  const commit = useCallback(
    (blockId: string, committedCaption: string) => {
      if (cancelledRef.current) {
        cancelledRef.current = false;
        setMediaCaptionEditing(null);
        return;
      }
      const current = getMediaCaptionEditingSnapshot();
      if (
        current !== null &&
        current.blockId === blockId &&
        current.draft !== committedCaption
      ) {
        editor.commands.setMediaBlockCaption(blockId, current.draft);
      }
      setMediaCaptionEditing(null);
    },
    [editor],
  );

  if (element === null) return null;

  const instances: MediaCaptionInstance[] = Array.from(
    element.querySelectorAll<HTMLElement>("[data-geul-media-kind]"),
  )
    .map((wrapper): MediaCaptionInstance | null => {
      const blockId = wrapper.getAttribute("data-geul-block-id");
      const kind = wrapper.getAttribute("data-geul-media-kind");
      if (blockId === null || !isMediaKind(kind)) return null;
      const alignment = wrapper.getAttribute("data-geul-text-alignment");
      return {
        blockId,
        kind,
        rect: readPageRect(findMediaVisualElement(wrapper) ?? wrapper),
        // file/audio는 model에 textAlignment 필드가 없어 이 attribute가 항상
        // null이다 — 아래 기본 분기를 타면 (width - rect.width)/2로 가운데
        // 정렬돼 좁은 <a>/<audio> 콘텐츠 기준 좌우로 균등히 삐져나온다.
        // _editor.scss(core가 내는 real caption div의 [data-geul-media-caption]
        // 규칙 주석)의 설계 그대로 "좌측 정렬 콘텐츠를 따라간다"를 지키려면
        // file/audio는 항상 left로 고정해야 한다(2026-09-17 사용자 보고 —
        // 파일 블록 캡션이 왼쪽 여백 없이 붙어 보임).
        textAlignment:
          kind === "file" || kind === "audio"
            ? "left"
            : alignment === "left" || alignment === "right"
              ? alignment
              : null,
      };
    })
    .filter((instance): instance is MediaCaptionInstance => instance !== null);

  return (
    <>
      {instances.map(({ blockId, kind, rect, textAlignment }) => {
        const block = editor.getBlock(blockId);
        // getBlock의 반환 타입 DocumentBlock = Block | CustomBlock에서
        // CustomBlock.type이 넓은 string이라 리터럴 비교만으로는 좁혀지지
        // 않는다(code-block-captions.tsx와 동일 근거) — 명시적으로
        // 캐스트한다.
        const committedCaption =
          block !== undefined &&
          (block.type === "image" ||
            block.type === "video" ||
            block.type === "audio" ||
            block.type === "file")
            ? ((block as ImageBlock | VideoBlock | AudioBlock | FileBlock)
                .caption ?? "")
            : "";
        const isEditing = editing?.blockId === blockId;
        const isHovered = hoverBlockId === blockId;

        // 빈 캡션 + 비편집 + 비호버면 오버레이 자체를 렌더하지 않는다(Q2 —
        // "placeholder가 공간을 차지해서는 안 된다"). codeBlock의 "빈 값+
        // 비편집" 게이트와 같은 모양이지만 media는 `isHovered`가 예외를 하나
        // 더 열어 hover 중엔 "캡션 추가" 버튼을 보인다.
        if (!isEditing && committedCaption === "" && !isHovered) {
          return null;
        }

        const width = Math.max(rect.width, MEDIA_CAPTION_MIN_WIDTH_PX);
        // 하한이 실제 폭보다 넓어졌을 때 남는 여백을 정렬 방향에 맞춰
        // 분배한다 — 왼쪽 정렬이면 오른쪽으로만, 오른쪽 정렬이면 왼쪽으로만,
        // 중앙(기본)이면 양쪽 절반씩 늘어난다(이미지 자신의 margin:auto
        // 중앙 정렬과 같은 전제).
        const left =
          textAlignment === "left"
            ? rect.left
            : textAlignment === "right"
              ? rect.right - width
              : rect.left - (width - rect.width) / 2;

        const handleKeyDown = (
          event: ReactKeyboardEvent<HTMLTextAreaElement>,
        ) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            cancelledRef.current = true;
            event.currentTarget.blur();
            focusEditor();
          }
        };
        const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
          setMediaCaptionEditing({ blockId, draft: event.target.value });
          autoResizeTextarea(event.target);
        };

        return (
          <div
            key={blockId}
            ref={(node) => {
              if (node === null) {
                overlayNodesRef.current.delete(blockId);
              } else {
                overlayNodesRef.current.set(blockId, node);
              }
            }}
            className="geul-media-caption"
            data-geul-text-alignment={textAlignment ?? undefined}
            style={{
              position: "absolute",
              top: rect.bottom,
              left,
              width,
            }}
          >
            {isEditing ? (
              <textarea
                className="geul-media-caption__textarea"
                data-geul-media-caption=""
                aria-label={dictionary.toolbar.media.captionInputAriaLabel.replace(
                  "{kind}",
                  dictionary.toolbar.kindNames[kind],
                )}
                placeholder={dictionary.toolbar.media.captionOverlayPlaceholder}
                value={editing.draft}
                rows={1}
                autoFocus
                ref={autoResizeTextarea}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onBlur={() => commit(blockId, committedCaption)}
              />
            ) : committedCaption !== "" ? (
              <button
                type="button"
                className="geul-media-caption__display"
                data-geul-media-caption=""
                onClick={() =>
                  setMediaCaptionEditing({ blockId, draft: committedCaption })
                }
              >
                {committedCaption}
              </button>
            ) : (
              <button
                type="button"
                className="geul-media-caption__add"
                data-geul-media-caption=""
                onClick={() => setMediaCaptionEditing({ blockId, draft: "" })}
              >
                {dictionary.toolbar.media.addCaptionAriaLabel}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
};

/**
 * textarea 높이를 내용에 맞춘다(Notion처럼 스크롤 없이 자라남) — height를
 * "auto"로 먼저 되돌려야 줄을 지웠을 때도 scrollHeight가 줄어든 값을
 * 돌려준다. ref callback으로도 쓸 수 있게 `HTMLTextAreaElement | null`을
 * 받는다(마운트 시 1회 자동 호출).
 */
const autoResizeTextarea = (node: HTMLTextAreaElement | null): void => {
  if (node === null) return;
  node.style.height = "auto";
  node.style.height = `${node.scrollHeight}px`;
};
