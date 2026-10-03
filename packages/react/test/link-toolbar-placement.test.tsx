// @vitest-environment jsdom

/**
 * LinkToolbar의 배치 계약을 확인한다(Issue #234 RD-005).
 * - 앵커는 선택 Range 아래 중앙이다. view 모드는 스크롤마다 새 rect를 따라간다.
 * - 편집 모드도 스크롤을 따라간다. 편집 중에는 DOM selection이 입력으로 옮겨가
 *   재조회(`updateFromSelection`)가 막히므로 열 때 보관한 Range에서 읽는다.
 * - 편집 모드에서 앵커가 스크롤 컨테이너 밖으로 나가면 숨기되 입력 draft를 잃지 않는다.
 * - Range rect를 읽을 수 없으면 마지막 좌표를 유지한다. DOM selection이 편집기 밖이면
 *   고정 대체 좌표(96, 48)를 쓴다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, LinkToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { stubRect } from "./mount-editor.js";
import { selectText } from "./selection-events.js";

const originalRangeRect = Range.prototype.getBoundingClientRect;

afterEach(() => {
  cleanup();
  Range.prototype.getBoundingClientRect = originalRangeRect;
});

const stubSelectionRect = (rect: DOMRect) => {
  Range.prototype.getBoundingClientRect = () => rect;
};

/** LinkToolbar가 읽는 표면만 가진 fake다. 링크 활성 여부만 바꾼다. */
const fakeController = (activeLink: { href: string } | null = null) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    editable.textContent = "editor text";
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMarks: vi.fn(() => [] as string[]),
  getSelectionLink: vi.fn(() => activeLink),
  getSelectionBlockType: vi.fn(() => null),
  getSelectionMediaBlock: vi.fn(() => null),
  isCellRangeSelected: vi.fn(() => false),
  commands: {
    setLink: vi.fn(() => ({ ok: true })),
    unsetLink: vi.fn(() => ({ ok: true, value: undefined })),
  },
});

const renderToolbar = (activeLink: { href: string } | null = null) => {
  render(
    withProvider(
      fakeController(activeLink),
      <>
        <LinkToolbar />
        <EditorContent />
      </>,
    ),
  );
  const host = screen.getByRole("textbox", { name: "Editor" });
  const textNode = host.firstChild?.firstChild;
  if (!textNode) throw new Error("Text node was not rendered");
  return { host, textNode };
};

const openEditing = () => {
  fireEvent.click(screen.getByRole("button", { name: "Add link" }));
};

const readToolbar = () =>
  screen.getByRole("toolbar", { hidden: true }) as HTMLElement;

const readPosition = () => {
  const toolbar = readToolbar();
  return { left: toolbar.style.left, top: toolbar.style.top };
};

describe("LinkToolbar 배치", () => {
  it("view 모드는 선택 Range 아래 중앙에 앵커한다", () => {
    const { textNode } = renderToolbar();
    stubSelectionRect(new DOMRect(100, 200, 80, 20));

    selectText(textNode, 0, 8);

    // 앵커는 (중앙, 아래쪽)이다. jsdom 박스는 0×0이라 clamp가 좌표를 그대로 둔다.
    expect(readPosition()).toEqual({ left: "140px", top: "220px" });
  });

  it("view 모드는 스크롤하면 Range의 새 rect를 따라간다", () => {
    const { textNode } = renderToolbar();
    stubSelectionRect(new DOMRect(100, 200, 80, 20));
    selectText(textNode, 0, 8);

    stubSelectionRect(new DOMRect(100, 150, 80, 20));
    fireEvent.scroll(window);

    expect(readPosition()).toEqual({ left: "140px", top: "170px" });
  });

  it("편집 모드도 스크롤하면 Range의 새 rect를 따라간다", () => {
    const { textNode } = renderToolbar();
    stubSelectionRect(new DOMRect(100, 200, 80, 20));
    selectText(textNode, 0, 8);
    openEditing();
    expect(screen.getByRole("textbox", { name: "Link URL" })).not.toBeNull();

    stubSelectionRect(new DOMRect(100, 150, 80, 20));
    fireEvent.scroll(window);

    expect(readPosition()).toEqual({ left: "140px", top: "170px" });
  });

  it("편집 모드도 resize하면 Range의 새 rect를 따라간다", () => {
    const { textNode } = renderToolbar();
    stubSelectionRect(new DOMRect(100, 200, 80, 20));
    selectText(textNode, 0, 8);
    openEditing();

    stubSelectionRect(new DOMRect(300, 200, 80, 20));
    fireEvent(window, new Event("resize"));

    expect(readPosition()).toEqual({ left: "340px", top: "220px" });
  });

  it("편집 모드에서 앵커가 영역 밖으로 나가면 숨기되 입력 draft를 유지한다", () => {
    const { host, textNode } = renderToolbar();
    host.style.overflowY = "auto";
    stubRect(host, { left: 0, top: 0, width: 600, height: 100 });
    stubSelectionRect(new DOMRect(100, 40, 80, 20));
    selectText(textNode, 0, 8);
    openEditing();
    fireEvent.change(screen.getByRole("textbox", { name: "Link URL" }), {
      target: { value: "https://example.com" },
    });
    expect(readToolbar().style.visibility).toBe("");

    stubSelectionRect(new DOMRect(100, 400, 80, 20));
    fireEvent.scroll(window);
    expect(readToolbar().style.visibility).toBe("hidden");

    stubSelectionRect(new DOMRect(100, 40, 80, 20));
    fireEvent.scroll(window);
    expect(readToolbar().style.visibility).toBe("");
    expect(
      (screen.getByRole("textbox", { name: "Link URL" }) as HTMLInputElement)
        .value,
    ).toBe("https://example.com");
  });

  it("Range rect를 읽을 수 없으면(0) 마지막 좌표를 유지한다", () => {
    const { textNode } = renderToolbar();
    stubSelectionRect(new DOMRect(100, 200, 80, 20));
    selectText(textNode, 0, 8);

    stubSelectionRect(new DOMRect(0, 0, 0, 0));
    fireEvent.scroll(window);

    expect(readPosition()).toEqual({ left: "140px", top: "220px" });
  });

  it("활성 링크는 있는데 DOM selection이 편집기 밖이면 (96, 48)에 둔다", () => {
    renderToolbar({ href: "https://example.com" });

    expect(readPosition()).toEqual({ left: "96px", top: "48px" });
  });
});
