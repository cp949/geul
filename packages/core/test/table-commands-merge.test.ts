/**
 * 표 셀 병합·분할 명령의 구조, 캐럿 이동, undo와 거절 계약을 확인한다.
 */
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import {
  getTableBlock,
  mergeTableCells,
  splitTableCell,
} from "../src/table-commands.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  createTableFixtureEditor,
  docWithTwoByThreeTable,
  docWithTwoRowTable,
  placeCaretInCell,
  selectCellRange,
} from "./table-test-support.js";

describe("표의 셀을 병합한다", () => {
  it("직사각형 범위의 셀을 하나로 병합한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    selectCellRange(editor, "cell-1", "cell-4");

    const result = mergeTableCells(editor, "table-1");

    expect(result).toEqual({ ok: true, value: undefined });
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    expect(table.value.rows).toHaveLength(2);
    expect(table.value.rows[0]?.cells).toHaveLength(1);
    expect(table.value.rows[0]?.cells[0]).toMatchObject({
      id: "cell-1",
      rowSpan: 2,
      columnSpan: 2,
    });
    expect(table.value.rows[1]?.cells ?? []).toHaveLength(0);
  });

  it("병합 직후 캐럿을 병합된 셀 안으로 옮긴다", () => {
    // replaceWith는 표 서브트리 전체를 바꾼다 — 옛 selection을 그대로
    // 매핑하면 표의 마지막 셀 같은 예측 불가능한 위치로 떨어진다
    // (duplicateBlock과 같은 원칙으로 명시 이동한다).
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    selectCellRange(editor, "cell-1", "cell-4");

    mergeTableCells(editor, "table-1");

    const { selection } = editor.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.attrs.cellId).toBe("cell-1");
  });

  it("병합 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON() as TiptapJsonNode;
    selectCellRange(editor, "cell-1", "cell-4");

    mergeTableCells(editor, "table-1");
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("CellSelection이 아니면(캐럿만 있으면) MERGE_TARGET_NOT_FOUND를 반환하고 문서를 바꾸지 않는다", () => {
    // 병합 범위의 유일한 권위는 현재 CellSelection이다(spec 6.2) — 캐럿만
    // 있으면 병합할 범위 자체가 없다.
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = mergeTableCells(editor, "table-1");

    expect(result).toEqual({
      ok: false,
      error: { code: "MERGE_TARGET_NOT_FOUND" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("현재 선택이 가리키는 표와 다른 blockId를 넘기면 MERGE_TARGET_NOT_FOUND를 반환하고 문서를 바꾸지 않는다", () => {
    // CellSelection이 실제로 가리키는 표(table-1)와 인자로 받은 blockId가
    // 다르면 decodeTable(TABLE_NOT_FOUND)까지 가지 않고 여기서 먼저
    // 거절된다 — 존재하지 않는 blockId를 넘겨도 마찬가지다.
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    selectCellRange(editor, "cell-1", "cell-4");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = mergeTableCells(editor, "missing");

    expect(result).toEqual({
      ok: false,
      error: { code: "MERGE_TARGET_NOT_FOUND" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("비직사각형 범위는 NOT_RECTANGULAR를 반환하고 문서를 바꾸지 않는다", () => {
    // 2x2 표는 셀 하나만 병합해도 남은 칸이 나머지 전체를 자동으로 덮어
    // selectedRect가 항상 표 전체와 같아진다(그래서 늘 직사각형) — 병합된
    // 셀 절반만 걸치는 선택을 재현하려면 열이 3개는 있어야 한다.
    const editor = createTableFixtureEditor(docWithTwoByThreeTable);
    // 첫 행의 왼쪽 두 셀을 병합해 (0,0)-(0,1)을 덮는 셀을 만든다.
    selectCellRange(editor, "cell-1", "cell-2");
    mergeTableCells(editor, "table-1");
    const before = editor.getJSON() as TiptapJsonNode;

    // 둘째 행 가운데 셀 ~ 첫 행 오른쪽 셀은 열 1-2, 행 0-1의 직사각형이지만
    // 병합된 셀((0,0)-(0,1))이 그중 (0,1)만 걸쳐 있다 — 경계를 가로지른다.
    selectCellRange(editor, "cell-5", "cell-3");
    const result = mergeTableCells(editor, "table-1");

    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_RECTANGULAR" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});

describe("표의 병합된 셀을 분할한다", () => {
  it("병합된 셀을 원래 셀 개수로 되돌린다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const createId = sequentialIds("split");
    selectCellRange(editor, "cell-1", "cell-4");
    mergeTableCells(editor, "table-1");

    const result = splitTableCell(editor, "table-1", "cell-1", createId);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    expect(table.value.rows[0]?.cells).toHaveLength(2);
    expect(table.value.rows[1]?.cells).toHaveLength(2);
  });

  it("분할 직후 캐럿을 분할 대상이었던 셀 안에 유지한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const createId = sequentialIds("split");
    selectCellRange(editor, "cell-1", "cell-4");
    mergeTableCells(editor, "table-1");

    splitTableCell(editor, "table-1", "cell-1", createId);

    const { selection } = editor.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.attrs.cellId).toBe("cell-1");
  });

  it("분할 직후 undo 1회로 병합 상태로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const createId = sequentialIds("split");
    selectCellRange(editor, "cell-1", "cell-4");
    mergeTableCells(editor, "table-1");
    const merged = editor.getJSON() as TiptapJsonNode;

    splitTableCell(editor, "table-1", "cell-1", createId);
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(merged);
  });

  it("병합되지 않은 셀은 분할해도 성공하되 undo 단계를 만들지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const createId = sequentialIds("split");
    const before = editor.getJSON() as TiptapJsonNode;

    expect(splitTableCell(editor, "table-1", "cell-1", createId)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
    expect(editor.can().undo()).toBe(false);
  });

  it("존재하지 않는 cellId는 CELL_NOT_FOUND를 반환하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const createId = sequentialIds("split");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = splitTableCell(editor, "table-1", "missing", createId);

    expect(result).toEqual({
      ok: false,
      error: { code: "CELL_NOT_FOUND", cellId: "missing" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});
