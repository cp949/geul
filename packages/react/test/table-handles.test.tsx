// @vitest-environment jsdom

/**
 * TableHandles 컴포넌트: 표 행/열 핸들의 hover 노출, 드래그 재정렬, 열 너비
 * 조절, 빠른 확장 컨트롤, 병합 셀 geometry 복구를 검증한다.
 * 핸들 클릭으로 여는 메뉴와 그 클릭 억제는 table-handle-menu.test.tsx가 맡는다.
 *
 * 모든 describe가 실제 createEditor() 마운트 위에서 돈다(Issue #76) —
 * 손으로 조립한 fake 컨트롤러/DOM 레인은 남아 있지 않다. 명령이 진짜라
 * 호출 스파이 대신 문서 결과(rowIdsOf/columnsOf)를 단언한다.
 */

import type { EditorController } from "@cp949/geul-core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TableHandles } from "../src/table-handles.js";
import { mountTableEditor, stubRect, tableBlockOf } from "./mount-editor.js";

// @testing-library/react는 전역 afterEach나 teardown이 함수일 때만 자동
// cleanup을 등록한다(dist/index.js의 typeof afterEach === "function" 분기와
// 그 else의 teardown fallback). vitest는 globals: true일 때만 그 전역을
// 노출하는데 저장소 루트 vitest.config.ts에는 globals도 setupFiles도 없어 자동
// cleanup이 없다(실측: 이 설정에서 둘 다 undefined). 각 it 말미의 unmount로는
// assertion이 먼저 던질 때 DOM이 남아 다음 테스트의 getByRole(...)가
// "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
afterEach(cleanup);

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

/**
 * 실제 편집기를 마운트하고 TableHandles를 얹는다. 반환값의 `host`는
 * role="textbox" 마운트 host, `editable`은 그 안의 contenteditable 노드다 —
 * mountTableEditor가 주는 뜻 그대로 쓴다. 둘을 바꿔 쓰면 host를 겨냥한
 * 조작이 조용히 편집 영역을 때린다.
 */
const renderRealTable = (options?: { rows?: number; columns?: number }) =>
  mountTableEditor({ ...options, children: <TableHandles /> });

/**
 * 표 블록의 행 id 목록. 개수만 세면 어느 행이 움직였는지 구분하지 못하므로
 * 재정렬·삽입 결과를 순서까지 이 목록으로 확인한다.
 */
const rowIdsOf = (editor: EditorController) =>
  tableBlockOf(editor).rows.map((row) => row.id);

/** 표 블록의 열 목록. 열 재정렬(id 순서)과 너비 커밋을 함께 확인한다. */
const columnsOf = (editor: EditorController) => tableBlockOf(editor).columns;

// 리사이즈 시드 검증용 모델 열 너비. 스텁 격자의 셀 너비(mountTableEditor의
// layout.columnWidth=100px)와 일부러 다르게 둔다 — 두 값이 같으면 시작
// 너비가 colgroup col의 모델 너비에서 왔는지 셀 rect에서 왔는지 구분할 수
// 없다.
const RESIZE_SEED_COLUMN_WIDTH = 120;

/**
 * 첫 열의 모델 너비만 120px로 벌린 표를 마운트한다. 셀 rect 격자는 100px
 * 그대로라, 리사이즈 시작 너비가 rect(100)가 아니라 colgroup col의 모델
 * 너비(120)에서 시드되는지를 이 어긋남으로 구분한다(table-handles.tsx의
 * readColumnStyleWidth — 콘텐츠가 렌더 너비를 벌려도 저장 너비가 튀지
 * 않아야 한다).
 *
 * restubGeometry를 쓰지 않는다 — 그쪽은 모델 너비를 layout.columnWidth로
 * 되돌려 이 어긋남을 지운다. 열 너비만 바꾸는 커맨드는 표 노드도 tr/td도
 * 다시 만들지 않아(실측 확인) 마운트 시점 rect 스텁이 그대로 살아 있다.
 */
