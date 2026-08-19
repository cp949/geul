// @vitest-environment jsdom

import type { EditorController } from "@cp949/geul-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider } from "../src/index.js";
import { TableHandles } from "../src/table-handles.js";

const rowHandleLabel = "Drag to reorder row, click for options";
const columnHandleLabel = "Drag to reorder column, click for options";
const addRowLabel = "Add row";
const addColumnLabel = "Add column";

if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}

type FakeControllerOptions = {
  moveTableRow?: EditorController["commands"]["moveTableRow"];
  moveTableColumn?: EditorController["commands"]["moveTableColumn"];
  resizeTableColumn?: EditorController["commands"]["resizeTableColumn"];
  insertTableRow?: EditorController["commands"]["insertTableRow"];
  insertTableColumn?: EditorController["commands"]["insertTableColumn"];
};

const ok = () => ({ ok: true, value: undefined }) as const;

const fakeController = ({
  moveTableRow = () => ({ ok: true, value: undefined }),
  moveTableColumn = () => ({ ok: true, value: undefined }),
  resizeTableColumn = () => ({ ok: true, value: undefined }),
  insertTableRow = () => ({ ok: true, value: undefined }),
  insertTableColumn = () => ({ ok: true, value: undefined }),
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    const table = document.createElement("table");
    table.setAttribute("data-be-block-id", "table-1");
    // 실제 에디터의 renderHTML(applyTableDomAttributes)과 동일하게 열
    // 순서·개수의 권위를 data-be-columns로 노출한다(PIT-0004).
    table.setAttribute(
      "data-be-columns",
      JSON.stringify([
        { id: "col-1", width: 120 },
        { id: "col-2", width: 100 },
      ]),
    );
    // 실제 에디터의 renderHTML과 동일하게 모델 열 너비를 colgroup/col로 노출한다.
    const colgroup = document.createElement("colgroup");
    for (const width of [120, 100]) {
      const col = document.createElement("col");
      col.style.width = `${width}px`;
      colgroup.append(col);
    }
    table.append(colgroup);
    const row1 = document.createElement("tr");
    row1.setAttribute("data-be-row-id", "row-1");
    const cell1 = document.createElement("td");
    cell1.setAttribute("data-be-column-id", "col-1");
    const cell2 = document.createElement("td");
    cell2.setAttribute("data-be-column-id", "col-2");
    row1.append(cell1, cell2);
    const row2 = document.createElement("tr");
    row2.setAttribute("data-be-row-id", "row-2");
    const cell3 = document.createElement("td");
    cell3.setAttribute("data-be-column-id", "col-1");
    const cell4 = document.createElement("td");
    cell4.setAttribute("data-be-column-id", "col-2");
    row2.append(cell3, cell4);
    table.append(row1, row2);
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
    insertTableRow: vi.fn(insertTableRow),
    insertTableColumn: vi.fn(insertTableColumn),
    moveTableRow: vi.fn(moveTableRow),
    moveTableColumn: vi.fn(moveTableColumn),
    resizeTableColumn: vi.fn(resizeTableColumn),
    deleteTableRow: vi.fn(ok),
    deleteTableColumn: vi.fn(ok),
    toggleTableHeaderRow: vi.fn(ok),
    toggleTableHeaderColumn: vi.fn(ok),
    setTableCellTextColor: vi.fn(ok),
    setTableCellBackgroundColor: vi.fn(ok),
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
        <TableHandles />
        <EditorContent />
      </>,
    ),
  );
  const editable = screen.getByRole("textbox", { name: "Editor" });
  const table = editable.querySelector("table");
  if (table === null) throw new Error("Table was not rendered");
  stubRect(table, { left: 100, top: 100, width: 200, height: 60 });
  const rows = Array.from(table.querySelectorAll("[data-be-row-id]"));
  const [row1, row2] = rows;
  if (row1 === undefined || row2 === undefined) {
    throw new Error("Rows were not rendered");
  }
  stubRect(row1, { left: 100, top: 100, width: 200, height: 30 });
  stubRect(row2, { left: 100, top: 130, width: 200, height: 30 });
  const firstRowCells = Array.from(
    row1.querySelectorAll("[data-be-column-id]"),
  );
  const [cell1, cell2] = firstRowCells;
  if (cell1 === undefined || cell2 === undefined) {
    throw new Error("Cells were not rendered");
  }
  stubRect(cell1, { left: 100, top: 100, width: 100, height: 30 });
  stubRect(cell2, { left: 200, top: 100, width: 100, height: 30 });
  return { view, table, editable };
};

