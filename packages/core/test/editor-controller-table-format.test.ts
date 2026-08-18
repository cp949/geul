/**
 * 표의 서식 계약: 헤더 행/열 토글, 행/열 단위 셀 색상, 행/열 삭제.
 * 구조 연산(삽입·이동·병합·분할)은 editor-controller-table.test.ts가 소유한다.
 */
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

/** 문단 1개 뒤에 rows x columns 표를 넣은 편집기와 표 blockId를 만든다. */
const editorWithTable = (rows: number, columns: number) => {
  const editor = createEditor({
    initialDocument: paragraphDocument("content"),
    createId: sequentialIds("id"),
  });
  const inserted = editor.commands.insertTable("block-1", { rows, columns });
  if (!inserted.ok) throw new Error("표 삽입 fixture 준비 실패");
  return { editor, tableBlockId: inserted.value.blockId };
};

/** 저장 문서에서 표 블록을 꺼낸다. */
const tableOf = (editor: ReturnType<typeof editorWithTable>["editor"]) => {
  const block = editor.getDocument().blocks[1];
  if (block?.type !== "table") throw new Error("Expected a table block");
  return block;
};

describe("표 헤더 행과 헤더 열", () => {
  it("toggleTableHeaderRow가 headerRows를 켜고 undo 1회로 복원된다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    mountTiptapEditor(editor);
    const before = editor.getDocument();

    expect(editor.commands.toggleTableHeaderRow(tableBlockId)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(tableOf(editor).headerRows).toBe(1);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });

  it("toggleTableHeaderRow를 두 번 부르면 원래 상태로 돌아온다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    mountTiptapEditor(editor);

    editor.commands.toggleTableHeaderRow(tableBlockId);
    editor.commands.toggleTableHeaderRow(tableBlockId);

    expect(tableOf(editor).headerRows).toBe(0);
  });

  it("toggleTableHeaderColumn이 headerColumns를 켠다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    mountTiptapEditor(editor);

    expect(editor.commands.toggleTableHeaderColumn(tableBlockId)).toEqual({
      ok: true,
      value: undefined,
    });

    expect(tableOf(editor).headerColumns).toBe(1);
  });
});

describe("표 행/열 단위 셀 색상", () => {
  it("setTableCellBackgroundColor가 대상 행의 모든 셀에 색을 저장한다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    mountTiptapEditor(editor);

    expect(
      editor.commands.setTableCellBackgroundColor(
        tableBlockId,
        { kind: "row", index: 0 },
        "#AABBCC",
      ),
    ).toEqual({ ok: true, value: undefined });

    const table = tableOf(editor);
    expect(table.rows[0]?.cells.map((cell) => cell.backgroundColor)).toEqual([
      "#AABBCC",
      "#AABBCC",
    ]);
    expect(table.rows[1]?.cells.map((cell) => cell.backgroundColor)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("setTableCellTextColor가 대상 열의 셀에 색을 저장하고 null로 지운다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    mountTiptapEditor(editor);
    const target = { kind: "column", index: 1 } as const;

    editor.commands.setTableCellTextColor(tableBlockId, target, "#112233");
    expect(tableOf(editor).rows[0]?.cells[1]?.textColor).toBe("#112233");

    expect(
      editor.commands.setTableCellTextColor(tableBlockId, target, null),
    ).toEqual({ ok: true, value: undefined });
    expect(tableOf(editor).rows[0]?.cells[1]).not.toHaveProperty("textColor");
  });

  it("색상 적용은 undo 1회로 복원된다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    mountTiptapEditor(editor);
    const before = editor.getDocument();

    editor.commands.setTableCellBackgroundColor(
      tableBlockId,
      { kind: "row", index: 1 },
      "#AABBCC",
    );

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });

  it("정규 형식이 아닌 색은 INVALID_COLOR를 반환하고 문서를 바꾸지 않는다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    mountTiptapEditor(editor);
    const before = editor.getDocument();

    expect(
      editor.commands.setTableCellTextColor(
        tableBlockId,
        { kind: "row", index: 0 },
        "#aabbcc",
      ),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_COLOR", color: "#aabbcc" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("범위 밖 인덱스는 INDEX_OUT_OF_RANGE를 반환한다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    mountTiptapEditor(editor);

    expect(
      editor.commands.setTableCellBackgroundColor(
        tableBlockId,
        { kind: "column", index: 9 },
        "#AABBCC",
      ),
    ).toEqual({ ok: false, error: { code: "INDEX_OUT_OF_RANGE" } });
  });
});

describe("표 셀 색상 렌더링", () => {
  it("셀 색상을 인라인 스타일로 렌더한다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    const { editable } = mountTiptapEditor(editor);

    editor.commands.setTableCellBackgroundColor(
      tableBlockId,
      { kind: "row", index: 0 },
      "#AABBCC",
    );
    editor.commands.setTableCellTextColor(
      tableBlockId,
      { kind: "row", index: 0 },
      "#112233",
    );

    const cell = editable.querySelector<HTMLElement>("table td");
    expect(cell?.style.backgroundColor).toBe("rgb(170, 187, 204)");
    expect(cell?.style.color).toBe("rgb(17, 34, 51)");
    editor.destroy();
  });

  it("색을 지우면 인라인 스타일도 사라진다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    const { editable } = mountTiptapEditor(editor);
    const target = { kind: "row", index: 0 } as const;

    editor.commands.setTableCellBackgroundColor(
      tableBlockId,
      target,
      "#AABBCC",
    );
    editor.commands.setTableCellBackgroundColor(tableBlockId, target, null);

    const cell = editable.querySelector<HTMLElement>("table td");
    expect(cell?.style.backgroundColor).toBe("");
    editor.destroy();
  });
});

describe("표 행/열 삭제", () => {
  it("deleteTableRow가 행을 지우고 undo 1회로 복원된다", () => {
    const { editor, tableBlockId } = editorWithTable(3, 2);
    mountTiptapEditor(editor);
    const before = editor.getDocument();

    expect(editor.commands.deleteTableRow(tableBlockId, 1)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(tableOf(editor).rows).toHaveLength(2);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });

  it("deleteTableColumn이 열을 지운다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 3);
    mountTiptapEditor(editor);

    expect(editor.commands.deleteTableColumn(tableBlockId, 0)).toEqual({
      ok: true,
      value: undefined,
    });

    const table = tableOf(editor);
    expect(table.columns).toHaveLength(2);
    expect(table.rows[0]?.cells).toHaveLength(2);
  });

  it("마지막 행 삭제는 LAST_ROW로 거절하고 문서를 바꾸지 않는다", () => {
    const { editor, tableBlockId } = editorWithTable(1, 2);
    mountTiptapEditor(editor);
    const before = editor.getDocument();

    expect(editor.commands.deleteTableRow(tableBlockId, 0)).toEqual({
      ok: false,
      error: { code: "LAST_ROW" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("마지막 열 삭제는 LAST_COLUMN으로 거절한다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 1);
    mountTiptapEditor(editor);

    expect(editor.commands.deleteTableColumn(tableBlockId, 0)).toEqual({
      ok: false,
      error: { code: "LAST_COLUMN" },
    });
  });
});
