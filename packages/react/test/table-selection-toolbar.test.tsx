// @vitest-environment jsdom

/**
 * TableSelectionToolbar 컴포넌트: 표 셀 범위 선택 시 병합·서식 버튼 노출,
 * 병합된 셀에 캐럿을 두면 분할·서식 버튼 노출, 병합·분할 명령 호출, Cell
 * formatting 색상 메뉴의 열기·닫기를 검증한다.
 *
 * 병합 셀 캐럿 레인(분할·서식·실패 피드백)은 실제 createEditor() 마운트
 * 위에서 돈다(Issue #76) — 명령이 진짜라 호출 스파이 대신 문서 결과를
 * 단언한다. 셀 범위 선택(CellSelection) 레인만 fake 컨트롤러로 남는다.
 * 남긴 이유는 fakeController 위 주석과 각 테스트의 잔여 주석에 있다.
 */

import type { EditorController, TableCellSelection } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider } from "../src/index.js";
import { TableSelectionToolbar } from "../src/table-selection-toolbar.js";
import { mountTableEditor, stubRect } from "./mount-editor.js";
import { queryMountedEditable } from "./query-mounted-editable.js";

// vitest.config.ts에 globals도 setupFiles도 없어 자동 cleanup이 없다. 각 it
// 말미의 unmount로는 assertion이 먼저 던질 때 DOM이 남아 다음 테스트의
// getByRole(...)가 "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
// block-side-menu.test.tsx와 같은 afterEach(cleanup)을 쓴다.
afterEach(cleanup);

const mergeLabel = "Merge cells";
const splitLabel = "Split cell";
const formatLabel = "Cell formatting";

// 잔여 6개가 실제로 덮어쓰는 것만 남긴다. 쓰이지 않는 옵션을 남겨 두면
// 다음 사람이 새 테스트를 실제 마운트가 아니라 이 fake에 연결하게 된다.
type FakeControllerOptions = {
  getTableCellSelection?: () => TableCellSelection | null;
  mergeTableCells?: EditorController["commands"]["mergeTableCells"];
};

/**
 * 셀 범위 선택(CellSelection) 상태를 흉내내는 fake 컨트롤러. 이 레인이 실제
 * 마운트로 넘어가지 못한 이유를 한 곳에 적는다 — 각 테스트의 잔여 주석은
 * 여기서 갈라지는 구체적 상태만 짚는다.
 *
 * `mergeable`(cellIds 2개 이상)과 트리플클릭한 단일 셀 선택은 둘 다
 * ProseMirror의 CellSelection에서만 나온다(editor-controller.ts의
 * getTableCellSelection). 그런데 CellSelection을 세우려면
 * `@tiptap/pm/tables`가 필요하고 packages/react는 Tiptap/ProseMirror에
 * 의존할 수 없다(ADR-0002 패키지 경계, pnpm check:boundaries가 강제).
 * EditorController의 공개 표면에도 선택을 세우는 API가 없다 —
 * getTableCellSelection은 읽기 전용이고 나머지는 전부 문서 명령이다.
 * Task 7이 병합 셀을 replaceDocument로 심을 수 있었던 것은 rowSpan/columnSpan이
 * 문서 필드이기 때문이고, CellSelection은 문서가 아니라 선택 상태라 같은
 * 수법이 통하지 않는다.
 *
 * 실제 마운트 위에서 브라우저가 CellSelection을 만드는 경로도 전부 막힌다
 * (실측 확인): 셀을 가로지르는 DOM Selection·트리플클릭(mousedown detail 3)은
 * prosemirror-view의 posAtCoords가 jsdom에 없는 document.elementFromPoint를
 * 불러 "TypeError: ...elementFromPoint is not a function"으로 죽고,
 * Shift+Arrow는 레이아웃 rect에 기대는 endOfTextblock 때문에 선택을 만들지
 * 못해 .selectedCell 데코레이션이 0개로 남는다. 그 상태에서
 * editor.commands.mergeTableCells는 COMMAND_NOT_APPLICABLE을 돌려준다.
 */