describe("표 위에 hover하면 핸들을 표시한다", () => {
  it("행 핸들과 열 핸들, 빠른 확장 버튼을 함께 표시한다", () => {
    const controller = fakeController();
    const { view, table } = renderTable(controller);

    fireEvent.pointerMove(table);

    expect(
      screen.getAllByRole("button", { name: rowHandleLabel }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: columnHandleLabel }),
    ).toHaveLength(2);
    expect(screen.getByRole("button", { name: addRowLabel })).not.toBeNull();
    expect(screen.getByRole("button", { name: addColumnLabel })).not.toBeNull();
    view.unmount();
  });

  it("표 밖으로 나가면 핸들을 숨긴다", () => {
    const controller = fakeController();
    const { view, table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    expect(screen.queryByRole("button", { name: addRowLabel })).not.toBeNull();

    fireEvent.pointerMove(editable);

    expect(screen.queryByRole("button", { name: addRowLabel })).toBeNull();
    view.unmount();
  });

  it("표와 핸들 사이 여백으로 이동해도 핸들이 유지된다", () => {
    const controller = fakeController();
    const { view, table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    expect(screen.queryByRole("button", { name: addRowLabel })).not.toBeNull();

    // 표 왼쪽 경계(100)와 행 핸들(76~96) 사이의 여백 지점.
    fireEvent.pointerMove(editable, { clientX: 98, clientY: 110 });

    expect(screen.queryByRole("button", { name: addRowLabel })).not.toBeNull();
    view.unmount();
  });
});

describe("행/열 핸들을 드래그해 재정렬한다", () => {
  it("행 핸들을 두 번째 행 아래로 드래그하면 moveTableRow(0, 1)을 호출한다", () => {
    const controller = fakeController();
    const { view, table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientY: 150 });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(controller.commands.moveTableRow).toHaveBeenCalledWith(
      "table-1",
      0,
      1,
    );
    view.unmount();
  });

  it("열 핸들을 두 번째 열 오른쪽으로 드래그하면 moveTableColumn(0, 1)을 호출한다", () => {
    const controller = fakeController();
    const { view, table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const [firstColumnHandle] = screen.getAllByRole("button", {
      name: columnHandleLabel,
    });
    if (firstColumnHandle === undefined) throw new Error("열 핸들 없음");

    fireEvent.pointerDown(firstColumnHandle, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 250 });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(controller.commands.moveTableColumn).toHaveBeenCalledWith(
      "table-1",
      0,
      1,
    );
    view.unmount();
  });

  it("제자리로 되돌리면 moveTableRow를 호출하지 않는다", () => {
    const controller = fakeController();
    const { view, table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientY: 105 });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(controller.commands.moveTableRow).not.toHaveBeenCalled();
    view.unmount();
  });

  it("Escape로 드래그를 취소하면 아무 명령도 호출하지 않는다", () => {
    const controller = fakeController();
    const { view, table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientY: 150 });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(controller.commands.moveTableRow).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe("열 경계를 드래그해 너비를 조절한다", () => {
  it("드래그 중에는 명령을 호출하지 않고 pointer-up에 한 번만 resizeTableColumn을 호출한다", () => {
    const controller = fakeController();
    const { view, table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const resizeHandle = document.querySelector(
      "[data-be-table-resize-handle]",
    );
    if (resizeHandle === null) throw new Error("resize 핸들 없음");

    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 240 });
    expect(controller.commands.resizeTableColumn).not.toHaveBeenCalled();

    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 260 });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    // 시작 너비는 셀 rect(100px)가 아닌 colgroup col의 모델 너비(120px)에서
    // 시드된다 — 콘텐츠가 렌더 너비를 강제로 벌려도 저장 너비가 튀지 않는다.
    expect(controller.commands.resizeTableColumn).toHaveBeenCalledTimes(1);
    expect(controller.commands.resizeTableColumn).toHaveBeenCalledWith(
      "table-1",
      0,
      180,
    );
    view.unmount();
  });

  it("드래그 중에는 col 요소의 너비를 프레임 단위로 시각 갱신한다", async () => {
    const controller = fakeController();
    const { view, table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const resizeHandle = document.querySelector(
      "[data-be-table-resize-handle]",
    );
    if (resizeHandle === null) throw new Error("resize 핸들 없음");

    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 260 });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const col = table.querySelector<HTMLElement>("colgroup col");
    expect(col?.style.width).toBe("180px");
    expect(controller.commands.resizeTableColumn).not.toHaveBeenCalled();

    fireEvent.pointerUp(editable, { pointerId: 1 });
    view.unmount();
  });

  it("Escape로 리사이즈를 취소하면 명령을 호출하지 않고 원래 너비로 복원한다", async () => {
    const controller = fakeController();
    const { view, table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const resizeHandle = document.querySelector(
      "[data-be-table-resize-handle]",
    );
    if (resizeHandle === null) throw new Error("resize 핸들 없음");

    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 260 });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    const col = table.querySelector<HTMLElement>("colgroup col");
    expect(col?.style.width).toBe("120px");
    expect(controller.commands.resizeTableColumn).not.toHaveBeenCalled();
    view.unmount();
  });

  it("최소 너비 아래로는 조절하지 않는다", () => {
    const controller = fakeController();
    const { view, table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const resizeHandle = document.querySelector(
      "[data-be-table-resize-handle]",
    );
    if (resizeHandle === null) throw new Error("resize 핸들 없음");

    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: -1000 });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(controller.commands.resizeTableColumn).toHaveBeenCalledWith(
      "table-1",
      0,
      48,
    );
    view.unmount();
  });
});

