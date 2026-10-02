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
 *
 * 추가 주제(Issue #233, RD-002 DELTA-02): 메뉴가 useDismissibleOverlay를 거친다.
 * - 핸들 keydown(Enter·Space)으로 연 메뉴의 첫 항목 초점과 신호 소비.
 * - 키보드로 연 메뉴에서 다른 media 핸들을 다시 열 때의 재초점과 대상 전환 재마운트.
 * - 대상 블록 삭제 시 닫힘(internal·external), 열자마자의 삭제, 닫힐 때 초점 규칙.
 * - Escape(편집기가 먼저 막은 키 포함)·바깥 클릭·핸들 재클릭·항목 클릭 닫힘의 초점.
 * - 블록 사이드 메뉴와 함께 열렸을 때의 키보드 초점 소유자와 Escape LIFO.
 */

import { DEFAULT_DICTIONARY, type EditorController } from "@cp949/geul-core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BlockSideMenu } from "../src/block-side-menu.js";
import { EditorContent, EditorProvider, useEditor } from "../src/index.js";
import {
  findMediaVisualElement,
  MediaHandleOverlays,
} from "../src/media-handle-overlays.js";
import {
  mountBlockEditor,
  type MountBlockEditorOptions,
  stubRect,
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

const MEDIA_URL = "https://example.com/x.png";

/** `MEDIA_URL`을 가리키는 image 블록 fixture. id만 테스트마다 다르다. */
const imageBlock = (id: string) => ({
  id,
  type: "image" as const,
  url: MEDIA_URL,
});
// TrailingBlockExtension 함정(위 plus 버튼 테스트와 같은 이유) — 명시 문단으로 닫는다.
const tailBlock = {
  id: "tail-1",
  type: "paragraph" as const,
  content: [],
};

/**
 * 삭제 테스트용 media 문서. 블록이 최소 하나 남아야 해서 media 둘과 꼬리 문단을 둔다.
 * `image-1`이 메뉴 대상이고 `image-2`는 다른 블록이다.
 */
const twoImageBlocks = () => [
  imageBlock("image-1"),
  imageBlock("image-2"),
  tailBlock,
];

/**
 * 첫 번째 media 핸들을 hover -> click해 메뉴를 연다. 초점은 편집기에 둔 채로 둬서
 * "초점이 메뉴로 옮겨졌는가"를 판정할 수 있게 한다. fireEvent.click의 기본 detail은
 * 0이라 재오픈 억제 가드를 타지 않는다(위 그립 클릭 테스트와 같은 근거).
 */
const openMediaMenu = (
  initialBlocks: MountBlockEditorOptions["initialBlocks"] = twoImageBlocks(),
) => {
  const rendered = renderMediaOverlays({ initialBlocks });
  const [media] = rendered.blocks;
  if (media === undefined) throw new Error("media 요소가 없다");
  rendered.editable.focus();
  fireEvent.pointerMove(media);
  fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));
  return rendered;
};

/**
 * 첫 번째 media 핸들에 키보드 열림 신호(keydown)를 보낸 뒤 click한다.
 * 브라우저는 핸들에 초점이 있을 때 Enter·Space를 keydown 뒤 click으로 바꾼다.
 * keydown 없이 click만 쏘는 jsdom 기본 호출과 이 경로를 구분하는 데 쓴다.
 */
const openMediaMenuViaKeyboard = (key: "Enter" | " ") => {
  const rendered = renderMediaOverlays({ initialBlocks: twoImageBlocks() });
  const [media] = rendered.blocks;
  if (media === undefined) throw new Error("media 요소가 없다");
  rendered.editable.focus();
  fireEvent.pointerMove(media);
  const handle = screen.getByRole("button", { name: dragHandleLabel });
  fireEvent.keyDown(handle, { key });
  fireEvent.click(handle);
  return rendered;
};

