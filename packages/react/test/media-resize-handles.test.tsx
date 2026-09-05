// @vitest-environment jsdom

/**
 * MediaResizeHandles 컴포넌트: image/video이고 url이 있는 미디어 블록을
 * 선택했을 때만 좌우 리사이즈 핸들 2개가 나타남(kind·url 가드), 핸들을
 * 드래그하면 포인터 이동량의 2배로 폭이 바뀌어 반대쪽 경계도 대칭으로
 * 움직임(spec §6.3 중심 고정 대칭 — CSS `margin:0 auto` 정렬 아래에서
 * 경계 이동량이 폭 변화량의 절반이라, 커서를 1:1로 따라가려면 폭을 2배로
 * 바꿔야 한다), 64px~content 폭(래퍼 rect) clamp, pointer-up 1회 커밋과
 * 변화 없을 때 커밋 생략, Escape·pointercancel·커밋 실패 시 드래그 시작
 * 시점의 원본 인라인 스타일(previewWidth 미설정이면 빈 문자열, 설정돼
 * 있었으면 그 값)로 복원하고 명령 미호출, 선택 해제 시 즉시 사라짐을
 * 검증한다.
 *
 * `media-toolbar.test.tsx`의 fake 컨트롤러 관례(NodeSelection을 jsdom에서
 * 직접 재현하지 않고 getSelectionMediaBlock 반환값으로 대체)와
 * `table-handles.test.tsx`의 pointer-drag 관례(fireEvent.pointer*,
 * document.querySelector로 핸들 조회, rAF await로 시각 갱신 확인)를 함께
 * 쓴다.
 */

import type { MediaBlockKind } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, MediaResizeHandles } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { stubRect } from "./mount-editor.js";
import { queryMountedEditable } from "./query-mounted-editable.js";

// table-handles.test.tsx와 같은 이유(@testing-library/react가 전역 afterEach/
// teardown이 함수일 때만 자동 cleanup을 등록하는데, 저장소 vitest.config.ts는
// globals: true가 아니라 자동 등록이 없다).
afterEach(cleanup);

if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}

type SelectionMediaBlock = {
  blockId: string;
  kind: MediaBlockKind;
  url: string | null;
  name: string | null;
  caption: string | null;
};

const filledImageSelection: SelectionMediaBlock = {
  blockId: "media-1",
  kind: "image",
  url: "https://example.com/photo.png",
  name: "photo.png",
  caption: null,
};

// media rect(200x100, left=100/top=50)와 wrapper rect(폭 400, content 폭
// 역할)를 고정값으로 둔다 — 아래 모든 드래그 산술 기대값이 이 두 값에서
// 유도된다(시작폭 200, 중심 y=100, 상한 400).
const MEDIA_RECT = { left: 100, top: 50, width: 200, height: 100 };
const WRAPPER_WIDTH = 400;

type FakeControllerOptions = {
  getSelectionMediaBlock?: () => SelectionMediaBlock | null;
  setMediaPreviewWidth?: (blockId: string, width: number) => { ok: boolean };
  mediaTag?: "img" | "video";
  wrapperWidth?: number;
};

/**
 * MediaResizeHandles가 읽는 최소 표면(getSelectionMediaBlock,
 * commands.setMediaPreviewWidth)만 채운 fake 컨트롤러를 만든다. `mount`는
 * `media-toolbar.test.tsx`처럼 실제 NodeSelection 없이 `data-be-block-id`
 * 래퍼 div와 그 자식 미디어 엘리먼트만 손으로 조립한다 — jsdom은
 * 클릭→NodeSelection 변환을 지원하지 않아 이 컴포넌트가 실제로 읽는
 * `getSelectionMediaBlock()` 반환값을 직접 제어하는 편이 선택 메커니즘
 * 자체(core 몫, editor-controller-selection.test.ts가 이미 검증)를
 * 재현하지 않고도 UI 반응만 정확히 검증한다.
 */
