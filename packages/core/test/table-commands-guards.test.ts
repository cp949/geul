/**
 * 표 조회와 no-op·트랜잭션 거절 방어 명령의 문서 보존 계약을 확인한다.
 */
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import {
  deleteTableRow,
  getTableBlock,
  insertTable,
  moveTableColumn,
  moveTableRow,
  resizeTableColumn,
} from "../src/table-commands.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  createTableFixtureEditor,
  docWithParagraph,
  docWithTable,
  docWithTwoRowTable,
  RejectAllTransactionsExtension,
} from "./table-test-support.js";

describe("표 블록을 읽는다", () => {
  it("존재하는 표 blockId로 TableBlock을 읽는다", () => {
    const editor = createTableFixtureEditor(docWithTable);

    const result = getTableBlock(editor, "table-1");

    expect(result).toEqual({
      ok: true,
      value: {
        id: "table-1",
        type: "table",
        columns: [
          { id: "col-1", width: 160 },
          { id: "col-2", width: 160 },
        ],
        rows: [
          {
            id: "row-1",
            cells: [
              {
                id: "cell-1",
                columnId: "col-1",
                rowSpan: 1,
                columnSpan: 1,
                content: [],
              },
              {
                id: "cell-2",
                columnId: "col-2",
                rowSpan: 1,
                columnSpan: 1,
                content: [],
              },
            ],
          },
        ],
        headerRows: 0,
        headerColumns: 0,
      },
    });
  });

  it("존재하지 않는 blockId는 TABLE_NOT_FOUND를 반환한다", () => {
    const editor = createTableFixtureEditor(docWithTable);

    const result = getTableBlock(editor, "missing");

    expect(result).toEqual({
      ok: false,
      error: { code: "TABLE_NOT_FOUND", blockId: "missing" },
    });
  });

  it("표가 아닌 blockId는 TABLE_NOT_FOUND를 반환한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);

    const result = getTableBlock(editor, "para-1");

    expect(result).toEqual({
      ok: false,
      error: { code: "TABLE_NOT_FOUND", blockId: "para-1" },
    });
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
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0]?.type).toBe("table");
    const originalTable = getTableBlock(editor, "table-1");
    if (!originalTable.ok) throw new Error("표 조회 실패");
    expect(originalTable.value.rows).toHaveLength(1);
    expect(originalTable.value.rows[0]?.cells).toHaveLength(2);
    expect(doc.content?.[1]?.type).toBe("table");
  });

  it("동일 인덱스 행 이동은 성공하되 undo 단계를 만들지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON() as TiptapJsonNode;

    expect(moveTableRow(editor, "table-1", 1, 1)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
    expect(editor.can().undo()).toBe(false);
  });

  it("동일 인덱스 열 이동은 성공하되 undo 단계를 만들지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON() as TiptapJsonNode;

    expect(moveTableColumn(editor, "table-1", 0, 0)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
    expect(editor.can().undo()).toBe(false);
  });

  it("현재 값과 같은 너비로 리사이즈하면 성공하되 undo 단계를 만들지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const before = editor.getJSON() as TiptapJsonNode;

    expect(resizeTableColumn(editor, "table-1", 0, 160)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
    expect(editor.can().undo()).toBe(false);
  });

  it("필터가 트랜잭션을 버리면 applyTableGridOperation 경유 명령은 실패를 반환하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable, [
      RejectAllTransactionsExtension,
    ]);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = deleteTableRow(editor, "table-1", 0);

    expect(result).toEqual({
      ok: false,
      error: { code: "TRANSACTION_REJECTED" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("필터가 트랜잭션을 버리면 insertTable은 실패를 반환하고 표를 삽입하지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph, [
      RejectAllTransactionsExtension,
    ]);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = insertTable(
      editor,
      "para-1",
      { rows: 1, columns: 1 },
      createId,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "TRANSACTION_REJECTED" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});

// DELTA-02a 완료 조건 6·9 — 중첩된 표(다른 블록의 자식)의 위치 조회·삽입이
// 재귀화된 뒤에도 표의 중첩 위치와 주변 구조가 보존되는지 검증한다.
