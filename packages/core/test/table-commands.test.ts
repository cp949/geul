import type { TabularData } from "@cp949/geul-io";
import { describe, expect, it } from "vitest";

import {
  deleteTableColumn,
  deleteTableRow,
  insertTable,
  insertTableColumn,
  insertTableRow,
  mergeTableCells,
  moveTableColumn,
  moveTableRow,
  pasteTabularData,
  resizeTableColumn,
  splitTableCell,
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

const docWithTwoParagraphs = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "para-1" },
      content: [{ type: "text", text: "hello" }],
    },
    {
      type: "paragraph",
      attrs: { blockId: "para-2" },
      content: [{ type: "text", text: "world" }],
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

describe("표의 행을 이동한다", () => {
  it("지정 인덱스로 행을 이동한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    const result = moveTableRow(editor, "table-1", 0, 1);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = editor.getJSON().content?.[0];
    expect(table?.content?.[0]?.attrs?.rowId).toBe("row-2");
    expect(table?.content?.[1]?.attrs?.rowId).toBe("row-1");
    editor.destroy();
  });

  it("이동 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON();

    moveTableRow(editor, "table-1", 0, 1);
    editor.commands.undo();

    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("존재하지 않는 표 blockId는 TABLE_NOT_FOUND를 반환하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON();

    const result = moveTableRow(editor, "missing", 0, 1);

    expect(result).toEqual({
      ok: false,
      error: { code: "TABLE_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("범위를 벗어난 인덱스는 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON();

    const result = moveTableRow(editor, "table-1", 0, 99);

    expect(result).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });
});

describe("표의 열을 이동한다", () => {
  it("지정 인덱스로 열을 이동한다", () => {
    const editor = createTableFixtureEditor(docWithTable);

    const result = moveTableColumn(editor, "table-1", 0, 1);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = editor.getJSON().content?.[0];
    const columns = table?.attrs?.columns as { id: string }[];
    expect(columns.map((column) => column.id)).toEqual(["col-2", "col-1"]);
    const firstRowCells = table?.content?.[0]?.content ?? [];
    expect(firstRowCells[0]?.attrs?.columnId).toBe("col-2");
    expect(firstRowCells[1]?.attrs?.columnId).toBe("col-1");
    editor.destroy();
  });

  it("이동 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON();

    moveTableColumn(editor, "table-1", 0, 1);
    editor.commands.undo();

    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("범위를 벗어난 인덱스는 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON();

    const result = moveTableColumn(editor, "table-1", 0, 99);

    expect(result).toEqual({
      ok: false,
      error: { code: "INDEX_OUT_OF_RANGE" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });
});

describe("표의 열 너비를 조절한다", () => {
  it("지정 인덱스 열의 너비를 바꾼다", () => {
    const editor = createTableFixtureEditor(docWithTable);

    const result = resizeTableColumn(editor, "table-1", 1, 240);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = editor.getJSON().content?.[0];
    expect(table?.attrs?.columns).toEqual([
      { id: "col-1", width: 160 },
      { id: "col-2", width: 240 },
    ]);
    editor.destroy();
  });

  it("조절 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON();

    resizeTableColumn(editor, "table-1", 1, 240);
    editor.commands.undo();

    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("허용 범위 밖 너비는 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON();

    const result = resizeTableColumn(editor, "table-1", 0, 47);

    expect(result).toEqual({
      ok: false,
      error: { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: 47 },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });
});

describe("표 삽입 시 트리거 블록 텍스트를 함께 지운다", () => {
  const docWithSlashText = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { blockId: "para-1" },
        content: [{ type: "text", text: "/table" }],
      },
    ],
  };

  it("clearAfterBlockText가 true면 트리거 블록을 비우고 그 뒤에 표를 단일 트랜잭션으로 삽입한다", () => {
    const editor = createTableFixtureEditor(docWithSlashText);
    const createId = sequentialIds("id");

    const result = insertTable(
      editor,
      "para-1",
      { rows: 1, columns: 1 },
      createId,
      { clearAfterBlockText: true },
    );

    expect(result.ok).toBe(true);
    const doc = editor.getJSON();
    expect(doc.content?.[0]?.type).toBe("paragraph");
    expect(doc.content?.[0]?.content ?? []).toHaveLength(0);
    expect(doc.content?.[1]?.type).toBe("table");
    editor.destroy();
  });

  it("삽입 직후 undo 1회로 트리거 텍스트와 표 삽입 이전 상태로 함께 복원된다", () => {
    const editor = createTableFixtureEditor(docWithSlashText);
    const createId = sequentialIds("id");
    const before = editor.getJSON();

    insertTable(editor, "para-1", { rows: 1, columns: 1 }, createId, {
      clearAfterBlockText: true,
    });
    editor.commands.undo();

    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });
});

describe("표의 셀을 병합한다", () => {
  it("직사각형 범위의 셀을 하나로 병합한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    const result = mergeTableCells(
      editor,
      "table-1",
      { row: 0, column: 0 },
      { row: 1, column: 1 },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    const table = editor.getJSON().content?.[0];
    expect(table?.content).toHaveLength(2);
    expect(table?.content?.[0]?.content).toHaveLength(1);
    expect(table?.content?.[0]?.content?.[0]?.attrs).toMatchObject({
      cellId: "cell-1",
      rowspan: 2,
      colspan: 2,
    });
    expect(table?.content?.[1]?.content ?? []).toHaveLength(0);
    editor.destroy();
  });

  it("병합 직후 캐럿을 병합된 셀 안으로 옮긴다", () => {
    // replaceWith는 표 서브트리 전체를 바꾼다 — 옛 selection을 그대로
    // 매핑하면 표의 마지막 셀 같은 예측 불가능한 위치로 떨어진다
    // (duplicateBlock과 같은 원칙으로 명시 이동한다).
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    mergeTableCells(
      editor,
      "table-1",
      { row: 0, column: 0 },
      { row: 1, column: 1 },
    );

    const { selection } = editor.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.attrs.cellId).toBe("cell-1");
    editor.destroy();
  });

  it("병합 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON();

    mergeTableCells(
      editor,
      "table-1",
      { row: 0, column: 0 },
      { row: 1, column: 1 },
    );
    editor.commands.undo();

    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("존재하지 않는 표 blockId는 TABLE_NOT_FOUND를 반환하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON();

    const result = mergeTableCells(
      editor,
      "missing",
      { row: 0, column: 0 },
      { row: 1, column: 1 },
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "TABLE_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("비직사각형 범위는 NOT_RECTANGULAR를 반환하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    // 먼저 좌상단 2x1을 병합해 L자 모양(비직사각형) 선택을 만든다.
    mergeTableCells(
      editor,
      "table-1",
      { row: 0, column: 0 },
      { row: 1, column: 0 },
    );
    const before = editor.getJSON();

    const result = mergeTableCells(
      editor,
      "table-1",
      { row: 0, column: 0 },
      { row: 0, column: 1 },
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_RECTANGULAR" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });
});

describe("표의 병합된 셀을 분할한다", () => {
  it("병합된 셀을 원래 셀 개수로 되돌린다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const createId = sequentialIds("split");
    mergeTableCells(
      editor,
      "table-1",
      { row: 0, column: 0 },
      { row: 1, column: 1 },
    );

    const result = splitTableCell(editor, "table-1", "cell-1", createId);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = editor.getJSON().content?.[0];
    expect(table?.content?.[0]?.content).toHaveLength(2);
    expect(table?.content?.[1]?.content).toHaveLength(2);
    editor.destroy();
  });

  it("분할 직후 캐럿을 분할 대상이었던 셀 안에 유지한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const createId = sequentialIds("split");
    mergeTableCells(
      editor,
      "table-1",
      { row: 0, column: 0 },
      { row: 1, column: 1 },
    );

    splitTableCell(editor, "table-1", "cell-1", createId);

    const { selection } = editor.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.attrs.cellId).toBe("cell-1");
    editor.destroy();
  });

  it("분할 직후 undo 1회로 병합 상태로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const createId = sequentialIds("split");
    mergeTableCells(
      editor,
      "table-1",
      { row: 0, column: 0 },
      { row: 1, column: 1 },
    );
    const merged = editor.getJSON();

    splitTableCell(editor, "table-1", "cell-1", createId);
    editor.commands.undo();

    expect(editor.getJSON()).toEqual(merged);
    editor.destroy();
  });

  it("병합되지 않은 셀은 분할해도 성공하되 undo 단계를 만들지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const createId = sequentialIds("split");
    const before = editor.getJSON();

    expect(splitTableCell(editor, "table-1", "cell-1", createId)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getJSON()).toEqual(before);
    expect(editor.can().undo()).toBe(false);
    editor.destroy();
  });

  it("존재하지 않는 cellId는 CELL_NOT_FOUND를 반환하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const createId = sequentialIds("split");
    const before = editor.getJSON();

    const result = splitTableCell(editor, "table-1", "missing", createId);

    expect(result).toEqual({
      ok: false,
      error: { code: "CELL_NOT_FOUND", cellId: "missing" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });
});

describe("표 명령 방어 동작", () => {
  it("clearAfterBlockText로 표 블록을 지정하면 표 내용을 삭제하지 않고 삽입만 한다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");

    const result = insertTable(
      editor,
      "table-1",
      { rows: 1, columns: 1 },
      createId,
      { clearAfterBlockText: true },
    );

    expect(result.ok).toBe(true);
    const doc = editor.getJSON();
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0]?.type).toBe("table");
    expect(doc.content?.[0]?.content).toHaveLength(1);
    expect(doc.content?.[0]?.content?.[0]?.content).toHaveLength(2);
    expect(doc.content?.[1]?.type).toBe("table");
    editor.destroy();
  });

  it("동일 인덱스 행 이동은 성공하되 undo 단계를 만들지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON();

    expect(moveTableRow(editor, "table-1", 1, 1)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getJSON()).toEqual(before);
    expect(editor.can().undo()).toBe(false);
    editor.destroy();
  });

  it("동일 인덱스 열 이동은 성공하되 undo 단계를 만들지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON();

    expect(moveTableColumn(editor, "table-1", 0, 0)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getJSON()).toEqual(before);
    expect(editor.can().undo()).toBe(false);
    editor.destroy();
  });

  it("현재 값과 같은 너비로 리사이즈하면 성공하되 undo 단계를 만들지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON();

    expect(resizeTableColumn(editor, "table-1", 0, 160)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getJSON()).toEqual(before);
    expect(editor.can().undo()).toBe(false);
    editor.destroy();
  });
});