const fakeController = ({
  getSelectionMediaBlock = () => null,
  setMediaPreviewWidth = () => ({ ok: true }),
  mediaTag = "img",
  wrapperWidth = WRAPPER_WIDTH,
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-be-block-id", "media-1");
    const media = document.createElement(mediaTag);
    wrapper.append(media);
    editable.append(wrapper);
    element.append(editable);
    stubRect(wrapper, { left: 0, top: 0, width: wrapperWidth, height: 200 });
    stubRect(media, MEDIA_RECT);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getSelectionMediaBlock: vi.fn(getSelectionMediaBlock),
  commands: {
    setMediaPreviewWidth: vi.fn(setMediaPreviewWidth),
  },
});

const renderHandles = (controller: ReturnType<typeof fakeController>) =>
  render(
    withProvider(
      controller,
      <>
        <MediaResizeHandles />
        <EditorContent />
      </>,
    ),
  );

const getEditable = () => {
  const host = screen.getByRole("textbox", { name: "Editor" });
  return queryMountedEditable(host);
};

const getHandle = (side: "left" | "right"): HTMLElement => {
  const handle = document.querySelector<HTMLElement>(
    `[data-be-media-resize-handle="${side}"]`,
  );
  if (handle === null) throw new Error(`${side} 리사이즈 핸들 없음`);
  return handle;
};

const getMediaElement = (): HTMLElement => {
  const media = document.querySelector<HTMLElement>(
    '[data-be-block-id="media-1"] > img, [data-be-block-id="media-1"] > video',
  );
  if (media === null) throw new Error("미디어 엘리먼트 없음");
  return media;
};

/** 다음 requestAnimationFrame이 실행될 때까지 기다린다(rAF 기반 시각 갱신 확인용, table-handles.test.tsx와 동일 관용구). */
const awaitAnimationFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

describe("선택 상태에 따른 핸들 노출", () => {
  it("선택된 미디어 블록이 없으면 핸들을 렌더링하지 않는다", () => {
    renderHandles(fakeController());

    expect(document.querySelector("[data-be-media-resize-handle]")).toBeNull();
  });

  it("audio를 선택하면 핸들을 렌더링하지 않는다(image/video 전용)", () => {
    renderHandles(
      fakeController({
        getSelectionMediaBlock: () => ({
          ...filledImageSelection,
          kind: "audio",
        }),
      }),
    );

    expect(document.querySelector("[data-be-media-resize-handle]")).toBeNull();
  });

  it("url 없는 image를 선택하면 핸들을 렌더링하지 않는다(그릴 미디어가 없음)", () => {
    renderHandles(
      fakeController({
        getSelectionMediaBlock: () => ({ ...filledImageSelection, url: null }),
      }),
    );

    expect(document.querySelector("[data-be-media-resize-handle]")).toBeNull();
  });

  it("url 있는 image를 선택하면 좌우 핸들 2개를 미디어 경계에 렌더링한다", () => {
    renderHandles(
      fakeController({ getSelectionMediaBlock: () => filledImageSelection }),
    );

    const left = getHandle("left");
    const right = getHandle("right");
    // HANDLE_HALF=8 기준: left는 mediaRect.left(100), right는 .right(300)에
    // 중심을 맞추고, top은 세로 중앙(50 + 100/2 = 100)에 맞춘다.
    expect(left.style.left).toBe("92px");
    expect(left.style.top).toBe("92px");
    expect(right.style.left).toBe("292px");
    expect(right.style.top).toBe("92px");
  });

  it("url 있는 video를 선택해도 핸들을 렌더링한다", () => {
    renderHandles(
      fakeController({
        getSelectionMediaBlock: () => ({
          ...filledImageSelection,
          kind: "video",
        }),
        mediaTag: "video",
      }),
    );

    expect(getHandle("left")).not.toBeNull();
    expect(getHandle("right")).not.toBeNull();
  });

  it("selectionchange로 선택이 풀리면 핸들이 즉시 사라진다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageSelection,
    });
    renderHandles(controller);
    expect(getHandle("right")).not.toBeNull();

    controller.getSelectionMediaBlock.mockReturnValue(null);
    fireEvent(document, new Event("selectionchange"));

    expect(document.querySelector("[data-be-media-resize-handle]")).toBeNull();
  });
});