const renderResizableTable = () => {
  const rendered = renderRealTable();
  const widened = rendered.editor.commands.resizeTableColumn(
    rendered.tableBlockId,
    0,
    RESIZE_SEED_COLUMN_WIDTH,
  );
  if (!widened.ok) throw new Error("첫 열 너비 fixture 준비 실패");
  // 전제 1: 모델 너비가 colgroup col까지 내려갔다. 안 내려갔다면 아래
  // 기대값(180/120px)은 rect 격자에서 나온 값과 구분되지 않는다.
  const col = rendered.table.querySelector<HTMLElement>("colgroup col");
  expect(col?.style.width).toBe("120px");
  // 전제 2: 셀 rect는 100px 그대로다 — 두 값이 같아지면 이 fixture가
  // 만들려던 어긋남 자체가 사라진다.
  const cell = rendered.table.querySelector<HTMLElement>("[data-be-column-id]");
  expect(cell?.getBoundingClientRect().width).toBe(100);
  return rendered;
};

/**
 * 첫 행의 두 열을 columnSpan 2 셀 하나로 병합한 문서를 심고, 다시 만들어진
 * 표 노드에 스텁 격자를 씌워 돌려준다. 첫 행만 보고 열 경계를 읽으면 둘째
 * 열 핸들이 사라지는 회귀(PIT-0004)를 만드는 상태다.
 *
 * 병합 명령을 쓰지 않는 이유: mergeTableCells는 tableBlockId 하나만 받고 병합
 * 범위를 넘길 파라미터가 아예 없다 — 범위의 유일한 권위가 현재
 * CellSelection인데(editor-controller.ts), CellSelection을 직접 세우려면
 * @tiptap/pm/tables가 필요하고 packages/react는 Tiptap에 의존할 수
 * 없다(ADR-0002 결정 본문에서 파생하는 금지 — Consequences가 이름으로
 * 적은 것은 @tiptap/react뿐이다) — package.json dependencies에 없어
 * 여기서는 해석조차 되지
 * 않는다(실측: MODULE_NOT_FOUND). columnSpan은 문서 필드라 모델을 직접 만들어
 * replaceDocument로 심을 수 있다 — 컨트롤러도 명령도 진짜다.
 *
 * replaceDocument는 tiptap 편집기를 통째로 다시 만들어 마운트 시점의 table·
 * editable 참조를 문서에서 떼어낸다(실측 확인) — 그래서 표를 다시 찾아
 * 돌려준다. 스텁도 restubGeometry가 아니라 여기서 직접 씌운다: 병합된 첫
 * 행은 셀이 하나뿐이라 "모든 행이 열 개수만큼 셀을 갖는다"는 그쪽 격자
 * 전제가 깨진다.
 */