/**
 * 메뉴의 첫 활성 항목. 비활성 항목은 `aria-disabled="true"`로 표시된다(G-UI-004).
 * media 메뉴는 Turn into 목록이 없고 첫 블록의 Indent가 비활성이라 첫 `menuitem`이
 * 초점 대상이 아닐 수 있다.
 */
const firstActiveMenuItem = (): HTMLElement => {
  const item = screen
    .getAllByRole("menuitem")
    .find((candidate) => candidate.getAttribute("aria-disabled") !== "true");
  if (item === undefined) throw new Error("활성 메뉴 항목이 없다");
  return item;
};

/**
 * `useEditor()`로 얻은 컨트롤러를 ref에 담는 렌더 없는 컴포넌트.
 * internal ownership 마운트는 컨트롤러를 호출부가 만들지 않아 이렇게 꺼낸다.
 */
const EditorCapture = ({
  editorRef,
}: {
  editorRef: { current: EditorController | null };
}) => {
  editorRef.current = useEditor();
  return null;
};

/**
 * EditorProvider가 createEditor()를 직접 만드는 internal ownership 마운트.
 * 삭제 닫힘이 external·internal 양쪽에서 같은지 보는 데 쓴다. 컨트롤러는
 * `useEditor()`를 호출하는 캡처 컴포넌트로 꺼낸다.
 */
const mountInternalMediaEditor = (
  blocks: MountBlockEditorOptions["initialBlocks"] = twoImageBlocks(),
) => {
  const editorRef: { current: EditorController | null } = { current: null };
  render(
    <EditorProvider
      initialDocument={{
        formatVersion: 1,
        revision: 0,
        blocks: blocks ?? [],
      }}
    >
      <EditorCapture editorRef={editorRef} />
      <MediaHandleOverlays onBlockAdded={vi.fn()} />
      <EditorContent />
    </EditorProvider>,
  );
  const editor = editorRef.current;
  if (editor === null) throw new Error("internal editor를 capture하지 못했다");
  const host = screen.getByRole("textbox", { name: "Editor" });
  const blockElements = Array.from(
    host.querySelectorAll<HTMLElement>("[data-geul-block-id]"),
  );
  blockElements.forEach((block, index) => {
    const rect = { left: 0, top: index * 20, width: 600, height: 20 };
    stubRect(block, rect);
    const visual = findMediaVisualElement(block);
    if (visual !== null) stubRect(visual, rect);
  });
  return { editor, blocks: blockElements, host };
};

const openInternalMediaMenu = (
  blocks?: MountBlockEditorOptions["initialBlocks"],
) => {
  const rendered = mountInternalMediaEditor(blocks);
  const [media] = rendered.blocks;
  if (media === undefined) throw new Error("media 요소가 없다");
  fireEvent.pointerMove(media);
  fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));
  return rendered;
};

