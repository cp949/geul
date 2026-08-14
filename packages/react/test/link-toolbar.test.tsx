// @vitest-environment jsdom

import type { EditorController } from "@cp949/geul-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider, LinkToolbar } from "../src/index.js";

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
    editable.contentEditable = "true";
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
  const view = render(
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
  return view;
};

describe("LinkToolbar", () => {
  it("does not render without a selection or an active link", () => {
    const controller = fakeController();
    const view = render(withProvider(controller, <LinkToolbar />));

    expect(screen.queryByRole("toolbar")).toBeNull();
    view.unmount();
  });

  it("shows an add-link control when text is selected without an existing link", () => {
    const controller = fakeController();
    const view = renderWithSelectedText(controller);

    expect(screen.getByRole("toolbar", { name: "Link" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add link" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Remove link" })).toBeNull();
    view.unmount();
  });

  it("shows open, edit and remove controls when the cursor is inside an existing link", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    const view = render(
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
    view.unmount();
  });

  it("creates a link from the add-link control", () => {
    const controller = fakeController();
    const view = renderWithSelectedText(controller);

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Link URL" }), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(controller.commands.setLink).toHaveBeenCalledWith(
      "https://example.com",
    );
    view.unmount();
  });

  it("shows a rejection message when the link URL is not allowed", () => {
    const controller = fakeController({
      setLink: () => ({
        ok: false,
        error: { code: "LINK_HREF_REJECTED" },
      }),
    });
    const view = renderWithSelectedText(controller);

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Link URL" }), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Link URL" })).not.toBeNull();
    view.unmount();
  });

  it("removes the link from the remove control", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    const view = render(
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
    view.unmount();
  });

  it("edits an existing link's href", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    const view = render(
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
    view.unmount();
  });

  it("closes without applying when an existing href is unchanged", () => {
    const controller = fakeController({
      getSelectionLink: () => ({ href: "https://example.com" }),
    });
    const view = render(
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
    view.unmount();
  });

  it("hides when the selection collapses and there is no active link", () => {
    const controller = fakeController();
    const view = renderWithSelectedText(controller);
    expect(screen.queryByRole("toolbar")).not.toBeNull();

    collapseSelection();

    expect(screen.queryByRole("toolbar")).toBeNull();
    view.unmount();
  });

  it("keeps the URL input open while a selectionchange fires during editing", () => {
    const controller = fakeController();
    const view = renderWithSelectedText(controller);

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    collapseSelection();

    expect(screen.getByRole("textbox", { name: "Link URL" })).not.toBeNull();
    view.unmount();
  });
});
