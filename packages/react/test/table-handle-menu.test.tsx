// @vitest-environment jsdom

/**
 * TableHandleMenu 컴포넌트: 행/열 핸들 클릭으로 여는 메뉴(삽입, 삭제, 헤더
 * 토글, 색상)와 드래그 재정렬 직후 합성 click 억제를 검증한다. TableHandles
 * 안에서만 렌더되는 내부 컴포넌트라 TableHandles를 합성 마운트해 구동한다.
 *
 * 모든 describe가 실제 createEditor() 마운트 위에서 돈다(Issue #76) —
 * 손으로 조립한 fake 컨트롤러/DOM 레인은 남아 있지 않다. 명령이 진짜라
 * 호출 스파이 대신 문서 결과(rowsOf/tableBlockOf)를 단언한다.
 */

import type { EditorController } from "@cp949/geul-core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { TableHandles } from "../src/table-handles.js";
import { mountTableEditor, stubRect } from "./mount-editor.js";

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

/**
 * 실제 편집기를 마운트하고 TableHandles를 얹는다. 반환 shape는 fake
 * 컨트롤러 레인 시절 renderTable이 쓰던 필드 이름(editable/contentEditable)을
 * 그대로 유지해 각 테스트 본문 수정을 최소화한다.
 */
const renderRealTable = (options?: { rows?: number; columns?: number }) => {
  const mounted = mountTableEditor({
    ...options,
    children: <TableHandles />,
  });
  // 기존 renderTable은 `editable`이 role="textbox" host였고 `contentEditable`이
  // 그 안의 편집 영역이었다. mountTableEditor는 그 둘을 host/editable로 부르므로
  // 여기서 되돌려 매핑한다 — 이름만 같고 뜻이 바뀌면 host 대상 조작이 조용히
  // 편집 영역을 때리고, 그런 단언은 통과한 채로 아무것도 검증하지 못한다.
  return {
    ...mounted,
    editable: mounted.host,
    contentEditable: mounted.editable,
  };
};

/**
 * 이미 렌더된 표에서 첫 행 핸들을 띄우고(hover) 드래그 없이 클릭해 행 메뉴를
 * 연다. 메뉴를 열기 전에 문서를 먼저 바꿔야 하는 테스트(예: "없음"이 지울
 * 색을 미리 칠해두는 경우)는 렌더까지 함께 묶인 openRowMenu를 쓸 수 없다.
 *
 * pointerMove를 표 노드 자체에 쏘면 target.closest("table[data-be-block-id]")가
 * 매치돼 hover 여백 검사 전에 hoverTableId가 잡힌다 — 좌표가 없어도 된다.
 * 반면 `editable`에 쏠 때는 좌표를 반드시 준다: 생략하면 jsdom이 0으로 채우고
 * 그건 hover 여백(HANDLE_HOVER_MARGIN=28) 밖이라 핸들이 언마운트된다(Issue #62).
 */
const clickFirstRowHandle = (table: HTMLElement) => {
  fireEvent.pointerMove(table);
  const [handle] = screen.getAllByRole("button", { name: rowHandleLabel });
  if (handle === undefined) throw new Error("행 핸들 없음");
  fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
  fireEvent.pointerUp(handle, { pointerId: 1 });
  fireEvent.click(handle);
};

/** 이미 렌더된 표에서 첫 열 핸들을 클릭해 열 메뉴를 연다(행 쪽과 같은 규칙). */
const clickFirstColumnHandle = (table: HTMLElement) => {
  fireEvent.pointerMove(table);
  const [handle] = screen.getAllByRole("button", { name: columnHandleLabel });
  if (handle === undefined) throw new Error("열 핸들 없음");
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 150 });
  fireEvent.pointerUp(handle, { pointerId: 1 });
  fireEvent.click(handle);
};

/** 실제 마운트한 표에서 행 메뉴를 연 상태로 만든다. */
const openRowMenu = (options?: { rows?: number; columns?: number }) => {
  const rendered = renderRealTable(options);
  clickFirstRowHandle(rendered.table);
  return rendered;
};

/** 실제 마운트한 표에서 열 메뉴를 연 상태로 만든다. */
const openColumnMenu = (options?: { rows?: number; columns?: number }) => {
  const rendered = renderRealTable(options);
  clickFirstColumnHandle(rendered.table);
  return rendered;
};

/**
 * 실제 문서에서 표 블록을 읽는다. 명령이 진짜라 호출 스파이 대신 결과를 본다
 * — 스파이는 명령이 아무것도 하지 않아도 통과한다.
 */
const tableBlockOf = (editor: EditorController) => {
  const block = editor.getDocument().blocks[1];
  if (block?.type !== "table") throw new Error("표 블록을 찾지 못했다");
  return block;
};

/** 실제 문서에서 표 블록의 행 목록을 읽는다. tableBlockOf와 같은 이유로 있다. */
const rowsOf = (editor: EditorController) => tableBlockOf(editor).rows;