const replaceWithColumnSpanMergedTable = (
  rendered: ReturnType<typeof renderRealTable>,
): HTMLElement => {
  const document0 = rendered.editor.getDocument();
  const block = tableBlockOf(rendered.editor);
  const [row0, row1] = block.rows;
  if (row0 === undefined || row1 === undefined) {
    throw new Error("병합할 2x2 표를 찾지 못했다");
  }
  const [topLeftCell] = row0.cells;
  if (topLeftCell === undefined) {
    throw new Error("병합할 2x2 표의 셀을 찾지 못했다");
  }
  const replaced = rendered.editor.replaceDocument({
    ...document0,
    blocks: document0.blocks.map((candidate) =>
      candidate.id === block.id
        ? {
            ...block,
            // 병합 셀이 덮는 자리(첫 행 둘째 열)는 행 cells에서 빠진다.
            rows: [
              { ...row0, cells: [{ ...topLeftCell, columnSpan: 2 }] },
              row1,
            ],
          }
        : candidate,
    ),
  });
  if (!replaced.ok) throw new Error("병합 문서 fixture 준비 실패");

  const table = rendered.host.querySelector<HTMLElement>(
    `table[data-be-block-id="${rendered.tableBlockId}"]`,
  );
  if (table === null) throw new Error("병합 표가 렌더되지 않았다");
  const [mergedRow, remainderRow] = Array.from(
    table.querySelectorAll<HTMLElement>("[data-be-row-id]"),
  );
  if (mergedRow === undefined || remainderRow === undefined) {
    throw new Error("병합 표의 행이 없다");
  }
  const mergedCell = mergedRow.querySelector<HTMLElement>(
    "[data-be-column-id]",
  );
  const [bottomLeft, bottomRight] = Array.from(
    remainderRow.querySelectorAll<HTMLElement>("[data-be-column-id]"),
  );
  if (
    mergedCell === null ||
    bottomLeft === undefined ||
    bottomRight === undefined
  ) {
    throw new Error("병합 표의 셀이 없다");
  }
  stubRect(table, { left: 100, top: 100, width: 200, height: 60 });
  stubRect(mergedRow, { left: 100, top: 100, width: 200, height: 30 });
  stubRect(remainderRow, { left: 100, top: 130, width: 200, height: 30 });
  stubRect(mergedCell, { left: 100, top: 100, width: 200, height: 30 });
  stubRect(bottomLeft, { left: 100, top: 130, width: 100, height: 30 });
  stubRect(bottomRight, { left: 200, top: 130, width: 100, height: 30 });
  // 전제 1: 첫 행이 정말 병합됐다. colspan 속성이 열 경계 판정의 입력이라
  // (readRowBoxes의 spansColumns), 이게 없으면 아래 두 테스트는 병합되지
  // 않은 평범한 표를 검증하면서 그대로 통과한다.
  expect(mergedCell.getAttribute("colspan")).toBe("2");
  // 전제 2: 스텁이 문서에 붙어 있는 표에 씌워졌다. replaceDocument가 표
  // 노드를 갈아치우므로, 떨어져 나간 노드를 칠했다면 여기 rect는 0으로 남고
  // 핸들이 아예 안 그려진다.
  expect(table.getBoundingClientRect().height).toBe(60);
  return table;
};

describe("표 위에 hover하면 핸들을 표시한다", () => {
  it("행 핸들과 열 핸들, 빠른 확장 버튼을 함께 표시한다", () => {
    const { table } = renderRealTable();

    fireEvent.pointerMove(table);

    expect(
      screen.getAllByRole("button", { name: rowHandleLabel }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: columnHandleLabel }),
    ).toHaveLength(2);
    expect(screen.getByRole("button", { name: addRowLabel })).not.toBeNull();
    expect(screen.getByRole("button", { name: addColumnLabel })).not.toBeNull();
  });

  it("표 밖으로 나가면 핸들을 숨긴다", () => {
    const { editable, table } = renderRealTable();
    fireEvent.pointerMove(table);
    expect(screen.queryByRole("button", { name: addRowLabel })).not.toBeNull();

    // 표 오른쪽/아래 경계(300, 160)에서 hover 여백(HANDLE_HOVER_MARGIN=28)을
    // 확실히 넘어선 지점. 좌표를 생략하면 jsdom이 0으로 채워 우연히 여백
    // 밖이 되는데, 그러면 "표 밖으로 나갔다"가 아니라 "좌표가 없다"를
    // 검증하게 된다(Issue #62).
    fireEvent.pointerMove(editable, { clientX: 500, clientY: 500 });

    expect(screen.queryByRole("button", { name: addRowLabel })).toBeNull();
  });

  it("표와 핸들 사이 여백으로 이동해도 핸들이 유지된다", () => {
    const { editable, table } = renderRealTable();
    fireEvent.pointerMove(table);
    expect(screen.queryByRole("button", { name: addRowLabel })).not.toBeNull();

    // 표 왼쪽 경계(100)와 행 핸들(76~96) 사이의 여백 지점.
    fireEvent.pointerMove(editable, { clientX: 98, clientY: 110 });

    expect(screen.queryByRole("button", { name: addRowLabel })).not.toBeNull();
  });
});

