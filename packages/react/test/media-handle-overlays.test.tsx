// @vitest-environment jsdom

/**
 * MediaHandleOverlays 컴포넌트(Issue #187 RD-001 DELTA-01): 들여쓴
 * image/video/audio/file 블록에서 그립·plus 버튼이 실측 위치(readPageRect)에
 * 뜨고, 그립 클릭 시 기존 BlockSideMenuMenu를 blockId로 열며, 그립 드래그로
 * 단일 블록을 재정렬하고, plus 클릭 시 새 문단을 추가함을 검증한다.
 *
 * block-side-menu.test.tsx의 관례(실제 createEditor() 마운트, 명령이 진짜라
 * 호출 스파이 대신 문서 결과를 단언)를 그대로 따른다. `<MediaHandleOverlays />`는
 * index.ts에 공개 export하지 않는다(TableHandles와 같은 이유 — SlashMenu가
 * 자동 마운트할 대상이라 소비자가 중복 마운트하면 오버레이가 두 벌 겹친다,
 * DELTA-02) — 이 테스트도 `../src/media-handle-overlays.js`에서 직접
 * import한다. `slash-menu.tsx` 마운트·공용 gutter의 media 제외는 DELTA-02,
 * e2e는 DELTA-03(RD-001-DELTA-01.md).
 */

import { DEFAULT_DICTIONARY } from "@cp949/geul-core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findMediaVisualElement,
  MediaHandleOverlays,
} from "../src/media-handle-overlays.js";
import {
  mountBlockEditor,
  type MountBlockEditorOptions,
} from "./mount-editor.js";

// jsdom은 setPointerCapture를 구현하지 않는다(block-side-menu.test.tsx와
// 같은 이유) — 그립 pointerdown이 실제로 이를 호출한다.
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}

afterEach(cleanup);

const dragHandleLabel = DEFAULT_DICTIONARY.handle.dragBlock;
const addBlockLabel = DEFAULT_DICTIONARY.handle.addBlock;
const overlaySelector = ".geul-media-handle-overlay";

const renderMediaOverlays = (
  options: Omit<MountBlockEditorOptions, "children">,
  onBlockAdded = vi.fn(),
) => ({
  ...mountBlockEditor({
    ...options,
    children: <MediaHandleOverlays onBlockAdded={onBlockAdded} />,
  }),
  onBlockAdded,
});

describe("hover 시 그립·plus 위치 — readPageRect 실측(완료 조건 1, Issue #187 배경)", () => {
  it.each([
    { left: 0, top: 0 },
    // 들여쓰기로 밀린 상태를 흉내낸다 — 고정 오프셋이면 이 케이스에서도
    // 앞과 같은 좌표가 나와야 하는데, 실측 rect를 따르면 달라져야 한다.
    { left: 124, top: 200 },
  ])(
    "media rect(left=$left, top=$top)에 맞춰 오버레이가 그 자리에 뜬다",
    ({ left, top }) => {
      const rendered = renderMediaOverlays({
        initialBlocks: [
          { id: "image-1", type: "image", url: "https://example.com/x.png" },
        ],
        layout: { left, top, width: 600, height: 20 },
      });
      const [media] = rendered.blocks;
      if (media === undefined) throw new Error("media 요소가 없다");

      fireEvent.pointerMove(media);

      const overlay = document.querySelector<HTMLElement>(overlaySelector);
      expect(overlay).not.toBeNull();
      // readPageRect는 getBoundingClientRect() + scrollX/scrollY다 —
      // jsdom scrollX/scrollY는 0이라 stub한 rect 값과 그대로 같다.
      expect(overlay?.style.top).toBe(`${top}px`);
      // left는 media rect 왼쪽에서 고정 오프셋만큼 뺀 값이다 — 정확한
      // 오프셋 상수는 구현이 정하고, 여기서는 "media rect가 달라지면
      // 오버레이 위치도 그만큼 달라진다"만 고정값 대신 상대 비교로 본다.
    },
  );

  it("두 rect의 left 차이만큼 오버레이 left 차이도 그대로 반영된다(고정 오프셋이 아니라는 근거, 검출 변이: 상수 오프셋으로 바꾸면 이 assertion이 깨진다)", () => {
    const first = renderMediaOverlays({
      initialBlocks: [
        { id: "image-1", type: "image", url: "https://example.com/x.png" },
      ],
      layout: { left: 0, top: 0, width: 600, height: 20 },
    });
    fireEvent.pointerMove(first.blocks[0] as HTMLElement);
    const firstLeft =
      document.querySelector<HTMLElement>(overlaySelector)?.style.left;
    cleanup();

    const second = renderMediaOverlays({
      initialBlocks: [
        { id: "image-2", type: "image", url: "https://example.com/x.png" },
      ],
      layout: { left: 124, top: 0, width: 600, height: 20 },
    });
    fireEvent.pointerMove(second.blocks[0] as HTMLElement);
    const secondLeft =
      document.querySelector<HTMLElement>(overlaySelector)?.style.left;

    if (firstLeft === undefined || secondLeft === undefined) {
      throw new Error("오버레이 left를 읽지 못했다");
    }
    expect(parseFloat(secondLeft) - parseFloat(firstLeft)).toBeCloseTo(124);
  });
});