// table-keyboard-extension.test.ts와 동일한 관례: descendants로 cellId를
// 찾아 그 셀의 시작 경계(boundary) 위치를 구하고, setTextSelection처럼
// 셀 내부에 캐럿을 두려면 boundary + 1을 쓴다.
const findCellBoundaryPosition = (
  editor: ReturnType<typeof createTableFixtureEditor>,
  cellId: string,
): number | null => {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "tableCell" && node.attrs.cellId === cellId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
};

const placeCaretInCell = (
  editor: ReturnType<typeof createTableFixtureEditor>,
  cellId: string,
) => {
  const boundary = findCellBoundaryPosition(editor, cellId);
  if (boundary === null) throw new Error("셀 fixture 준비 실패");
  editor.commands.setTextSelection(boundary + 1);
};

describe("표에 표 형태 데이터를 붙여넣는다", () => {
  const oneByOneData = (text: string): TabularData => ({
    columnCount: 1,
    rows: [
      {
        cells: [
          { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [{ text }] },
        ],
      },
    ],
  });

  it("두 문단에 걸친 선택에서 호출하면 선택을 지우고 캐럿을 새 표로 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTwoParagraphs);
    // "hello"의 "e"부터 "world"의 "w" 뒤까지 — 두 최상위 블록에 걸친 선택.
    editor.commands.setTextSelection({ from: 2, to: 9 });
    const createId = sequentialIds("paste");

    const result = pasteTabularData(editor, oneByOneData("A"), createId);

    expect(result.ok).toBe(true);
    // 선택 삭제로 두 문단이 "h" + "orld"로 병합되고 그 뒤에 표가 생긴다 —
    // 다른 에디터와 같은 "붙여넣기는 선택을 대체한다" 계약(Issue #29).
    const doc = editor.getJSON();
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0]?.attrs?.blockId).toBe("para-1");
    expect(doc.content?.[0]?.content?.[0]?.text).toBe("horld");
    expect(doc.content?.[1]?.type).toBe("table");
    const { selection } = editor.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.textContent).toBe("A");
    editor.destroy();
  });

  it("블록 전체를 선택하고 호출하면 내용을 지우고 빈 문단 뒤에 표를 만든다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    // "hello" 전체 선택 — 삭제 후 빈 문단은 그대로 남긴다(블록 교체 안 함).
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const createId = sequentialIds("paste");

    const result = pasteTabularData(editor, oneByOneData("A"), createId);

    expect(result.ok).toBe(true);
    const doc = editor.getJSON();
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0]?.attrs?.blockId).toBe("para-1");
    expect(doc.content?.[0]?.content ?? []).toHaveLength(0);
    expect(doc.content?.[1]?.type).toBe("table");
    const { selection } = editor.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.textContent).toBe("A");
    editor.destroy();
  });

  it("표 밖 붙여넣기와 선택 삭제가 undo 1회로 함께 복원된다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const createId = sequentialIds("paste");
    const before = editor.getJSON();

    const result = pasteTabularData(editor, oneByOneData("A"), createId);
    expect(result.ok).toBe(true);

    editor.commands.undo();

    // 선택 삭제와 표 삽입이 한 트랜잭션이어야 undo 1회로 원문이 돌아온다.
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("표 밖에서 호출하면 현재 블록 뒤에 새 표를 만든다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1); // "para-1" 문단 안(텍스트 "hello" 앞)
    const createId = sequentialIds("paste");

    const twoByOne: TabularData = {
      columnCount: 2,
      rows: [
        {
          cells: [
            {
              columnIndex: 0,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "A" }],
            },
            {
              columnIndex: 1,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "B" }],
            },
          ],
        },
      ],
    };

    const result = pasteTabularData(editor, twoByOne, createId);

    expect(result.ok).toBe(true);
    const doc = editor.getJSON();
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0]?.type).toBe("paragraph");
    // 캐럿 선택(빈 selection)은 지울 것이 없다 — 문단 텍스트가 남는다.
    expect(doc.content?.[0]?.content?.[0]?.text).toBe("hello");
    const tableJson = doc.content?.[1];
    expect(tableJson?.type).toBe("table");
    expect(tableJson?.content).toHaveLength(1);
    expect(tableJson?.content?.[0]?.content).toHaveLength(2);
    expect(tableJson?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe("A");
    expect(tableJson?.content?.[0]?.content?.[1]?.content?.[0]?.text).toBe("B");
    if (result.ok) {
      expect(result.value.blockId).toBe(tableJson?.attrs?.blockId);
    }
    // 표 안 분기의 selectCellId와 대칭 — 캐럿이 붙여넣은 표의 좌상단 셀로
    // 이동한다(Issue #29).
    const { selection } = editor.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.textContent).toBe("A");
    editor.destroy();
  });

  it("표 안에서 호출하면 현재 셀을 좌상단으로 덮어쓴다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const createId = sequentialIds("paste");

    const result = pasteTabularData(editor, oneByOneData("x"), createId);

    expect(result.ok).toBe(true);
    // 표 크기는 그대로 2x2다 — 새 표를 만들지 않고 기존 표를 덮어썼다.
    const table = editor.getJSON().content?.[0];
    expect(table?.attrs?.blockId).toBe("table-1");
    expect(table?.content).toHaveLength(2);
    expect(table?.content?.[0]?.content).toHaveLength(2);
    expect(table?.content?.[1]?.content).toHaveLength(2);
    // 좌상단 셀(cell-1 자리)만 붙여넣은 텍스트로 바뀌고 나머지는 빈 채로 남는다.
    expect(table?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe("x");
    expect(table?.content?.[0]?.content?.[1]?.content ?? []).toHaveLength(0);
    expect(table?.content?.[1]?.content?.[0]?.content ?? []).toHaveLength(0);
    expect(table?.content?.[1]?.content?.[1]?.content ?? []).toHaveLength(0);
    if (result.ok) expect(result.value.blockId).toBe("table-1");

    // 붙여넣은 좌상단 셀 안으로 캐럿이 옮겨간다(applyTableGridOperation의
    // selectCellId 계약 — mergeTableCells/splitTableCell과 동일한 원칙).
    const { selection } = editor.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.textContent).toBe("x");
    editor.destroy();
  });

  it("병합 충돌이면 문서를 바꾸지 않고 거절한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    // 좌측 열(cell-1, cell-3)을 세로로 병합해 rowSpan=2 셀을 만든다 —
    // "비직사각형 범위는 NOT_RECTANGULAR..." 테스트와 같은 준비 단계다.
    const merged = mergeTableCells(
      editor,
      "table-1",
      { row: 0, column: 0 },
      { row: 1, column: 0 },
    );
    expect(merged.ok).toBe(true);

    // 병합된 셀(cell-1) 안으로 캐럿을 옮긴다. selectedRect는 이 셀의 기준
    // 좌표(0,0)를 anchor로 잡지만 실제로는 rowSpan=2라서 row 1도 덮는다.
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON();

    // 1행짜리 데이터를 anchor(0,0)에 붙여넣으면 rowSpan=2 셀의 아래쪽 절반
    // (row 1, column 0)이 어느 셀에도 속하지 않게 된다 — 병합 경계를 걸치는
    // 붙여넣기는 PASTE_MERGE_CONFLICT로 거절되어야 한다.
    const result = pasteTabularData(
      editor,
      oneByOneData("x"),
      sequentialIds("paste"),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "PASTE_MERGE_CONFLICT" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("붙여넣기 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const createId = sequentialIds("paste");
    const before = editor.getJSON();

    const result = pasteTabularData(editor, oneByOneData("x"), createId);
    expect(result.ok).toBe(true);

    editor.commands.undo();

    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("구조적으로 invalid한 TabularData는 TABULAR_DATA_INVALID로 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const createId = sequentialIds("paste");
    const before = editor.getJSON();

    // columnIndex가 columnCount 밖이라 (0,0)이 어느 셀에도 덮이지 않는다.
    const outOfRange: TabularData = {
      columnCount: 1,
      rows: [
        {
          cells: [
            {
              columnIndex: 3,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "x" }],
            },
          ],
        },
      ],
    };
    // 같은 좌표를 두 셀이 덮는다.
    const overlapping: TabularData = {
      columnCount: 2,
      rows: [
        {
          cells: [
            { columnIndex: 0, rowSpan: 1, columnSpan: 2, content: [] },
            { columnIndex: 1, rowSpan: 1, columnSpan: 1, content: [] },
          ],
        },
      ],
    };

    // 구조(커버리지) 위반은 병합 명령의 NOT_RECTANGULAR가 아니라 원인
    // message가 담긴 전용 코드로 보고된다 — 호출자가 실패 원인을 구분할 수
    // 있어야 한다(Issue #30).
    const outOfRangeResult = pasteTabularData(editor, outOfRange, createId);
    expect(outOfRangeResult.ok).toBe(false);
    if (!outOfRangeResult.ok) {
      expect(outOfRangeResult.error.code).toBe("TABULAR_DATA_INVALID");
      if (outOfRangeResult.error.code === "TABULAR_DATA_INVALID") {
        expect(outOfRangeResult.error.message).toContain(
          "Table layout is invalid",
        );
      }
    }
    const overlappingResult = pasteTabularData(editor, overlapping, createId);
    expect(overlappingResult.ok).toBe(false);
    if (!overlappingResult.ok) {
      expect(overlappingResult.error.code).toBe("TABULAR_DATA_INVALID");
    }
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("model 인라인 텍스트 계약을 어기는 TabularData는 표 안에서도 TABULAR_DATA_INVALID로 거절한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON();

    expect(
      pasteTabularData(editor, oneByOneData("a\tb"), sequentialIds("paste")),
    ).toEqual({
      ok: false,
      error: {
        code: "TABULAR_DATA_INVALID",
        message: "Cell text at row 0, cell 0 is not valid inline text",
      },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("서식 값 위반과 열 정렬 위반은 원인이 담긴 TABULAR_DATA_INVALID로 보고한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const createId = sequentialIds("paste");
    const before = editor.getJSON();

    // 소문자 hex — model 정규 형식(대문자 #RRGGBB) 위반.
    const badColor: TabularData = {
      columnCount: 1,
      rows: [
        {
          cells: [
            {
              columnIndex: 0,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "x" }],
              textColor: "#ff0000",
            },
          ],
        },
      ],
    };
    // columnIndex 내림차순 — pasteInto가 요구하는 오름차순 계약 위반.
    const unsorted: TabularData = {
      columnCount: 2,
      rows: [
        {
          cells: [
            { columnIndex: 1, rowSpan: 1, columnSpan: 1, content: [] },
            { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [] },
          ],
        },
      ],
    };

    expect(pasteTabularData(editor, badColor, createId)).toEqual({
      ok: false,
      error: {
        code: "TABULAR_DATA_INVALID",
        message: "Cell textColor at row 0, cell 0 is not a canonical color",
      },
    });
    expect(pasteTabularData(editor, unsorted, createId)).toEqual({
      ok: false,
      error: {
        code: "TABULAR_DATA_INVALID",
        message: "Cells in row 0 are not sorted by ascending columnIndex",
      },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("표 밖에서 빈 TabularData로 호출하면 INVALID_TABLE_SIZE로 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const createId = sequentialIds("paste");
    const before = editor.getJSON();

    const emptyRows: TabularData = { columnCount: 1, rows: [] };
    const emptyColumns: TabularData = {
      columnCount: 0,
      rows: [{ cells: [] }],
    };

    expect(pasteTabularData(editor, emptyRows, createId)).toEqual({
      ok: false,
      error: { code: "INVALID_TABLE_SIZE" },
    });
    expect(pasteTabularData(editor, emptyColumns, createId)).toEqual({
      ok: false,
      error: { code: "INVALID_TABLE_SIZE" },
    });
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });
});