describe("행/열 핸들을 드래그해 재정렬한다", () => {
  it("행 핸들을 두 번째 행 아래로 드래그하면 moveTableRow(0, 1)을 호출한다", () => {
    const { editable, editor, rowIds, table } = renderRealTable();
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    // clientX를 표 가로 범위 안(150)으로 준다 — 생략하면 jsdom이 0으로
    // 채우고 그건 hover 여백 밖이라 hoverTableId가 지워진다. 드래그 중에는
    // reorderState가 activeTableId를 쥐고 있어 이 커맨드까지는 도달하지만,
    // 좌표 없는 pointerMove는 그 자체로 Issue #62의 실패 모양이다.
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    // 실제 moveTableRow(tableBlockId, 0, 1)이 돌았음을 남은 행 순서로 본다.
    expect(rowIdsOf(editor)).toEqual([rowIds[1], rowIds[0]]);
  });

  it("열 핸들을 두 번째 열 오른쪽으로 드래그하면 moveTableColumn(0, 1)을 호출한다", () => {
    const { columnIds, editable, editor, table } = renderRealTable();
    fireEvent.pointerMove(table);
    const [firstColumnHandle] = screen.getAllByRole("button", {
      name: columnHandleLabel,
    });
    if (firstColumnHandle === undefined) throw new Error("열 핸들 없음");

    fireEvent.pointerDown(firstColumnHandle, { pointerId: 1, clientX: 100 });
    // clientY도 표 세로 범위 안(110)으로 준다 — 위 행 테스트의 clientX와
    // 같은 이유다.
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 250,
      clientY: 110,
    });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    // PIT-0004: 열 순서의 권위는 모델 columns(=data-be-columns)다.
    expect(columnsOf(editor).map((column) => column.id)).toEqual([
      columnIds[1],
      columnIds[0],
    ]);
  });

  it("제자리로 되돌리면 moveTableRow를 호출하지 않는다", () => {
    const { editable, editor, table } = renderRealTable();
    const documentBeforeDrag = editor.getDocument();
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    // 첫 행 상반부(105 < 100 + 30/2)라 목표 인덱스가 출발 인덱스와 같다.
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 150,
      clientY: 105,
    });
    // 드래그가 실제로 진행됐는지 먼저 고정한다 — 드래그가 시작조차 안 됐다면
    // 아래 "문서가 안 바뀐다"는 억제 로직과 무관하게 통과한다(Issue #62).
    // 재정렬 가이드는 hasDragged와 목표 인덱스가 모두 있을 때만 그려진다.
    expect(
      document.querySelector("[data-be-table-reorder-guide]"),
    ).not.toBeNull();
    fireEvent.pointerUp(editable, { pointerId: 1 });

    // 커맨드 호출 자체를 볼 수 없으니 문서 전체가 그대로인지로 본다 — 실제
    // 컨트롤러에서 moveTableRow(0, 0)은 문서를 바꾸지 않아
    // COMMAND_NOT_APPLICABLE로 끝나므로, 호출 여부와 문서 불변은 여기서
    // 관측상 구분되지 않는다.
    expect(editor.getDocument()).toEqual(documentBeforeDrag);
  });

  it("Escape로 드래그를 취소하면 아무 명령도 호출하지 않는다", () => {
    const { editable, editor, table } = renderRealTable();
    const documentBeforeDrag = editor.getDocument();
    fireEvent.pointerMove(table);
    const [firstRowHandle] = screen.getAllByRole("button", {
      name: rowHandleLabel,
    });
    if (firstRowHandle === undefined) throw new Error("행 핸들 없음");

    fireEvent.pointerDown(firstRowHandle, { pointerId: 1, clientY: 100 });
    // 둘째 행 아래(150)까지 끈다 — 취소하지 않았다면 재정렬됐을 좌표다.
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 150,
      clientY: 150,
    });
    // 전제: 취소 전에는 실제로 드래그가 진행 중이고 목표 인덱스도 잡혔다.
    expect(
      document.querySelector("[data-be-table-reorder-guide]"),
    ).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    // Escape가 목표 인덱스를 지웠는지 가이드로 확인한다 — 지우지 못했다면
    // 아래 pointerUp이 재정렬을 커밋한다.
    expect(document.querySelector("[data-be-table-reorder-guide]")).toBeNull();
    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(editor.getDocument()).toEqual(documentBeforeDrag);
  });
});