const fakeController = ({
  getTableCellSelection = () => null,
  mergeTableCells = () => ({ ok: true, value: undefined }),
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
    splitTableCell: vi.fn(() => ({ ok: true, value: undefined })),
    toggleTableHeaderRow: vi.fn(() => ({ ok: true, value: undefined })),
    toggleTableHeaderColumn: vi.fn(() => ({ ok: true, value: undefined })),
    deleteTableRow: vi.fn(() => ({ ok: true, value: undefined })),
    deleteTableColumn: vi.fn(() => ({ ok: true, value: undefined })),
    setTableCellTextColor: vi.fn(() => ({ ok: true, value: undefined })),
    setTableCellBackgroundColor: vi.fn(() => ({
      ok: true,
      value: undefined,
    })),
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
 * fake 컨트롤러를 EditorProvider에 꽂는다. 실제 마운트 레인은
 * mountTableEditor가 같은 일을 하므로 이 헬퍼는 fake 레인 전용이다.
 */
const withProvider = (
  controller: ReturnType<typeof fakeController>,
  children: React.ReactNode,
) => (
  <EditorProvider editor={controller as unknown as EditorController}>
    {children}
  </EditorProvider>
);

/**
 * fake 컨트롤러가 조립한 표 DOM을 렌더하고 셀 rect를 씌운다. 실제 격자와
 * 같은 값(100px 폭, 30px 높이)을 써 툴바 앵커 계산이 두 레인에서 갈라지지
 * 않게 한다.
 */
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
  return { table, cell1, cell2 };
};

const triggerSelectionChange = () => {
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
};

// 병합 셀 fixture의 rect 격자. 열이 2개(각 100px)인 표를 colspan 2 셀
// 하나가 가로지르므로 셀 폭은 200px이다.
const MERGED_LAYOUT = { left: 100, top: 100, width: 200, rowHeight: 30 };

/**
 * 실제 편집기를 마운트하고 TableSelectionToolbar를 얹는다. 편집 영역에
 * 미리 초점을 준다 — ProseMirror는 초점이 없으면 DOM 선택 변화를 무시하므로
 * (hasFocusAndSelection) placeCaret이 조용히 no-op가 된다.
 */
const renderRealToolbar = () => {
  const rendered = mountTableEditor({ children: <TableSelectionToolbar /> });
  rendered.editable.focus();
  expect(document.activeElement).toBe(rendered.editable);
  return rendered;
};

/**
 * 병합 표에 rect 격자를 씌우고 표·셀 노드를 돌려준다. 표 DOM을 다시 만드는
 * 명령(replaceDocument, deleteTableRow) 뒤에 다시 부른다 — 새로 만들어진
 * td에는 스텁이 없어 rect가 0이 된다.
 *
 * mountTableEditor의 restubGeometry를 쓰지 않는다: 그쪽은 "모든 행이 열
 * 개수만큼 셀을 갖는다"는 균일 격자를 전제하는데, 이 fixture는 행마다
 * colspan 2 셀이 하나뿐이라 셀 순서가 곧 행 순서다.
 */
const stubMergedGeometry = (host: HTMLElement, tableBlockId: string) => {
  const table = host.querySelector<HTMLElement>(
    `table[data-be-block-id="${tableBlockId}"]`,
  );
  if (table === null) throw new Error("병합 표를 찾지 못했다");
  const cells = Array.from(
    table.querySelectorAll<HTMLElement>("[data-be-cell-id]"),
  );
  stubRect(table, {
    left: MERGED_LAYOUT.left,
    top: MERGED_LAYOUT.top,
    width: MERGED_LAYOUT.width,
    height: MERGED_LAYOUT.rowHeight * cells.length,
  });
  cells.forEach((cell, index) => {
    stubRect(cell, {
      left: MERGED_LAYOUT.left,
      top: MERGED_LAYOUT.top + index * MERGED_LAYOUT.rowHeight,
      width: MERGED_LAYOUT.width,
      height: MERGED_LAYOUT.rowHeight,
    });
  });
  return { cells, table };
};

/** 실제 문서에서 표 블록을 읽는다. 호출 스파이 대신 이 결과를 단언한다. */
const tableBlockOf = (editor: EditorController) => {
  const block = editor.getDocument().blocks[1];
  if (block?.type !== "table") throw new Error("표 블록을 찾지 못했다");
  return block;
};

/**
 * 표 블록에서 cellId로 셀을 찾는다. 색상 명령이 어느 셀에 적용됐는지
 * 문서에서 확인할 때 쓴다 — 대상을 틀려도 "무언가 칠해졌다"로는 안 걸린다.
 */
const cellOf = (editor: EditorController, cellId: string) =>
  tableBlockOf(editor)
    .rows.flatMap((row) => row.cells)
    .find((cell) => cell.id === cellId);

/**
 * 두 행이 각각 columnSpan 2 병합 셀 하나인 표를 심고 실제 편집기를
 * 마운트한다. 병합 셀이 둘인 이유는 "선택 대상이 바뀌면" 계열 테스트가
 * 캐럿을 옮겨 갈 두 번째 병합 셀을 필요로 하기 때문이다.
 *
 * 병합 명령을 쓰지 않는 이유: mergeTableCells는 CellSelection만을 병합
 * 범위의 권위로 삼는데(editor-controller.ts) react에서는 CellSelection을
 * 만들 수 없다(위 fakeController 주석). rowSpan/columnSpan은 문서 필드이므로
 * 모델을 직접 만들어 replaceDocument로 심는다 — 컨트롤러도 명령도 진짜다
 * (table-handles.test.tsx의 replaceWithColumnSpanMergedTable과 같은 기법).
 *
 * replaceDocument는 tiptap 편집기를 통째로 다시 만들어 마운트 시점의 table·
 * editable 참조를 문서에서 떼어낸다(실측 확인) — 그래서 둘 다 다시 찾아
 * 돌려준다. 캐럿을 놓으려면 초점이 필요하므로 새 편집 영역에 다시 준다.
 */
const renderMergedCellTable = () => {
  const rendered = renderRealToolbar();
  const document0 = rendered.editor.getDocument();
  const block = tableBlockOf(rendered.editor);
  const [row0, row1] = block.rows;
  if (row0 === undefined || row1 === undefined) {
    throw new Error("병합할 2x2 표를 찾지 못했다");
  }
  const [firstRowCell] = row0.cells;
  const [secondRowCell] = row1.cells;
  if (firstRowCell === undefined || secondRowCell === undefined) {
    throw new Error("병합할 2x2 표의 셀을 찾지 못했다");
  }
  const replaced = rendered.editor.replaceDocument({
    ...document0,
    blocks: document0.blocks.map((candidate) =>
      candidate.id === block.id
        ? {
            ...block,
            // 병합 셀이 덮는 자리(각 행의 둘째 열)는 행 cells에서 빠진다.
            rows: [
              { ...row0, cells: [{ ...firstRowCell, columnSpan: 2 }] },
              { ...row1, cells: [{ ...secondRowCell, columnSpan: 2 }] },
            ],
          }
        : candidate,
    ),
  });
  if (!replaced.ok) throw new Error("병합 문서 fixture 준비 실패");

  const { cells, table } = stubMergedGeometry(
    rendered.host,
    rendered.tableBlockId,
  );
  const [firstMergedCell, secondMergedCell] = cells;
  if (firstMergedCell === undefined || secondMergedCell === undefined) {
    throw new Error("병합 표의 셀이 없다");
  }
  // 전제 1: 두 행이 정말 병합됐다. colspan이 없으면 아래 테스트들은
  // getTableCellSelection이 null인 평범한 표를 대상으로 돌게 된다.
  expect(cells).toHaveLength(2);
  expect(firstMergedCell.getAttribute("colspan")).toBe("2");
  expect(secondMergedCell.getAttribute("colspan")).toBe("2");
  // 전제 2: 스텁이 문서에 붙어 있는 표에 씌워졌다. replaceDocument가 표
  // 노드를 갈아치우므로, 떨어져 나간 노드를 칠했다면 rect가 0으로 남는다.
  expect(table.getBoundingClientRect().height).toBe(60);

  const editable = queryMountedEditable(rendered.host);
  editable.focus();
  expect(document.activeElement).toBe(editable);

  return {
    ...rendered,
    editable,
    firstMergedCell,
    firstMergedCellId: firstRowCell.id,
    secondMergedCellId: secondRowCell.id,
    table,
  };
};

/**
 * 편집기 안의 노드(병합 셀, 본문 문단)에 실제 DOM 캐럿을 놓는다.
 * EditorController에는 선택을 세우는 공개 API가 없으므로
 * (getTableCellSelection은 읽기 전용) 실제 편집기의 선택을 움직이는 유일한
 * 허용 경로다 — ProseMirror의 DOMObserver가 selectionchange를 받아 자기
 * state.selection을 DOM에서 다시 읽는다(실측 확인).
 *
 * 여기서 발행하는 selectionchange는 편집기 동기화용이다. 툴바가 그 선택을
 * 읽게 하려면 테스트가 triggerSelectionChange를 따로 불러야 한다 — 툴바의
 * 리스너가 편집기 리스너보다 먼저 등록돼(children이 EditorContent보다 앞)
 * 첫 발행 때는 아직 갱신 전 선택을 본다.
 */
const placeCaret = (node: HTMLElement) => {
  act(() => {
    const selection = node.ownerDocument.getSelection();
    if (selection === null) throw new Error("DOM 선택을 얻지 못했다");
    const range = node.ownerDocument.createRange();
    range.setStart(node, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    node.ownerDocument.dispatchEvent(new Event("selectionchange"));
  });
};

/**
 * 초점을 편집 영역 밖(방금 누른 툴바 버튼)으로 옮긴다. fixture가 캐럿을
 * 놓느라 편집 영역에 초점을 준 채로 두면 "초점을 편집기로 되돌린다" 단언이
 * 처음부터 편집기에 있던 초점을 다시 보는 공허한 단언이 된다.
 */
const focusOutsideEditor = (element: HTMLElement) => {
  element.focus();
  expect(document.activeElement).toBe(element);
};

describe("셀 범위를 선택하면 병합·서식 툴바를 표시한다", () => {
  // vi.fn() 레인에 남긴 이유: cellIds가 2개 이상(mergeable)인 상태는
  // CellSelection에서만 나오는데, react는 CellSelection을 세울 수 없다 —
  // ADR-0002 패키지 경계가 @tiptap/pm 의존을 금지하고 EditorController에는
  // 선택을 세우는 공개 API가 없다.
  // 실제로 시도한 것: 실제 마운트에서 두 셀을 가로지르는 DOM Selection을
  // 세우고 selectionchange를 발행했지만 getTableCellSelection은 null,
  // .selectedCell 데코레이션도 0개였다(실측).
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

  // vi.fn() 레인에 남긴 이유: 실제 mergeTableCells는 현재 선택이
  // CellSelection일 때만 동작하고(editor-controller.ts의 가드) react는 그
  // 선택을 만들 수 없다 — ADR-0002 패키지 경계.
  // 실제로 시도한 것: 실제 마운트에서 셀에 캐럿을 두고
  // editor.commands.mergeTableCells를 불렀더니
  // {code:"COMMAND_NOT_APPLICABLE", command:"mergeTableCells"}로 거절됐고,
  // Merge cells 버튼 자체가 뜨지 않아 클릭 대상도 없었다(실측).
  it("Merge cells 클릭 시 mergeTableCells(tableBlockId)를 호출한다", () => {
    const controller = mergeableSelectionController();
    const { cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: mergeLabel }));

    expect(controller.commands.mergeTableCells).toHaveBeenCalledWith("table-1");
  });

  // vi.fn() 레인에 남긴 이유: "셀 2개를 보고하는 선택인데 .selectedCell
  // 데코레이션은 없다"는 상태 자체가 실제 컨트롤러에서 만들어지지 않는다 —
  // 데코레이션은 tableEditing 플러그인이 CellSelection에 붙이므로 cellIds가
  // 2개면 항상 함께 존재한다. 방어 분기(cellSelectionBounds의 null)를
  // 검증하는 테스트라 fake로만 세울 수 있다.
  // 실제로 시도한 것: 실제 마운트에서 cellIds 2개짜리 선택을 만들 방법이
  // 없었다(위 두 테스트의 조사와 같음) — ADR-0002 패키지 경계.
  it("selectedCell 데코레이션이 없으면(경계 계산 불가) 아무 툴바도 표시하지 않는다", () => {
    const controller = mergeableSelectionController();
    renderTable(controller);

    triggerSelectionChange();

    expect(screen.queryByRole("button", { name: mergeLabel })).toBeNull();
  });

  it("표 셀 선택이 없으면 아무 툴바도 표시하지 않는다", () => {
    const { editor, firstMergedCell, firstMergedCellId, tableBlockId } =
      renderMergedCellTable();
    placeCaret(firstMergedCell);
    triggerSelectionChange();
    // 전제: 툴바가 실제로 떠 있는 상태에서 시작한다. 이 단언이 없으면 아래
    // 부재는 "캐럿 조작이 편집기에 닿지도 않았다"로도 통과한다(Issue #62).
    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();

    // 캐럿을 그대로 둔 채 그 셀의 병합만 푼다 — 표도 캐럿도 살아 있는데 셀
    // 선택만 사라진 상태다. 병합되지 않은 셀 안의 캐럿은 셀 선택이 아니다
    // (spec 7.2, 표에 타이핑하는 내내 툴바가 떠 있지 않게 하는 계약).
    const split = editor.commands.splitTableCell(
      tableBlockId,
      firstMergedCellId,
    );
    expect(split.ok).toBe(true);
    // 전제: 셀 선택이 정말 사라졌다.
    expect(editor.getTableCellSelection()).toBeNull();

    triggerSelectionChange();

    expect(screen.queryByRole("button", { name: mergeLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: splitLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: formatLabel })).toBeNull();
  });

  // vi.fn() 레인에 남긴 이유: 트리플클릭이 만드는 "병합되지 않은 셀 하나짜리
  // CellSelection"도 CellSelection이라 react에서 세울 수 없다 — ADR-0002
  // 패키지 경계. 실제 컨트롤러에서 병합되지 않은 셀의 캐럿은
  // getTableCellSelection이 null로 돌려주므로(그게 위 테스트의 계약)
  // 캐럿으로는 이 상태를 대신할 수 없다.
  // 실제로 시도한 것: 실제 마운트에서 mousedown detail 1/2/3을 순서대로
  // 쐈지만 prosemirror-view의 posAtCoords가 jsdom에 없는
  // document.elementFromPoint를 불러 TypeError로 죽었다(실측).
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
    const { editor, firstMergedCell, firstMergedCellId, tableBlockId } =
      renderMergedCellTable();
    placeCaret(firstMergedCell);
    // 전제: 실제 컨트롤러가 이 캐럿을 분할 대상으로 보고한다. 데코레이션
    // 없이 cellIds 1개짜리 경로(cellSelectionBounds의 sole-cell fallback)를
    // 타는 상태다.
    expect(editor.getTableCellSelection()).toEqual({
      tableBlockId,
      cellIds: [firstMergedCellId],
      mergeable: false,
      splitCellId: firstMergedCellId,
    });

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: splitLabel })).not.toBeNull();
    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
  });

  it("Split cell 클릭 시 splitTableCell(tableBlockId, cellId)를 호출한다", () => {
    const { editor, firstMergedCell, firstMergedCellId } =
      renderMergedCellTable();
    placeCaret(firstMergedCell);
    triggerSelectionChange();
    // 전제: 첫 행은 columnSpan 2 셀 하나뿐이다. 이미 나뉘어 있었다면 아래
    // "2개가 됐다"는 분할과 무관하게 통과한다.
    expect(tableBlockOf(editor).rows[0]?.cells.map((cell) => cell.id)).toEqual([
      firstMergedCellId,
    ]);

    fireEvent.click(screen.getByRole("button", { name: splitLabel }));

    // 실제 splitTableCell(tableBlockId, 병합 셀 id)이 돌았음을 문서로 본다.
    const [firstRow, secondRow] = tableBlockOf(editor).rows;
    expect(firstRow?.cells).toHaveLength(2);
    expect(firstRow?.cells[0]?.id).toBe(firstMergedCellId);
    expect(firstRow?.cells[0]?.columnSpan).toBe(1);
    expect(firstRow?.cells[1]?.columnSpan).toBe(1);
    // 둘째 행은 그대로다 — cellId 인자가 캐럿이 있던 첫 행 셀을 정확히
    // 짚었다는 증거다. 아무 셀이나 나눴다면 여기가 먼저 무너진다.
    expect(secondRow?.cells).toHaveLength(1);
    expect(secondRow?.cells[0]?.columnSpan).toBe(2);
  });
});

