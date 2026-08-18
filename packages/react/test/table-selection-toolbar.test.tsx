// @vitest-environment jsdom

import type { EditorController, TableCellSelection } from "@cp949/geul-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider } from "../src/index.js";
import { TableSelectionToolbar } from "../src/table-selection-toolbar.js";

const mergeLabel = "Merge cells";
const splitLabel = "Split cell";

type FakeControllerOptions = {
  getTableCellSelection?: () => TableCellSelection | null;
  mergeTableCells?: EditorController["commands"]["mergeTableCells"];
  splitTableCell?: EditorController["commands"]["splitTableCell"];
};

const fakeController = ({
  getTableCellSelection = () => null,
  mergeTableCells = () => ({ ok: true, value: undefined }),
  splitTableCell = () => ({ ok: true, value: undefined }),
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

describe("셀 범위를 선택하면 병합 툴바를 표시한다", () => {
  it("selectedCell 요소가 있으면 Merge cells 버튼을 보여준다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({ kind: "merge", tableBlockId: "table-1" }),
    });
    const { view, cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: mergeLabel })).not.toBeNull();
    view.unmount();
  });

  it("Merge cells 클릭 시 mergeTableCells(tableBlockId)를 호출한다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({ kind: "merge", tableBlockId: "table-1" }),
    });
    const { view, cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: mergeLabel }));

    expect(controller.commands.mergeTableCells).toHaveBeenCalledWith("table-1");
    view.unmount();
  });

  it("선택된 셀이 없으면 병합 후보라도 표시하지 않는다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({ kind: "merge", tableBlockId: "table-1" }),
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
    view.unmount();
  });
});

describe("병합된 셀에 캐럿을 두면 분할 툴바를 표시한다", () => {
  it("split 후보면 Split cell 버튼을 보여준다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        kind: "split",
        tableBlockId: "table-1",
        cellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: splitLabel })).not.toBeNull();
    view.unmount();
  });

  it("Split cell 클릭 시 splitTableCell(tableBlockId, cellId)를 호출한다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        kind: "split",
        tableBlockId: "table-1",
        cellId: "cell-1",
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