describe("표 오른쪽/아래쪽 빠른 확장 컨트롤", () => {
  it("Add row 클릭 시 마지막 행 뒤에 행을 추가한다", () => {
    const controller = fakeController();
    const { view, table } = renderTable(controller);
    fireEvent.pointerMove(table);

    fireEvent.click(screen.getByRole("button", { name: addRowLabel }));

    expect(controller.commands.insertTableRow).toHaveBeenCalledWith(
      "table-1",
      2,
    );
    view.unmount();
  });

  it("Add column 클릭 시 마지막 열 뒤에 열을 추가한다", () => {
    const controller = fakeController();
    const { view, table } = renderTable(controller);
    fireEvent.pointerMove(table);

    fireEvent.click(screen.getByRole("button", { name: addColumnLabel }));

    expect(controller.commands.insertTableColumn).toHaveBeenCalledWith(
      "table-1",
      2,
    );
    view.unmount();
  });
});

describe("첫 행이 병합된 표의 열 geometry", () => {
  // 첫 행이 colspan=2로 병합되면 그 행에는 열마다 하나씩인 [data-be-column-id]
  // 셀이 없다 — 첫 행만 보고 열 경계를 읽으면 두 번째 열 핸들이 사라진다.
  // 병합되지 않은 둘째 행의 셀 rect로 geometry를 복구해야 한다(PIT-0004).
  const fakeControllerWithMergedFirstRow = () => ({
    ...fakeController(),
    mount: vi.fn((element: HTMLElement) => {
      const editable = document.createElement("div");
      editable.contentEditable = "true";
      const table = document.createElement("table");
      table.setAttribute("data-be-block-id", "table-1");
      table.setAttribute(
        "data-be-columns",
        JSON.stringify([
          { id: "col-1", width: 120 },
          { id: "col-2", width: 100 },
        ]),
      );
      const colgroup = document.createElement("colgroup");
      for (const width of [120, 100]) {
        const col = document.createElement("col");
        col.style.width = `${width}px`;
        colgroup.append(col);
      }
      table.append(colgroup);

      const row1 = document.createElement("tr");
      row1.setAttribute("data-be-row-id", "row-1");
      const mergedCell = document.createElement("td");
      mergedCell.setAttribute("data-be-column-id", "col-1");
      mergedCell.setAttribute("colspan", "2");
      row1.append(mergedCell);

      const row2 = document.createElement("tr");
      row2.setAttribute("data-be-row-id", "row-2");
      const cell3 = document.createElement("td");
      cell3.setAttribute("data-be-column-id", "col-1");
      const cell4 = document.createElement("td");
      cell4.setAttribute("data-be-column-id", "col-2");
      row2.append(cell3, cell4);

      table.append(row1, row2);
      editable.append(table);
      element.append(editable);
    }),
  });

  it("둘째 열 핸들이 둘째 행의 비병합 셀 경계에 위치한다", () => {
    const controller = fakeControllerWithMergedFirstRow();
    const view = render(
      withProvider(
        controller as unknown as ReturnType<typeof fakeController>,
        <>
          <TableHandles />
          <EditorContent />
        </>,
      ),
    );
    const editable = screen.getByRole("textbox", { name: "Editor" });
    const table = editable.querySelector("table");
    if (table === null) throw new Error("Table was not rendered");
    stubRect(table, { left: 100, top: 100, width: 200, height: 60 });
    const [row1, row2] = Array.from(table.querySelectorAll("[data-be-row-id]"));
    if (row1 === undefined || row2 === undefined) {
      throw new Error("Rows were not rendered");
    }
    stubRect(row1, { left: 100, top: 100, width: 200, height: 30 });
    stubRect(row2, { left: 100, top: 130, width: 200, height: 30 });
    const [mergedCell] = Array.from(
      row1.querySelectorAll("[data-be-column-id]"),
    );
    const [cell3, cell4] = Array.from(
      row2.querySelectorAll("[data-be-column-id]"),
    );
    if (
      mergedCell === undefined ||
      cell3 === undefined ||
      cell4 === undefined
    ) {
      throw new Error("Cells were not rendered");
    }
    stubRect(mergedCell, { left: 100, top: 100, width: 200, height: 30 });
    stubRect(cell3, { left: 100, top: 130, width: 100, height: 30 });
    stubRect(cell4, { left: 200, top: 130, width: 100, height: 30 });

    fireEvent.pointerMove(table);

    const columnHandles = screen.getAllByRole("button", {
      name: columnHandleLabel,
    });
    expect(columnHandles).toHaveLength(2);
    // 열 핸들은 열 중앙(left + width/2 - 10)에 놓인다 — 둘째 열(cell4:
    // left 200, width 100)이면 240이어야 한다. 첫 행만 봤다면 둘째 열
    // 핸들 자체가 없어 이 값이 나올 수 없었다.
    expect((columnHandles[1] as HTMLElement).style.left).toBe("240px");
    view.unmount();
  });

  it("병합 셀이 가로지르는 행에는 리사이즈 strip을 그리지 않는다", () => {
    const controller = fakeControllerWithMergedFirstRow();
    const view = render(
      withProvider(
        controller as unknown as ReturnType<typeof fakeController>,
        <>
          <TableHandles />
          <EditorContent />
        </>,
      ),
    );
    const editable = screen.getByRole("textbox", { name: "Editor" });
    const table = editable.querySelector("table");
    if (table === null) throw new Error("Table was not rendered");
    stubRect(table, { left: 100, top: 100, width: 200, height: 60 });
    const [row1, row2] = Array.from(table.querySelectorAll("[data-be-row-id]"));
    if (row1 === undefined || row2 === undefined) {
      throw new Error("Rows were not rendered");
    }
    stubRect(row1, { left: 100, top: 100, width: 200, height: 30 });
    stubRect(row2, { left: 100, top: 130, width: 200, height: 30 });
    const [mergedCell] = Array.from(
      row1.querySelectorAll("[data-be-column-id]"),
    );
    const [cell3, cell4] = Array.from(
      row2.querySelectorAll("[data-be-column-id]"),
    );
    if (
      mergedCell === undefined ||
      cell3 === undefined ||
      cell4 === undefined
    ) {
      throw new Error("Cells were not rendered");
    }
    stubRect(mergedCell, { left: 100, top: 100, width: 200, height: 30 });
    stubRect(cell3, { left: 100, top: 130, width: 100, height: 30 });
    stubRect(cell4, { left: 200, top: 130, width: 100, height: 30 });

    fireEvent.pointerMove(table);

    // 첫 열 경계(x=200)는 병합된 첫 행에서는 셀 경계가 아니다 — 그 행에
    // strip을 그리면 병합 셀 한가운데 클릭이 리사이즈 드래그로 가로채인다
    // (PIT-0010). 둘째 행 구간만 남아야 한다.
    const handles = Array.from(
      document.querySelectorAll<HTMLElement>("[data-be-table-resize-handle]"),
    );
    const firstBoundary = handles.filter(
      (handle) => handle.style.left === "198px",
    );
    expect(firstBoundary).toHaveLength(1);
    expect(firstBoundary[0]?.style.top).toBe("130px");
    expect(firstBoundary[0]?.style.height).toBe("30px");
    // 마지막 열 경계(x=300)는 두 행 모두에서 셀 경계다.
    expect(
      handles.filter((handle) => handle.style.left === "298px"),
    ).toHaveLength(2);
    view.unmount();
  });
});