/**
 * 첫 열의 두 행을 rowSpan 2 셀 하나로 병합한 문서를 심고, 다시 만들어진 표
 * 노드에 스텁 격자를 씌워 돌려준다. 병합 셀 경계를 넘는 행 이동이 실제로
 * 거절되는 상태(MERGE_BOUNDARY_CROSSED)를 만들 때 쓴다.
 *
 * 병합 명령을 쓰지 않는 이유: mergeTableCells는 현재 CellSelection만을 병합
 * 범위의 권위로 삼는데(editor-controller.ts), CellSelection은 좌표로 셀을
 * 짚어야 만들어지고 jsdom에는 레이아웃이 없어 그 좌표가 없다. 그래서 모델을
 * 직접 만들어 replaceDocument로 심는다 — 컨트롤러도 명령도 진짜다.
 *
 * replaceDocument는 표 노드를 통째로 다시 만들어 mountTableEditor가 잡아둔
 * table 엘리먼트를 문서에서 떼어낸다 — 그래서 표를 다시 찾아 돌려준다.
 * rect는 restubGeometry가 다시 씌운다(그쪽도 tableBlockId로 다시 찾는다).
 */
const replaceWithRowSpanMergedTable = (
  rendered: ReturnType<typeof renderRealTable>,
): HTMLElement => {
  const document0 = rendered.editor.getDocument();
  const block = tableBlockOf(rendered.editor);
  const [row0, row1] = block.rows;
  if (row0 === undefined || row1 === undefined) {
    throw new Error("병합할 2x2 표를 찾지 못했다");
  }
  const [topLeftCell, topRightCell] = row0.cells;
  const bottomRightCell = row1.cells[1];
  if (
    topLeftCell === undefined ||
    topRightCell === undefined ||
    bottomRightCell === undefined
  ) {
    throw new Error("병합할 2x2 표의 셀을 찾지 못했다");
  }
  const replaced = rendered.editor.replaceDocument({
    ...document0,
    blocks: document0.blocks.map((candidate) =>
      candidate.id === block.id
        ? {
            ...block,
            rows: [
              // 병합 셀이 덮는 자리(둘째 행 첫 열)는 행 cells에서 빠진다.
              {
                ...row0,
                cells: [{ ...topLeftCell, rowSpan: 2 }, topRightCell],
              },
              { ...row1, cells: [bottomRightCell] },
            ],
          }
        : candidate,
    ),
  });
  if (!replaced.ok) throw new Error("병합 문서 fixture 준비 실패");
  rendered.restubGeometry();

  const table = rendered.editable.querySelector<HTMLElement>(
    `table[data-be-block-id="${rendered.tableBlockId}"]`,
  );
  if (table === null) throw new Error("병합 표가 렌더되지 않았다");
  // 스텁이 문서에 붙어 있는 표에 씌워졌는지 고정한다. replaceDocument가
  // 표 노드를 갈아치우므로, restubGeometry가 떨어져 나간 노드를 칠하면
  // 여기 rect는 0으로 남고 이 fixture를 쓰는 테스트는 그래도 통과한다.
  expect(table.getBoundingClientRect().height).toBe(60);
  // restubGeometry의 격자는 모든 행이 열 개수만큼 셀을 갖는 표를 전제해
  // 셀을 행 안 순번대로 배치한다. 병합된 행은 그 전제가 깨진다 — 둘째 행의
  // 유일한 셀은 순번 0이지만 실제로는 둘째 열이다. 두 칸만 실제 좌표로
  // 덮어써 스텁 격자를 진짜 레이아웃과 맞춘다.
  const [mergedRow, remainderRow] = Array.from(
    table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
  );
  if (mergedRow === undefined || remainderRow === undefined) {
    throw new Error("병합 표의 행이 없다");
  }
  const mergedCell = mergedRow.querySelector<HTMLElement>(
    "[data-be-column-id]",
  );
  const bottomRight = remainderRow.querySelector<HTMLElement>(
    "[data-be-column-id]",
  );
  if (mergedCell === null || bottomRight === null) {
    throw new Error("병합 표의 셀이 없다");
  }
  // 병합 셀은 두 행 높이를 덮는다 — 열 경계(readColumnBounds)는 rowspan을
  // 가로 병합으로 보지 않으므로 이 셀이 첫 열 경계의 권위로 남는다.
  stubRect(mergedCell, { left: 100, top: 100, width: 100, height: 60 });
  stubRect(bottomRight, { left: 200, top: 130, width: 100, height: 30 });
  return table;
};