describe("핸들 드래그로 폭을 조절한다", () => {
  it("오른쪽 핸들을 오른쪽으로 20px 끌면 폭이 40px(2배) 늘고, pointer-up에 새 폭으로 1회 커밋한다", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageSelection,
    });
    renderHandles(controller);
    const editable = getEditable();
    const media = getMediaElement();

    fireEvent.pointerDown(getHandle("right"), { pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 320 });
    await awaitAnimationFrame();
    expect(media.style.width).toBe("240px");
    // 드래그 중에는 아직 커밋하지 않는다 — pointermove마다 커밋하면 여기서
    // 이미 호출된다.
    expect(controller.commands.setMediaPreviewWidth).not.toHaveBeenCalled();

    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(controller.commands.setMediaPreviewWidth).toHaveBeenCalledTimes(1);
    expect(controller.commands.setMediaPreviewWidth).toHaveBeenCalledWith(
      "media-1",
      240,
    );
  });

  it("왼쪽 핸들은 방향이 반대다 — 왼쪽으로 20px 끌면 폭이 40px 늘어난다", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageSelection,
    });
    renderHandles(controller);
    const editable = getEditable();
    const media = getMediaElement();

    fireEvent.pointerDown(getHandle("left"), { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 80 });
    await awaitAnimationFrame();
    expect(media.style.width).toBe("240px");

    fireEvent.pointerUp(editable, { pointerId: 1 });
    expect(controller.commands.setMediaPreviewWidth).toHaveBeenCalledWith(
      "media-1",
      240,
    );
  });

  it("64px 미만으로 줄어들지 않는다", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageSelection,
    });
    renderHandles(controller);
    const editable = getEditable();
    const media = getMediaElement();

    fireEvent.pointerDown(getHandle("right"), { pointerId: 1, clientX: 300 });
    // 왼쪽으로 한참 끈다 — clamp 없으면 200 - 2*10000 = 음수가 된다.
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: -9700 });
    await awaitAnimationFrame();
    expect(media.style.width).toBe("64px");

    fireEvent.pointerUp(editable, { pointerId: 1 });
    expect(controller.commands.setMediaPreviewWidth).toHaveBeenCalledWith(
      "media-1",
      64,
    );
  });

  it("드래그 시작 시점의 래퍼 rect 폭(content 폭)을 넘지 않는다", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageSelection,
    });
    renderHandles(controller);
    const editable = getEditable();
    const media = getMediaElement();

    fireEvent.pointerDown(getHandle("right"), { pointerId: 1, clientX: 300 });
    // 오른쪽으로 한참 끈다 — clamp 없으면 400(WRAPPER_WIDTH)을 넘는다.
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 10300 });
    await awaitAnimationFrame();
    expect(media.style.width).toBe(`${WRAPPER_WIDTH}px`);

    fireEvent.pointerUp(editable, { pointerId: 1 });
    expect(controller.commands.setMediaPreviewWidth).toHaveBeenCalledWith(
      "media-1",
      WRAPPER_WIDTH,
    );
  });

  it("드래그 없이(순변화 0) pointer-up하면 명령을 호출하지 않는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageSelection,
    });
    renderHandles(controller);
    const editable = getEditable();

    fireEvent.pointerDown(getHandle("right"), { pointerId: 1, clientX: 300 });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(controller.commands.setMediaPreviewWidth).not.toHaveBeenCalled();
  });

  it("Escape로 취소하면 명령을 호출하지 않고 원본 인라인 스타일로 복원한다", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageSelection,
    });
    renderHandles(controller);
    const editable = getEditable();
    const media = getMediaElement();

    fireEvent.pointerDown(getHandle("right"), { pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 320 });
    await awaitAnimationFrame();
    // 전제: 취소 전에 시각 폭이 실제로 벌어져 있었다 — 이 단언이 없으면
    // 시각 갱신이 아예 안 돌아도 "복원했다"로 통과한다.
    expect(media.style.width).toBe("240px");

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    // fakeController가 만드는 media 엘리먼트는 드래그 전 인라인 width가
    // 전혀 없다(previewWidth 미설정, fluid) — "시작 폭(rect 기준
    // 200px)"으로 되돌리면 없던 인라인 width가 새로 생겨 취소 이후에도
    // 고정폭으로 굳는다(코드리뷰 발견). 원본 그대로(빈 문자열)로
    // 복원해야 한다.
    expect(media.style.width).toBe("");
    expect(controller.commands.setMediaPreviewWidth).not.toHaveBeenCalled();
  });

  it("이미 previewWidth가 설정돼 있었으면 취소 시 그 원본 값으로 복원한다(시작 rect 폭이 아니다)", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageSelection,
    });
    renderHandles(controller);
    const editable = getEditable();
    const media = getMediaElement();
    // media-block-extension.ts의 previewWidthStyleAttrs가 실제로 내는
    // 인라인 스타일과 같은 모양 — previewWidth가 이미 180으로 설정된
    // 상태를 흉내낸다. MEDIA_RECT(width 200)는 jsdom rect 스텁이라 이
    // 인라인 값과 무관하게 고정돼 있다 — 즉 startWidth(200, clamp 계산용)와
    // 복원 대상(180, 원본 인라인 값)이 서로 다른 값임을 이 테스트가 보장한다.
    media.style.width = "180px";

    fireEvent.pointerDown(getHandle("right"), { pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 320 });
    await awaitAnimationFrame();
    expect(media.style.width).toBe("240px");

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(media.style.width).toBe("180px");
    expect(controller.commands.setMediaPreviewWidth).not.toHaveBeenCalled();
  });

  it("pointercancel도 명령을 호출하지 않고 원본 인라인 스타일(빈 문자열)로 복원한다", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageSelection,
    });
    renderHandles(controller);
    const editable = getEditable();
    const media = getMediaElement();

    fireEvent.pointerDown(getHandle("right"), { pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 320 });
    await awaitAnimationFrame();
    expect(media.style.width).toBe("240px");

    fireEvent.pointerCancel(editable, { pointerId: 1 });

    expect(media.style.width).toBe("");
    expect(controller.commands.setMediaPreviewWidth).not.toHaveBeenCalled();
  });

  it("래퍼 content 폭이 64px보다 좁으면 최소 64px를 상한보다 우선한다", async () => {
    // 좁은 표 셀 등에 들어간 media처럼 content 폭(40) 자체가 spec 최소
    // 64px보다 좁은 축퇴 상황이다 — clampPreviewWidth가 상한을 바깥에 두면
    // (Math.min(40, ...)) 64 미만 결과가 나와 "최소 64px"를 조용히 어긴다.
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageSelection,
      wrapperWidth: 40,
    });
    renderHandles(controller);
    const editable = getEditable();
    const media = getMediaElement();

    // 오른쪽으로 끌어도(성장 방향) 결과는 상한(40)이 아니라 하한(64)이다.
    fireEvent.pointerDown(getHandle("right"), { pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 320 });
    await awaitAnimationFrame();
    expect(media.style.width).toBe("64px");

    fireEvent.pointerUp(editable, { pointerId: 1 });
    expect(controller.commands.setMediaPreviewWidth).toHaveBeenCalledWith(
      "media-1",
      64,
    );
  });

  it("커밋이 실패하면(예: 드래그 중 블록 삭제) 원래 폭으로 되돌린다", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageSelection,
      setMediaPreviewWidth: () => ({ ok: false }),
    });
    renderHandles(controller);
    const editable = getEditable();
    const media = getMediaElement();

    fireEvent.pointerDown(getHandle("right"), { pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 320 });
    await awaitAnimationFrame();
    expect(media.style.width).toBe("240px");

    fireEvent.pointerUp(editable, { pointerId: 1 });

    // 드래그 중 mutate해 둔 인라인 style이 커밋 실패 후에도 240px로 남으면
    // 모델(변경 없음)과 DOM이 어긋난다 — 원본 인라인 값(여기선 없었으므로
    // 빈 문자열)으로 되돌려야 한다.
    expect(media.style.width).toBe("");
  });
});
