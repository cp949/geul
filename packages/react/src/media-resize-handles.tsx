import { useCallback, useEffect, useRef, useState } from "react";

import { findElementByAttribute } from "./find-by-attribute.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useMirroredState } from "./use-mirrored-state.js";
import { usePointerDragGesture } from "./use-pointer-drag-gesture.js";

// spec §6.3 "최소 64px" — model(previewWidth)은 상한만 두고 값 자체를 강제
// clamp하지 않는다(spec §5.3, `isValidMediaPreviewWidth`는 양의 유한수만
// 본다). 이 하한·상한은 UI 전용 계약이라 core에서 export하지 않는다(표의
// MIN_COLUMN_WIDTH/MAX_COLUMN_WIDTH와 다르다 — 그쪽은 resizeTableColumn 자체가
// core에서도 같은 값으로 검증한다, table-grid.ts).
const MIN_MEDIA_PREVIEW_WIDTH = 64;

// 핸들 정사각형의 절반 길이(px). _media-resize-handles.scss의 실제 크기와
// 짝을 맞춘다 — 핸들 중심이 미디어 경계(좌/우 테두리, 세로 중앙)에 오도록
// 렌더 좌표에서 이 값만큼 빼서 배치한다.
const HANDLE_HALF = 8;

type Side = "left" | "right";

type ResizeState = {
  pointerId: number;
  blockId: string;
  side: Side;
  startClientX: number;
  startWidth: number;
  // 드래그 시작 시점에 한 번만 측정한 상한(content 폭). 드래그 도중
  // 래퍼 rect를 다시 재지 않는다 — table-handles.tsx의 resizeState도 같은
  // 이유로 시작 시점 값만 고정해 쓴다(측정 비용, 드래그 중 레이아웃이 그
  // 사이 바뀌는 경우는 다루지 않는다).
  maxWidth: number;
  currentWidth: number;
};

// 상한(content 폭)이 하한(64px)보다 좁은 축퇴 상황(media가 좁은 표 셀
// 등에 들어간 경우)에서는 하한을 우선한다 — Math.max를 바깥에 둬 그 경우
// 결과가 항상 64 이상이 되게 한다(코드리뷰 발견: Math.min을 바깥에 두면
// 상한이 하한보다 좁을 때 64 미만 결과가 나와 spec §6.3 "최소 64px"를
// 조용히 어겼다).
const clampPreviewWidth = (width: number, maxWidth: number): number =>
  Math.max(MIN_MEDIA_PREVIEW_WIDTH, Math.min(maxWidth, Math.round(width)));

// blockId는 에디터가 만드는 임의 문자열이라 attribute selector에 직접
// 보간하면 따옴표·백슬래시에서 SyntaxError가 난다(find-by-attribute.ts 주석,
// table-handles.tsx 세 파일이 이미 겪은 문제) — findElementByAttribute로
// 우회한다. tagName을 "div"로 좁히는 것은 table-handles.tsx의 findTable이
// "table"로 좁히는 것과 같은 이유(전체 문서의 `[data-be-block-id]` 스캔
// 범위를 줄인다) — 4종 미디어 블록의 래퍼는 항상 div다
// (media-block-extension.ts).
const findMediaWrapper = (
  element: HTMLElement,
  blockId: string,
): HTMLElement | null =>
  findElementByAttribute(element, "div", "data-be-block-id", blockId);

// image/video만 previewWidth를 가지므로(media-block-extension.ts) 래퍼의
// 직접 자식 img/video 하나만 찾으면 된다(caption div는 별도 형제라 여기
// 걸리지 않는다).
const findMediaElement = (
  wrapper: HTMLElement,
): HTMLImageElement | HTMLVideoElement | null =>
  wrapper.querySelector<HTMLImageElement | HTMLVideoElement>(
    ":scope > img, :scope > video",
  );

const setMediaStyleWidth = (
  element: HTMLElement,
  blockId: string,
  width: number,
): void => {
  const wrapper = findMediaWrapper(element, blockId);
  const media = wrapper === null ? null : findMediaElement(wrapper);
  if (media !== null) media.style.width = `${width}px`;
};

