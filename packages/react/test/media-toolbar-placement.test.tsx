// @vitest-environment jsdom

/**
 * MediaToolbar의 배치 계약을 확인한다(Issue #234 RD-005).
 * - 앵커는 `blockId`로 찾은 블록 우상단이다. 렌더마다 DOM에서 다시 읽는다.
 * - view·rename·caption·replacing 어느 모드에서도 scroll·resize를 따라간다.
 *   편집 중에는 `updateFromSelection`이 `editingRef`로 막히므로 위치가 이 경로에
 *   의존하면 안 된다.
 * - 리사이즈 종료 뒤 새 블록 rect를 읽는다.
 * - 블록 DOM이 없으면 고정 대체 좌표(96, 48)를 쓴다.
 */
import type { MediaBlockKind } from "@cp949/geul-core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, MediaToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type FakeOptions = {
  /** `false`면 마운트한 편집기에 미디어 블록 DOM을 만들지 않는다. */
  withBlockElement?: boolean;
  kind?: MediaBlockKind;
};

/** MediaToolbar가 읽는 표면만 가진 fake다. 블록은 항상 url이 있는 이미지다. */
const fakeController = ({
  withBlockElement = true,
  kind = "image",
}: FakeOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    if (withBlockElement) {
      const block = document.createElement("div");
      block.setAttribute("data-geul-block-id", "media-1");
      editable.append(block);
    }
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMediaBlock: vi.fn(() => ({
    blockId: "media-1",
    kind,
    url: "https://example.com/dir/photo.png",
    name: "photo.png",
    caption: null,
    showPreview: true,
    textAlignment: null,
  })),
  isUploadEnabled: vi.fn(() => true),
  getMediaUploadState: vi.fn(() => null),
  commands: {
    setMediaBlockName: vi.fn(() => ({ ok: true })),
    setMediaBlockCaption: vi.fn(() => ({ ok: true })),
    setMediaShowPreview: vi.fn(() => ({ ok: true })),
    setMediaTextAlignment: vi.fn(() => ({ ok: true })),
    deleteBlock: vi.fn(() => ({ ok: true })),
    replaceMediaBlockFile: vi.fn(() =>
      Promise.resolve({ ok: true, value: undefined }),
    ),
    setMediaBlockUrl: vi.fn(() => ({ ok: true })),
    setIframeSrc: vi.fn(() => ({ ok: true })),
    cancelMediaUpload: vi.fn(() => ({ ok: true, value: undefined })),
  },
});

/** 미디어 툴바와 편집기를 렌더하고 host와 대상 블록 요소를 돌려준다. */
const renderToolbar = (options: FakeOptions = {}) => {
  render(
    withProvider(
      fakeController(options),
      <>
        <MediaToolbar />
        <EditorContent />
      </>,
    ),
  );
  const host = screen.getByRole("textbox", { name: "Editor" });
  const block = host.querySelector<HTMLElement>(
    '[data-geul-block-id="media-1"]',
  );
  return { host, block };
};

/** left·top·크기로 `DOMRect` 모양 객체를 만든다. */
const rectAt = (left: number, top: number, width = 200, height = 100) =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect;

/** 블록 rect를 바꾼다. 블록 우상단은 (right, top)이다. */
const moveBlock = (block: HTMLElement | null, left: number, top: number) => {
  if (block === null) throw new Error("media block DOM missing");
  vi.spyOn(block, "getBoundingClientRect").mockReturnValue(rectAt(left, top));
};

/** 미디어 툴바 요소를 읽는다. 숨겨진 상태도 포함한다. */
const readToolbar = () =>
  screen.getByRole("toolbar", { hidden: true }) as HTMLElement;

/** 미디어 툴바의 fixed 좌표(style)를 읽는다. */
const readPosition = () => {
  const toolbar = readToolbar();
  return { left: toolbar.style.left, top: toolbar.style.top };
};

/** more 메뉴를 연다. */
const openMoreMenu = () => {
  fireEvent.click(screen.getByRole("button", { name: "More media options" }));
};

/** window scroll 이벤트를 act 안에서 보낸다. */
const scroll = () => {
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
};

describe("MediaToolbar 배치", () => {
  it("view 모드는 블록 우상단에 앵커한다", () => {
    const { block } = renderToolbar();
    moveBlock(block, 100, 300);
    scroll();

    // 우상단은 (left + width, top) = (300, 300). jsdom 박스는 0×0이라 clamp가 그대로 둔다.
    expect(readPosition()).toEqual({ left: "300px", top: "300px" });
  });

  it("view 모드는 스크롤하면 블록의 새 rect를 따라간다", () => {
    const { block } = renderToolbar();
    moveBlock(block, 100, 300);
    scroll();

    moveBlock(block, 100, 250);
    scroll();

    expect(readPosition()).toEqual({ left: "300px", top: "250px" });
  });

  it("이름 편집 모드도 스크롤하면 블록의 새 rect를 따라간다", () => {
    const { block } = renderToolbar();
    moveBlock(block, 100, 300);
    scroll();
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(screen.getByRole("textbox", { name: "Image name" })).not.toBeNull();

    moveBlock(block, 100, 250);
    scroll();

    expect(readPosition()).toEqual({ left: "300px", top: "250px" });
  });

  it("캡션 편집 모드도 스크롤하면 블록의 새 rect를 따라간다", () => {
    const { block } = renderToolbar();
    moveBlock(block, 100, 300);
    scroll();
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit caption" }));
    expect(
      screen.getByRole("textbox", { name: "Image caption" }),
    ).not.toBeNull();

    moveBlock(block, 100, 250);
    scroll();

    expect(readPosition()).toEqual({ left: "300px", top: "250px" });
  });

  it("교체 모드도 스크롤하면 블록의 새 rect를 따라간다", () => {
    const { block } = renderToolbar();
    moveBlock(block, 100, 300);
    scroll();
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    moveBlock(block, 100, 250);
    scroll();

    expect(readPosition()).toEqual({ left: "300px", top: "250px" });
  });

  it("편집 모드도 resize하면 블록의 새 rect를 따라간다", () => {
    const { block } = renderToolbar();
    moveBlock(block, 100, 300);
    scroll();
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));

    moveBlock(block, 200, 300);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(readPosition()).toEqual({ left: "400px", top: "300px" });
  });

  it("리사이즈가 끝나면 새 블록 rect에 앵커한다", async () => {
    const { host, block } = renderToolbar();
    moveBlock(block, 100, 300);
    scroll();
    host.setAttribute("data-geul-media-resizing-block-id", "media-1");
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());

    // 리사이즈로 블록 크기가 바뀌어 우상단이 옮겨간다.
    vi.spyOn(block as HTMLElement, "getBoundingClientRect").mockReturnValue(
      rectAt(100, 300, 120, 60),
    );
    host.removeAttribute("data-geul-media-resizing-block-id");

    await waitFor(() =>
      expect(readPosition()).toEqual({ left: "220px", top: "300px" }),
    );
  });

  it("블록 DOM을 찾지 못하면 (96, 48)에 둔다", () => {
    renderToolbar({ withBlockElement: false });

    expect(readPosition()).toEqual({ left: "96px", top: "48px" });
  });
});
