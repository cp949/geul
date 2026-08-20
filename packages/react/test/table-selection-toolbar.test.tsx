// @vitest-environment jsdom

/**
 * TableSelectionToolbar 컴포넌트: 표 셀 범위 선택 시 병합·서식 버튼 노출,
 * 병합된 셀에 캐럿을 두면 분할·서식 버튼 노출, 병합·분할 명령 호출, Cell
 * formatting 색상 메뉴의 열기·닫기를 검증한다.
 */

import type { EditorController, TableCellSelection } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider } from "../src/index.js";
import { TableSelectionToolbar } from "../src/table-selection-toolbar.js";

// vitest.config.ts에 globals도 setupFiles도 없어 자동 cleanup이 없다. 각 it
// 말미의 unmount로는 assertion이 먼저 던질 때 DOM이 남아 다음 테스트의
// getByRole(...)가 "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
// block-side-menu.test.tsx와 같은 afterEach(cleanup)을 쓴다.
afterEach(cleanup);

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
    // 실제 브라우저와 달리 jsdom은 contentEditable IDL 프로퍼티를
    // contenteditable 속성으로 반영하지 않는다. table-selection-toolbar.tsx:101의
    // focusEditor는 '[contenteditable="true"]'로 대상을 찾으므로, 속성을
    // 직접 세우지 않으면 초점 복구가 단위 테스트에서 조용히 no-op가 된다.
    editable.setAttribute("contenteditable", "true");
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

/**
 * 병합 가능한 2셀 선택 상태의 fakeController를 만든다. cellIds가 2개 이상이고
 * mergeable이 true, splitCellId가 null인 TableCellSelection을 반환한다.
 * getTableCellSelection 외 FakeControllerOptions는 overrides로 그대로
 * fakeController에 전달한다.
 */
const mergeableSelectionController = (
  overrides: Omit<FakeControllerOptions, "getTableCellSelection"> = {},
) =>
  fakeController({
    ...overrides,
    getTableCellSelection: () => ({
      tableBlockId: "table-1",
      cellIds: ["cell-1", "cell-2"],
      mergeable: true,
      splitCellId: null,
    }),
  });

/**
 * 분할 가능한 병합 셀 1개 상태의 fakeController를 만든다. cellIds가 1개이고
 * mergeable이 false, splitCellId가 "cell-1"인 TableCellSelection을 반환한다.
 * getTableCellSelection 외 FakeControllerOptions는 overrides로 그대로
 * fakeController에 전달한다.
 */
const splittableSelectionController = (
  overrides: Omit<FakeControllerOptions, "getTableCellSelection"> = {},
) =>
  fakeController({
    ...overrides,
    getTableCellSelection: () => ({
      tableBlockId: "table-1",
      cellIds: ["cell-1"],
      mergeable: false,
      splitCellId: "cell-1",
    }),
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
  render(
    withProvider(
      controller,
      <>
        <TableSelectionToolbar />
        <EditorContent />
      </>,
    ),
  );
  const host = screen.getByRole("textbox", { name: "Editor" });
  const table = host.querySelector("table");
  const cell1 = host.querySelector('[data-be-cell-id="cell-1"]');
  const cell2 = host.querySelector('[data-be-cell-id="cell-2"]');
  if (table === null || cell1 === null || cell2 === null) {
    throw new Error("Table fixture was not rendered");
  }
  stubRect(cell1, { left: 100, top: 100, width: 100, height: 30 });
  stubRect(cell2, { left: 200, top: 100, width: 100, height: 30 });
  // host(role="textbox")는 마운트 host이고, 컨트롤러가 그 안에 실제
  // contenteditable 자식을 넣는다(block-side-menu.test.tsx:57-59와 같은
  // 구조) — Escape 초점 복구 단언은 초점을 실제로 받는 후자를 대상으로 한다.
  const editable = host.querySelector<HTMLElement>('[contenteditable="true"]');
  if (editable === null) throw new Error("Editable was not mounted");
  return { table, cell1, cell2, editable };
};

const triggerSelectionChange = () => {
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
};

describe("셀 범위를 선택하면 병합·서식 툴바를 표시한다", () => {
  it("cellIds가 2개 이상(mergeable)이면 Merge cells와 Cell formatting 버튼을 보여준다", () => {
    const controller = mergeableSelectionController();
    const { cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: mergeLabel })).not.toBeNull();
    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
    expect(screen.queryByRole("button", { name: splitLabel })).toBeNull();
  });

  it("Merge cells 클릭 시 mergeTableCells(tableBlockId)를 호출한다", () => {
    const controller = mergeableSelectionController();
    const { cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: mergeLabel }));

    expect(controller.commands.mergeTableCells).toHaveBeenCalledWith("table-1");
  });

  it("selectedCell 데코레이션이 없으면(경계 계산 불가) 아무 툴바도 표시하지 않는다", () => {
    const controller = mergeableSelectionController();
    renderTable(controller);

    triggerSelectionChange();

    expect(screen.queryByRole("button", { name: mergeLabel })).toBeNull();
  });

  it("표 셀 선택이 없으면 아무 툴바도 표시하지 않는다", () => {
    const controller = fakeController({ getTableCellSelection: () => null });
    renderTable(controller);

    triggerSelectionChange();

    expect(screen.queryByRole("button", { name: mergeLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: splitLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: formatLabel })).toBeNull();
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
    const { cell1 } = renderTable(controller);
    cell1.classList.add("selectedCell");

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
    expect(screen.queryByRole("button", { name: mergeLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: splitLabel })).toBeNull();
  });
});