// roadmap Issue #212 RD-004 DELTA-01 — iframe(media 5번째 kind)도 그립·plus
// 오버레이 대상이다(spec §5). 이 파일의 wrapper/visual rect는 항상 같은 값으로
// 스텁되므로(mount-editor.tsx restubGeometry 주석 참고) 좌표 비교로는
// "wrapper 폴백"과 "iframe 발견"을 구분할 수 없다 — findMediaVisualElement를
// 직접 단위 테스트해 셀렉터 자체를 고정하고, 통합 테스트는 image와 동일한
// hover→오버레이 패리티만 확인한다.
describe("iframe 지원(roadmap Issue #212 RD-004 DELTA-01)", () => {
  it("findMediaVisualElement가 wrapper의 직접 자식 iframe을 찾는다", () => {
    const wrapper = document.createElement("div");
    const iframe = document.createElement("iframe");
    wrapper.append(iframe);

    expect(findMediaVisualElement(wrapper)).toBe(iframe);
  });

  // top=0이면 findMediaVisualElement가 iframe을 못 찾아 wrapper로 폴백해도
  // (스텁된 wrapper rect) 우연히 같은 값이 나와 이 회귀를 못 잡는다 — 0이
  // 아닌 좌표를 써서 "실제 iframe 요소(mount-editor.tsx가 스텁)를 찾았는지"와
  // "wrapper로 조용히 폴백했는지(그러면 iframe 자체는 jsdom 기본 rect 0이라
  // top이 어긋난다)"를 구분한다.
  it("iframe 블록도 image와 동일하게 hover 시 오버레이가 media rect에 뜬다", () => {
    renderMediaOverlays({
      initialBlocks: [
        { id: "iframe-1", type: "iframe", url: "https://example.com/embed" },
      ],
      layout: { left: 124, top: 200, width: 600, height: 20 },
    });

    const [media] = screen
      .getByRole("textbox", { name: "Editor" })
      .querySelectorAll<HTMLElement>("[data-geul-block-id]");
    if (media === undefined) throw new Error("media 요소가 없다");
    fireEvent.pointerMove(media);

    const overlay = document.querySelector<HTMLElement>(overlaySelector);
    expect(overlay).not.toBeNull();
    expect(overlay?.style.top).toBe("200px");
  });
});