describe("Cell formatting 버튼으로 색상 메뉴를 연다", () => {
  it("클릭하면 Text color/Background color 팔레트가 뜬다", () => {
    const { firstMergedCell } = renderMergedCellTable();
    placeCaret(firstMergedCell);
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: formatLabel }));

    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();
  });

  it('색상 스와치 클릭 시 setTableCellTextColor(tableBlockId, {kind:"cells",cellIds}, color)를 호출하고 메뉴를 닫으며 편집기로 초점을 되돌린다', () => {
    const {
      editable,
      editor,
      firstMergedCell,
      firstMergedCellId,
      secondMergedCellId,
    } = renderMergedCellTable();
    placeCaret(firstMergedCell);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));
    focusOutsideEditor(screen.getByRole("button", { name: formatLabel }));

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Red" }));

    // 실제 명령이 {kind:"cells", cellIds:[병합 셀]}로 나갔음을 문서로 본다.
    expect(cellOf(editor, firstMergedCellId)?.textColor).toBe("#D93025");
    // 대상이 그 셀 하나였다 — 표 전체나 행/열로 나갔다면 여기가 걸린다.
    expect(cellOf(editor, secondMergedCellId)?.textColor).toBeUndefined();
    expect(screen.queryByRole("menu", { name: "Cell formatting" })).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("Escape로 서식 메뉴를 닫고 편집기로 초점을 되돌린다", () => {
    const { editable, firstMergedCell } = renderMergedCellTable();
    placeCaret(firstMergedCell);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));
    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();
    focusOutsideEditor(screen.getByRole("button", { name: formatLabel }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu", { name: "Cell formatting" })).toBeNull();
    // 바깥 클릭과 달리 Escape는 돌아갈 클릭 대상이 없어 초점을 편집기로
    // 되돌린다(PIT-0013). onEscapeDismiss가 onOutsideDismiss로 잘못
    // 연결되면 초점은 그대로 버튼에 남아 이 단언이 실패한다.
    expect(document.activeElement).toBe(editable);
  });

  it("서식 메뉴 바깥을 클릭하면 초점을 강제로 옮기지 않고 메뉴만 닫는다", () => {
    const { firstMergedCell } = renderMergedCellTable();
    placeCaret(firstMergedCell);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));
    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();

    // 편집기 바깥 요소는 편집기가 만들지 않는다 — 실제 마운트로도 대신할
    // 수 없는 유일한 조립이라 여기서 직접 만든다.
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
      // 툴바 자체는 그대로 떠 있다. 여기 초점 단언은 편집기 밖 요소를
      // 가리키므로, 툴바가 통째로 사라져도 위 두 단언이 그대로 통과한다
      // (Issue #62). fake 레인에서는 getTableCellSelection이 상수라 툴바가
      // 사라질 수 없었지만, 실제 마운트에서는 selectionchange·mouseup·keyup이
      // 진짜 선택을 다시 읽으므로 가능해진 구멍이다.
      expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
    } finally {
      outsideButton.remove();
    }
  });

  it("서식 메뉴 안(data-be-cell-format-menu)을 클릭하면 닫히지 않는다", () => {
    const { firstMergedCell } = renderMergedCellTable();
    placeCaret(firstMergedCell);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));

    const menu = screen.getByRole("menu", { name: "Cell formatting" });
    fireEvent.pointerDown(menu);

    expect(
      screen.queryByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();
  });

  it("열린 서식 메뉴를 툴바 버튼으로 다시 누르면 닫고 편집기로 초점을 되돌린다", () => {
    const { editable, firstMergedCell } = renderMergedCellTable();
    placeCaret(firstMergedCell);
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
    focusOutsideEditor(trigger);
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByRole("menu", { name: "Cell formatting" })).toBeNull();
    expect(document.activeElement).toBe(editable);
  });
});