describe("병합된 셀에 캐럿을 두면 분할·서식 툴바를 표시한다", () => {
  it("splitCellId가 있으면 Split cell과 Cell formatting 버튼을 보여준다", () => {
    const controller = splittableSelectionController();
    renderTable(controller);

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: splitLabel })).not.toBeNull();
    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
  });

  it("Split cell 클릭 시 splitTableCell(tableBlockId, cellId)를 호출한다", () => {
    const controller = splittableSelectionController();
    renderTable(controller);
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: splitLabel }));

    expect(controller.commands.splitTableCell).toHaveBeenCalledWith(
      "table-1",
      "cell-1",
    );
  });
});

describe("Cell formatting 버튼으로 색상 메뉴를 연다", () => {
  it("클릭하면 Text color/Background color 팔레트가 뜬다", () => {
    const controller = splittableSelectionController();
    renderTable(controller);
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: formatLabel }));

    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();
  });

  it('색상 스와치 클릭 시 setTableCellTextColor(tableBlockId, {kind:"cells",cellIds}, color)를 호출하고 메뉴를 닫으며 편집기로 초점을 되돌린다', () => {
    const controller = splittableSelectionController();
    const { editable } = renderTable(controller);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Red" }));

    expect(controller.commands.setTableCellTextColor).toHaveBeenCalledWith(
      "table-1",
      { kind: "cells", cellIds: ["cell-1"] },
      "#D93025",
    );
    expect(screen.queryByRole("menu", { name: "Cell formatting" })).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("Escape로 서식 메뉴를 닫고 편집기로 초점을 되돌린다", () => {
    const controller = splittableSelectionController();
    const { editable } = renderTable(controller);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));
    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu", { name: "Cell formatting" })).toBeNull();
    // 바깥 클릭과 달리 Escape는 돌아갈 클릭 대상이 없어 초점을 편집기로
    // 되돌린다(PIT-0013). onEscapeDismiss가 onOutsideDismiss로 잘못
    // 연결되면 초점은 그대로 body에 남아 이 단언이 실패한다.
    expect(document.activeElement).toBe(editable);
  });

  it("서식 메뉴 바깥을 클릭하면 초점을 강제로 옮기지 않고 메뉴만 닫는다", () => {
    const controller = splittableSelectionController();
    renderTable(controller);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));
    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();

    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.append(outsideButton);
    outsideButton.focus();

    try {
      fireEvent.pointerDown(outsideButton);

      expect(
        screen.queryByRole("menu", { name: "Cell formatting" }),
      ).toBeNull();
      expect(document.activeElement).toBe(outsideButton);
    } finally {
      outsideButton.remove();
    }
  });

  it("서식 메뉴 안(data-be-cell-format-menu)을 클릭하면 닫히지 않는다", () => {
    const controller = splittableSelectionController();
    renderTable(controller);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));

    const menu = screen.getByRole("menu", { name: "Cell formatting" });
    fireEvent.pointerDown(menu);

    expect(
      screen.queryByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();
  });

  it("열린 서식 메뉴를 툴바 버튼으로 다시 누르면 닫고 편집기로 초점을 되돌린다", () => {
    const controller = splittableSelectionController();
    const { editable } = renderTable(controller);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));
    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();

    // 실제 브라우저의 재클릭은 pointerdown이 먼저 온다. 이 순서를 재현해야
    // CELL_FORMAT_MENU_DISMISS_ALLOW_SELECTORS의
    // "[data-be-cell-format-trigger]" 항목까지 잠긴다 — 그 항목이 빠지면
    // pointerdown이 onOutsideDismiss(초점 복구 없는 dismissFormatMenu)로 먼저
    // 닫고, 이어지는 click이 formatMenuOpen === false를 보고 메뉴를 다시 연다.
    // click만 쏘면 그 회귀가 이 테스트를 통과한다.
    const trigger = screen.getByRole("button", { name: formatLabel });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByRole("menu", { name: "Cell formatting" })).toBeNull();
    expect(document.activeElement).toBe(editable);
  });
});

