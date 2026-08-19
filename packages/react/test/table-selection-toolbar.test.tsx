// @vitest-environment jsdom

import type { EditorController, TableCellSelection } from "@cp949/geul-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider } from "../src/index.js";
import { TableSelectionToolbar } from "../src/table-selection-toolbar.js";

const mergeLabel = "Merge cells";
const splitLabel = "Split cell";
const formatLabel = "Cell formatting";

type FakeControllerOptions = {
  getTableCellSelection?: () => TableCellSelection | null;
  mergeTableCells?: EditorController["commands"]["mergeTableCells"];
  splitTableCell?: EditorController["commands"]["splitTableCell"];
  setTableCellTextColor?: EditorController["commands"]["setTableCellTextColor"];
  setTableCellBackgroundColor?: EditorController["commands"]["setTableCellBackgroundColor"];
};

const fakeController = ({
  getTableCellSelection = () => null,
  mergeTableCells = () => ({ ok: true, value: undefined }),
  splitTableCell = () => ({ ok: true, value: undefined }),
  setTableCellTextColor = () => ({ ok: true, value: undefined }),
  setTableCellBackgroundColor = () => ({ ok: true, value: undefined }),
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    const table = document.createElement("table");
    table.setAttribute("data-be-block-id", "table-1");
    const row = document.createElement("tr");
    row.setAttribute("data-be-row-id", "row-1");
    const cell1 = document.createElement("td");
    cell1.setAttribute("data-be-cell-id", "cell-1");
    cell1.setAttribute("data-be-column-id", "col-1");
    const cell2 = document.createElement("td");
    cell2.setAttribute("data-be-cell-id", "cell-2");
    cell2.setAttribute("data-be-column-id", "col-2");
    row.append(cell1, cell2);
    table.append(row);
    editable.append(table);
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMarks: vi.fn(() => [] as string[]),
  getSelectionLink: vi.fn(() => null),
  getCaretBlockContext: vi.fn(() => null),
  getSelectionBlockType: vi.fn(() => null),
  getTableCellSelection: vi.fn(getTableCellSelection),
  replaceDocument: vi.fn(),
  commands: {
    setText: vi.fn(),
    insertParagraphAfter: vi.fn(() => ({ ok: true, value: { blockId: "x" } })),
    setBlockType: vi.fn(() => ({ ok: true, value: undefined })),
    moveBlockBefore: vi.fn(() => ({ ok: true, value: undefined })),
    duplicateBlock: vi.fn(() => ({ ok: true, value: { blockId: "x" } })),
    deleteBlock: vi.fn(() => ({ ok: true, value: undefined })),
    toggleBold: vi.fn(() => ({ ok: true, value: undefined })),
    toggleItalic: vi.fn(() => ({ ok: true, value: undefined })),
    toggleUnderline: vi.fn(() => ({ ok: true, value: undefined })),
    toggleStrike: vi.fn(() => ({ ok: true, value: undefined })),
    toggleCode: vi.fn(() => ({ ok: true, value: undefined })),
    setLink: vi.fn(),
    unsetLink: vi.fn(),
    insertTable: vi.fn(() => ({ ok: true, value: { blockId: "table-1" } })),
    insertTableRow: vi.fn(),
    insertTableColumn: vi.fn(),
    moveTableRow: vi.fn(),
    moveTableColumn: vi.fn(),
    resizeTableColumn: vi.fn(),
    mergeTableCells: vi.fn(mergeTableCells),
    splitTableCell: vi.fn(splitTableCell),
    toggleTableHeaderRow: vi.fn(() => ({ ok: true, value: undefined })),
    toggleTableHeaderColumn: vi.fn(() => ({ ok: true, value: undefined })),
    deleteTableRow: vi.fn(() => ({ ok: true, value: undefined })),
    deleteTableColumn: vi.fn(() => ({ ok: true, value: undefined })),
    setTableCellTextColor: vi.fn(setTableCellTextColor),
    setTableCellBackgroundColor: vi.fn(setTableCellBackgroundColor),
    setTableCellAlign: vi.fn(() => ({ ok: true, value: undefined })),
    undo: vi.fn(),
    redo: vi.fn(),
  },
});

