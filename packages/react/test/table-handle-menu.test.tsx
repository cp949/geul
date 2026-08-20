// @vitest-environment jsdom

/**
 * TableHandleMenu 컴포넌트: 행/열 핸들 클릭으로 여는 메뉴(삽입, 삭제, 헤더
 * 토글, 색상)와 드래그 재정렬 직후 합성 click 억제를 검증한다. TableHandles
 * 안에서만 렌더되는 내부 컴포넌트라 TableHandles를 합성 마운트해 구동한다.
 */

import type { EditorController } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider } from "../src/index.js";
import { TableHandles } from "../src/table-handles.js";

// vitest.config.ts에 globals도 setupFiles도 없어 자동 cleanup이 없다. 각 it
// 말미의 unmount로는 assertion이 먼저 던질 때 DOM이 남아 다음 테스트의
// getByRole(...)가 "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
// block-side-menu.test.tsx와 같은 afterEach(cleanup)을 쓴다.
afterEach(cleanup);

const rowHandleLabel = "Drag to reorder row, click for options";
const columnHandleLabel = "Drag to reorder column, click for options";

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
    // 실제 브라우저와 달리 jsdom은 contentEditable IDL 프로퍼티를
    // contenteditable 속성으로 반영하지 않는다. table-handles.tsx:340의
    // focusEditor는 '[contenteditable="true"]'로 대상을 찾으므로, 속성을
    // 직접 세우지 않으면 초점 복구가 단위 테스트에서 조용히 no-op가 된다.
    editable.setAttribute("contenteditable", "true");
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
  render(
    withProvider(
      controller,
      <>
        <TableHandles />
        <EditorContent />
      </>,
    ),
  );
  // editable(role="textbox")은 마운트 host이고, 컨트롤러가 그 안에 실제
  // contenteditable 자식을 넣는다(block-side-menu.test.tsx:57-59와 같은 구조).
  // pointer 이벤트는 host에 쏘지만 focusEditor가 초점을 주는 대상은
  // contentEditable이므로 초점 단언 대상은 후자다.
  const editable = screen.getByRole("textbox", { name: "Editor" });
  const contentEditable = editable.querySelector<HTMLElement>(
    '[contenteditable="true"]',
  );
  if (contentEditable === null) throw new Error("Editable was not mounted");
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
  return { table, editable, contentEditable };
};

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

const openColumnMenu = (controller: ReturnType<typeof fakeController>) => {
  const rendered = renderTable(controller);
  fireEvent.pointerMove(rendered.table);
  const [firstColumnHandle] = screen.getAllByRole("button", {
    name: columnHandleLabel,
  });
  if (firstColumnHandle === undefined) throw new Error("열 핸들 없음");
  fireEvent.pointerDown(firstColumnHandle, { pointerId: 1, clientX: 150 });
  fireEvent.pointerUp(firstColumnHandle, { pointerId: 1 });
  fireEvent.click(firstColumnHandle);
  return rendered;
};