/**
 * `MediaResizeHandles`가 이번 렌더에서 그릴 대상(현재 image/video 선택의
 * 렌더 rect와 드래그 시작 시 쓸 content 폭 상한). null이면 아무것도 그리지
 * 않는다 — image/video가 아니거나 url이 없는 선택, 선택 자체가 없는 경우를
 * 하나로 묶는다. 래퍼를 한 번만 찾는다(코드리뷰 발견: 이전 버전은
 * findMediaElement가 내부에서 한 번, 이 함수가 maxWidth용으로 또 한 번,
 * 같은 전체 문서 스캔을 매 렌더 두 번 했다).
 */
type RenderTarget = {
  blockId: string;
  mediaRect: DOMRect;
  maxWidth: number;
};

const resolveRenderTarget = (
  editor: ReturnType<typeof useEditor>,
  element: HTMLElement | null,
): RenderTarget | null => {
  if (element === null) return null;
  const media = editor.getSelectionMediaBlock();
  if (media === null || media.url === null) return null;
  if (media.kind !== "image" && media.kind !== "video") return null;
  const wrapper = findMediaWrapper(element, media.blockId);
  if (wrapper === null) return null;
  const mediaElement = findMediaElement(wrapper);
  if (mediaElement === null) return null;
  const mediaRect = mediaElement.getBoundingClientRect();
  const maxWidth = Math.round(wrapper.getBoundingClientRect().width);
  return { blockId: media.blockId, mediaRect, maxWidth };
};

/**
 * image/video이고 url이 있는 미디어 블록을 선택하면 좌우에 리사이즈 핸들
 * 2개를 그리는 overlay(spec §6.3 `MED-007`). `table-handles.tsx`의 열 너비
 * 조절과 같은 pointer-drag *패턴*(`usePointerDragGesture`+
 * `useMirroredState`+rAF 시각 갱신, 커밋은 pointer-up 1회)을 재사용하되
 * 신규 컴포넌트다(코드 재사용 아님, RD-001.md "포함 범위").
 *
 * "중심 고정 대칭 리사이즈"(spec §6.3)는 `_media-resize-handles.scss`가
 * image/video를 래퍼 안에서 `margin: 0 auto`로 가운데 정렬해 두는 것과
 * 짝을 이룬다 — 폭이 `dW`만큼 바뀌면 좌우 margin이 각각 `dW/2`씩 반대로
 * 움직여 대칭 성장이 CSS만으로 성립한다. 그 위에서 핸들이 커서를 1:1로
 * 따라가려면(`table-handles.tsx`의 열 리사이즈가 이미 지키는 기준) 폭
 * 변화량을 포인터 이동량의 **2배**로 잡아야 한다 — 아래 `handleResizeMove`의
 * `2 * signedDelta`가 그 계산이다(직접 유도, RD-001-DELTA-02.md "배경"에
 * 수치 예시로 남겨 뒀다).
 *
 * `MediaToolbar`처럼 selection 기반으로 스스로 열고 닫혀 `index.ts`가 개별
 * export하고 소비자(데모 앱)가 나란히 조립한다 — `TableHandles`(hover 기반,
 * `SlashMenu`가 상시 마운트)와는 다른 부류다. `MediaToolbar`와 selection
 * 추적 로직을 공유 훅으로 뽑지 않는다 — `file-panel.tsx`/`media-toolbar.tsx`
 * 사이의 기존 결정(RD-003-DELTA-03.md, "사용처 2곳뿐이라 훅 추출 이득이
 * 적다")과 같은 근거다.
 */