describe("병합·분할 명령 실패 시 피드백", () => {
  it("병합이 NOT_RECTANGULAR로 거절되면 실패 메시지를 보여준다", () => {
    const controller = mergeableSelectionController({
      mergeTableCells: () => ({
        ok: false,
        error: { code: "NOT_RECTANGULAR" },
      }),
    });
    const { cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: mergeLabel }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Selection isn't rectangular",
    );
  });

  it("분할이 CELL_NOT_FOUND로 거절되면 실패 메시지를 보여준다", () => {
    const controller = splittableSelectionController({
      splitTableCell: () => ({
        ok: false,
        error: { code: "CELL_NOT_FOUND", cellId: "cell-1" },
      }),
    });
    renderTable(controller);
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: splitLabel }));

    expect(screen.getByRole("alert").textContent).toBe("Cell no longer exists");
  });

  it("실패 메시지가 뜬 채로 선택 대상이 바뀌면 메시지가 사라진다", () => {
    const controller = mergeableSelectionController({
      mergeTableCells: () => ({
        ok: false,
        error: { code: "NOT_RECTANGULAR" },
      }),
    });
    const { cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: mergeLabel }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Selection isn't rectangular",
    );

    controller.getTableCellSelection.mockImplementation(() => ({
      tableBlockId: "table-1",
      cellIds: ["cell-2"],
      mergeable: false,
      splitCellId: null,
    }));
    triggerSelectionChange();

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("툴바 메시지와 서식 메뉴 메시지의 상호작용", () => {
  it("병합 실패 메시지가 뜬 채로 Cell formatting 메뉴를 열면 툴바 메시지를 지운다", () => {
    const controller = mergeableSelectionController({
      mergeTableCells: () => ({
        ok: false,
        error: { code: "NOT_RECTANGULAR" },
      }),
    });
    const { cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: mergeLabel }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Selection isn't rectangular",
    );

    fireEvent.click(screen.getByRole("button", { name: formatLabel }));

    expect(screen.getByRole("menu", { name: formatLabel })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("서식 메뉴 실패 메시지가 뜬 채로 선택 대상이 바뀌면 메뉴와 메시지가 사라진다", () => {
    const controller = mergeableSelectionController({
      setTableCellTextColor: () => ({
        ok: false,
        error: { code: "CELL_NOT_FOUND", cellId: "cell-1" },
      }),
    });
    const { cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Blue" }));
    expect(screen.getByRole("alert").textContent).toBe("Cell no longer exists");

    controller.getTableCellSelection.mockImplementation(() => ({
      tableBlockId: "table-1",
      cellIds: ["cell-2"],
      mergeable: false,
      splitCellId: null,
    }));
    triggerSelectionChange();

    expect(screen.queryByRole("menu", { name: formatLabel })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
