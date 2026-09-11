/**
 * 표 열 삽입·삭제·이동·너비·헤더 명령의 구조와 선택 보존 계약을 확인한다.
 */
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import {
  deleteTableColumn,
  fitTableColumnsToContainer,
  getTableBlock,
  insertTableColumn,
  moveTableColumn,
  resizeTableColumn,
  toggleTableHeaderRow,
} from "../src/table-commands.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  activeCellId,
  createTableFixtureEditor,
  docWithTable,
  docWithTwoRowTable,
  placeCaretInCell,
  selectCellRange,
} from "./table-test-support.js";

describe("표에 열을 삽입한다", () => {
  it("지정 위치에 열을 하나 삽입한다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");

    const result = insertTableColumn(editor, "table-1", 2, createId);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    expect(table.value.columns).toHaveLength(3);
    expect(table.value.rows[0]?.cells).toHaveLength(3);
  });

  it("삽입 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    insertTableColumn(editor, "table-1", 2, createId);
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("맨 앞(0번)에 삽입한 열은 물리 문서에서도 첫 번째 셀로 렌더된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");

    const result = insertTableColumn(editor, "table-1", 0, createId);

    expect(result.ok).toBe(true);
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    expect(table?.attrs?.columns).toHaveLength(3);
    // G-TBL-001: table.columns가 새 열을 맨 앞에 둔다면, PM 문서의 물리 셀
    // 순서도 그 열을 첫 번째 형제 노드로 배치해야 한다(저장 배열 append 순서가 아니라).
    const firstRowCells = table?.content?.[0]?.content ?? [];
    expect(firstRowCells).toHaveLength(3);
    const newColumnId = (table?.attrs?.columns as { id: string }[])[0]?.id;
    expect(firstRowCells[0]?.attrs?.columnId).toBe(newColumnId);
    expect(firstRowCells[1]?.attrs?.columnId).toBe("col-1");
    expect(firstRowCells[2]?.attrs?.columnId).toBe("col-2");
  });

  it("삽입 후 새로 생긴 열의 첫 셀로 캐럿을 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");

    const result = insertTableColumn(editor, "table-1", 1, createId);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    const insertedCellId = table.value.rows[0]?.cells[1]?.id;
    expect(typeof insertedCellId).toBe("string");
    expect(activeCellId(editor)).toBe(insertedCellId);
  });
});

describe("표에서 열을 삭제한다", () => {
  it("지정 인덱스의 열을 삭제한다", () => {
    const editor = createTableFixtureEditor(docWithTable);

    const result = deleteTableColumn(editor, "table-1", 0);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    expect(table.value.columns).toHaveLength(1);
    expect(table.value.rows[0]?.cells).toHaveLength(1);
  });

  it("삭제 후 살아남은 열의 첫 행 셀로 캐럿을 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    const result = deleteTableColumn(editor, "table-1", 0);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(activeCellId(editor)).toBe("cell-2");
  });

  it("삭제 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON() as TiptapJsonNode;

    deleteTableColumn(editor, "table-1", 0);
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("마지막 남은 열은 삭제를 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    deleteTableColumn(editor, "table-1", 0);
    const beforeLastDelete = editor.getJSON() as TiptapJsonNode;

    const result = deleteTableColumn(editor, "table-1", 0);

    expect(result).toEqual({ ok: false, error: { code: "LAST_COLUMN" } });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(beforeLastDelete);
  });
});