describe("병합·분할 명령 실패 시 피드백", () => {
  // vi.fn() 레인에 남긴 이유: NOT_RECTANGULAR는 병합 셀을 가로지르는
  // CellSelection에서만 나오는 거절 코드다. 그 선택을 react에서 세울 수
  // 없다 — ADR-0002 패키지 경계(@tiptap/pm 의존 금지, EditorController에
  // 선택 설정 API 없음). Merge cells 버튼도 mergeable=true일 때만 뜨므로
  // 클릭 대상 자체가 실제 마운트에서는 존재하지 않는다.
  // 실제로 시도한 것: 실제 마운트에서 병합 셀을 심고 캐럿·DOM Selection·
  // 트리플클릭·Shift+Arrow로 셀 범위 선택을 만들어보려 했으나 전부
  // getTableCellSelection null 또는 posAtCoords TypeError였다(실측).
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
    const { editor, firstMergedCell, firstMergedCellId, tableBlockId } =
      renderMergedCellTable();
    placeCaret(firstMergedCell);
    triggerSelectionChange();
    // 툴바가 잡아둔 셀을 문서에서 실제로 없앤다 — 실패 코드를 흉내내지 않고
    // "클릭 시점에는 그 셀이 이미 사라진" 상태를 진짜로 만든다. 툴바는 문서
    // 변경이 아니라 선택 이벤트로만 갱신하므로 낡은 splitCellId를 쥔 채
    // 남는다.
    const deleted = editor.commands.deleteTableRow(tableBlockId, 0);
    expect(deleted.ok).toBe(true);
    // 전제: 셀이 정말 사라졌다. 남아 있었다면 분할이 성공해 메시지가 없다.
    expect(cellOf(editor, firstMergedCellId)).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: splitLabel }));

    expect(screen.getByRole("alert").textContent).toBe("Cell no longer exists");
  });

  it("실패 메시지가 뜬 채로 선택 대상이 바뀌면 메시지가 사라진다", () => {
    const {
      editor,
      firstMergedCell,
      firstMergedCellId,
      host,
      secondMergedCellId,
      tableBlockId,
    } = renderMergedCellTable();
    placeCaret(firstMergedCell);
    triggerSelectionChange();
    // 분할 실패 테스트와 같은 방식으로 툴바가 잡아둔 셀을 실제로 없앤다.
    const deleted = editor.commands.deleteTableRow(tableBlockId, 0);
    expect(deleted.ok).toBe(true);
    expect(cellOf(editor, firstMergedCellId)).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: splitLabel }));
    expect(screen.getByRole("alert").textContent).toBe("Cell no longer exists");

    // 남은 병합 셀로 캐럿을 옮긴다. 행 삭제가 이미 캐럿을 그 셀로 옮기지만
    // (실측 확인) 그 부수효과에 기대지 않고 명시적으로 놓는다. 행 삭제가 표
    // DOM을 다시 만들었으므로 셀을 다시 찾아 rect부터 씌운다.
    const [remainingCell] = stubMergedGeometry(host, tableBlockId).cells;
    if (remainingCell === undefined) throw new Error("남은 병합 셀이 없다");
    placeCaret(remainingCell);
    // 전제: 선택 대상이 실제로 다른 셀로 바뀌었다(selectionKey가 달라진다).
    expect(editor.getTableCellSelection()?.cellIds).toEqual([
      secondMergedCellId,
    ]);
    triggerSelectionChange();

    expect(screen.queryByRole("alert")).toBeNull();
    // 툴바는 그대로 떠 있다 — 툴바째 사라져도 "alert 없음"은 통과한다
    // (Issue #62).
    expect(screen.getByRole("button", { name: splitLabel })).not.toBeNull();
  });
});