const stubRect = (
  element: Element,
  rect: { left: number; top: number; width: number; height: number },
) => {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
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

const renderTable = (controller: ReturnType<typeof fakeController>) => {
  const view = render(
    withProvider(
      controller,
      <>
        <TableSelectionToolbar />
        <EditorContent />
      </>,
    ),
  );
  const editable = screen.getByRole("textbox", { name: "Editor" });
  const table = editable.querySelector("table");
  const cell1 = editable.querySelector('[data-be-cell-id="cell-1"]');
  const cell2 = editable.querySelector('[data-be-cell-id="cell-2"]');
  if (table === null || cell1 === null || cell2 === null) {
    throw new Error("Table fixture was not rendered");
  }
  stubRect(cell1, { left: 100, top: 100, width: 100, height: 30 });
  stubRect(cell2, { left: 200, top: 100, width: 100, height: 30 });
  return { view, table, cell1, cell2 };
};

const triggerSelectionChange = () => {
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
};

describe("셀 범위를 선택하면 병합·서식 툴바를 표시한다", () => {
  it("cellIds가 2개 이상(mergeable)이면 Merge cells와 Cell formatting 버튼을 보여준다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1", "cell-2"],
        mergeable: true,
        splitCellId: null,
      }),
    });
    const { view, cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: mergeLabel })).not.toBeNull();
    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
    expect(screen.queryByRole("button", { name: splitLabel })).toBeNull();
    view.unmount();
  });

  it("Merge cells 클릭 시 mergeTableCells(tableBlockId)를 호출한다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1", "cell-2"],
        mergeable: true,
        splitCellId: null,
      }),
    });
    const { view, cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: mergeLabel }));

    expect(controller.commands.mergeTableCells).toHaveBeenCalledWith("table-1");
    view.unmount();
  });

  it("selectedCell 데코레이션이 없으면(경계 계산 불가) 아무 툴바도 표시하지 않는다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1", "cell-2"],
        mergeable: true,
        splitCellId: null,
      }),
    });
    const { view } = renderTable(controller);

    triggerSelectionChange();

    expect(screen.queryByRole("button", { name: mergeLabel })).toBeNull();
    view.unmount();
  });

  it("표 셀 선택이 없으면 아무 툴바도 표시하지 않는다", () => {
    const controller = fakeController({ getTableCellSelection: () => null });
    const { view } = renderTable(controller);

    triggerSelectionChange();

    expect(screen.queryByRole("button", { name: mergeLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: splitLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: formatLabel })).toBeNull();
    view.unmount();
  });

  it("트리플클릭한 병합되지 않은 셀 하나(mergeable=false, splitCellId=null)도 Cell formatting 버튼을 보여준다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: null,
      }),
    });
    const { view, cell1 } = renderTable(controller);
    cell1.classList.add("selectedCell");

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
    expect(screen.queryByRole("button", { name: mergeLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: splitLabel })).toBeNull();
    view.unmount();
  });
});

describe("병합된 셀에 캐럿을 두면 분할·서식 툴바를 표시한다", () => {
  it("splitCellId가 있으면 Split cell과 Cell formatting 버튼을 보여준다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: splitLabel })).not.toBeNull();
    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
    view.unmount();
  });

  it("Split cell 클릭 시 splitTableCell(tableBlockId, cellId)를 호출한다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: splitLabel }));

    expect(controller.commands.splitTableCell).toHaveBeenCalledWith(
      "table-1",
      "cell-1",
    );
    view.unmount();
  });
});

describe("Cell formatting 버튼으로 색상 메뉴를 연다", () => {
  it("클릭하면 Text color/Background color 팔레트가 뜬다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: formatLabel }));

    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();
    view.unmount();
  });

  it('색상 스와치 클릭 시 setTableCellTextColor(tableBlockId, {kind:"cells",cellIds}, color)를 호출하고 메뉴를 닫는다', () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Red" }));

    expect(controller.commands.setTableCellTextColor).toHaveBeenCalledWith(
      "table-1",
      { kind: "cells", cellIds: ["cell-1"] },
      "#D93025",
    );
    expect(screen.queryByRole("menu", { name: "Cell formatting" })).toBeNull();
    view.unmount();
  });

  it("Escape로 서식 메뉴를 닫는다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));
    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(screen.queryByRole("menu", { name: "Cell formatting" })).toBeNull();
    view.unmount();
  });

  it("서식 메뉴 바깥을 클릭하면 초점을 강제로 옮기지 않고 메뉴만 닫는다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));
    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();

    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.append(outsideButton);
    outsideButton.focus();

    fireEvent.pointerDown(outsideButton);

    expect(screen.queryByRole("menu", { name: "Cell formatting" })).toBeNull();
    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
    view.unmount();
  });

  it("서식 메뉴 안(data-be-cell-format-menu)을 클릭하면 닫히지 않는다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));

    const menu = screen.getByRole("menu", { name: "Cell formatting" });
    fireEvent.pointerDown(menu);

    expect(
      screen.queryByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();
    view.unmount();
  });
});