describe("표의 열을 이동한다", () => {
  it("지정 인덱스로 열을 이동한다", () => {
    const editor = createTableFixtureEditor(docWithTable);

    const result = moveTableColumn(editor, "table-1", 0, 1);

    expect(result).toEqual({ ok: true, value: undefined });
    // raw JSON을 유지한다 — columns 메타데이터 순서와 물리 셀 columnId 순서가
    // 일치하는지를 tableBlockToTiptapJson이 만든 tiptap 문서에서 직접 검사한다
    // (G-TBL-001의 columnIndexById 정렬). getTableBlock으로 바꿔도 같은 회귀는
    // 똑같이 잡는다 — tiptapNodeToTableBlock도 같은 물리 순서를 읽기 때문이다.
    // 다만 그러면 이 assertion이 쓰기 경로(tableBlockToTiptapJson)뿐 아니라
    // 읽기 경로(tiptapNodeToTableBlock)까지 함께 거치게 되어, 실패했을 때 어느
    // 쪽 코덱이 깨졌는지 이 테스트만으로는 구분할 수 없다.
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    const columns = table?.attrs?.columns as { id: string }[];
    expect(columns.map((column) => column.id)).toEqual(["col-2", "col-1"]);
    const firstRowCells = table?.content?.[0]?.content ?? [];
    expect(firstRowCells[0]?.attrs?.columnId).toBe("col-2");
    expect(firstRowCells[1]?.attrs?.columnId).toBe("col-1");
  });

  it("이동 후 이동한 열(목표 인덱스)의 첫 행 셀로 캐럿을 옮긴다", () => {
    // fromIndex=1, toIndex=0으로 검증한다(0→1이 아니다): 2열 표에서 목표
    // 열이 마지막 열(index1)이면, selectCellId 없이도 ProseMirror의
    // Selection.near 기본 폴백이 문서 끝에서부터 뒤로 검색해 우연히 표의
    // "마지막 셀"에 멈춘다 — 목표 좌표와 그 폴백 결과가 같은 셀이 되어
    // 옵션이 없어도 assertion이 통과해버린다(실측 확인). 목표 열을 index0
    // (마지막 열이 아닌 위치)으로 바꾸면 그 우연한 일치가 사라져 옵션
    // 유무가 실제로 갈린다.
    const editor = createTableFixtureEditor(docWithTable);

    const result = moveTableColumn(editor, "table-1", 1, 0);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(activeCellId(editor)).toBe("cell-2");
  });

  it("이동 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON() as TiptapJsonNode;

    moveTableColumn(editor, "table-1", 0, 1);
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("범위를 벗어난 인덱스는 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = moveTableColumn(editor, "table-1", 0, 99);

    expect(result).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});

describe("표의 열 너비를 조절한다", () => {
  it("지정 인덱스 열의 너비를 바꾼다", () => {
    const editor = createTableFixtureEditor(docWithTable);

    const result = resizeTableColumn(editor, "table-1", 1, 240);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    expect(table.value.columns).toEqual([
      { id: "col-1", width: 160 },
      { id: "col-2", width: 240 },
    ]);
  });

  it("조절 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON() as TiptapJsonNode;

    resizeTableColumn(editor, "table-1", 1, 240);
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("허용 범위 밖 너비는 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = resizeTableColumn(editor, "table-1", 0, 47);

    expect(result).toEqual({
      ok: false,
      error: { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: 47 },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("너비 조절 후에도 두 셀에 걸친 CellSelection을 유지한다", () => {
    // 열 너비 조절은 colwidth만 바꾸고 행·열·셀 id는 그대로다 —
    // preserveSelection: true로 옛 CellSelection의 양 끝 cellId를 새 표에서
    // 그대로 복원해야 한다(구조 불변 경로, toggleTableHeaderRow와 같은 패턴).
    const editor = createTableFixtureEditor(docWithTable);
    selectCellRange(editor, "cell-1", "cell-2");

    const result = resizeTableColumn(editor, "table-1", 1, 240);

    expect(result).toEqual({ ok: true, value: undefined });
    const { selection } = editor.state;
    expect(selection).toBeInstanceOf(CellSelection);
    const cellSelection = selection as CellSelection;
    expect(cellSelection.$anchorCell.nodeAfter?.attrs.cellId).toBe("cell-1");
    expect(cellSelection.$headCell.nodeAfter?.attrs.cellId).toBe("cell-2");
  });

  it("너비 조절 후에도 표 안 캐럿(TextSelection) 위치를 유지한다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.state.selection;

    const result = resizeTableColumn(editor, "table-1", 1, 240);

    expect(result).toEqual({ ok: true, value: undefined });
    const { selection } = editor.state;
    expect(selection).toBeInstanceOf(TextSelection);
    expect(selection.from).toBe(before.from);
    expect(selection.to).toBe(before.to);
  });
});

describe("표 너비를 컨테이너 폭에 맞춘다", () => {
  it("컨테이너 폭에 맞춰 모든 열 너비를 재분배한다", () => {
    // docWithTable은 두 열 모두 160(동일 비율)이라 500을 정확히 반씩 나눈다.
    const editor = createTableFixtureEditor(docWithTable);

    const result = fitTableColumnsToContainer(editor, "table-1", 500);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    expect(table.value.columns).toEqual([
      { id: "col-1", width: 250 },
      { id: "col-2", width: 250 },
    ]);
  });

  it("적용 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON() as TiptapJsonNode;

    fitTableColumnsToContainer(editor, "table-1", 500);
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("컨테이너 폭이 0 이하면 CONTAINER_WIDTH_INVALID로 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = fitTableColumnsToContainer(editor, "table-1", 0);

    expect(result).toEqual({
      ok: false,
      error: { code: "CONTAINER_WIDTH_INVALID", containerWidth: 0 },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("적용 후에도 두 셀에 걸친 CellSelection을 유지한다", () => {
    // resizeTableColumn과 같은 이유(구조 불변, preserveSelection: true) —
    // 재분배는 colwidth만 바꾸고 행·열·셀 id는 그대로다.
    const editor = createTableFixtureEditor(docWithTable);
    selectCellRange(editor, "cell-1", "cell-2");

    const result = fitTableColumnsToContainer(editor, "table-1", 500);

    expect(result).toEqual({ ok: true, value: undefined });
    const { selection } = editor.state;
    expect(selection).toBeInstanceOf(CellSelection);
    const cellSelection = selection as CellSelection;
    expect(cellSelection.$anchorCell.nodeAfter?.attrs.cellId).toBe("cell-1");
    expect(cellSelection.$headCell.nodeAfter?.attrs.cellId).toBe("cell-2");
  });
});

describe("표의 헤더 행·열을 토글한다", () => {
  it("헤더 행 토글 후에도 셀 범위 선택을 유지한다", () => {
    // 헤더 토글은 headerRows 플래그만 바꾸고 행·열·셀 id는 그대로다 —
    // preserveSelection: true로 옛 CellSelection의 양 끝 cellId를 새 표에서
    // 그대로 복원해야 한다(구조 불변 경로, setTableCellColor/Align과 같은 패턴).
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    selectCellRange(editor, "cell-1", "cell-2");

    const result = toggleTableHeaderRow(editor, "table-1");

    expect(result).toEqual({ ok: true, value: undefined });
    const { selection } = editor.state;
    expect(selection).toBeInstanceOf(CellSelection);
    const cellSelection = selection as CellSelection;
    expect(cellSelection.$anchorCell.nodeAfter?.attrs.cellId).toBe("cell-1");
    expect(cellSelection.$headCell.nodeAfter?.attrs.cellId).toBe("cell-2");
  });
});
