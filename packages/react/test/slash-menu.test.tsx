// @vitest-environment jsdom

import type { EditorController } from "@cp949/geul-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider, SlashMenu } from "../src/index.js";
import { expectIconOnlyButton } from "./expect-icon-button.js";

// 드래그 핸들 accessible name — 드래그와 클릭(블록 메뉴) 두 동작을 모두 기술한다.
const dragHandleLabel = "Drag to reorder, click for options";

type CaretContext = ReturnType<EditorController["getCaretBlockContext"]>;

type FakeControllerOptions = {
  getCaretBlockContext?: () => CaretContext;
  insertParagraphAfter?: EditorController["commands"]["insertParagraphAfter"];
  setBlockType?: EditorController["commands"]["setBlockType"];
  moveBlockBefore?: EditorController["commands"]["moveBlockBefore"];
  duplicateBlock?: EditorController["commands"]["duplicateBlock"];
  deleteBlock?: EditorController["commands"]["deleteBlock"];
  insertTable?: EditorController["commands"]["insertTable"];
  blockIds?: readonly string[];
  tableBlockIds?: readonly string[];
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
  insertTable = () => ({ ok: true, value: { blockId: "table-1" } }),
  blockIds = ["block-1"],
  tableBlockIds = [],
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
    for (const blockId of tableBlockIds) {
      const table = document.createElement("table");
      table.setAttribute("data-be-block-id", blockId);
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.textContent = "cell text";
      row.append(cell);
      table.append(row);
      editable.append(table);
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
    insertTable: vi.fn(insertTable),
    insertTableRow: vi.fn(() => ({ ok: true, value: undefined })),
    insertTableColumn: vi.fn(() => ({ ok: true, value: undefined })),
    moveTableRow: vi.fn(() => ({ ok: true, value: undefined })),
    moveTableColumn: vi.fn(() => ({ ok: true, value: undefined })),
    resizeTableColumn: vi.fn(() => ({ ok: true, value: undefined })),
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
    expect(screen.getAllByRole("option")).toHaveLength(5);
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

  it("표 항목을 클릭하면 트리거 블록 텍스트를 지우며 3x3 표를 삽입한다", () => {
    const controller = fakeController({
      getCaretBlockContext: () => ({
        blockId: "block-1",
        blockType: { type: "paragraph" },
        text: "/table",
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

    fireEvent.click(screen.getByRole("option", { name: /Table/ }));

    expect(controller.commands.insertTable).toHaveBeenCalledWith(
      "block-1",
      { rows: 3, columns: 3 },
      { clearAfterBlockText: true },
    );
    expect(screen.queryByRole("listbox")).toBeNull();
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
    expect(screen.getAllByRole("option")).toHaveLength(5);
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
      screen.getByRole("button", { name: dragHandleLabel }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add block" })).not.toBeNull();
    view.unmount();
  });

  it("표 위에 hover해도 블록 거터(드래그 핸들·add-block 버튼)를 표시하지 않는다", () => {
    // 표는 table-handles.tsx가 자체 행/열 핸들을 갖는다. BlockSideMenu가
    // 표에도 반응하면 두 오버레이의 gutter가 같은 좌표 부근에 겹쳐 렌더돼
    // 실 브라우저에서 표 행 핸들 클릭이 block-side-menu의 "Add block"
    // 버튼으로 새는 결함이 있었다(e2e에서만 재현, jsdom hit-test로는 못 잡음).
    const controller = fakeController({
      blockIds: [],
      tableBlockIds: ["table-1"],
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
    const table = screen
      .getByRole("textbox", { name: "Editor" })
      .querySelector("table[data-be-block-id]");
    if (table === null) throw new Error("Table element was not rendered");

    fireEvent.pointerMove(table);

    expect(screen.queryByRole("button", { name: dragHandleLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add block" })).toBeNull();
    view.unmount();
  });

  it("따옴표·백슬래시가 든 블록 id에서도 hover 거터가 크래시 없이 표시된다", () => {
    // 블록 id는 z.string() 임의 문자열이라 attribute selector에 보간하면
    // 따옴표·백슬래시에서 querySelector가 SyntaxError를 던진다.
    const controller = fakeController({ blockIds: ['a"b\\c'] });
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

  it("드래그 핸들과 블록 추가 버튼에 aria-hidden 아이콘과 title을 부여한다", () => {
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

    const expectedButtons = [
      { label: dragHandleLabel, iconClass: "lucide-grip-vertical" },
      { label: "Add block", iconClass: "lucide-plus" },
    ];
    for (const { label, iconClass } of expectedButtons) {
      expectIconOnlyButton(
        screen.getByRole("button", { name: label }),
        label,
        iconClass,
      );
    }
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
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientY: 5 });

    expect(
      view.container.querySelector("[data-be-block-insertion-guide]"),
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
    const handle = screen.getByRole("button", { name: dragHandleLabel });
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
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      view.container.querySelector("[data-be-block-insertion-guide]"),
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
    const handle = screen.getByRole("button", { name: dragHandleLabel });
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
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 0,
      clientY: 50,
    });
    fireEvent.pointerMove(editable, { pointerId: 2, clientX: 0, clientY: 5 });
    fireEvent.pointerUp(editable, { pointerId: 2 });

    expect(
      view.container.querySelector("[data-be-block-insertion-guide]"),
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
    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));
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

    fireEvent.click(screen.getByRole("button", { name: dragHandleLabel }));

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