describe("hover 히스테리시스(완료 조건 3)", () => {
  it("포인터가 media와 여백 밖으로 완전히 나가면 오버레이가 사라진다", () => {
    const rendered = renderMediaOverlays({
      initialBlocks: [
        { id: "image-1", type: "image", url: "https://example.com/x.png" },
      ],
    });
    const [media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");

    fireEvent.pointerMove(media);
    expect(document.querySelector(overlaySelector)).not.toBeNull();

    fireEvent.pointerMove(document.body, { clientX: -1000, clientY: -1000 });
    expect(document.querySelector(overlaySelector)).toBeNull();
  });
});

describe("plus 버튼(완료 조건 4)", () => {
  it("클릭 시 뒤에 새 문단을 추가하고 onBlockAdded를 그 blockId로 호출한다", () => {
    const rendered = renderMediaOverlays({
      initialBlocks: [
        { id: "image-1", type: "image", url: "https://example.com/x.png" },
        // TrailingBlockExtension이 atom 블록으로 끝난 문서에 로드 시점 빈
        // paragraph를 자동 동반한다(media-block-extension.test.ts와 같은
        // 함정) — 그 자동 삽입이 "id-1"을 먼저 소비해버리지 않도록 명시
        // 문단으로 닫는다.
        { id: "tail-1", type: "paragraph", content: [] },
      ],
    });
    const [media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");

    fireEvent.pointerMove(media);
    const addButton = screen.getByRole("button", { name: addBlockLabel });
    fireEvent.click(addButton);

    const blocks = rendered.editor.getDocument().blocks;
    expect(blocks.map((block) => block.id)).toEqual([
      "image-1",
      "id-1",
      "tail-1",
    ]);
    expect(rendered.onBlockAdded).toHaveBeenCalledWith("id-1");
  });
});

describe("그립 클릭(완료 조건 2·5)", () => {
  it("기존 BlockSideMenuMenu를 해당 blockId로 열고, Indent 클릭이 실제로 앞 문단의 자식으로 옮긴다", () => {
    const rendered = renderMediaOverlays({
      initialBlocks: [
        { id: "para-1", type: "paragraph", content: [{ text: "본문" }] },
        { id: "image-1", type: "image", url: "https://example.com/x.png" },
        // TrailingBlockExtension 함정(위 plus 버튼 테스트와 같은 이유) —
        // 명시 문단으로 닫는다.
        { id: "tail-1", type: "paragraph", content: [] },
      ],
    });
    const [, media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");

    fireEvent.pointerMove(media);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    // fireEvent.click의 기본 detail은 0이라(포인터 클릭 아님) 재오픈
    // 억제 가드를 타지 않는다 — block-side-menu.test.tsx의 openBlockMenu와
    // 같은 근거.
    fireEvent.click(handle);

    expect(document.querySelector("[data-geul-block-menu]")).not.toBeNull();
    const indentItem = screen.getByText(DEFAULT_DICTIONARY.menu.indent);
    fireEvent.click(indentItem);

    const blocks = rendered.editor.getDocument().blocks;
    expect(blocks.map((block) => block.id)).toEqual(["para-1", "tail-1"]);
    expect(
      "children" in (blocks[0] ?? {})
        ? (blocks[0] as { children?: { id: string }[] }).children?.map(
            (child) => child.id,
          )
        : null,
    ).toEqual(["image-1"]);
  });
});

// roadmap Issue #212 RD-004 DELTA-03 — iframe 전용 Interact 토글. 모델/커맨드에
// 없는 순수 UI 상태라 DOM 속성(`data-geul-iframe-interactive`)과 `aria-pressed`만
// 단언한다(spec §5 142행).
describe("Interact 토글(RD-004 DELTA-03)", () => {
  const interactButtonLabel = DEFAULT_DICTIONARY.handle.interactWithIframe;

  it("Interact 버튼은 iframe 블록에서만 보이고 image 블록에서는 보이지 않는다", () => {
    renderMediaOverlays({
      initialBlocks: [
        { id: "image-1", type: "image", url: "https://example.com/x.png" },
      ],
    });
    const [media] = screen
      .getByRole("textbox", { name: "Editor" })
      .querySelectorAll<HTMLElement>("[data-geul-block-id]");
    if (media === undefined) throw new Error("media 요소가 없다");
    fireEvent.pointerMove(media);

    expect(
      screen.queryByRole("button", { name: interactButtonLabel }),
    ).toBeNull();
  });

  it("Interact 클릭 시 iframe에 상호작용 속성이 세팅되고 버튼이 aria-pressed=true가 된다", () => {
    renderMediaOverlays({
      initialBlocks: [
        { id: "iframe-1", type: "iframe", url: "https://example.com/embed" },
      ],
    });
    const [media] = screen
      .getByRole("textbox", { name: "Editor" })
      .querySelectorAll<HTMLElement>("[data-geul-block-id]");
    if (media === undefined) throw new Error("media 요소가 없다");
    fireEvent.pointerMove(media);

    const interactButton = screen.getByRole("button", {
      name: interactButtonLabel,
    });
    expect(interactButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(interactButton);

    const iframe = media.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("data-geul-iframe-interactive")).toBe("true");
    expect(interactButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("같은 버튼을 다시 클릭하면 해제된다", () => {
    renderMediaOverlays({
      initialBlocks: [
        { id: "iframe-1", type: "iframe", url: "https://example.com/embed" },
      ],
    });
    const [media] = screen
      .getByRole("textbox", { name: "Editor" })
      .querySelectorAll<HTMLElement>("[data-geul-block-id]");
    if (media === undefined) throw new Error("media 요소가 없다");
    fireEvent.pointerMove(media);

    const interactButton = screen.getByRole("button", {
      name: interactButtonLabel,
    });
    fireEvent.click(interactButton);
    fireEvent.click(interactButton);

    const iframe = media.querySelector("iframe");
    expect(iframe?.getAttribute("data-geul-iframe-interactive")).toBeNull();
    expect(interactButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("문서의 다른 곳을 클릭하면(중간 요소가 bubble에서 stopPropagation을 호출해도) 자동으로 해제된다 — 검출 변이: capture 대신 bubble로 등록하면 이 테스트가 RED", () => {
    renderMediaOverlays({
      initialBlocks: [
        { id: "iframe-1", type: "iframe", url: "https://example.com/embed" },
      ],
    });
    const [media] = screen
      .getByRole("textbox", { name: "Editor" })
      .querySelectorAll<HTMLElement>("[data-geul-block-id]");
    if (media === undefined) throw new Error("media 요소가 없다");
    fireEvent.pointerMove(media);

    const interactButton = screen.getByRole("button", {
      name: interactButtonLabel,
    });
    fireEvent.click(interactButton);

    // 클릭 대상과 document 사이에 bubble-phase stopPropagation을 거는
    // 중간 요소를 둔다 — 해제 리스너가 capture-phase가 아니라면 이
    // stopPropagation에 막혀 document까지 도달하지 못한다.
    const middle = document.createElement("div");
    const target = document.createElement("button");
    middle.append(target);
    document.body.append(middle);
    middle.addEventListener("click", (event) => event.stopPropagation());

    fireEvent.click(target);

    const iframe = media.querySelector("iframe");
    expect(iframe?.getAttribute("data-geul-iframe-interactive")).toBeNull();
    expect(interactButton.getAttribute("aria-pressed")).toBe("false");

    middle.remove();
  });

  it("해제 후 다시 클릭하면 다시 켤 수 있다(리스너가 활성화마다 새로 걸린다)", () => {
    renderMediaOverlays({
      initialBlocks: [
        { id: "iframe-1", type: "iframe", url: "https://example.com/embed" },
      ],
    });
    const [media] = screen
      .getByRole("textbox", { name: "Editor" })
      .querySelectorAll<HTMLElement>("[data-geul-block-id]");
    if (media === undefined) throw new Error("media 요소가 없다");
    fireEvent.pointerMove(media);

    const interactButton = screen.getByRole("button", {
      name: interactButtonLabel,
    });
    fireEvent.click(interactButton);
    fireEvent.click(document.body);
    expect(
      media
        .querySelector("iframe")
        ?.getAttribute("data-geul-iframe-interactive"),
    ).toBeNull();

    fireEvent.click(interactButton);
    fireEvent.click(document.body);
    expect(
      media
        .querySelector("iframe")
        ?.getAttribute("data-geul-iframe-interactive"),
    ).toBeNull();
  });
});

describe("그립 드래그 재정렬(완료 조건 6, 그릴링 결정 — 클릭+드래그 모두 이식)", () => {
  it("아래로 드래그하면 media 블록이 뒤 형제 뒤로 재정렬된다", () => {
    const rendered = renderMediaOverlays({
      initialBlocks: [
        { id: "image-1", type: "image", url: "https://example.com/x.png" },
        { id: "para-1", type: "paragraph", content: [{ text: "본문" }] },
      ],
    });
    const [media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");

    fireEvent.pointerMove(media);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // para-1(top 20~40)의 하반부를 지나 문서 끝으로 겨냥한다 —
    // computeDragGuide가 no-op이 아닌 targetIndex=-1(끝)로 판정하는
    // 지점이다(block-side-menu-geometry.ts, block-side-menu.test.tsx의
    // 동형 케이스와 같은 근거).
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 35 });
    expect(
      document.querySelector("[data-geul-block-insertion-guide]"),
    ).not.toBeNull();
    fireEvent.pointerUp(handle, { pointerId: 1 });

    // moveBlockBefore(sourceBlockId, null)로 문서 끝에 놓이면, 그 결과
    // 문서가 atom 블록(image-1)으로 끝나 TrailingBlockExtension이 트랜잭션
    // 직후 빈 문단을 자동 동반한다(위 plus 버튼 테스트와 같은 함정 —
    // 여기서는 로드 시점이 아니라 이동 결과가 트리거한다).
    expect(
      rendered.editor.getDocument().blocks.map((block) => block.id),
    ).toEqual(["para-1", "image-1", "id-1"]);
  });

  it("검출 변이: 드래그 지오메트리가 no-op으로만 판정되면(예: 항상 같은 자리) moveBlockBefore가 호출되지 않아 순서가 그대로다 — 실제로는 바뀐다", () => {
    const rendered = renderMediaOverlays({
      initialBlocks: [
        { id: "image-1", type: "image", url: "https://example.com/x.png" },
        { id: "para-1", type: "paragraph", content: [{ text: "본문" }] },
      ],
    });
    const [media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");
    const before = rendered.editor
      .getDocument()
      .blocks.map((block) => block.id);

    fireEvent.pointerMove(media);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // 4px 미만 이동은 클릭으로 해석돼 재정렬을 시작하지 않는다
    // (block-side-menu.test.tsx "hasDragged 임계값" 케이스와 같은 근거).
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 2 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(
      rendered.editor.getDocument().blocks.map((block) => block.id),
    ).toEqual(before);
  });
});
