/**
 * 표 행 삽입·삭제·이동 명령의 구조, 선택, undo 계약을 확인한다.
 */
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import {
  deleteTableRow,
  getTableBlock,
  insertTableRow,
  moveTableRow,
} from "../src/table-commands.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  activeCellId,
  createTableFixtureEditor,
  docWithTable,
  docWithTwoRowTable,
} from "./table-test-support.js";

describe("표에 행을 삽입한다", () => {
  it("지정 위치에 행을 하나 삽입한다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");

    const result = insertTableRow(editor, "table-1", 1, createId);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    expect(table.value.rows).toHaveLength(2);
    expect(table.value.rows[1]?.cells).toHaveLength(2);
  });

  it("삽입 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    insertTableRow(editor, "table-1", 1, createId);
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("존재하지 않는 표 blockId는 TABLE_NOT_FOUND를 반환하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = insertTableRow(editor, "missing", 1, createId);

    expect(result).toEqual({
      ok: false,
      error: { code: "TABLE_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("범위를 벗어난 인덱스는 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = insertTableRow(editor, "table-1", 99, createId);

    expect(result).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("삽입 후 새 행의 0열 셀로 캐럿을 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");

    const result = insertTableRow(editor, "table-1", 1, createId);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    const insertedCellId = table.value.rows[1]?.cells[0]?.id;
    expect(typeof insertedCellId).toBe("string");
    expect(activeCellId(editor)).toBe(insertedCellId);
  });
});

describe("표에서 행을 삭제한다", () => {
  it("지정 인덱스의 행을 삭제한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    const result = deleteTableRow(editor, "table-1", 0);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    expect(table.value.rows).toHaveLength(1);
    expect(table.value.rows[0]?.id).toBe("row-2");
  });

  it("삭제 후 살아남은 행의 첫 셀로 캐럿을 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    const result = deleteTableRow(editor, "table-1", 0);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(activeCellId(editor)).toBe("cell-3");
  });

  it("삭제 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON() as TiptapJsonNode;

    deleteTableRow(editor, "table-1", 0);
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("마지막 남은 행은 삭제를 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = deleteTableRow(editor, "table-1", 0);

    expect(result).toEqual({ ok: false, error: { code: "LAST_ROW" } });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});

describe("표의 행을 이동한다", () => {
  it("지정 인덱스로 행을 이동한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    const result = moveTableRow(editor, "table-1", 0, 1);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    expect(table.value.rows[0]?.id).toBe("row-2");
    expect(table.value.rows[1]?.id).toBe("row-1");
  });

  it("이동 후 이동한 행(목표 인덱스)의 첫 셀로 캐럿을 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    const result = moveTableRow(editor, "table-1", 0, 1);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(activeCellId(editor)).toBe("cell-1");
  });

  it("이동 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON() as TiptapJsonNode;

    moveTableRow(editor, "table-1", 0, 1);
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("존재하지 않는 표 blockId는 TABLE_NOT_FOUND를 반환하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = moveTableRow(editor, "missing", 0, 1);

    expect(result).toEqual({
      ok: false,
      error: { code: "TABLE_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("범위를 벗어난 인덱스는 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = moveTableRow(editor, "table-1", 0, 99);

    expect(result).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});