export const MediaResizeHandles = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [, setSelectionVersion] = useState(0);
  const [resizeState, resizeStateRef, updateResizeState] =
    useMirroredState<ResizeState | null>(null);
  const resizeAnimationFrameRef = useRef<number | null>(null);

  // 어느 블록이 선택돼 있는지는 이 컴포넌트 상태로 캐시하지 않는다 —
  // 렌더마다 resolveRenderTarget이 DOM에서 직접 다시 읽는다(table-handles.tsx의
  // geometry와 같은 이유: pointer-up 커밋 뒤 PM이 img/video DOM을 새로
  // 만들어도 다음 렌더가 항상 최신 노드를 다시 찾는다). 이 state는 그
  // "다음 렌더"를 강제로 트리거하는 용도만 갖는다.
  const bumpSelectionVersion = useCallback(() => {
    setSelectionVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const ownerDocument = element?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    ownerDocument?.addEventListener("selectionchange", bumpSelectionVersion);
    ownerDocument?.addEventListener("mouseup", bumpSelectionVersion);
    ownerDocument?.addEventListener("keyup", bumpSelectionVersion);
    ownerWindow?.addEventListener("scroll", bumpSelectionVersion, true);
    ownerWindow?.addEventListener("resize", bumpSelectionVersion);
    return () => {
      ownerDocument?.removeEventListener(
        "selectionchange",
        bumpSelectionVersion,
      );
      ownerDocument?.removeEventListener("mouseup", bumpSelectionVersion);
      ownerDocument?.removeEventListener("keyup", bumpSelectionVersion);
      ownerWindow?.removeEventListener("scroll", bumpSelectionVersion, true);
      ownerWindow?.removeEventListener("resize", bumpSelectionVersion);
    };
  }, [bumpSelectionVersion, element]);

  const resizeActive = resizeState !== null;

  // 스펙 §6.3 성능 계약(table-handles.tsx의 "스펙 13절"과 같은 원칙):
  // pointer-move 동안에는 프레임 단위로 실제 img/video의 style.width만
  // 갱신하고, 문서 커밋은 pointer-up에서 한 번만 한다.
  const scheduleResizeVisualUpdate = useCallback(() => {
    if (element === null) return;
    const view = element.ownerDocument.defaultView;
    if (resizeAnimationFrameRef.current !== null || view === null) return;
    resizeAnimationFrameRef.current = view.requestAnimationFrame(() => {
      resizeAnimationFrameRef.current = null;
      const current = resizeStateRef.current;
      if (current === null) return;
      setMediaStyleWidth(element, current.blockId, current.currentWidth);
      // current는 이미 resizeStateRef.current라 ref 재대입은 no-op이고
      // setState만 실질적으로 작동한다(핸들 위치 재계산을 위한 재렌더
      // 트리거) — table-handles.tsx의 scheduleResizeVisualUpdate와 동형.
      updateResizeState(current);
    });
  }, [element, resizeStateRef, updateResizeState]);

  const restoreResizeVisualWidth = useCallback(
    (state: ResizeState) => {
      if (element === null) return;
      setMediaStyleWidth(element, state.blockId, state.startWidth);
    },
    [element],
  );

  const handleResizeMove = useCallback(
    (event: PointerEvent) => {
      const current = resizeStateRef.current;
      if (current === null) return;
      const rawDelta = event.clientX - current.startClientX;
      // 오른쪽 핸들은 오른쪽으로 끌수록(rawDelta>0), 왼쪽 핸들은
      // 왼쪽으로 끌수록(rawDelta<0) 커진다 — 둘 다 "중심에서 멀어지는
      // 방향"을 양수로 정규화한다.
      const signedDelta = current.side === "right" ? rawDelta : -rawDelta;
      // 2배: 위 컴포넌트 주석 "중심 고정 대칭 리사이즈" 참고 — margin:auto
      // 대칭 때문에 실제 경계 이동량은 폭 변화량의 절반이라, 폭을
      // 포인터 이동량의 2배로 바꿔야 드래그 중인 경계가 커서를 그대로
      // 따라간다.
      const nextWidth = clampPreviewWidth(
        current.startWidth + 2 * signedDelta,
        current.maxWidth,
      );
      if (nextWidth === current.currentWidth) return;
      resizeStateRef.current = { ...current, currentWidth: nextWidth };
      scheduleResizeVisualUpdate();
    },
    [resizeStateRef, scheduleResizeVisualUpdate],
  );

  const handleResizeUp = useCallback(() => {
    const current = resizeStateRef.current;
    if (current === null) return;
    if (current.currentWidth !== current.startWidth) {
      const result = editor.commands.setMediaPreviewWidth(
        current.blockId,
        current.currentWidth,
      );
      // 커밋 실패(예: 드래그 도중 블록이 삭제·교체됨)는 모델을 바꾸지
      // 않는다 — 드래그 중 직접 mutate해 둔 인라인 style.width만 시작
      // 폭으로 되돌려 DOM이 실제로 반영되지 않은 폭에서 계속 어긋난 채
      // 남지 않게 한다(코드리뷰 발견).
      if (!result.ok) restoreResizeVisualWidth(current);
    }
    updateResizeState(null);
  }, [editor, resizeStateRef, restoreResizeVisualWidth, updateResizeState]);

  const handleResizeCancel = useCallback(() => {
    const current = resizeStateRef.current;
    if (current === null) return;
    restoreResizeVisualWidth(current);
    updateResizeState(null);
  }, [resizeStateRef, restoreResizeVisualWidth, updateResizeState]);

  const handleResizeEscape = useCallback((): null => {
    const current = resizeStateRef.current;
    if (current === null) return null;
    restoreResizeVisualWidth(current);
    updateResizeState(null);
    return null;
  }, [resizeStateRef, restoreResizeVisualWidth, updateResizeState]);

  usePointerDragGesture({
    active: resizeActive,
    element,
    pointerId: resizeState?.pointerId ?? null,
    onMove: handleResizeMove,
    onUp: handleResizeUp,
    onCancel: handleResizeCancel,
    onEscape: handleResizeEscape,
  });

  // 리사이즈가 끝나거나(커밋/취소/Escape) 언마운트되면 예약된 rAF를 반드시
  // 취소한다 — table-handles.tsx와 같은 이유(취소하지 않으면 이미 끝난
  // 제스처의 낡은 currentWidth로 style.width를 나중에 되돌려 쓴다).
  useEffect(() => {
    return () => {
      const frame = resizeAnimationFrameRef.current;
      if (frame === null || element === null) return;
      resizeAnimationFrameRef.current = null;
      element.ownerDocument.defaultView?.cancelAnimationFrame(frame);
    };
  }, [resizeActive, element]);

  const handlePointerDownOnHandle = (
    event: React.PointerEvent<HTMLDivElement>,
    side: Side,
    blockId: string,
    startWidth: number,
    maxWidth: number,
  ) => {
    if (event.button !== 0) return;
    // pointerdown을 취소하면 호환 mousedown도 취소된다 — table-handles.tsx의
    // resize strip과 같은 이유(막지 않으면 드래그가 네이티브 텍스트 선택을
    // 함께 끌고 다닌다).
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateResizeState({
      pointerId: event.pointerId,
      blockId,
      side,
      startClientX: event.clientX,
      startWidth,
      maxWidth,
      currentWidth: startWidth,
    });
  };

  const target = resolveRenderTarget(editor, element);
  if (target === null) return null;

  const { blockId, mediaRect, maxWidth } = target;
  const startWidth = Math.round(mediaRect.width);
  const handleTop = mediaRect.top + mediaRect.height / 2 - HANDLE_HALF;

  return (
    <>
      <div
        className="geul-media-resize-handle"
        data-be-media-resize-handle="left"
        onPointerDown={(event) =>
          handlePointerDownOnHandle(
            event,
            "left",
            blockId,
            startWidth,
            maxWidth,
          )
        }
        style={{
          position: "fixed",
          left: mediaRect.left - HANDLE_HALF,
          top: handleTop,
        }}
      />
      <div
        className="geul-media-resize-handle"
        data-be-media-resize-handle="right"
        onPointerDown={(event) =>
          handlePointerDownOnHandle(
            event,
            "right",
            blockId,
            startWidth,
            maxWidth,
          )
        }
        style={{
          position: "fixed",
          left: mediaRect.right - HANDLE_HALF,
          top: handleTop,
        }}
      />
    </>
  );
};
