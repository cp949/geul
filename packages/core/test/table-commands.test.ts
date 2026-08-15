import { describe, expect, it } from "vitest";

import {
  deleteTableColumn,
  deleteTableRow,
  insertTable,
  insertTableColumn,
  insertTableRow,
} from "../src/table-commands.js";
import { createTableFixtureEditor } from "./table-test-support.js";

const sequentialIds = (prefix: string) => {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
};

const docWithParagraph = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "para-1" },
      content: [{ type: "text", text: "hello" }],
    },
  ],
};

const cellJson = (cellId: string, columnId: string) => ({
  type: "tableCell",
  attrs: {
    cellId,
    columnId,
    colspan: 1,
    rowspan: 1,
    colwidth: null,
    textColor: null,
    backgroundColor: null,
  },
  content: [],
});

const docWithTable = {
  type: "doc",
  content: [
    {
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [
          { id: "col-1", width: 160 },
          { id: "col-2", width: 160 },
        ],
        headerRows: 0,
        headerColumns: 0,
      },
      content: [
        {
          type: "tableRow",
          attrs: { rowId: "row-1" },
          content: [cellJson("cell-1", "col-1"), cellJson("cell-2", "col-2")],
        },
      ],
    },
  ],
};

const docWithTwoRowTable = {
  type: "doc",
  content: [
    {
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [
          { id: "col-1", width: 160 },
          { id: "col-2", width: 160 },
        ],
        headerRows: 0,
        headerColumns: 0,
      },
      content: [
        {
          type: "tableRow",
          attrs: { rowId: "row-1" },
          content: [cellJson("cell-1", "col-1"), cellJson("cell-2", "col-2")],
        },
        {
          type: "tableRow",
          attrs: { rowId: "row-2" },
          content: [cellJson("cell-3", "col-1"), cellJson("cell-4", "col-2")],
        },
      ],
    },
  ],
};

describe("표를 삽입한다", () => {
  it("지정한 블록 뒤에 표를 단일 트랜잭션으로 삽입한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");

    const result = insertTable(
      editor,
      "para-1",
      { rows: 2, columns: 2 },
      createId,
    );

    expect(result.ok).toBe(true);
    const doc = editor.getJSON();
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[1]?.type).toBe("table");
    expect(doc.content?.[1]?.content).toHaveLength(2);
    expect(doc.content?.[1]?.content?.[0]?.content).toHaveLength(2);

    editor.destroy();
  });

  it("삽입 직후 undo 1회로 표 삽입 이전 상태로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");
    const before = editor.getJSON();

    insertTable(editor, "para-1", { rows: 2, columns: 2 }, createId);
    editor.commands.undo();

    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("존재하지 않는 blockId 뒤에는 삽입할 수 없고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");
    const before = editor.getJSON();

    const result = insertTable(
      editor,
      "missing",
      { rows: 2, columns: 2 },
      createId,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("행 또는 열이 1보다 작으면 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");
    const before = editor.getJSON();

    const result = insertTable(
      editor,
      "para-1",
      { rows: 0, columns: 2 },
      createId,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_TABLE_SIZE" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });
});

describe("표에 행을 삽입한다", () => {
  it("지정 위치에 행을 하나 삽입한다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");

    const result = insertTableRow(editor, "table-1", 1, createId);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = editor.getJSON().content?.[0];
    expect(table?.content).toHaveLength(2);
    expect(table?.content?.[1]?.content).toHaveLength(2);
    editor.destroy();
  });

  it("삽입 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");
    const before = editor.getJSON();

    insertTableRow(editor, "table-1", 1, createId);
    editor.commands.undo();

    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("존재하지 않는 표 blockId는 TABLE_NOT_FOUND를 반환하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");
    const before = editor.getJSON();

    const result = insertTableRow(editor, "missing", 1, createId);

    expect(result).toEqual({
      ok: false,
      error: { code: "TABLE_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("범위를 벗어난 인덱스는 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");
    const before = editor.getJSON();

    const result = insertTableRow(editor, "table-1", 99, createId);

    expect(result).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });
});

describe("표에 열을 삽입한다", () => {
  it("지정 위치에 열을 하나 삽입한다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");

    const result = insertTableColumn(editor, "table-1", 2, createId);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = editor.getJSON().content?.[0];
    expect(table?.attrs?.columns).toHaveLength(3);
    expect(table?.content?.[0]?.content).toHaveLength(3);
    editor.destroy();
  });

  it("삽입 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");
    const before = editor.getJSON();

    insertTableColumn(editor, "table-1", 2, createId);
    editor.commands.undo();

    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("맨 앞(0번)에 삽입한 열은 물리 문서에서도 첫 번째 셀로 렌더된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");

    const result = insertTableColumn(editor, "table-1", 0, createId);

    expect(result.ok).toBe(true);
    const table = editor.getJSON().content?.[0];
    expect(table?.attrs?.columns).toHaveLength(3);
    // PIT-0004: table.columns가 새 열을 맨 앞에 둔다면, PM 문서의 물리 셀
    // 순서도 그 열을 첫 번째 형제 노드로 배치해야 한다(저장 배열 append 순서가 아니라).
    const firstRowCells = table?.content?.[0]?.content ?? [];
    expect(firstRowCells).toHaveLength(3);
    const newColumnId = (table?.attrs?.columns as { id: string }[])[0]?.id;
    expect(firstRowCells[0]?.attrs?.columnId).toBe(newColumnId);
    expect(firstRowCells[1]?.attrs?.columnId).toBe("col-1");
    expect(firstRowCells[2]?.attrs?.columnId).toBe("col-2");

    editor.destroy();
  });
});

describe("표에서 행을 삭제한다", () => {
  it("지정 인덱스의 행을 삭제한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    const result = deleteTableRow(editor, "table-1", 0);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = editor.getJSON().content?.[0];
    expect(table?.content).toHaveLength(1);
    expect(table?.content?.[0]?.attrs?.rowId).toBe("row-2");
    editor.destroy();
  });

  it("삭제 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON();

    deleteTableRow(editor, "table-1", 0);
    editor.commands.undo();

    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("마지막 남은 행은 삭제를 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON();

    const result = deleteTableRow(editor, "table-1", 0);

    expect(result).toEqual({ ok: false, error: { code: "LAST_ROW" } });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });
});

describe("표에서 열을 삭제한다", () => {
  it("지정 인덱스의 열을 삭제한다", () => {
    const editor = createTableFixtureEditor(docWithTable);

    const result = deleteTableColumn(editor, "table-1", 0);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = editor.getJSON().content?.[0];
    expect(table?.attrs?.columns).toHaveLength(1);
    expect(table?.content?.[0]?.content).toHaveLength(1);
    editor.destroy();
  });

  it("삭제 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON();

    deleteTableColumn(editor, "table-1", 0);
    editor.commands.undo();

    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("마지막 남은 열은 삭제를 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    deleteTableColumn(editor, "table-1", 0);
    const beforeLastDelete = editor.getJSON();

    const result = deleteTableColumn(editor, "table-1", 0);

    expect(result).toEqual({ ok: false, error: { code: "LAST_COLUMN" } });
    expect(editor.getJSON()).toEqual(beforeLastDelete);
    editor.destroy();
  });
});
