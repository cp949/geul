// @vitest-environment jsdom

/**
 * LinkToolbar의 배치 계약을 확인한다(Issue #234 RD-005).
 * - 앵커는 선택 Range 아래 중앙이다. view 모드는 스크롤마다 새 rect를 따라간다.
 * - 편집 모드도 스크롤을 따라간다. 편집 중에는 DOM selection이 입력으로 옮겨가
 *   재조회(`updateFromSelection`)가 막히므로 열 때 보관한 Range에서 읽는다.
 * - 편집 입력에 포커스가 있으면 앵커가 스크롤 컨테이너 밖으로 나가도 숨기지 않는다(Issue #243).
 * - 포커스가 빠진 뒤 앵커가 밖으로 나가면 숨기되 입력 draft를 잃지 않는다.
 * - Range rect를 읽을 수 없으면 마지막 좌표를 유지한다.
 * - DOM selection이 편집기 밖이면 활성 링크가 있어도 열지 않는다. 고정 대체 좌표는
 *   없다(Issue #282).
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, LinkToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { stubRect } from "./mount-editor.js";
import { selectText } from "./selection-events.js";

/** jsdom 원본 `Range.getBoundingClientRect`. 각 테스트 뒤에 복원한다. */
const originalRangeRect = Range.prototype.getBoundingClientRect;

afterEach(() => {
  cleanup();
  Range.prototype.getBoundingClientRect = originalRangeRect;
});

/** 모든 Range가 지정한 rect를 돌려주게 한다. */
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
  selectionIntersectsCodeBlock: vi.fn(() => false),
  isAtomBlockSelected: vi.fn(() => false),
  commands: {
    setLink: vi.fn(() => ({ ok: true })),
    unsetLink: vi.fn(() => ({ ok: true, value: undefined })),
  },
});

/** 링크 툴바와 편집기를 렌더하고 host와 본문 text node를 돌려준다. */
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

/** `Add link`를 눌러 편집 모드로 들어간다. */
const openEditing = () => {
  fireEvent.click(screen.getByRole("button", { name: "Add link" }));
};

/** 링크 툴바 요소를 읽는다. 숨겨진 상태도 포함한다. */
const readToolbar = () =>
  screen.getByRole("toolbar", { hidden: true }) as HTMLElement;

/** 링크 툴바의 fixed 좌표(style)를 읽는다. */
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
    // 실제 브라우저에서는 입력에 초점이 가며 DOM selection이 편집기를 떠난다.
    // 라이브 selection을 읽는 구현이면 여기서 앵커를 잃는다.
    window.getSelection()?.removeAllRanges();

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

  it("편집 입력에 포커스가 있으면 앵커가 영역 밖으로 나가도 숨기지 않는다", () => {
    const { host, textNode } = renderToolbar();
    host.style.overflowY = "auto";
    stubRect(host, { left: 0, top: 0, width: 600, height: 100 });
    stubSelectionRect(new DOMRect(100, 40, 80, 20));
    selectText(textNode, 0, 8);
    openEditing();
    const input = screen.getByRole("textbox", { name: "Link URL" });
    expect(document.activeElement).toBe(input);

    stubSelectionRect(new DOMRect(100, 400, 80, 20));
    fireEvent.scroll(window);

    expect(readToolbar().style.visibility).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("편집 입력의 포커스가 빠진 뒤 앵커가 영역 밖으로 나가면 숨기되 입력 draft를 유지한다", () => {
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
    // 포커스가 입력에 있으면 숨기지 않는다. 숨김 판정은 포커스가 빠진 뒤에 선다.
    act(() => screen.getByRole("textbox", { name: "Link URL" }).blur());

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

  it("활성 링크는 있는데 DOM selection이 편집기 밖이면 닫힌다", () => {
    renderToolbar({ href: "https://example.com" });

    expect(screen.queryByRole("toolbar", { hidden: true })).toBeNull();
  });
});