describe("행/열 핸들 클릭 메뉴", () => {
  const openRowMenu = (controller: ReturnType<typeof fakeController>) => {
    const rendered = renderTable(controller);
    fireEvent.pointerMove(rendered.table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");
    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(firstRowHandle, { pointerId: 1 });
    fireEvent.click(firstRowHandle);
    return rendered;
  };

  it("행 핸들을 클릭하면 표 메뉴가 열린다", () => {
    const controller = fakeController();
    const { view } = openRowMenu(controller);

    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();
    view.unmount();
  });

  it("메뉴의 삭제 항목이 deleteTableRow를 행 인덱스로 호출한다", () => {
    const controller = fakeController();
    const { view } = openRowMenu(controller);

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete row" }));

    expect(controller.commands.deleteTableRow).toHaveBeenCalledWith(
      "table-1",
      0,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    view.unmount();
  });

  it("메뉴의 삽입 항목이 위/아래 인덱스로 insertTableRow를 호출한다", () => {
    const controller = fakeController();
    const { view } = openRowMenu(controller);

    fireEvent.click(screen.getByRole("menuitem", { name: "Insert row below" }));

    expect(controller.commands.insertTableRow).toHaveBeenCalledWith(
      "table-1",
      1,
    );
    view.unmount();
  });

  it("첫 행 메뉴에서 헤더 행을 토글한다", () => {
    const controller = fakeController();
    const { view } = openRowMenu(controller);

    const headerItem = screen.getByRole("menuitemcheckbox", {
      name: "Header row",
    });
    expect(headerItem.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(headerItem);

    expect(controller.commands.toggleTableHeaderRow).toHaveBeenCalledWith(
      "table-1",
    );
    view.unmount();
  });

  it("둘째 행 메뉴에는 헤더 토글 항목이 없다", () => {
    const controller = fakeController();
    const { view, table } = renderTable(controller);
    fireEvent.pointerMove(table);
    const rowHandles = screen.getAllByRole("button", { name: rowHandleLabel });
    const secondRowHandle = rowHandles[1];
    if (secondRowHandle === undefined) throw new Error("둘째 행 핸들 없음");

    fireEvent.pointerDown(secondRowHandle, { pointerId: 1, clientY: 130 });
    fireEvent.pointerUp(secondRowHandle, { pointerId: 1 });
    fireEvent.click(secondRowHandle);

    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();
    expect(screen.queryByRole("menuitemcheckbox")).toBeNull();
    view.unmount();
  });

  it("배경색 팔레트가 대상 행 인덱스로 setTableCellBackgroundColor를 호출한다", () => {
    const controller = fakeController();
    const { view } = openRowMenu(controller);

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Background color Yellow" }),
    );

    expect(
      controller.commands.setTableCellBackgroundColor,
    ).toHaveBeenCalledWith("table-1", { kind: "row", index: 0 }, "#FEF7E0");
    view.unmount();
  });

  it("글자색 없음 항목은 색을 null로 지운다", () => {
    const controller = fakeController();
    const { view } = openRowMenu(controller);

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color None" }));

    expect(controller.commands.setTableCellTextColor).toHaveBeenCalledWith(
      "table-1",
      { kind: "row", index: 0 },
      null,
    );
    view.unmount();
  });

  it("스크롤하면 메뉴 위치가 갱신된 핸들 geometry를 따라간다", () => {
    const controller = fakeController();
    const { view, table } = openRowMenu(controller);

    const menu = screen.getByRole("menu", { name: "Table row menu" });
    const topBeforeScroll = menu.style.top;

    const row1 = table.querySelector('[data-be-row-id="row-1"]');
    if (row1 === null) throw new Error("첫 행 없음");
    // 스크롤로 페이지가 위로 밀린 상황을 흉내낸다 — 행 rect의 top이 줄어든다.
    stubRect(row1, { left: 100, top: 0, width: 200, height: 30 });
    fireEvent.scroll(document);

    expect(menu.style.top).not.toBe(topBeforeScroll);
    view.unmount();
  });

  it("Escape로 메뉴를 닫는다", () => {
    const controller = fakeController();
    const { view } = openRowMenu(controller);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    view.unmount();
  });

  it("메뉴 바깥을 클릭하면 초점을 강제로 옮기지 않고 메뉴만 닫는다", () => {
    const controller = fakeController();
    const { view } = openRowMenu(controller);

    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.append(outsideButton);
    outsideButton.focus();

    fireEvent.pointerDown(outsideButton);

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
    view.unmount();
  });

  it("메뉴 안(data-be-table-menu)을 클릭하면 닫히지 않는다", () => {
    const controller = fakeController();
    const { view } = openRowMenu(controller);

    const menu = screen.getByRole("menu", { name: "Table row menu" });
    fireEvent.pointerDown(menu);

    expect(screen.queryByRole("menu")).not.toBeNull();
    view.unmount();
  });

  it("드래그로 재정렬한 뒤 이어지는 click은 메뉴를 열지 않는다", () => {
    const controller = fakeController();
    const { view, table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(editable, { pointerId: 1, clientY: 150 });
    fireEvent.pointerUp(editable, { pointerId: 1 });
    fireEvent.click(firstRowHandle, { detail: 1 });

    expect(screen.queryByRole("menu")).toBeNull();
    view.unmount();
  });

  it("열 핸들 클릭은 열 메뉴를 열고 헤더 열을 토글한다", () => {
    const controller = fakeController();
    const { view, table } = renderTable(controller);
    fireEvent.pointerMove(table);
    const [firstColumnHandle] = screen.getAllByRole("button", {
      name: columnHandleLabel,
    });
    if (firstColumnHandle === undefined) throw new Error("열 핸들 없음");

    fireEvent.pointerDown(firstColumnHandle, { pointerId: 1, clientX: 150 });
    fireEvent.pointerUp(firstColumnHandle, { pointerId: 1 });
    fireEvent.click(firstColumnHandle);

    expect(
      screen.getByRole("menu", { name: "Table column menu" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Header column" }),
    );
    expect(controller.commands.toggleTableHeaderColumn).toHaveBeenCalledWith(
      "table-1",
    );
    view.unmount();
  });
});
