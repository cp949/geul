// @vitest-environment jsdom

import type { EditorController } from "@cp949/geul-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  EditorContent,
  EditorProvider,
  FormattingToolbar,
} from "../src/index.js";

type SelectionBlockType = {
  blockId: string;
  blockType: { type: "paragraph" } | { type: "heading"; level: 1 | 2 | 3 };
} | null;

const fakeController = (
  getSelectionMarks = vi.fn(() => [] as string[]),
  getSelectionBlockType = vi.fn(
    (): SelectionBlockType => ({
      blockId: "block-1",
      blockType: { type: "paragraph" },
    }),
  ),
  setBlockType = vi.fn(() => ({ ok: true, value: undefined })),
) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.textContent = "editor text";
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMarks,
  getSelectionBlockType,
  replaceDocument: vi.fn(),
  commands: {
    setText: vi.fn(),
    setBlockType,
    toggleBold: vi.fn(() => ({ ok: true, value: undefined })),
    toggleItalic: vi.fn(() => ({ ok: true, value: undefined })),
    toggleUnderline: vi.fn(() => ({ ok: true, value: undefined })),
    toggleStrike: vi.fn(() => ({ ok: true, value: undefined })),
    toggleCode: vi.fn(() => ({ ok: true, value: undefined })),
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

describe("FormattingToolbar", () => {
  it("does not render without an active text selection", () => {
    const controller = fakeController();
    const view = render(withProvider(controller, <FormattingToolbar />));

    expect(screen.queryByRole("toolbar")).toBeNull();
    view.unmount();
  });

  it("shows toggle buttons reflecting active marks when text is selected", () => {
    const controller = fakeController(vi.fn(() => ["bold"]));
    const view = render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (textNode === null) throw new Error("Text node was not rendered");

    selectText(textNode, 0, 8);

    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    expect(toolbar).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Italic" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    view.unmount();
  });

  it("calls the matching core command when a toggle button is clicked", () => {
    const controller = fakeController();
    const view = render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (textNode === null) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    fireEvent.click(screen.getByRole("button", { name: "Underline" }));

    expect(controller.commands.toggleBold).toHaveBeenCalledOnce();
    expect(controller.commands.toggleUnderline).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("hides when the selection collapses", () => {
    const controller = fakeController();
    const view = render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (textNode === null) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);
    expect(screen.queryByRole("toolbar")).not.toBeNull();

    collapseSelection();

    expect(screen.queryByRole("toolbar")).toBeNull();
    view.unmount();
  });

  it("shows a block type select reflecting the current block type", () => {
    const controller = fakeController();
    const view = render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (textNode === null) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    expect(
      (
        screen.getByRole("combobox", {
          name: "Block type",
        }) as HTMLSelectElement
      ).value,
    ).toBe("paragraph");
    view.unmount();
  });

  it("shows the heading level in the block type select", () => {
    const controller = fakeController(
      vi.fn(() => []),
      vi.fn(() => ({
        blockId: "block-1",
        blockType: { type: "heading", level: 2 },
      })),
    );
    const view = render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (textNode === null) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    expect(
      (
        screen.getByRole("combobox", {
          name: "Block type",
        }) as HTMLSelectElement
      ).value,
    ).toBe("heading-2");
    view.unmount();
  });

  it("calls setBlockType when the block type select changes", () => {
    const controller = fakeController();
    const view = render(
      withProvider(
        controller,
        <>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
      ?.firstChild;
    if (textNode === null) throw new Error("Text node was not rendered");
    selectText(textNode, 0, 8);

    fireEvent.change(screen.getByRole("combobox", { name: "Block type" }), {
      target: { value: "heading-1" },
    });

    expect(controller.commands.setBlockType).toHaveBeenCalledWith("block-1", {
      type: "heading",
      level: 1,
    });
    view.unmount();
  });

  it("stays hidden when text outside its editor is selected", () => {
    const controller = fakeController();
    const view = render(
      withProvider(
        controller,
        <>
          <p data-testid="outside">outside text</p>
          <FormattingToolbar />
          <EditorContent />
        </>,
      ),
    );
    const textNode = screen.getByTestId("outside").firstChild;
    if (textNode === null) throw new Error("Text node was not rendered");

    selectText(textNode, 0, 7);

    expect(screen.queryByRole("toolbar")).toBeNull();
    view.unmount();
  });
});
