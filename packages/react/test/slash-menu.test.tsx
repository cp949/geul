// @vitest-environment jsdom

import type { EditorController } from "@cp949/geul-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider, SlashMenu } from "../src/index.js";

type CaretContext = ReturnType<EditorController["getCaretBlockContext"]>;

type FakeControllerOptions = {
  getCaretBlockContext?: () => CaretContext;
  insertParagraphAfter?: EditorController["commands"]["insertParagraphAfter"];
  setBlockType?: EditorController["commands"]["setBlockType"];
};

const fakeController = ({
  getCaretBlockContext = () => null,
  insertParagraphAfter = () => ({
    ok: true,
    value: { blockId: "new-block" },
  }),
  setBlockType = () => ({ ok: true, value: undefined }),
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    const block = document.createElement("p");
    block.setAttribute("data-be-block-id", "block-1");
    block.textContent = "editor text";
    editable.append(block);
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMarks: vi.fn(() => [] as string[]),
  getSelectionLink: vi.fn(() => null),
  getCaretBlockContext: vi.fn(getCaretBlockContext),
  replaceDocument: vi.fn(),
  commands: {
    setText: vi.fn(),
    insertParagraphAfter: vi.fn(insertParagraphAfter),
    setBlockType: vi.fn(setBlockType),
    toggleBold: vi.fn(() => ({ ok: true, value: undefined })),
    toggleItalic: vi.fn(() => ({ ok: true, value: undefined })),
    toggleUnderline: vi.fn(() => ({ ok: true, value: undefined })),
    toggleStrike: vi.fn(() => ({ ok: true, value: undefined })),
    toggleCode: vi.fn(() => ({ ok: true, value: undefined })),
    setLink: vi.fn(),
    unsetLink: vi.fn(),
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

const fireCaretUpdate = () => {
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
};

describe("SlashMenu query popup", () => {
  it("does not render when the caret is not in a block", () => {
    const controller = fakeController();
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );

    expect(screen.queryByRole("listbox")).toBeNull();
    view.unmount();
  });

  it("does not render when the block text is not a slash query", () => {
    const controller = fakeController({
      getCaretBlockContext: () => ({
        blockId: "block-1",
        blockType: { type: "paragraph" },
        text: "hello",
      }),
    });
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    fireCaretUpdate();

    expect(screen.queryByRole("listbox")).toBeNull();
    view.unmount();
  });

  it("opens with every item when the block text is a bare slash", () => {
    const controller = fakeController({
      getCaretBlockContext: () => ({
        blockId: "block-1",
        blockType: { type: "paragraph" },
        text: "/",
      }),
    });
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    fireCaretUpdate();

    expect(screen.getByRole("listbox", { name: "Slash menu" })).not.toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("option", { name: /Text/ })).not.toBeNull();
    expect(screen.getByRole("option", { name: /Heading 1/ })).not.toBeNull();
    view.unmount();
  });

  it("filters items to match the typed query", () => {
    const controller = fakeController({
      getCaretBlockContext: () => ({
        blockId: "block-1",
        blockType: { type: "paragraph" },
        text: "/head",
      }),
    });
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    fireCaretUpdate();

    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.queryByRole("option", { name: /^Text/ })).toBeNull();
    view.unmount();
  });

  it("calls setBlockType with clearContent when an item is clicked", () => {
    const controller = fakeController({
      getCaretBlockContext: () => ({
        blockId: "block-1",
        blockType: { type: "paragraph" },
        text: "/h1",
      }),
    });
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    fireCaretUpdate();

    fireEvent.click(screen.getByRole("option", { name: /Heading 1/ }));

    expect(controller.commands.setBlockType).toHaveBeenCalledWith(
      "block-1",
      { type: "heading", level: 1 },
      { clearContent: true },
    );
    view.unmount();
  });

  it("closes on Escape", () => {
    const controller = fakeController({
      getCaretBlockContext: () => ({
        blockId: "block-1",
        blockType: { type: "paragraph" },
        text: "/",
      }),
    });
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    fireCaretUpdate();
    expect(screen.getByRole("listbox")).not.toBeNull();

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Editor" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("listbox")).toBeNull();
    view.unmount();
  });
});

describe("SlashMenu add-block button", () => {
  it("does not render the add-block button without hover", () => {
    const controller = fakeController();
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );

    expect(screen.queryByRole("button", { name: "Add block" })).toBeNull();
    view.unmount();
  });

  it("shows the add-block button when hovering a block", () => {
    const controller = fakeController();
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    const block = screen
      .getByRole("textbox", { name: "Editor" })
      .querySelector("[data-be-block-id]");
    if (block === null) throw new Error("Block element was not rendered");

    fireEvent.pointerMove(block);

    expect(screen.getByRole("button", { name: "Add block" })).not.toBeNull();
    view.unmount();
  });

  it("keeps the add-block button visible while the pointer moves onto it", () => {
    const controller = fakeController();
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    const block = screen
      .getByRole("textbox", { name: "Editor" })
      .querySelector("[data-be-block-id]");
    if (block === null) throw new Error("Block element was not rendered");
    fireEvent.pointerMove(block);
    const addBlockButton = screen.getByRole("button", { name: "Add block" });

    fireEvent.pointerMove(addBlockButton);

    expect(screen.getByRole("button", { name: "Add block" })).not.toBeNull();
    view.unmount();
  });

  it("inserts a paragraph after the hovered block and opens the menu for it", () => {
    const controller = fakeController({
      insertParagraphAfter: () => ({
        ok: true,
        value: { blockId: "block-2" },
      }),
    });
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    const block = screen
      .getByRole("textbox", { name: "Editor" })
      .querySelector("[data-be-block-id]");
    if (block === null) throw new Error("Block element was not rendered");
    fireEvent.pointerMove(block);

    fireEvent.click(screen.getByRole("button", { name: "Add block" }));

    expect(controller.commands.insertParagraphAfter).toHaveBeenCalledWith(
      "block-1",
    );
    expect(screen.getByRole("listbox", { name: "Slash menu" })).not.toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(4);
    view.unmount();
  });

  it("does not open the menu again once the user types a non-slash character", () => {
    let text = "";
    const controller = fakeController({
      getCaretBlockContext: () => ({
        blockId: "block-2",
        blockType: { type: "paragraph" },
        text,
      }),
      insertParagraphAfter: () => ({
        ok: true,
        value: { blockId: "block-2" },
      }),
    });
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    const block = screen
      .getByRole("textbox", { name: "Editor" })
      .querySelector("[data-be-block-id]");
    if (block === null) throw new Error("Block element was not rendered");
    fireEvent.pointerMove(block);
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    expect(screen.getByRole("listbox")).not.toBeNull();

    text = "a";
    fireCaretUpdate();

    expect(screen.queryByRole("listbox")).toBeNull();
    view.unmount();
  });
});