describe("행/열 핸들 클릭 메뉴", () => {
  it("행 핸들을 클릭하면 표 메뉴가 열린다", () => {
    const controller = fakeController();
    openRowMenu(controller);

    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();
  });

  it("메뉴의 삭제 항목이 deleteTableRow를 행 인덱스로 호출하고 편집기로 초점을 되돌린다", () => {
    const controller = fakeController();
    const { contentEditable } = openRowMenu(controller);

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete row" }));

    expect(controller.commands.deleteTableRow).toHaveBeenCalledWith(
      "table-1",
      0,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(contentEditable);
  });

  it("메뉴의 삽입 항목이 위/아래 인덱스로 insertTableRow를 호출한다", () => {
    const controller = fakeController();
    openRowMenu(controller);

    fireEvent.click(screen.getByRole("menuitem", { name: "Insert row below" }));

    expect(controller.commands.insertTableRow).toHaveBeenCalledWith(
      "table-1",
      1,
    );
  });

  it("첫 행 메뉴에서 헤더 행을 토글한다", () => {
    const controller = fakeController();
    openRowMenu(controller);

    const headerItem = screen.getByRole("menuitemcheckbox", {
      name: "Header row",
    });
    expect(headerItem.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(headerItem);

    expect(controller.commands.toggleTableHeaderRow).toHaveBeenCalledWith(
      "table-1",
    );
  });

  it("둘째 행 메뉴에는 헤더 토글 항목이 없다", () => {
    const controller = fakeController();
    const { table } = renderTable(controller);
    fireEvent.pointerMove(table);
    const rowHandles = screen.getAllByRole("button", { name: rowHandleLabel });
    const secondRowHandle = rowHandles[1];
    if (secondRowHandle === undefined) throw new Error("둘째 행 핸들 없음");

    fireEvent.pointerDown(secondRowHandle, { pointerId: 1, clientY: 130 });
    fireEvent.pointerUp(secondRowHandle, { pointerId: 1 });
    fireEvent.click(secondRowHandle);

    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();
    expect(screen.queryByRole("menuitemcheckbox")).toBeNull();
  });

  it("배경색 팔레트가 대상 행 인덱스로 setTableCellBackgroundColor를 호출한다", () => {
    const controller = fakeController();
    openRowMenu(controller);

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Background color Yellow" }),
    );

    expect(
      controller.commands.setTableCellBackgroundColor,
    ).toHaveBeenCalledWith("table-1", { kind: "row", index: 0 }, "#FEF7E0");
  });

  it("글자색 없음 항목은 색을 null로 지운다", () => {
    const controller = fakeController();
    openRowMenu(controller);

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color None" }));

    expect(controller.commands.setTableCellTextColor).toHaveBeenCalledWith(
      "table-1",
      { kind: "row", index: 0 },
      null,
    );
  });

  it("스크롤하면 메뉴 위치가 갱신된 핸들 geometry를 따라간다", () => {
    const controller = fakeController();
    const { table } = openRowMenu(controller);

    const menu = screen.getByRole("menu", { name: "Table row menu" });
    const topBeforeScroll = menu.style.top;

    const row1 = table.querySelector('[data-be-row-id="row-1"]');
    if (row1 === null) throw new Error("첫 행 없음");
    // 스크롤로 페이지가 위로 밀린 상황을 흉내낸다 — 행 rect의 top이 줄어든다.
    stubRect(row1, { left: 100, top: 0, width: 200, height: 30 });
    fireEvent.scroll(document);

    expect(menu.style.top).not.toBe(topBeforeScroll);
  });

  it("Escape로 메뉴를 닫고 편집기로 초점을 되돌린다", () => {
    const controller = fakeController();
    const { contentEditable } = openRowMenu(controller);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    // 바깥 클릭과 달리 Escape는 돌아갈 클릭 대상이 없어 초점을 편집기로
    // 되돌린다(PIT-0013). onEscapeDismiss가 onOutsideDismiss로 잘못
    // 연결되면 초점은 그대로 body에 남아 이 단언이 실패한다.
    expect(document.activeElement).toBe(contentEditable);
  });

  it("메뉴 바깥을 클릭하면 초점을 강제로 옮기지 않고 메뉴만 닫는다", () => {
    const controller = fakeController();
    openRowMenu(controller);

    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.append(outsideButton);
    outsideButton.focus();

    try {
      fireEvent.pointerDown(outsideButton);

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(outsideButton);
    } finally {
      outsideButton.remove();
    }
  });

  it("메뉴 안(data-be-table-menu)을 클릭하면 닫히지 않는다", () => {
    const controller = fakeController();
    openRowMenu(controller);

    const menu = screen.getByRole("menu", { name: "Table row menu" });
    fireEvent.pointerDown(menu);

    expect(screen.queryByRole("menu")).not.toBeNull();
  });

  it("드래그로 재정렬한 뒤 이어지는 click은 메뉴를 열지 않는다", () => {
    const controller = fakeController();
    const { table, editable } = renderTable(controller);
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
  });

  it("실제 moveTableRow로 표 DOM이 재정렬돼도 뒤이은 click이 메뉴를 열지 않는다", () => {
    // 핸들 버튼의 React key는 rowId라 재정렬 뒤에도 같은 DOM 노드가
    // 재사용된다 — moveTableRow를 no-op mock이 아니라 실제 tr 재배치로
    // 구현해, click 시점에 onClick 클로저가 받는 index가 sourceIndex가
    // 아니라 이동 후 index임을 재현한다(Issue #17).
    const controller = fakeController({
      moveTableRow: (tableBlockId, sourceIndex, toIndex) => {
        const table = document.querySelector<HTMLTableElement>(
          `table[data-be-block-id="${tableBlockId}"]`,
        );
        const rows =
          table === null
            ? []
            : Array.from(
                table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
              );
        const moved = rows[sourceIndex];
        if (table !== null && moved !== undefined) {
          moved.remove();
          const remaining = Array.from(
            table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
          );
          const reference = remaining[toIndex] ?? null;
          if (reference === null) table.append(moved);
          else table.insertBefore(moved, reference);
        }
        return { ok: true, value: undefined };
      },
    });
    const { table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    // clientX를 표 가로 범위 안(예: 150)으로 줘야 한다 — 생략하면 jsdom
    // PointerEvent의 clientX 기본값 0이 표 hover 여백(HANDLE_HOVER_MARGIN)
    // 밖이라, 별도의 hover 추적 리스너(handlePointerMove,
    // table-handles.tsx:366-413)가 이 이벤트만으로 hoverTableId를 지운다.
    // 드래그 중에는 reorderState.tableBlockId가 activeTableId를 우선하므로
    // 안 드러나지만, pointerUp이 reorderState를 지우고 나면 activeTableId가
    // hoverTableId로 폴백해 geometry가 null이 되고 핸들 버튼 전부가
    // 언마운트된다 — 뒤이은 click이 사라진 노드를 때려 억제 로직과
    // 무관하게 항상 통과해버린다(RED가 안 걸린다).
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerUp(editable, { pointerId: 1 });
    // Issue #17의 전제 — 실제 브라우저는 pointerup 직후 같은 버튼
    // (setPointerCapture로 고정된 대상)에 합성 click을 보낸다 — 를 이
    // 테스트에서는 fireEvent.click으로 직접 재현한다. 이 전제 자체가
    // 실제 브라우저에서 성립하는지는 e2e의 몫이다(PIT-0019, Issue #63).
    fireEvent.click(firstRowHandle, { detail: 1 });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("실제 moveTableColumn으로 표 DOM이 재정렬돼도 뒤이은 click이 메뉴를 열지 않는다", () => {
    // PIT-0004: 열 순서·개수의 권위는 data-be-columns다. moveTableColumn을
    // 그 속성을 실제로 갱신하는 구현으로 대체해 Issue #17과 같은 재현
    // 조건을 만든다.
    const controller = fakeController({
      moveTableColumn: (tableBlockId, sourceIndex, toIndex) => {
        const table = document.querySelector<HTMLTableElement>(
          `table[data-be-block-id="${tableBlockId}"]`,
        );
        if (table === null) return { ok: true, value: undefined };
        const raw = table.getAttribute("data-be-columns");
        const columns: { id: string; width: number }[] =
          raw === null ? [] : JSON.parse(raw);
        const moved = columns[sourceIndex];
        if (moved === undefined) return { ok: true, value: undefined };
        columns.splice(sourceIndex, 1);
        columns.splice(toIndex, 0, moved);
        table.setAttribute("data-be-columns", JSON.stringify(columns));
        return { ok: true, value: undefined };
      },
    });
    const { table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const [firstColumnHandle] = screen.getAllByRole("button", {
      name: columnHandleLabel,
    });
    if (firstColumnHandle === undefined) throw new Error("열 핸들 없음");

    fireEvent.pointerDown(firstColumnHandle, { pointerId: 1, clientX: 100 });
    // clientY도 표 세로 범위 안(예: 110)으로 줘야 한다 — 위 row 테스트의
    // clientX와 같은 이유(hover 추적 리스너가 hoverTableId를 지워 pointerUp
    // 뒤 핸들이 통째로 언마운트되고, 뒤이은 click이 사라진 노드를 때려
    // 억제 로직과 무관하게 항상 통과한다).
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 250,
      clientY: 110,
    });
    fireEvent.pointerUp(editable, { pointerId: 1 });
    fireEvent.click(firstColumnHandle, { detail: 1 });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("moveTableRow가 실패해도(예: 병합 셀 경계) 뒤이은 click은 여전히 억제된다", () => {
    // 이 테스트는 원래(Option B, Issue #17) moveTableRow/moveTableColumn의
    // Result를 버리면 실패 경로에서 억제 키가 어긋나던 결함을 잡았다.
    // Option A(Issue #63)로 억제 키가 안정 식별자(rowId)가 되면서 그
    // 결함 자체가 구조적으로 사라졌다 — id는 커맨드 성공/실패와 무관하게
    // 안 바뀌므로 갱신할 대상도, result.ok 분기도 없다. 테스트는 지우지
    // 않고 그 불변조건(실패해도 억제는 깨지지 않는다)을 계속 지키는지로
    // 다시 쓴다 — 나중에 누군가 result.ok 분기를 되살리는 회귀를 잡는다.
    const controller = fakeController({
      moveTableRow: () => ({
        ok: false,
        error: { code: "MERGE_BOUNDARY_CROSSED" },
      }),
    });
    const { table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerUp(editable, { pointerId: 1 });
    fireEvent.click(firstRowHandle, { detail: 1 });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("재정렬 뒤 합성 click이 오지 않아도 다음 진짜 click은 억제되지 않는다", () => {
    // 억제 키는 뒤이은 click이 소비할 때만 비워진다. 브라우저가 그 합성
    // click을 아예 보내지 않으면(PIT-0019: Chromium은 임계값을 넘는 드래그
    // 뒤 click을 합성하지 않는다) 키가 남아, 사용자가 나중에 그 핸들을
    // 진짜로 클릭할 때 한 번 삼켜진다. block-side-menu는 같은 결함을
    // pointerdown에서 키를 비워 막는다(block-side-menu.tsx:280).
    const controller = fakeController({
      moveTableRow: (tableBlockId, sourceIndex, toIndex) => {
        const table = document.querySelector<HTMLTableElement>(
          `table[data-be-block-id="${tableBlockId}"]`,
        );
        const rows =
          table === null
            ? []
            : Array.from(
                table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
              );
        const moved = rows[sourceIndex];
        if (table !== null && moved !== undefined) {
          moved.remove();
          const remaining = Array.from(
            table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
          );
          const reference = remaining[toIndex] ?? null;
          if (reference === null) table.append(moved);
          else table.insertBefore(moved, reference);
        }
        return { ok: true, value: undefined };
      },
    });
    const { table, editable } = renderTable(controller);
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerUp(editable, { pointerId: 1 });
    // 합성 click은 오지 않는다 — 여기서 fireEvent.click을 하지 않는다.

    // 이어지는 별개의 제스처: 드래그 없이 방금 옮긴 행의 핸들을 클릭한다.
    fireEvent.pointerDown(firstRowHandle, { pointerId: 2, clientY: 140 });
    fireEvent.pointerUp(editable, { pointerId: 2 });
    fireEvent.click(firstRowHandle, { detail: 1 });

    expect(screen.queryByRole("menu")).not.toBeNull();
  });

  it("rowId가 빈 문자열이면 억제를 걸지 않는다", () => {
    // rowId는 table-handles.tsx의 getAttribute("data-be-row-id") ?? ""
    // 폴백으로 빈 문자열이 될 수 있다(Option A, Issue #63). 억제 키를
    // 안정 식별자(rowId)로 쓰므로, 빈 id를 그대로 키에 쓰면 빈 id를 가진
    // 서로 다른 행이 같은 "row-" 키로 충돌한다. 이 저장소는 그 경우
    // 억제를 아예 걸지 않는 fail-open을 택한다(index 폴백은 Option A로
    // 지우려는 finalIndex 산술을 되살린다) — 드래그 뒤 첫 click이 (드물게)
    // 억제되지 않고 메뉴가 열리는 쪽을, 엉뚱한 행을 잘못 억제하는 쪽보다
    // 우선한다.
    const controller = fakeController({
      moveTableRow: (tableBlockId, sourceIndex, toIndex) => {
        const table = document.querySelector<HTMLTableElement>(
          `table[data-be-block-id="${tableBlockId}"]`,
        );
        const rows =
          table === null
            ? []
            : Array.from(
                table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
              );
        const moved = rows[sourceIndex];
        if (table !== null && moved !== undefined) {
          moved.remove();
          const remaining = Array.from(
            table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
          );
          const reference = remaining[toIndex] ?? null;
          if (reference === null) table.append(moved);
          else table.insertBefore(moved, reference);
        }
        return { ok: true, value: undefined };
      },
    });
    const { table, editable } = renderTable(controller);
    const [row1] = Array.from(
      table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
    );
    if (row1 === undefined) throw new Error("행 없음");
    // hover 추적(pointerMove(table))이 geometry를 처음 읽기 전에 rowId를
    // 비운다 — 이후 렌더는 전부 빈 rowId를 기준으로 handle을 만든다.
    row1.setAttribute("data-be-row-id", "");
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerUp(editable, { pointerId: 1 });
    fireEvent.click(firstRowHandle, { detail: 1 });

    expect(screen.queryByRole("menu")).not.toBeNull();
  });

  it("열 핸들 클릭은 열 메뉴를 열고 헤더 열을 토글한다", () => {
    const controller = fakeController();
    const { table } = renderTable(controller);
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
  });
});

describe("메뉴 명령 실패 시 피드백", () => {
  it("삭제가 LAST_ROW로 거절되면 메뉴를 닫지 않고 실패 메시지를 보여준다", () => {
    const base = fakeController();
    const controller = {
      ...base,
      commands: {
        ...base.commands,
        deleteTableRow: vi.fn(
          () =>
            ({ ok: false, error: { code: "LAST_ROW" } }) as ReturnType<
              EditorController["commands"]["deleteTableRow"]
            >,
        ),
      },
    };
    openRowMenu(controller as unknown as ReturnType<typeof fakeController>);

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete row" }));

    expect(controller.commands.deleteTableRow).toHaveBeenCalledWith(
      "table-1",
      0,
    );
    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(
      "Can't delete the last row",
    );
  });

  it("삭제가 LAST_COLUMN으로 거절되면 메뉴를 닫지 않고 실패 메시지를 보여준다", () => {
    const base = fakeController();
    const controller = {
      ...base,
      commands: {
        ...base.commands,
        deleteTableColumn: vi.fn(
          () =>
            ({ ok: false, error: { code: "LAST_COLUMN" } }) as ReturnType<
              EditorController["commands"]["deleteTableColumn"]
            >,
        ),
      },
    };
    openColumnMenu(controller as unknown as ReturnType<typeof fakeController>);

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete column" }));

    expect(controller.commands.deleteTableColumn).toHaveBeenCalledWith(
      "table-1",
      0,
    );
    expect(
      screen.getByRole("menu", { name: "Table column menu" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(
      "Can't delete the last column",
    );
  });

  it("그 외 실패는 메뉴를 닫지 않고 일반 실패 메시지를 보여준다", () => {
    const base = fakeController();
    const controller = {
      ...base,
      commands: {
        ...base.commands,
        insertTableRow: vi.fn(
          () =>
            ({
              ok: false,
              error: { code: "INDEX_OUT_OF_RANGE" },
            }) as ReturnType<EditorController["commands"]["insertTableRow"]>,
        ),
      },
    };
    openRowMenu(controller as unknown as ReturnType<typeof fakeController>);

    fireEvent.click(screen.getByRole("menuitem", { name: "Insert row below" }));

    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Action failed");
  });

  it("다른 행으로 메뉴 대상을 바로 전환하면 이전 실패 메시지가 남지 않는다", () => {
    const base = fakeController();
    const controller = {
      ...base,
      commands: {
        ...base.commands,
        deleteTableRow: vi.fn(
          () =>
            ({ ok: false, error: { code: "LAST_ROW" } }) as ReturnType<
              EditorController["commands"]["deleteTableRow"]
            >,
        ),
      },
    };
    const { table } = renderTable(
      controller as unknown as ReturnType<typeof fakeController>,
    );
    fireEvent.pointerMove(table);
    const rowHandles = screen.getAllByRole("button", { name: rowHandleLabel });
    const [firstRowHandle, secondRowHandle] = rowHandles;
    if (firstRowHandle === undefined || secondRowHandle === undefined) {
      throw new Error("행 핸들 없음");
    }

    fireEvent.click(firstRowHandle);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete row" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Can't delete the last row",
    );

    fireEvent.click(secondRowHandle);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("마지막 행/열에서 삭제 비활성화", () => {
  const fakeControllerWithSingleRow = () => ({
    ...fakeController(),
    mount: vi.fn((element: HTMLElement) => {
      const editable = document.createElement("div");
      editable.setAttribute("contenteditable", "true");
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
      const cell1 = document.createElement("td");
      cell1.setAttribute("data-be-column-id", "col-1");
      const cell2 = document.createElement("td");
      cell2.setAttribute("data-be-column-id", "col-2");
      row1.append(cell1, cell2);
      table.append(row1);
      editable.append(table);
      element.append(editable);
    }),
  });

  const fakeControllerWithSingleColumn = () => ({
    ...fakeController(),
    mount: vi.fn((element: HTMLElement) => {
      const editable = document.createElement("div");
      editable.setAttribute("contenteditable", "true");
      const table = document.createElement("table");
      table.setAttribute("data-be-block-id", "table-1");
      table.setAttribute(
        "data-be-columns",
        JSON.stringify([{ id: "col-1", width: 120 }]),
      );
      const colgroup = document.createElement("colgroup");
      const col = document.createElement("col");
      col.style.width = "120px";
      colgroup.append(col);
      table.append(colgroup);
      const row1 = document.createElement("tr");
      row1.setAttribute("data-be-row-id", "row-1");
      const cell1 = document.createElement("td");
      cell1.setAttribute("data-be-column-id", "col-1");
      row1.append(cell1);
      const row2 = document.createElement("tr");
      row2.setAttribute("data-be-row-id", "row-2");
      const cell2 = document.createElement("td");
      cell2.setAttribute("data-be-column-id", "col-1");
      row2.append(cell2);
      table.append(row1, row2);
      editable.append(table);
      element.append(editable);
    }),
  });

  const renderSingleRowTable = (
    controller: ReturnType<typeof fakeControllerWithSingleRow>,
  ) => {
    render(
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
    stubRect(table, { left: 100, top: 100, width: 200, height: 30 });
    const row1 = table.querySelector<HTMLElement>("[data-be-row-id]");
    if (row1 === null) throw new Error("Row was not rendered");
    stubRect(row1, { left: 100, top: 100, width: 200, height: 30 });
    return { table };
  };

  const renderSingleColumnTable = (
    controller: ReturnType<typeof fakeControllerWithSingleColumn>,
  ) => {
    render(
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
    stubRect(table, { left: 100, top: 100, width: 100, height: 60 });
    const [row1, row2] = Array.from(
      table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
    );
    if (row1 === undefined || row2 === undefined) {
      throw new Error("Rows were not rendered");
    }
    stubRect(row1, { left: 100, top: 100, width: 100, height: 30 });
    stubRect(row2, { left: 100, top: 130, width: 100, height: 30 });
    return { table };
  };

  it("행이 1개뿐이면 Delete row가 비활성화되고 클릭해도 명령을 호출하지 않는다", () => {
    const controller = fakeControllerWithSingleRow();
    const { table } = renderSingleRowTable(controller);
    fireEvent.pointerMove(table);
    const [rowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (rowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(rowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(rowHandle, { pointerId: 1 });
    fireEvent.click(rowHandle);

    const deleteItem = screen.getByRole("menuitem", { name: "Delete row" });
    expect((deleteItem as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(deleteItem);

    expect(controller.commands.deleteTableRow).not.toHaveBeenCalled();
  });

  it("열이 1개뿐이면 Delete column이 비활성화되고 클릭해도 명령을 호출하지 않는다", () => {
    const controller = fakeControllerWithSingleColumn();
    const { table } = renderSingleColumnTable(controller);
    fireEvent.pointerMove(table);
    const [columnHandle] = screen.getAllByRole("button", {
      name: columnHandleLabel,
    });
    if (columnHandle === undefined) throw new Error("열 핸들 없음");

    fireEvent.pointerDown(columnHandle, { pointerId: 1, clientX: 150 });
    fireEvent.pointerUp(columnHandle, { pointerId: 1 });
    fireEvent.click(columnHandle);

    const deleteItem = screen.getByRole("menuitem", {
      name: "Delete column",
    });
    expect((deleteItem as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(deleteItem);

    expect(controller.commands.deleteTableColumn).not.toHaveBeenCalled();
  });
});

describe("메뉴 대상 인덱스가 무효화되면 자동으로 닫힌다", () => {
  it("메뉴가 가리키는 마지막 행이 사라지면 메뉴가 자동으로 닫힌다", async () => {
    const controller = fakeController();
    const { table } = renderTable(controller);
    fireEvent.pointerMove(table);
    const rowHandles = screen.getAllByRole("button", { name: rowHandleLabel });
    const secondRowHandle = rowHandles[1];
    if (secondRowHandle === undefined) throw new Error("둘째 행 핸들 없음");
    fireEvent.pointerDown(secondRowHandle, { pointerId: 1, clientY: 130 });
    fireEvent.pointerUp(secondRowHandle, { pointerId: 1 });
    fireEvent.click(secondRowHandle);
    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();

    const row2 = table.querySelector('[data-be-row-id="row-2"]');
    if (row2 === null) throw new Error("둘째 행 없음");

    await act(async () => {
      row2.remove();
      await Promise.resolve();
    });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("메뉴가 가리키는 행이 그대로 있으면 다른 행이 사라져도 메뉴는 열린 채로 남는다", async () => {
    const controller = fakeController();
    const { table } = openRowMenu(controller);

    const row2 = table.querySelector('[data-be-row-id="row-2"]');
    if (row2 === null) throw new Error("둘째 행 없음");

    await act(async () => {
      row2.remove();
      await Promise.resolve();
    });

    expect(screen.queryByRole("menu")).not.toBeNull();
  });

  it("메뉴가 가리키는 마지막 열이 data-be-columns에서 사라지면 메뉴가 자동으로 닫힌다", async () => {
    const controller = fakeController();
    const { table } = renderTable(controller);
    fireEvent.pointerMove(table);
    const columnHandles = screen.getAllByRole("button", {
      name: columnHandleLabel,
    });
    const secondColumnHandle = columnHandles[1];
    if (secondColumnHandle === undefined) throw new Error("둘째 열 핸들 없음");
    fireEvent.pointerDown(secondColumnHandle, { pointerId: 1, clientX: 250 });
    fireEvent.pointerUp(secondColumnHandle, { pointerId: 1 });
    fireEvent.click(secondColumnHandle);
    expect(
      screen.getByRole("menu", { name: "Table column menu" }),
    ).toBeTruthy();

    await act(async () => {
      table.setAttribute(
        "data-be-columns",
        JSON.stringify([{ id: "col-1", width: 120 }]),
      );
      await Promise.resolve();
    });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("메뉴가 열린 동안 표 블록이 통째로 사라지면 메뉴 상태도 함께 비워진다", async () => {
    const controller = fakeController();
    const { table, contentEditable } = openRowMenu(controller);
    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();

    // 사라진 표의 menuState가 남으면 activeTableId가 죽은 blockId에 고정돼
    // (table-handles.tsx의 activeTableId 우선순위) 다른 표를 hover해도
    // geometry가 null이라 편집기 전체에서 핸들이 하나도 렌더되지 않는다.
    // 메뉴 자체는 geometry 게이트 때문에 이미 안 보이므로, 메뉴 상태가
    // 실제로 비워졌는지는 남은 표의 핸들 복구로 관찰한다.
    const secondTable = table.cloneNode(true) as HTMLElement;
    secondTable.setAttribute("data-be-block-id", "table-2");
    contentEditable.append(secondTable);
    stubRect(secondTable, { left: 100, top: 300, width: 200, height: 60 });
    const [secondRow1, secondRow2] = Array.from(
      secondTable.querySelectorAll<HTMLElement>("[data-be-row-id]"),
    );
    if (secondRow1 === undefined || secondRow2 === undefined) {
      throw new Error("둘째 표의 행이 없음");
    }
    stubRect(secondRow1, { left: 100, top: 300, width: 200, height: 30 });
    stubRect(secondRow2, { left: 100, top: 330, width: 200, height: 30 });

    await act(async () => {
      table.remove();
      await Promise.resolve();
    });

    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.pointerMove(secondTable);
    expect(
      screen.getAllByRole("button", { name: rowHandleLabel }),
    ).toHaveLength(2);
  });
});