describe("툴바 메시지와 서식 메뉴 메시지의 상호작용", () => {
  // vi.fn() 레인에 남긴 이유: 툴바에 "병합 실패" 메시지를 띄우려면 Merge
  // cells 버튼을 눌러야 하고, 그 버튼은 mergeable=true(cellIds 2개 이상)일
  // 때만 뜬다 — 즉 CellSelection이 필요하고 react는 그것을 세울 수 없다
  // (ADR-0002 패키지 경계).
  // 실제로 시도한 것: 실제 마운트에서 셀 범위 선택을 만들 경로를 전부
  // 시도했다(같은 파일의 다른 잔여 주석 참조) — DOM Selection·트리플클릭·
  // Shift+Arrow 모두 CellSelection을 만들지 못했다(실측).
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
    const {
      editor,
      firstMergedCell,
      firstMergedCellId,
      host,
      secondMergedCellId,
      tableBlockId,
    } = renderMergedCellTable();
    placeCaret(firstMergedCell);
    triggerSelectionChange();
    // 분할 실패 테스트와 같은 방식으로 대상 셀을 실제로 없앤다 — 색상
    // 명령도 존재하지 않는 cellId를 받으면 CELL_NOT_FOUND로 거절한다
    // (table-grid.ts의 resolveTargetCellIds).
    const deleted = editor.commands.deleteTableRow(tableBlockId, 0);
    expect(deleted.ok).toBe(true);
    expect(cellOf(editor, firstMergedCellId)).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Blue" }));
    expect(screen.getByRole("alert").textContent).toBe("Cell no longer exists");
    // 전제: 실패한 명령은 메뉴를 닫지 않는다(useTableCommandFeedback) —
    // 이미 닫혀 있었다면 아래 "메뉴가 사라졌다"는 선택 변경과 무관하다.
    expect(screen.getByRole("menu", { name: formatLabel })).not.toBeNull();

    const [remainingCell] = stubMergedGeometry(host, tableBlockId).cells;
    if (remainingCell === undefined) throw new Error("남은 병합 셀이 없다");
    placeCaret(remainingCell);
    expect(editor.getTableCellSelection()?.cellIds).toEqual([
      secondMergedCellId,
    ]);
    triggerSelectionChange();

    expect(screen.queryByRole("menu", { name: formatLabel })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    // 툴바 자체는 남아 있어야 위 두 부재가 의미를 갖는다(Issue #62).
    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
  });
});
