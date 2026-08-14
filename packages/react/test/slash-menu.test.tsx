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
  moveBlockBefore?: EditorController["commands"]["moveBlockBefore"];
  duplicateBlock?: EditorController["commands"]["duplicateBlock"];
  deleteBlock?: EditorController["commands"]["deleteBlock"];
  blockIds?: readonly string[];
};

const fakeController = ({
  getCaretBlockContext = () => null,
  insertParagraphAfter = () => ({
    ok: true,
    value: { blockId: "new-block" },
  }),
  setBlockType = () => ({ ok: true, value: undefined }),
  moveBlockBefore = () => ({ ok: true, value: undefined }),
  duplicateBlock = () => ({ ok: true, value: { blockId: "new-block" } }),
  deleteBlock = () => ({ ok: true, value: undefined }),
  blockIds = ["block-1"],
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    for (const blockId of blockIds) {
      const block = document.createElement("p");
      block.setAttribute("data-be-block-id", blockId);
      block.textContent = "editor text";
      editable.append(block);
    }
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
    moveBlockBefore: vi.fn(moveBlockBefore),
    duplicateBlock: vi.fn(duplicateBlock),
    deleteBlock: vi.fn(deleteBlock),
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

// jsdom은 Pointer Capture API를 구현하지 않는다. 드래그 핸들이 pointerdown에서
// 호출하므로 테스트 환경에서만 no-op으로 채운다.
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}

const stubBlockRect = (
  block: Element,
  rect: { top: number; height: number },
) => {
  block.getBoundingClientRect = () =>
    ({
      ...rect,
      left: 0,
      bottom: rect.top + rect.height,
      right: 0,
      width: 0,
      x: 0,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
};

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

describe("SlashMenu drag handle", () => {
  it("hover 시 add-block 버튼과 함께 드래그 핸들을 표시한다", () => {
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

    expect(
      screen.getByRole("button", { name: "Drag to reorder" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add block" })).not.toBeNull();
    view.unmount();
  });

  it("핸들을 드래그해 다른 블록 앞에 놓으면 삽입 가이드를 표시하고 moveBlockBefore를 호출한다", () => {
    const controller = fakeController({
      blockIds: ["block-1", "block-2", "block-3"],
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
    const editable = screen.getByRole("textbox", { name: "Editor" });
    const blocks = Array.from(editable.querySelectorAll("[data-be-block-id]"));
    expect(blocks).toHaveLength(3);
    const [block1, block2, block3] = blocks;
    if (block1 === undefined || block2 === undefined || block3 === undefined) {
      throw new Error("Block elements were not rendered");
    }
    stubBlockRect(block1, { top: 0, height: 20 });
    stubBlockRect(block2, { top: 20, height: 20 });
    stubBlockRect(block3, { top: 40, height: 20 });

    fireEvent.pointerMove(block3);
    const handle = screen.getByRole("button", { name: "Drag to reorder" });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientY: 5 });

    expect(
      view.container.querySelector(".be-block-insertion-guide"),
    ).not.toBeNull();

    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(controller.commands.moveBlockBefore).toHaveBeenCalledWith(
      "block-3",
      "block-1",
    );
    view.unmount();
  });

  it("자기 자신의 현재 위치로 드래그하면 moveBlockBefore를 호출하지 않는다", () => {
    const controller = fakeController({ blockIds: ["block-1", "block-2"] });
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    const editable = screen.getByRole("textbox", { name: "Editor" });
    const blocks = Array.from(editable.querySelectorAll("[data-be-block-id]"));
    const [block1, block2] = blocks;
    if (block1 === undefined || block2 === undefined) {
      throw new Error("Block elements were not rendered");
    }
    stubBlockRect(block1, { top: 0, height: 20 });
    stubBlockRect(block2, { top: 20, height: 20 });

    fireEvent.pointerMove(block1);
    const handle = screen.getByRole("button", { name: "Drag to reorder" });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientY: 5 });
    fireEvent.pointerUp(editable, { pointerId: 1 });
    fireEvent.click(handle, { detail: 1 });

    expect(controller.commands.moveBlockBefore).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "Block menu" })).toBeNull();
    view.unmount();
  });

  it("Escape로 드롭 없이 드래그를 취소하면 아무 명령도 호출하지 않는다", async () => {
    const controller = fakeController({ blockIds: ["block-1", "block-2"] });
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    const editable = screen.getByRole("textbox", { name: "Editor" });
    const blocks = Array.from(editable.querySelectorAll("[data-be-block-id]"));
    const [block1, block2] = blocks;
    if (block1 === undefined || block2 === undefined) {
      throw new Error("Block elements were not rendered");
    }
    stubBlockRect(block1, { top: 0, height: 20 });
    stubBlockRect(block2, { top: 20, height: 20 });

    fireEvent.pointerMove(block2);
    const handle = screen.getByRole("button", { name: "Drag to reorder" });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      view.container.querySelector(".be-block-insertion-guide"),
    ).toBeNull();

    fireEvent.pointerUp(handle, { pointerId: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    fireEvent.click(handle, { detail: 1 });

    expect(controller.commands.moveBlockBefore).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "Block menu" })).toBeNull();
    view.unmount();
  });

  it("pointercancel 뒤 후속 click이 블록 메뉴를 열지 않는다", async () => {
    const controller = fakeController({ blockIds: ["block-1", "block-2"] });
    const view = render(
      withProvider(
        controller,
        <>
          <SlashMenu />
          <EditorContent />
        </>,
      ),
    );
    const editable = screen.getByRole("textbox", { name: "Editor" });
    const blocks = Array.from(editable.querySelectorAll("[data-be-block-id]"));
    const [block1, block2] = blocks;
    if (block1 === undefined || block2 === undefined) {
      throw new Error("Block elements were not rendered");
    }
    stubBlockRect(block1, { top: 0, height: 20 });
    stubBlockRect(block2, { top: 20, height: 20 });

    fireEvent.pointerMove(block2);
    const handle = screen.getByRole("button", { name: "Drag to reorder" });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    fireEvent.click(handle, { detail: 1 });

    expect(controller.commands.moveBlockBefore).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "Block menu" })).toBeNull();
    view.unmount();
  });

  it("드래그를 시작한 pointer와 다른 pointer 이벤트는 무시한다", () => {
    const controller = fakeController({
      blockIds: ["block-1", "block-2", "block-3"],
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
    const editable = screen.getByRole("textbox", { name: "Editor" });
    const blocks = Array.from(editable.querySelectorAll("[data-be-block-id]"));
    const [block1, block2, block3] = blocks;
    if (block1 === undefined || block2 === undefined || block3 === undefined) {
      throw new Error("Block elements were not rendered");
    }
    stubBlockRect(block1, { top: 0, height: 20 });
    stubBlockRect(block2, { top: 20, height: 20 });
    stubBlockRect(block3, { top: 40, height: 20 });

    fireEvent.pointerMove(block3);
    const handle = screen.getByRole("button", { name: "Drag to reorder" });
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 0,
      clientY: 50,
    });
    fireEvent.pointerMove(editable, { pointerId: 2, clientX: 0, clientY: 5 });
    fireEvent.pointerUp(editable, { pointerId: 2 });

    expect(
      view.container.querySelector(".be-block-insertion-guide"),
    ).toBeNull();
    expect(controller.commands.moveBlockBefore).not.toHaveBeenCalled();

    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 0, clientY: 5 });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(controller.commands.moveBlockBefore).toHaveBeenCalledWith(
      "block-3",
      "block-1",
    );
    view.unmount();
  });
});