describe("열 경계를 드래그해 너비를 조절한다", () => {
  it("드래그 중에는 명령을 호출하지 않고 pointer-up에 한 번만 resizeTableColumn을 호출한다", () => {
    const { editable, editor, table } = renderResizableTable();
    fireEvent.pointerMove(table);
    const resizeHandle = document.querySelector(
      "[data-be-table-resize-handle]",
    );
    if (resizeHandle === null) throw new Error("resize 핸들 없음");

    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 240,
      clientY: 110,
    });
    // 드래그 중에는 모델이 그대로다 — 프레임마다 커밋하면 여기서 160이 된다.
    expect(columnsOf(editor)[0]?.width).toBe(120);

    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 260,
      clientY: 110,
    });
    const revisionBeforeCommit = editor.getDocument().revision;
    fireEvent.pointerUp(editable, { pointerId: 1 });

    // 시작 너비는 셀 rect(100px)가 아닌 colgroup col의 모델 너비(120px)에서
    // 시드된다 — 콘텐츠가 렌더 너비를 강제로 벌려도 저장 너비가 튀지 않는다.
    expect(columnsOf(editor)[0]?.width).toBe(180);
    // "한 번만": 커밋 하나가 revision을 정확히 1 올린다(editor-controller의
    // commitDocument). 중간 프레임까지 커밋했다면 2 이상 오른다.
    expect(editor.getDocument().revision).toBe(revisionBeforeCommit + 1);
  });

  it("드래그 중에는 col 요소의 너비를 프레임 단위로 시각 갱신한다", async () => {
    const { editable, editor, table } = renderResizableTable();
    fireEvent.pointerMove(table);
    const resizeHandle = document.querySelector(
      "[data-be-table-resize-handle]",
    );
    if (resizeHandle === null) throw new Error("resize 핸들 없음");

    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 260,
      clientY: 110,
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const col = table.querySelector<HTMLElement>("colgroup col");
    expect(col?.style.width).toBe("180px");
    // 시각만 갱신했을 뿐 모델은 아직 시작 너비다. 표 NodeView가 col의
    // attribute 변이를 ignoreMutation으로 걸러야 이 시각 갱신이 즉시
    // 되돌려지지 않는다(table-extension.ts).
    expect(columnsOf(editor)[0]?.width).toBe(120);

    fireEvent.pointerUp(editable, { pointerId: 1 });
  });

  it("Escape로 리사이즈를 취소하면 명령을 호출하지 않고 원래 너비로 복원한다", async () => {
    const { editable, editor, table } = renderResizableTable();
    fireEvent.pointerMove(table);
    const resizeHandle = document.querySelector(
      "[data-be-table-resize-handle]",
    );
    if (resizeHandle === null) throw new Error("resize 핸들 없음");

    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(editable, {
      pointerId: 1,
      clientX: 260,
      clientY: 110,
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const col = table.querySelector<HTMLElement>("colgroup col");
    // 전제: 취소 전에 시각 너비가 실제로 벌어져 있었다. 이 단언이 없으면
    // 프레임 갱신이 아예 안 돌아 처음부터 120px인 경우도 "복원했다"로
    // 통과한다.
    expect(col?.style.width).toBe("180px");

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    expect(col?.style.width).toBe("120px");
    expect(columnsOf(editor)[0]?.width).toBe(120);
  });

  it("최소 너비 아래로는 조절하지 않는다", () => {
    const { editable, editor, table } = renderResizableTable();
    fireEvent.pointerMove(table);
    const resizeHandle = document.querySelector(
      "[data-be-table-resize-handle]",
    );
    if (resizeHandle === null) throw new Error("resize 핸들 없음");

    fireEvent.pointerDown(resizeHandle, { pointerId: 1, clientX: 200 });
    // 표 왼쪽 밖으로 한참 끈다(120 - 1200 = -1080). 여기서는 clientY를 주지
    // 않는다 — 어차피 clientX가 hover 여백 밖이라 hoverTableId는 지워지고,
    // geometry는 resizeState가 계속 쥐고 있어 커밋까지 그대로 간다.
    fireEvent.pointerMove(editable, { pointerId: 1, clientX: -1000 });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    // 오버레이가 MIN_COLUMN_WIDTH(48)로 clamp해서 보내고, 실제
    // resizeTableColumn도 48을 범위 안으로 받아들인다.
    expect(columnsOf(editor)[0]?.width).toBe(48);
  });
});