describe("media 메뉴 키보드 열림 초점(Issue #233 RD-002 DELTA-02)", () => {
  it("핸들에서 Enter keydown 뒤 click으로 열면 첫 활성 항목에 초점을 준다", () => {
    openMediaMenuViaKeyboard("Enter");

    const menu = screen.getByRole("menu", { name: "Block menu" });
    expect(document.activeElement).toBe(firstActiveMenuItem());
    expect(menu.contains(document.activeElement)).toBe(true);
  });

  it("핸들에서 Space keydown 뒤 click으로 열어도 첫 활성 항목에 초점을 준다", () => {
    openMediaMenuViaKeyboard(" ");

    expect(document.activeElement).toBe(firstActiveMenuItem());
  });

  it("keydown 없이 click만 오면 초점을 옮기지 않는다", () => {
    const rendered = openMediaMenu();

    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("남아 있던 keydown 신호는 마우스 pointerdown이 지워 그 뒤 click은 초점을 옮기지 않는다", () => {
    const rendered = renderMediaOverlays({ initialBlocks: twoImageBlocks() });
    const [media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");
    rendered.editable.focus();
    fireEvent.pointerMove(media);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    // 키로 눌렀지만 click이 오지 않은 신호가 남은 상태를 만든다.
    fireEvent.keyDown(handle, { key: "Enter" });

    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.click(handle, { detail: 1 });

    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("다른 키의 keydown은 키보드 열림 신호가 아니다", () => {
    const rendered = renderMediaOverlays({ initialBlocks: twoImageBlocks() });
    const [media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");
    rendered.editable.focus();
    fireEvent.pointerMove(media);
    const handle = screen.getByRole("button", { name: dragHandleLabel });

    fireEvent.keyDown(handle, { key: "a" });
    fireEvent.click(handle);

    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("Enter로 연 뒤 닫고 keydown 없이 click만 보내면 초점이 메뉴로 가지 않는다(click이 신호를 소비한다)", () => {
    const rendered = openMediaMenuViaKeyboard("Enter");
    expect(document.activeElement).toBe(firstActiveMenuItem());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);

    // 앞선 keydown 신호가 click에서 소비됐다면 이번 click은 키보드 열림이 아니다.
    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));

    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("메뉴 패널은 tabIndex -1을 가져 활성 항목이 없을 때 초점을 받을 수 있다", () => {
    openMediaMenu();

    expect(
      screen.getByRole("menu", { name: "Block menu" }).getAttribute("tabindex"),
    ).toBe("-1");
  });
});

describe("media 메뉴 키보드 연속 열림(Issue #233 RD-002 DELTA-02)", () => {
  it("키보드로 연 메뉴에서 다른 media 핸들을 키보드로 다시 열면 새 메뉴의 첫 항목에 초점을 준다", () => {
    const rendered = renderMediaOverlays({ initialBlocks: twoImageBlocks() });
    const [media1, media2] = rendered.blocks;
    if (media1 === undefined || media2 === undefined) {
      throw new Error("media 요소가 없다");
    }
    rendered.editable.focus();
    fireEvent.pointerMove(media1);
    let handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.keyDown(handle, { key: "Enter" });
    fireEvent.click(handle);
    expect(document.activeElement).toBe(firstActiveMenuItem());

    // 메뉴를 닫지 않은 채 image-2의 핸들을 다시 키보드로 연다. 메뉴가 key로
    // 재마운트되면 초점을 가진 이전 항목이 지워지므로 focusKey가 새 메뉴에
    // 초점을 다시 줘야 한다.
    fireEvent.pointerMove(media2);
    handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.keyDown(handle, { key: "Enter" });
    fireEvent.click(handle);

    const menu = screen.getByRole("menu", { name: "Block menu" });
    expect(menu.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(firstActiveMenuItem());
    expect(document.activeElement?.tagName).not.toBe("BODY");
  });
});

describe("media 메뉴 대상 전환 재마운트(Issue #233 RD-002 DELTA-02)", () => {
  it("메뉴가 열린 채 다른 media 핸들로 다시 열면 메뉴를 새로 마운트한다", () => {
    const rendered = renderMediaOverlays({ initialBlocks: twoImageBlocks() });
    const [media1, media2] = rendered.blocks;
    if (media1 === undefined || media2 === undefined) {
      throw new Error("media 요소가 없다");
    }
    fireEvent.pointerMove(media1);
    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));
    const firstMenu = screen.getByRole("menu", { name: "Block menu" });

    fireEvent.pointerMove(media2);
    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));

    // 메뉴는 열 때의 block type을 lazy init으로 붙든다. 재마운트하지 않으면
    // 이전 대상의 상태가 새 대상에 남는다. media는 type descriptor가 null이라
    // 지금은 DOM 노드가 바뀌는지로만 관측된다.
    const secondMenu = screen.getByRole("menu", { name: "Block menu" });
    expect(secondMenu).not.toBe(firstMenu);
  });
});

describe("media 메뉴 대상 블록 삭제 시 닫힘(Issue #233 RD-002 DELTA-02)", () => {
  it("external 마운트에서 메뉴가 연 블록을 deleteBlock하면 메뉴가 닫힌다", async () => {
    const rendered = openMediaMenu();
    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();

    const deleted = rendered.editor.commands.deleteBlock("image-1");
    if (!deleted.ok) throw new Error("대상 블록 삭제 fixture 준비 실패");

    // 구독 통지는 커밋 뒤 effect가 판정한다. 동기 단언이 아니라 수렴을 기다린다.
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  it("internal 마운트에서도 메뉴가 연 블록을 deleteBlock하면 메뉴가 닫힌다", async () => {
    const rendered = openInternalMediaMenu();
    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();

    const deleted = rendered.editor.commands.deleteBlock("image-1");
    if (!deleted.ok) throw new Error("대상 블록 삭제 fixture 준비 실패");

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  it("메뉴가 연 블록이 아닌 다른 블록을 삭제하면 메뉴가 닫히지 않는다", async () => {
    const rendered = openMediaMenu();

    const deletedOther = rendered.editor.commands.deleteBlock("image-2");
    if (!deletedOther.ok) throw new Error("다른 블록 삭제 fixture 준비 실패");

    // 구독 통지와 커밋 뒤 판정이 끝나도록 flush한 다음에 단언한다. 삭제 직후의
    // 동기 단언은 판정이 돌기 전이라 어떤 구현에서도 통과한다.
    await act(async () => {});
    expect(screen.getByRole("menu", { name: "Block menu" })).not.toBeNull();

    // 판정이 살아 있음을 같은 테스트에서 확인한다. 대상 블록을 삭제하면 닫힌다.
    // 이 확인이 없으면 위 단언은 "삭제를 아예 감지하지 않는다"와 구분되지 않는다.
    const deletedTarget = rendered.editor.commands.deleteBlock("image-1");
    if (!deletedTarget.ok) throw new Error("대상 블록 삭제 fixture 준비 실패");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  it("초점이 메뉴 안에 있을 때 대상 블록이 삭제돼 닫히면 초점을 편집기로 돌린다", async () => {
    const rendered = openMediaMenu();
    screen.getByRole("menuitem", { name: "Duplicate" }).focus();
    expect(screen.getByRole("menu").contains(document.activeElement)).toBe(
      true,
    );

    const deleted = rendered.editor.commands.deleteBlock("image-1");
    if (!deleted.ok) throw new Error("대상 블록 삭제 fixture 준비 실패");

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
    expect(document.activeElement).toBe(rendered.editable);
  });
});

/**
 * 편집기 밖에 `<input>`을 만들어 초점을 준다. 편집기 밖 입력에 초점이 있을 때
 * 메뉴가 닫혀도 초점을 가져가지 않는지 판정하는 데 쓴다. 정리 함수를 돌려준다.
 */
const focusOutsideInput = (): {
  input: HTMLInputElement;
  remove: () => void;
} => {
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  return { input, remove: () => input.remove() };
};

describe("media 메뉴 삭제 닫힘의 초점 규칙(Issue #233 RD-002 DELTA-02)", () => {
  it("internal 마운트에서 편집기 밖 입력에 초점이 있으면 대상 블록 삭제로 닫혀도 초점을 가져가지 않는다", async () => {
    const rendered = openInternalMediaMenu();
    const { input, remove } = focusOutsideInput();
    try {
      const deleted = rendered.editor.commands.deleteBlock("image-1");
      if (!deleted.ok) throw new Error("대상 블록 삭제 fixture 준비 실패");

      await waitFor(() => {
        expect(screen.queryByRole("menu")).toBeNull();
      });
      expect(document.activeElement).toBe(input);
    } finally {
      remove();
    }
  });

  it("external 마운트에서도 편집기 밖 입력의 초점을 가져가지 않는다", async () => {
    const rendered = openMediaMenu();
    const { input, remove } = focusOutsideInput();
    try {
      const deleted = rendered.editor.commands.deleteBlock("image-1");
      if (!deleted.ok) throw new Error("대상 블록 삭제 fixture 준비 실패");

      await waitFor(() => {
        expect(screen.queryByRole("menu")).toBeNull();
      });
      expect(document.activeElement).toBe(input);
    } finally {
      remove();
    }
  });
});

describe("media 메뉴 대상 type 변경 시 닫힘의 초점 규칙(Issue #233 RD-002 DELTA-02)", () => {
  it("internal 마운트에서 대상 블록이 같은 id의 다른 type으로 바뀌어 닫혀도 편집기 밖 입력의 초점을 가져가지 않는다", async () => {
    const rendered = openInternalMediaMenu();
    const { input, remove } = focusOutsideInput();
    try {
      // BlockSideMenuMenu는 열 때의 block type을 붙들고 있다가 같은 id의 type이
      // 달라지면 `onInvalidated`로 닫는다. media는 descriptor가 null이라 같은 id가
      // 문단이 되면 type이 달라진다.
      const replaced = rendered.editor.replaceDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "image-1", type: "paragraph", content: [] },
          imageBlock("image-2"),
          tailBlock,
        ],
      });
      if (!replaced.ok) throw new Error("문서 교체 fixture 준비 실패");

      await waitFor(() => {
        expect(screen.queryByRole("menu")).toBeNull();
      });
      expect(document.activeElement).toBe(input);
    } finally {
      remove();
    }
  });
});

describe("media 메뉴를 연 직후 같은 batch의 삭제(Issue #233 RD-002 DELTA-02)", () => {
  it("external 마운트에서 열자마자 같은 act에서 대상을 삭제하면 메뉴가 닫힌다", async () => {
    const rendered = renderMediaOverlays({ initialBlocks: twoImageBlocks() });
    const [media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");
    fireEvent.pointerMove(media);
    const handle = screen.getByRole("button", { name: dragHandleLabel });

    act(() => {
      fireEvent.click(handle);
      rendered.editor.commands.deleteBlock("image-1");
    });

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  it("internal 마운트에서도 열자마자 같은 act에서 대상을 삭제하면 메뉴가 닫힌다", async () => {
    const rendered = mountInternalMediaEditor();
    const [media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");
    fireEvent.pointerMove(media);
    const handle = screen.getByRole("button", { name: dragHandleLabel });

    act(() => {
      fireEvent.click(handle);
      rendered.editor.commands.deleteBlock("image-1");
    });

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });
});

describe("media 메뉴 Escape·바깥 클릭·재클릭·항목 클릭의 초점(Issue #233 RD-002 DELTA-02)", () => {
  it("Escape로 메뉴를 닫고 편집기로 초점을 되돌린다", () => {
    const rendered = openMediaMenu();
    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();
    // 초점이 편집기에 있으면 `escape` 규칙이 없어도 결과가 같아 단언이 공허하다.
    // 편집기 밖 입력에 초점을 둬서 `escape` 규칙만 편집기로 돌리게 한다.
    const { remove } = focusOutsideInput();

    try {
      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(rendered.editable);
    } finally {
      remove();
    }
  });

  it("편집기가 Escape를 먼저 preventDefault해도 마우스로 연 메뉴가 닫히고 초점이 편집기에 남는다", () => {
    const rendered = openMediaMenu();
    rendered.editable.focus();
    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();
    // ProseMirror editHandlers.keydown이 편집기 안의 Escape를 막는 것을 흉내 낸다.
    const consume = (event: Event) => event.preventDefault();
    rendered.editable.addEventListener("keydown", consume);
    try {
      fireEvent.keyDown(rendered.editable, { key: "Escape" });
    } finally {
      rendered.editable.removeEventListener("keydown", consume);
    }

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("메뉴 바깥 컨트롤을 누르면 초점을 그 컨트롤에 둔 채 메뉴만 닫는다", () => {
    openMediaMenu();
    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();

    // 편집기 바깥 요소는 편집기가 만들지 않는다 — 실제 마운트로도 대신할
    // 수 없는 유일한 조립이라 여기서 직접 만든다.
    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.append(outsideButton);
    outsideButton.focus();

    try {
      fireEvent.pointerDown(outsideButton);

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(outsideButton);
    } finally {
      outsideButton.remove();
    }
  });

  it("메뉴 안(data-geul-block-menu)을 누르면 닫히지 않는다", () => {
    openMediaMenu();

    fireEvent.pointerDown(screen.getByRole("menu", { name: "Block menu" }));

    expect(screen.queryByRole("menu")).not.toBeNull();
  });

  it("메뉴 항목에 초점이 있을 때 바깥 컨트롤을 누르면 초점을 편집기로 돌린다", () => {
    const rendered = openMediaMenu();
    screen.getByRole("menuitem", { name: "Duplicate" }).focus();
    const outsideButton = document.createElement("button");
    document.body.append(outsideButton);

    try {
      fireEvent.pointerDown(outsideButton);

      expect(screen.queryByRole("menu")).toBeNull();
      // 메뉴가 언마운트되며 초점이 BODY로 떨어지면 안 된다.
      expect(document.activeElement).toBe(rendered.editable);
    } finally {
      outsideButton.remove();
    }
  });

  it("같은 핸들 재클릭이 닫는 분기를 타면 메뉴를 닫고 편집기로 초점을 되돌린다", () => {
    const rendered = openMediaMenu();
    expect(screen.getByRole("menu", { name: "Block menu" })).toBeTruthy();
    // 초점이 편집기에 있으면 `outside` 규칙으로 닫아도 같은 결과라 단언이 공허하다.
    // 편집기 밖 입력에 초점을 둬서 `trigger` 규칙만 편집기로 돌리게 한다.
    const { remove } = focusOutsideInput();

    try {
      // 실제 마우스 재클릭은 pointerdown -> pointerup -> click 순서로 온다
      // (G-TST-001). click만 쏘면 pointerdown의 메뉴 해제를 거치지 않는다.
      const handle = screen.getByRole("button", { name: dragHandleLabel });
      fireEvent.pointerDown(handle, { pointerId: 1 });
      fireEvent.pointerUp(handle, { pointerId: 1 });
      fireEvent.click(handle, { detail: 1 });

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(rendered.editable);
    } finally {
      remove();
    }
  });

  it("항목 클릭으로 닫히면 편집기로 초점을 돌린다", () => {
    const rendered = openMediaMenu();
    // 위 재클릭 테스트와 같은 이유로 초점을 편집기 밖 입력에 둔다.
    const { remove } = focusOutsideInput();

    try {
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(rendered.editable);
    } finally {
      remove();
    }
  });
});

/**
 * 블록 사이드 메뉴와 media 핸들 오버레이를 production 마운트 순서(slash-menu.tsx:
 * BlockSideMenu가 먼저)로 함께 마운트한다. 두 메뉴가 같은 allow 셀렉터를 공유해서
 * 동시에 열렸을 때의 키보드 초점과 Escape 순서를 보는 데 쓴다.
 */
const renderBlockAndMediaOverlays = () =>
  mountBlockEditor({
    initialBlocks: [
      { id: "para-1", type: "paragraph" as const, content: [{ text: "본문" }] },
      imageBlock("image-1"),
      tailBlock,
    ],
    children: (
      <>
        <BlockSideMenu onBlockAdded={vi.fn()} />
        <MediaHandleOverlays onBlockAdded={vi.fn()} />
      </>
    ),
  });

/**
 * 소유자(`data-geul-menu-owner`)별 메뉴 패널. 두 메뉴가 같은 `data-geul-block-menu`를
 * 공유해서 `role="menu"` 조회로는 둘을 구분할 수 없다.
 */
const menuOwnedBy = (owner: "block" | "media"): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-geul-menu-owner="${owner}"]`);

/**
 * 소유자별 핸들. 블록 gutter와 media 오버레이가 둘 다 같은 접근성 이름의 핸들을
 * 렌더해서 컨테이너로 구분한다.
 */
const handleOwnedBy = (owner: "block" | "media"): HTMLElement => {
  const container =
    owner === "block" ? ".geul-block-gutter" : ".geul-media-handle-overlay";
  const handle = document.querySelector<HTMLElement>(
    `${container} [data-geul-block-handle]`,
  );
  if (handle === null) throw new Error(`${owner} 핸들이 없다`);
  return handle;
};

/** 메뉴 안의 첫 활성 항목. 비활성은 `aria-disabled="true"`다(G-UI-004). */
const firstActiveItemOf = (menu: HTMLElement): HTMLElement => {
  const item = Array.from(
    menu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).find((candidate) => candidate.getAttribute("aria-disabled") !== "true");
  if (item === undefined) throw new Error("활성 메뉴 항목이 없다");
  return item;
};

describe("블록 메뉴와 media 메뉴가 함께 열릴 때(Issue #233 RD-002 DELTA-02 실측 위험)", () => {
  it("블록 메뉴가 열린 채 media 핸들을 키보드로 열면 초점이 media 메뉴의 첫 활성 항목으로 간다", () => {
    const rendered = renderBlockAndMediaOverlays();
    const [paragraph, media] = rendered.blocks;
    if (paragraph === undefined || media === undefined) {
      throw new Error("블록 요소가 없다");
    }
    fireEvent.pointerMove(paragraph);
    fireEvent.click(handleOwnedBy("block"));
    expect(menuOwnedBy("block")).not.toBeNull();

    fireEvent.pointerMove(media);
    const mediaHandle = handleOwnedBy("media");
    fireEvent.keyDown(mediaHandle, { key: "Enter" });
    fireEvent.click(mediaHandle);

    const mediaMenu = menuOwnedBy("media");
    if (mediaMenu === null) throw new Error("media 메뉴가 열리지 않았다");
    // 두 메뉴가 같은 `data-geul-block-menu`를 공유한다. 문서 순서상 첫 표면은
    // 블록 메뉴라서 소유자 셀렉터가 없으면 초점이 그쪽으로 간다.
    expect(mediaMenu.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(firstActiveItemOf(mediaMenu));
  });

  it("media 메뉴가 열린 채 블록 핸들을 키보드로 열면 초점이 블록 메뉴의 첫 활성 항목으로 간다", () => {
    const rendered = renderBlockAndMediaOverlays();
    const [paragraph, media] = rendered.blocks;
    if (paragraph === undefined || media === undefined) {
      throw new Error("블록 요소가 없다");
    }
    fireEvent.pointerMove(media);
    fireEvent.click(handleOwnedBy("media"));
    expect(menuOwnedBy("media")).not.toBeNull();

    fireEvent.pointerMove(paragraph);
    const blockHandle = handleOwnedBy("block");
    fireEvent.keyDown(blockHandle, { key: "Enter" });
    fireEvent.click(blockHandle);

    const blockMenu = menuOwnedBy("block");
    if (blockMenu === null) throw new Error("블록 메뉴가 열리지 않았다");
    expect(blockMenu.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(firstActiveItemOf(blockMenu));
  });

  it("두 메뉴가 열린 채 Escape를 누르면 가장 나중에 연 media 메뉴가 먼저 닫히고 블록 메뉴가 남는다", () => {
    const rendered = renderBlockAndMediaOverlays();
    const [paragraph, media] = rendered.blocks;
    if (paragraph === undefined || media === undefined) {
      throw new Error("블록 요소가 없다");
    }
    fireEvent.pointerMove(paragraph);
    fireEvent.click(handleOwnedBy("block"));
    fireEvent.pointerMove(media);
    fireEvent.click(handleOwnedBy("media"));
    expect(menuOwnedBy("block")).not.toBeNull();
    expect(menuOwnedBy("media")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    // 개수만 보면 FIFO(먼저 연 메뉴가 먼저 닫힘)와 구분되지 않는다. 남은 메뉴의
    // 소유자로 순서를 본다.
    expect(menuOwnedBy("media")).toBeNull();
    expect(menuOwnedBy("block")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