describe("SlashMenu block menu", () => {
  const openBlockMenu = () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Drag to reorder" }));
    return { controller, view };
  };

  it("핸들 클릭 시 종류 변경/복제/삭제 메뉴를 연다", () => {
    const { view } = openBlockMenu();

    expect(screen.getByRole("menu", { name: "Block menu" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Heading 1" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Delete" })).not.toBeNull();
    view.unmount();
  });

  it("같은 핸들을 다시 클릭하면 메뉴를 닫는다", () => {
    const { view } = openBlockMenu();

    fireEvent.click(screen.getByRole("button", { name: "Drag to reorder" }));

    expect(screen.queryByRole("menu")).toBeNull();
    view.unmount();
  });

  it("종류 변경 항목을 클릭하면 setBlockType을 호출하고 메뉴를 닫는다", () => {
    const { controller, view } = openBlockMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Heading 2" }));

    expect(controller.commands.setBlockType).toHaveBeenCalledWith("block-1", {
      type: "heading",
      level: 2,
    });
    expect(screen.queryByRole("menu")).toBeNull();
    view.unmount();
  });

  it("복제 항목을 클릭하면 duplicateBlock을 호출하고 메뉴를 닫는다", () => {
    const { controller, view } = openBlockMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    expect(controller.commands.duplicateBlock).toHaveBeenCalledWith("block-1");
    expect(screen.queryByRole("menu")).toBeNull();
    view.unmount();
  });

  it("삭제 항목을 클릭하면 deleteBlock을 호출하고 메뉴를 닫는다", () => {
    const { controller, view } = openBlockMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(controller.commands.deleteBlock).toHaveBeenCalledWith("block-1");
    expect(screen.queryByRole("menu")).toBeNull();
    view.unmount();
  });

  it("Escape를 누르면 메뉴를 닫는다", () => {
    const { view } = openBlockMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    view.unmount();
  });

  it("메뉴 바깥을 클릭하면 메뉴를 닫는다", () => {
    const { view } = openBlockMenu();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu")).toBeNull();
    view.unmount();
  });
});