describe("표 오른쪽/아래쪽 빠른 확장 컨트롤", () => {
  it("Add row 클릭 시 마지막 행 뒤에 행을 추가한다", () => {
    const { editor, rowIds, table } = renderRealTable();
    fireEvent.pointerMove(table);

    fireEvent.click(screen.getByRole("button", { name: addRowLabel }));

    // 기존 두 행이 앞에 그대로 남아야 "마지막 행 뒤"(인덱스 2)에 들어간 것이다
    // — 개수만 세면 앞이나 중간에 끼어든 경우와 구분하지 못한다.
    const ids = rowIdsOf(editor);
    expect(ids).toHaveLength(3);
    expect(ids.slice(0, 2)).toEqual(rowIds);
  });

  it("Add column 클릭 시 마지막 열 뒤에 열을 추가한다", () => {
    const { columnIds, editor, table } = renderRealTable();
    fireEvent.pointerMove(table);

    fireEvent.click(screen.getByRole("button", { name: addColumnLabel }));

    const ids = columnsOf(editor).map((column) => column.id);
    expect(ids).toHaveLength(3);
    expect(ids.slice(0, 2)).toEqual(columnIds);
  });
});

describe("첫 행이 병합된 표의 열 geometry", () => {
  // 첫 행이 colspan=2로 병합되면 그 행에는 열마다 하나씩인 [data-be-column-id]
  // 셀이 없다 — 첫 행만 보고 열 경계를 읽으면 두 번째 열 핸들이 사라진다.
  // 병합되지 않은 둘째 행의 셀 rect로 geometry를 복구해야 한다(PIT-0004).

  it("둘째 열 핸들이 둘째 행의 비병합 셀 경계에 위치한다", () => {
    const rendered = renderRealTable();
    const table = replaceWithColumnSpanMergedTable(rendered);

    fireEvent.pointerMove(table);

    const columnHandles = screen.getAllByRole("button", {
      name: columnHandleLabel,
    });
    expect(columnHandles).toHaveLength(2);
    // 열 핸들은 열 중앙(left + width/2 - 10)에 놓인다 — 둘째 열(둘째 행의
    // 오른쪽 셀: left 200, width 100)이면 240이어야 한다. 첫 행만 봤다면
    // 둘째 열 핸들 자체가 없어 이 값이 나올 수 없었다.
    expect(columnHandles[1]?.style.left).toBe("240px");
  });

  it("병합 셀이 가로지르는 행에는 리사이즈 strip을 그리지 않는다", () => {
    const rendered = renderRealTable();
    const table = replaceWithColumnSpanMergedTable(rendered);

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
  });
});
