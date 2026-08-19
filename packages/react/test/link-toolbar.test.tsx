// @vitest-environment jsdom

/**
 * LinkToolbar 컴포넌트: 텍스트 선택에 따른 링크 추가/편집/제거 컨트롤 노출,
 * 허용되지 않는 링크 URL의 거부 메시지, selectionchange에 따른 표시·숨김 전환,
 * URL 입력에서 Escape 시 닫힘과 편집기로의 초점 복구를 검증한다.
 */

import type { EditorController } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider, LinkToolbar } from "../src/index.js";

// vitest.config.ts에 globals도 setupFiles도 없어 자동 cleanup이 없다. 각 it
// 말미의 unmount로는 assertion이 먼저 던질 때 DOM이 남아 다음 테스트의
// getByRole(...)가 "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
// block-side-menu.test.tsx와 같은 afterEach(cleanup)을 쓴다.
afterEach(cleanup);

type FakeControllerOptions = {
  getSelectionLink?: () => { href: string } | null;
  setLink?: (href: string) => { ok: boolean; error?: { code: string } };
};

const fakeController = ({
  getSelectionLink = () => null,
  setLink = () => ({ ok: true }),
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    // 실제 브라우저와 달리 jsdom은 contentEditable IDL 프로퍼티를
    // contenteditable 속성으로 반영하지 않는다. link-toolbar.tsx:145의
    // closeAndRestoreFocus는 '[contenteditable="true"]'로 대상을 찾으므로,
    // 속성을 직접 세우지 않으면 초점 복구가 단위 테스트에서 조용히 no-op가 된다.
    editable.setAttribute("contenteditable", "true");
    editable.textContent = "editor text";
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMarks: vi.fn(() => [] as string[]),
  getSelectionLink: vi.fn(getSelectionLink),
  replaceDocument: vi.fn(),
  commands: {
    setText: vi.fn(),
    toggleBold: vi.fn(() => ({ ok: true, value: undefined })),
    toggleItalic: vi.fn(() => ({ ok: true, value: undefined })),
    toggleUnderline: vi.fn(() => ({ ok: true, value: undefined })),
    toggleStrike: vi.fn(() => ({ ok: true, value: undefined })),
    toggleCode: vi.fn(() => ({ ok: true, value: undefined })),
    setLink: vi.fn(setLink),
    unsetLink: vi.fn(() => ({ ok: true, value: undefined })),
    undo: vi.fn(),
    redo: vi.fn(),
  },
});

const withProvider = (
  controller: ReturnType<typeof fakeController>,
  children: React.ReactNode,
) => (
  <EditorProvider editor={controller as unknown as EditorController}>
    {children}
  </EditorProvider>
);

const selectText = (node: Node, start: number, end: number) => {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
};

const collapseSelection = () => {
  window.getSelection()?.removeAllRanges();
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
};

const renderWithSelectedText = (
  controller: ReturnType<typeof fakeController>,
) => {
  render(
    withProvider(
      controller,
      <>
        <LinkToolbar />
        <EditorContent />
      </>,
    ),
  );
  const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
    ?.firstChild;
  if (textNode === null || textNode === undefined) {
    throw new Error("Text node was not rendered");
  }
  selectText(textNode, 0, 8);
};

describe("LinkToolbar 링크 툴바", () => {
  it("선택도 활성 링크도 없으면 렌더링하지 않는다", () => {
    const controller = fakeController();
    render(withProvider(controller, <LinkToolbar />));

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("링크 없는 텍스트를 선택하면 링크 추가 컨트롤을 표시한다", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);

    expect(screen.getByRole("toolbar", { name: "Link" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add link" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Remove link" })).toBeNull();
  });

  it("커서가 기존 링크 안에 있으면 열기·편집·제거 컨트롤을 표시한다", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    render(
      withProvider(
        controller,
        <>
          <LinkToolbar />
          <EditorContent />
        </>,
      ),
    );
    collapseSelection();

    expect(screen.getByRole("toolbar", { name: "Link" })).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "Open link" }).getAttribute("href"),
    ).toBe("https://example.com");
    expect(screen.getByRole("button", { name: "Edit link" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove link" })).not.toBeNull();
  });

  it("링크 추가 컨트롤로 링크를 만든다", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Link URL" }), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(controller.commands.setLink).toHaveBeenCalledWith(
      "https://example.com",
    );
  });

  it("허용되지 않는 링크 URL이면 거부 메시지를 표시한다", () => {
    const controller = fakeController({
      setLink: () => ({
        ok: false,
        error: { code: "LINK_HREF_REJECTED" },
      }),
    });
    renderWithSelectedText(controller);

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Link URL" }), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Link URL" })).not.toBeNull();
  });

  it("제거 컨트롤로 링크를 제거한다", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    render(
      withProvider(
        controller,
        <>
          <LinkToolbar />
          <EditorContent />
        </>,
      ),
    );
    collapseSelection();

    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));

    expect(controller.commands.unsetLink).toHaveBeenCalledOnce();
  });

  it("기존 링크의 href를 편집한다", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    render(
      withProvider(
        controller,
        <>
          <LinkToolbar />
          <EditorContent />
        </>,
      ),
    );
    collapseSelection();

    fireEvent.click(screen.getByRole("button", { name: "Edit link" }));
    const input = screen.getByRole("textbox", {
      name: "Link URL",
    }) as HTMLInputElement;
    expect(input.value).toBe("https://example.com");

    fireEvent.change(input, {
      target: { value: "https://updated.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(controller.commands.setLink).toHaveBeenCalledWith(
      "https://updated.example.com",
    );
  });

  it("기존 href가 그대로면 적용하지 않고 닫는다", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    render(
      withProvider(
        controller,
        <>
          <LinkToolbar />
          <EditorContent />
        </>,
      ),
    );
    collapseSelection();

    fireEvent.click(screen.getByRole("button", { name: "Edit link" }));
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(controller.commands.setLink).not.toHaveBeenCalled();
    expect(screen.queryByRole("toolbar", { name: "Link" })).toBeNull();
  });

  it("선택이 collapsed가 되고 활성 링크도 없으면 숨긴다", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);
    expect(screen.queryByRole("toolbar")).not.toBeNull();

    collapseSelection();

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("편집 중 selectionchange가 발생해도 URL 입력을 열어 둔다", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    collapseSelection();

    expect(screen.getByRole("textbox", { name: "Link URL" })).not.toBeNull();
  });

  it("URL 입력에서 Escape를 누르면 툴바를 닫고 편집기로 초점을 되돌린다", () => {
    const controller = fakeController();
    renderWithSelectedText(controller);
    // host(role="textbox")는 마운트 host이고, 컨트롤러가 그 안에 실제
    // contenteditable 자식을 넣는다(block-side-menu.test.tsx:70-75와 같은
    // 구조) — closeAndRestoreFocus가 초점을 실제로 주는 대상은 후자다.
    const host = screen.getByRole("textbox", { name: "Editor" });
    const editable = host.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    );
    if (editable === null) throw new Error("Editable was not mounted");

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    const input = screen.getByRole("textbox", { name: "Link URL" });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Link URL" })).toBeNull();
    expect(document.activeElement).toBe(editable);
  });
});