describe("행/열 핸들 클릭 메뉴", () => {
  it("행 핸들을 클릭하면 표 메뉴가 열린다", () => {
    openRowMenu();

    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();
  });

  it("메뉴의 삭제 항목이 deleteTableRow를 행 인덱스로 호출하고 편집기로 초점을 되돌린다", () => {
    const { contentEditable, editor, rowIds } = openRowMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete row" }));

    // 남은 행 수만 세면 어느 행이 지워졌는지 구분하지 못한다 — 남은 id로
    // 인덱스 0이 지워졌음을 확인한다.
    expect(rowsOf(editor).map((row) => row.id)).toEqual([rowIds[1]]);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(contentEditable);
  });

  it("메뉴의 삽입 항목이 위/아래 인덱스로 insertTableRow를 호출한다", () => {
    const { editor, rowIds } = openRowMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Insert row below" }));

    // 새 행이 첫 행 "아래"(인덱스 1)에 들어갔음을 기존 두 행이 밀린 위치로 본다.
    const ids = rowsOf(editor).map((row) => row.id);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe(rowIds[0]);
    expect(ids[2]).toBe(rowIds[1]);
  });

  it("첫 행 메뉴에서 헤더 행을 토글한다", () => {
    const { editor } = openRowMenu();

    const headerItem = screen.getByRole("menuitemcheckbox", {
      name: "Header row",
    });
    expect(headerItem.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(headerItem);

    expect(tableBlockOf(editor).headerRows).toBe(1);
  });

  it("둘째 행 메뉴에는 헤더 토글 항목이 없다", () => {
    const { table } = renderRealTable();
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

  // openColumnMenu(:95)는 clickFirstColumnHandle(:78)에 위임하고, 그쪽이
  // getAllByRole(...)[0]으로 첫 열만 잡는다 — 둘째 열을 보려면 이 헬퍼를
  // 쓸 수 없고 핸들을 [1]로 직접 잡아야 한다.
  it("둘째 열 메뉴에는 헤더 토글 항목이 없다", () => {
    const { table } = renderRealTable();
    fireEvent.pointerMove(table);
    const columnHandles = screen.getAllByRole("button", {
      name: columnHandleLabel,
    });
    const secondColumnHandle = columnHandles[1];
    if (secondColumnHandle === undefined) throw new Error("둘째 열 핸들 없음");

    // 메뉴 대상은 클릭된 버튼의 closure(column.index)가 정한다 — clientX는
    // handlePointerDownOnReorderHandle이 읽지 않아 이 흐름에서는 무관하다. 그래도
    // clientX: 200을 주는 건 행 쪽 템플릿(:244, clientY: 130)과 대칭 때문이다:
    // DEFAULT_LAYOUT(left:100, columnWidth:100)에서 둘째 열은 x 200~300 구간이라 사실이다.
    fireEvent.pointerDown(secondColumnHandle, { pointerId: 1, clientX: 200 });
    fireEvent.pointerUp(secondColumnHandle, { pointerId: 1 });
    fireEvent.click(secondColumnHandle);

    expect(
      screen.getByRole("menu", { name: "Table column menu" }),
    ).toBeTruthy();
    expect(screen.queryByRole("menuitemcheckbox")).toBeNull();
  });

  it("배경색 팔레트가 대상 행 인덱스로 setTableCellBackgroundColor를 호출한다", () => {
    const { editor } = openRowMenu();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Background color Yellow" }),
    );

    // 대상이 { kind: "row", index: 0 }이었음을 첫 행 셀만 칠해진 것으로 본다.
    const rows = rowsOf(editor);
    expect(rows[0]?.cells.map((cell) => cell.backgroundColor)).toEqual([
      "#FEF7E0",
      "#FEF7E0",
    ]);
    expect(rows[1]?.cells.map((cell) => cell.backgroundColor)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("글자색 없음 항목은 색을 null로 지운다", () => {
    const rendered = renderRealTable();
    // "없음"이 지울 색을 먼저 칠해둔다. 실제 컨트롤러는 색이 없는 셀에 null을
    // 다시 넣는 호출이 문서를 안 바꿔 COMMAND_NOT_APPLICABLE로 거절하므로,
    // 칠하지 않은 상태에서 누르면 "지운다"가 아니라 실패 경로를 검증하게 된다.
    const painted = rendered.editor.commands.setTableCellTextColor(
      rendered.tableBlockId,
      { kind: "row", index: 0 },
      "#D93025",
    );
    if (!painted.ok) throw new Error("글자색 fixture 준비 실패");
    // 색 적용이 표 DOM을 다시 만든다 — 새 tr/td에는 rect 스텁이 없어 핸들이
    // 사라지므로 다음 pointer 이벤트 전에 다시 스텁한다.
    rendered.restubGeometry();
    // 칠해진 대상이 정말 첫 행인지 고정한다. ok만 보면 다른 행이 칠해져도
    // 통과하는데, 그러면 첫 행은 여전히 색이 없어 "없음" 클릭이
    // COMMAND_NOT_APPLICABLE로 거절되고도 아래 마지막 단언이 그대로
    // 통과한다 — 아무것도 검증하지 못한 채 초록으로 남는다.
    expect(
      rowsOf(rendered.editor)[0]?.cells.map((cell) => cell.textColor),
    ).toEqual(["#D93025", "#D93025"]);
    clickFirstRowHandle(rendered.table);

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color None" }));

    expect(
      rowsOf(rendered.editor)[0]?.cells.map((cell) => cell.textColor),
    ).toEqual([undefined, undefined]);
  });

  it("스크롤하면 메뉴 위치가 갱신된 핸들 geometry를 따라간다", () => {
    const { rowIds, table } = openRowMenu();

    const menu = screen.getByRole("menu", { name: "Table row menu" });
    const topBeforeScroll = menu.style.top;

    const row1 = table.querySelector(`[data-be-row-id="${rowIds[0]}"]`);
    if (row1 === null) throw new Error("첫 행 없음");
    // 스크롤로 페이지가 위로 밀린 상황을 흉내낸다 — 행 rect의 top이 줄어든다.
    stubRect(row1, { left: 100, top: 0, width: 200, height: 30 });
    fireEvent.scroll(document);

    expect(menu.style.top).not.toBe(topBeforeScroll);
  });

  it("Escape로 메뉴를 닫고 편집기로 초점을 되돌린다", () => {
    const { contentEditable } = openRowMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    // 바깥 클릭과 달리 Escape는 돌아갈 클릭 대상이 없어 초점을 편집기로
    // 되돌린다(PIT-0013). onEscapeDismiss가 onOutsideDismiss로 잘못
    // 연결되면 초점은 그대로 body에 남아 이 단언이 실패한다.
    expect(document.activeElement).toBe(contentEditable);
  });

  it("메뉴 바깥을 클릭하면 초점을 강제로 옮기지 않고 메뉴만 닫는다", () => {
    openRowMenu();
    // 메뉴가 실제로 열렸다는 전제가 없으면 메뉴 열기 자체가 죽어도 아래
    // queryByRole(...).toBeNull()이 그대로 통과한다 — 먼저 고정한다.
    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();

    // 편집기 바깥 요소는 편집기가 만들지 않는다 — 실제 마운트로도 대신할
    // 수 없는 유일한 조립이라 여기서 직접 만든다.
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
    openRowMenu();

    const menu = screen.getByRole("menu", { name: "Table row menu" });
    fireEvent.pointerDown(menu);

    expect(screen.queryByRole("menu")).not.toBeNull();
  });

  it("드래그로 재정렬한 뒤 이어지는 click은 메뉴를 열지 않는다", () => {
    const { editable, table } = renderRealTable();
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    // clientX를 표 가로 범위 안(150)으로 줘야 한다 — 생략하면 jsdom
    // PointerEvent의 clientX 기본값 0이 표 hover 여백(HANDLE_HOVER_MARGIN)
    // 밖이라, 별도의 hover 추적 리스너(handlePointerMove,
    // table-handles.tsx:366-413)가 이 이벤트만으로 hoverTableId를 지운다.
    // 드래그 중에는 reorderState.tableBlockId가 activeTableId를 우선하므로
    // 안 드러나지만, pointerUp이 reorderState를 지우고 나면 activeTableId가
    // hoverTableId로 폴백해 geometry가 null이 되고 핸들 버튼 전부가
    // 언마운트된다 — 뒤이은 click이 사라진 노드를 때려 억제 로직과
    // 무관하게 항상 통과해버린다(RED가 안 걸린다, Issue #62).
    // 아래 재정렬 테스트 셋도 같은 이유로 좌표를 준다.
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerUp(editable, { pointerId: 1 });
    // 억제가 아니라 핸들이 사라져서 메뉴가 안 열린 것일 수 있다 — 그 경우도
    // 아래 단언은 통과한다(Issue #62). click이 살아 있는 노드를 때리는지
    // 먼저 고정한다.
    expect(firstRowHandle.isConnected).toBe(true);
    fireEvent.click(firstRowHandle, { detail: 1 });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("실제 moveTableRow로 표 DOM이 재정렬돼도 뒤이은 click이 메뉴를 열지 않는다", () => {
    // 핸들 버튼의 React key는 rowId라 재정렬 뒤에도 같은 DOM 노드가
    // 재사용된다 — 실제 편집기 마운트라 moveTableRow가 진짜로 tr을 재배치해,
    // click 시점에 onClick 클로저가 받는 index가 sourceIndex가 아니라 이동 후
    // index임을 재현한다(Issue #17).
    const { editable, editor, rowIds, table } = renderRealTable();
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
    // 재정렬이 실제로 일어났는지 문서에서 확인한다 — 안 일어났다면 이 테스트는
    // 재정렬 없는 드래그를 검증하는 셈이 되고, 제목이 말하는 조건을 잃는다.
    expect(rowsOf(editor).map((row) => row.id)).toEqual([rowIds[1], rowIds[0]]);
    // Issue #17의 전제 — 실제 브라우저는 pointerup 직후 같은 버튼
    // (setPointerCapture로 고정된 대상)에 합성 click을 보낸다 — 를 이
    // 테스트에서는 fireEvent.click으로 직접 재현한다. 이 전제 자체가
    // 실제 브라우저에서 성립하는지는 e2e의 몫이다(PIT-0019, Issue #63).
    // 억제가 아니라 핸들이 사라져서 메뉴가 안 열린 것일 수 있다 — 그 경우도
    // 아래 단언은 통과한다(Issue #62). click이 살아 있는 노드를 때리는지
    // 먼저 고정한다.
    expect(firstRowHandle.isConnected).toBe(true);
    fireEvent.click(firstRowHandle, { detail: 1 });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("실제 moveTableColumn으로 표 DOM이 재정렬돼도 뒤이은 click이 메뉴를 열지 않는다", () => {
    // PIT-0004: 열 순서·개수의 권위는 data-be-columns다. 실제 편집기 마운트라
    // moveTableColumn이 그 속성을 진짜로 갱신해 Issue #17과 같은 재현 조건이
    // 그대로 만들어진다.
    const { columnIds, editable, editor, table } = renderRealTable();
    fireEvent.pointerMove(table);
    const [firstColumnHandle] = screen.getAllByRole("button", {
      name: columnHandleLabel,
    });
    if (firstColumnHandle === undefined) throw new Error("열 핸들 없음");

    fireEvent.pointerDown(firstColumnHandle, { pointerId: 1, clientX: 100 });
    // clientY도 표 세로 범위 안(110)으로 줘야 한다 — 위 행 테스트의 clientX와
    // 같은 이유다(hover 추적 리스너가 hoverTableId를 지워 pointerUp 뒤 핸들이
    // 통째로 언마운트되고, 뒤이은 click이 사라진 노드를 때린다).
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 250,
      clientY: 110,
    });
    fireEvent.pointerUp(editable, { pointerId: 1 });
    expect(tableBlockOf(editor).columns.map((column) => column.id)).toEqual([
      columnIds[1],
      columnIds[0],
    ]);
    // 억제가 아니라 핸들이 사라져서 메뉴가 안 열린 것일 수 있다 — 그 경우도
    // 아래 단언은 통과한다(Issue #62). click이 살아 있는 노드를 때리는지
    // 먼저 고정한다.
    expect(firstColumnHandle.isConnected).toBe(true);
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
    const rendered = renderRealTable();
    const table = replaceWithRowSpanMergedTable(rendered);
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(rendered.editable, {
      pointerId: 1,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerUp(rendered.editable, { pointerId: 1 });
    // 드래그가 정말 실패하는 명령을 때렸는지 같은 인자로 한 번 더 확인한다
    // (실패한 명령은 문서를 바꾸지 않아 상태에 영향이 없다). 병합이 풀려
    // 성공하면 이 테스트는 제목이 말하는 실패 조건을 잃고 성공 경로를
    // 검증하게 된다.
    expect(
      rendered.editor.commands.moveTableRow(rendered.tableBlockId, 0, 1),
    ).toEqual({ ok: false, error: { code: "MERGE_BOUNDARY_CROSSED" } });
    expect(rowsOf(rendered.editor).map((row) => row.id)).toEqual(
      rendered.rowIds,
    );
    // 억제가 아니라 핸들이 사라져서 메뉴가 안 열린 것일 수 있다 — 그 경우도
    // 아래 단언은 통과한다(Issue #62). click이 살아 있는 노드를 때리는지
    // 먼저 고정한다.
    expect(firstRowHandle.isConnected).toBe(true);
    fireEvent.click(firstRowHandle, { detail: 1 });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("재정렬 뒤 합성 click이 오지 않아도 다음 진짜 click은 억제되지 않는다", () => {
    // 억제 키는 뒤이은 click이 소비할 때만 비워진다. 브라우저가 그 합성
    // click을 아예 보내지 않으면(PIT-0019: Chromium은 임계값을 넘는 드래그
    // 뒤 click을 합성하지 않는다) 키가 남아, 사용자가 나중에 그 핸들을
    // 진짜로 클릭할 때 한 번 삼켜진다. block-side-menu는 같은 결함을
    // pointerdown에서 키를 비워 막는다(block-side-menu.tsx:280).
    const { editable, editor, restubGeometry, rowIds, table } =
      renderRealTable();
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
    expect(rowsOf(editor).map((row) => row.id)).toEqual([rowIds[1], rowIds[0]]);
    // 합성 click은 오지 않는다 — 여기서 fireEvent.click을 하지 않는다.

    // 실제 moveTableRow가 표 DOM을 다시 만들어 새 tr/td에는 rect 스텁이 없다.
    // 다시 스텁하지 않으면 geometry가 0이 되어 다음 제스처가 핸들 없는 화면을
    // 때린다.
    restubGeometry();

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
    const { editable, editor, rowIds, table } = renderRealTable();
    const [row1] = Array.from(
      table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
    );
    if (row1 === undefined) throw new Error("행 없음");
    // 모델은 빈 id를 허용하지 않아(model의 문자열 불변식) 실제 편집기로는 이
    // 상태를 만들 수 없다 — 렌더된 DOM의 속성만 비운다. table-handles가 값을
    // 읽는 경로가 getAttribute("data-be-row-id") ?? ""라 이 조작만으로 폴백에
    // 정확히 도달한다. hover 추적(pointerMove(table))이 geometry를 처음 읽기
    // 전에 비워야 이후 렌더가 전부 빈 rowId를 기준으로 handle을 만든다.
    row1.setAttribute("data-be-row-id", "");
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    // 제자리(첫 행 상반부, 105)에 놓는 드래그다. 실제 편집기에서는 재정렬이
    // 일어나면 옮겨진 tr을 모델에서 다시 그려 비워둔 data-be-row-id가 곧바로
    // 복구되고, 그러면 핸들 버튼의 React key(`row-${rowId}`)가 바뀌어 버튼
    // 노드 자체가 교체된다 — 뒤이은 click이 사라진 노드를 때려 억제 로직과
    // 무관하게 실패한다(실측 확인). 검증 대상인 fail-open 분기는
    // hasDragged와 빈 sourceId만 보므로(table-handles.tsx의 handlePointerUp)
    // 행이 실제로 움직였는지와 무관하게 그대로 도달한다.
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 150,
      clientY: 105,
    });
    fireEvent.pointerUp(editable, { pointerId: 1 });
    // 위 좌표가 정말 제자리 드래그였는지 문서로 확인한다 — 재정렬이 일어났다면
    // 이 테스트는 자기가 세운 전제를 잃는다.
    expect(rowsOf(editor).map((row) => row.id)).toEqual(rowIds);
    fireEvent.click(firstRowHandle, { detail: 1 });

    expect(screen.queryByRole("menu")).not.toBeNull();
  });

  it("열 핸들 클릭은 열 메뉴를 열고 헤더 열을 토글한다", () => {
    const { editor } = openColumnMenu();

    expect(
      screen.getByRole("menu", { name: "Table column menu" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Header column" }),
    );
    expect(tableBlockOf(editor).headerColumns).toBe(1);
  });
});

describe("메뉴 명령 실패 시 피드백", () => {
  it("삭제가 LAST_ROW로 거절되면 메뉴를 닫지 않고 실패 메시지를 보여준다", () => {
    // canDelete(TableHandleMenuProps)는 geometry.rows.length > 1일 때만
    // 참이라, 실제로 1행뿐인 표를 마운트하면 Delete row가 처음부터
    // disabled라 클릭이 아예 핸들러에 닿지 않는다(disabled 버튼의 click은
    // jsdom도 디스패치하지 않는다, 실측 확인) — LAST_ROW를 진짜로 받으려면
    // "메뉴가 이미 2행을 전제로 열려 있는데, 그 사이 나머지 행이 지워져
    // 지금은 정말 마지막 행"이라는 순간을 만들어야 한다.
    //
    // 그 순간은 타이밍이 아니라 TableHandles의 실제 불변조건이다. 외부
    // controller를 받은 EditorProvider는 onChange를 never로 막아
    // (editor-provider.tsx) 문서가 바뀌어도 TableHandles를 리렌더시키지
    // 않는다 — geometry는 렌더 시점에만 다시 계산되는 값이라 그대로
    // 구식으로 남는다. 유일한 감시자인 MutationObserver도 geometry를
    // 다시 채우지 않는다 — 메뉴가 가리키는 인덱스가 범위를 벗어날 때만
    // closeMenu를 부른다(아래 "메뉴 대상 인덱스가 무효화되면" describe가
    // 그 경계를 검증한다 — 인덱스가 유효하면 메뉴는 열린 채로 남는다).
    //
    // 그래서 2행 표에서 메뉴를 index 0으로 연 뒤(canDelete=true, Delete
    // row는 disabled가 아니다) 나머지 행(index 1)을 실제 명령으로 지워도
    // Delete row 버튼은 계속 활성 상태로 남는다. 그 상태에서 클릭하면
    // 진짜 deleteTableRow(tableBlockId, 0)이 호출되고, 모델은 이미 1행이라
    // 진짜 LAST_ROW로 거절된다. 이건 조작이 아니라 실제로 일어날 수 있는
    // 상황이다 — 메뉴가 열린 채로 문서가 undo나 다른 경로로 바뀌고
    // 리렌더가 없으면, 사용자가 그 뒤 Delete를 누르는 것과 같다.
    //
    // 진짜 취약점은 여기 있다: 누군가 TableHandles에 문서 변경 구독이나
    // geometry 재계산을 추가하면 이 셋업은 더 이상 작동하지 않는다 —
    // 그리고 그때는 LAST_ROW로 가는 UI 경로 자체가 없어진다(canDelete가
    // 항상 먼저 막으므로). 아래 disabled 단언이 바로 그 변화가 생기면
    // 실패로 드러내는 가드다.
    const { editor, tableBlockId } = openRowMenu();
    const deleteItem = screen.getByRole("menuitem", {
      name: "Delete row",
    }) as HTMLButtonElement;
    // 클릭 전 전제: 지금은 아직 2행이라 버튼이 활성 상태다.
    expect(deleteItem.disabled).toBe(false);

    const removedSibling = editor.commands.deleteTableRow(tableBlockId, 1);
    if (!removedSibling.ok) throw new Error("나머지 행 삭제 fixture 준비 실패");
    // 모델은 진짜 1행이 됐지만, 리렌더를 기다리지 않아 버튼은 아직 그대로다.
    expect(rowsOf(editor)).toHaveLength(1);
    expect(deleteItem.disabled).toBe(false);

    fireEvent.click(deleteItem);

    // 실제 deleteTableRow가 LAST_ROW로 거절돼 행 수는 그대로 1이다.
    expect(rowsOf(editor)).toHaveLength(1);
    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(
      "Can't delete the last row",
    );
  });

  it("삭제가 LAST_COLUMN으로 거절되면 메뉴를 닫지 않고 실패 메시지를 보여준다", () => {
    // 위 LAST_ROW 테스트와 같은 불변조건·같은 기법이다 — 열 쪽 canDelete는
    // geometry.columns.length > 1이라 실제 1열 표는 처음부터 disabled다.
    // TableHandles는 문서 변경을 구독하지 않고 MutationObserver도
    // geometry를 다시 채우지 않으므로, 2열 표에서 메뉴를 연 뒤 나머지
    // 열을 실제 명령으로 지워도 Delete column은 계속 활성 상태로 남는다.
    // 그 버튼을 눌러 진짜 LAST_COLUMN을 받는다.
    const { editor, tableBlockId } = openColumnMenu();
    const deleteItem = screen.getByRole("menuitem", {
      name: "Delete column",
    }) as HTMLButtonElement;
    expect(deleteItem.disabled).toBe(false);

    const removedSibling = editor.commands.deleteTableColumn(tableBlockId, 1);
    if (!removedSibling.ok) throw new Error("나머지 열 삭제 fixture 준비 실패");
    expect(tableBlockOf(editor).columns).toHaveLength(1);
    expect(deleteItem.disabled).toBe(false);

    fireEvent.click(deleteItem);

    expect(tableBlockOf(editor).columns).toHaveLength(1);
    expect(
      screen.getByRole("menu", { name: "Table column menu" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(
      "Can't delete the last column",
    );
  });

  it("그 외 실패는 메뉴를 닫지 않고 일반 실패 메시지를 보여준다", () => {
    // LAST_ROW/LAST_COLUMN 말고 실제로 재현 가능한 실패가 필요하다.
    // setTableCellTextColor(target, null)은 대상 셀에 이미 색이 없으면
    // 문서를 바꾸지 않아(table-grid.ts의 setCellFormat) commitDocument가
    // no-op으로 보고 COMMAND_NOT_APPLICABLE로 거절한다(실측 확인) — 이
    // 코드는 ERROR_MESSAGES(table-command-error-messages.ts)에 없어
    // "Action failed" 폴백으로 떨어진다. LAST_ROW 계열과 달리 disabled
    // 게이트가 없어 그냥 클릭으로 재현된다.
    const { editor } = openRowMenu();
    // 전제: 새로 만든 표라 첫 행에는 아직 글자색이 없다 — 이미 색이
    // 있었다면 "없음" 클릭이 진짜로 지우는 성공 경로가 되어 이 테스트가
    // 노리는 실패를 만들지 못한다.
    expect(rowsOf(editor)[0]?.cells.map((cell) => cell.textColor)).toEqual([
      undefined,
      undefined,
    ]);

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color None" }));

    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Action failed");
  });

  it("다른 행으로 메뉴 대상을 바로 전환하면 이전 실패 메시지가 남지 않는다", () => {
    // 앞선 "그 외 실패"와 같은 실패(색 없음 상태에 "없음"을 눌러
    // COMMAND_NOT_APPLICABLE)를 재사용한다 — LAST_ROW 재사용은 표를 1행으로
    // 줄여야 해서 아래 둘째 행 핸들 클릭(전환 대상)을 없앤다.
    const { editor, table } = renderRealTable();
    expect(rowsOf(editor)[0]?.cells.map((cell) => cell.textColor)).toEqual([
      undefined,
      undefined,
    ]);
    fireEvent.pointerMove(table);
    const rowHandles = screen.getAllByRole("button", { name: rowHandleLabel });
    const [firstRowHandle, secondRowHandle] = rowHandles;
    if (firstRowHandle === undefined || secondRowHandle === undefined) {
      throw new Error("행 핸들 없음");
    }

    fireEvent.click(firstRowHandle);
    fireEvent.click(screen.getByRole("menuitem", { name: "Text color None" }));
    expect(screen.getByRole("alert").textContent).toBe("Action failed");

    fireEvent.click(secondRowHandle);

    // 메뉴 자체가 사라진 것이 아니라 둘째 행으로 다시 열렸는지 고정한다 —
    // 핸들 클릭이 메뉴를 닫아버리는 회귀라도 alert는 똑같이 사라져 그
    // 경우와 "대상 전환으로 이전 실패가 지워졌다"를 구분하지 못한다
    // (Issue #62 공허 단언 부류).
    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("마지막 행/열에서 삭제 비활성화", () => {
  it("행이 1개뿐이면 Delete row가 비활성화되고 클릭해도 명령을 호출하지 않는다", () => {
    const { editor, rowIds } = openRowMenu({ rows: 1, columns: 2 });
    // canDelete=false가 진짜 "행이 1개뿐"이라는 전제에서 나왔는지 고정한다.
    expect(rowsOf(editor)).toHaveLength(1);

    const deleteItem = screen.getByRole("menuitem", { name: "Delete row" });
    expect((deleteItem as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(deleteItem);

    // disabled가 클릭 자체를 막았는지 문서로 본다. 막지 못했다면 실제
    // deleteTableRow가 호출돼 LAST_ROW로 거절되고, 그러면 실패 alert가
    // 뜬다 — 행 수만 보면 "막힘"과 "거절"을 구분하지 못한다(둘 다 1행으로
    // 남는다).
    expect(screen.queryByRole("alert")).toBeNull();
    expect(rowsOf(editor).map((row) => row.id)).toEqual(rowIds);
  });

  it("열이 1개뿐이면 Delete column이 비활성화되고 클릭해도 명령을 호출하지 않는다", () => {
    const { editor, columnIds } = openColumnMenu({ rows: 2, columns: 1 });
    expect(tableBlockOf(editor).columns).toHaveLength(1);

    const deleteItem = screen.getByRole("menuitem", {
      name: "Delete column",
    });
    expect((deleteItem as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(deleteItem);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(tableBlockOf(editor).columns.map((column) => column.id)).toEqual(
      columnIds,
    );
  });
});

describe("메뉴 대상 인덱스가 무효화되면 자동으로 닫힌다", () => {
  it("메뉴가 가리키는 마지막 행이 사라지면 메뉴가 자동으로 닫힌다", async () => {
    const { editor, rowIds, table, tableBlockId } = renderRealTable();
    fireEvent.pointerMove(table);
    const rowHandles = screen.getAllByRole("button", { name: rowHandleLabel });
    const secondRowHandle = rowHandles[1];
    if (secondRowHandle === undefined) throw new Error("둘째 행 핸들 없음");
    fireEvent.pointerDown(secondRowHandle, { pointerId: 1, clientY: 130 });
    fireEvent.pointerUp(secondRowHandle, { pointerId: 1 });
    fireEvent.click(secondRowHandle);
    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();

    await act(async () => {
      // 메뉴가 가리키는 인덱스(1, 마지막 행)를 실제로 지운다. MutationObserver가
      // 관찰하는 mutation이 이 명령이 만드는 것과 같아야 프로덕션의
      // applyTableDomAttributes 경로가 실제로 돈다(Issue #76).
      const deleted = editor.commands.deleteTableRow(tableBlockId, 1);
      if (!deleted.ok) throw new Error("행 삭제 fixture 준비 실패");
      await Promise.resolve();
    });

    // 메뉴가 가리키던 인덱스 1이 정말 사라졌는지 문서로 고정한다 — ok만
    // 보면 다른 행이 지워져도 통과해 "마지막 행이 사라지면"이라는 전제를
    // 잃는다.
    expect(rowsOf(editor).map((row) => row.id)).toEqual([rowIds[0]]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("메뉴가 가리키는 행이 그대로 있으면 다른 행이 사라져도 메뉴는 열린 채로 남는다", async () => {
    const { editor, rowIds, tableBlockId } = openRowMenu();
    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();

    await act(async () => {
      // openRowMenu는 인덱스 0(rowIds[0])에 메뉴를 연다 — 인덱스 1을 지워야
      // 메뉴 대상이 아닌 "다른" 행이 사라지는 조건이 된다.
      const deleted = editor.commands.deleteTableRow(tableBlockId, 1);
      if (!deleted.ok) throw new Error("행 삭제 fixture 준비 실패");
      await Promise.resolve();
    });

    // 대상 행(rowIds[0])이 아니라 정말 "다른" 행이 지워졌는지 고정한다 —
    // 대상 행이 지워졌다면 메뉴가 열린 채로 남는 것은 이 테스트가 말하는
    // 조건이 아니라 우연이 된다.
    expect(rowsOf(editor).map((row) => row.id)).toEqual([rowIds[0]]);
    expect(screen.queryByRole("menu")).not.toBeNull();
  });

  it("메뉴가 가리키는 마지막 열이 data-be-columns에서 사라지면 메뉴가 자동으로 닫힌다", async () => {
    const { editor, table, tableBlockId } = renderRealTable();
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
      // data-be-columns를 손으로 setAttribute하던 자리 — 실제 deleteTableColumn을
      // 불러 serializeTableColumns가 그 속성을 다시 쓰게 한다.
      const deleted = editor.commands.deleteTableColumn(tableBlockId, 1);
      if (!deleted.ok) throw new Error("열 삭제 fixture 준비 실패");
      await Promise.resolve();
    });

    // 메뉴가 가리키던 인덱스 1이 정말 data-be-columns에서 사라졌는지
    // 고정한다 — ok만 보면 다른 열이 지워져도 통과한다.
    expect(tableBlockOf(editor).columns).toHaveLength(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("메뉴가 열린 동안 표 블록이 통째로 사라지면 메뉴 상태도 함께 비워진다", async () => {
    const { editable, editor, table, tableBlockId } = openRowMenu();
    expect(screen.getByRole("menu", { name: "Table row menu" })).toBeTruthy();

    // 실제 둘째 표를 첫 표 뒤에 심는다. mountTableEditor는 role="textbox"
    // host를 getByRole로 한 번만 찾으므로(다중 매치는 던진다) 한 테스트
    // 안에서 mountTableEditor를 두 번 부를 수 없다 — 같은 마운트에
    // insertTable로 표를 하나 더 추가해 "표가 여럿인 문서"를 재현한다.
    const insertedSecondTable = editor.commands.insertTable(tableBlockId, {
      rows: 2,
      columns: 2,
    });
    if (!insertedSecondTable.ok) throw new Error("둘째 표 fixture 준비 실패");
    const secondTableBlockId = insertedSecondTable.value.blockId;
    const secondTable = editable.querySelector<HTMLElement>(
      `table[data-be-block-id="${secondTableBlockId}"]`,
    );
    if (secondTable === null) throw new Error("둘째 표가 렌더되지 않았다");
    // 둘째 표가 실제로 심어졌는지 고정한다 — 못 심었다면 뒤이은 삭제·복구
    // 관찰은 표가 하나뿐인 상태를 검증하는 셈이 되어 전제를 잃는다.
    expect(
      editor.getDocument().blocks.filter((block) => block.type === "table"),
    ).toHaveLength(2);
    // 사라진 표의 menuState가 남으면 activeTableId가 죽은 blockId에 고정돼
    // (table-handles.tsx의 activeTableId 우선순위) 다른 표를 hover해도
    // geometry가 null이라 편집기 전체에서 핸들이 하나도 렌더되지 않는다.
    // 메뉴 자체는 geometry 게이트 때문에 이미 안 보이므로, 메뉴 상태가
    // 실제로 비워졌는지는 남은 표의 핸들 복구로 관찰한다.
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
      const deleted = editor.commands.deleteBlock(tableBlockId);
      if (!deleted.ok) throw new Error("표 블록 삭제 fixture 준비 실패");
      await Promise.resolve();
    });

    // 메뉴가 가리키던 표가 정말 사라졌는지 고정한다 — ok만 보면
    // deleteBlock이 엉뚱한 블록을 지워도 통과한다.
    expect(table.isConnected).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.pointerMove(secondTable);
    expect(
      screen.getAllByRole("button", { name: rowHandleLabel }),
    ).toHaveLength(2);
  });
});
