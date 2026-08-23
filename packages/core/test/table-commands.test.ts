/**
 * 표 명령의 구조 조작 경로를 검증한다. 표 삽입, 행·열의 삽입·삭제·이동,
 * 열 너비 조절, 헤더 행·열 토글, 셀 병합·분할, 그리고 undo 단계를 만들지
 * 않아야 하는 no-op 방어 동작을 다룬다. 각 구조 변경 명령이 연산 후 캐럿을
 * 예측 가능한 셀로 옮기는지도 함께 검증한다(applyTableGridOperation의
 * selectCellId/preserveSelection 계약). 붙여넣기 경로는 table-paste-*.test.ts가
 * 맡는다.
 */
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import {
  deleteTableColumn,
  deleteTableRow,
  insertTable,
  insertTableColumn,
  insertTableRow,
  mergeTableCells,
  moveTableColumn,
  moveTableRow,
  resizeTableColumn,
  splitTableCell,
  toggleTableHeaderRow,
} from "../src/table-commands.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  activeCellId,
  createTableFixtureEditor,
  docWithParagraph,
  docWithTable,
  docWithTwoRowTable,
  selectCellRange,
} from "./table-test-support.js";

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
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[1]?.type).toBe("table");
    expect(doc.content?.[1]?.content).toHaveLength(2);
    expect(doc.content?.[1]?.content?.[0]?.content).toHaveLength(2);
  });

  it("삽입 직후 undo 1회로 표 삽입 이전 상태로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    insertTable(editor, "para-1", { rows: 2, columns: 2 }, createId);
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("존재하지 않는 blockId 뒤에는 삽입할 수 없고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

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
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("행 또는 열이 1보다 작으면 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

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
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});

describe("표에 행을 삽입한다", () => {
  it("지정 위치에 행을 하나 삽입한다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");

    const result = insertTableRow(editor, "table-1", 1, createId);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    expect(table?.content).toHaveLength(2);
    expect(table?.content?.[1]?.content).toHaveLength(2);
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
});

describe("표에 열을 삽입한다", () => {
  it("지정 위치에 열을 하나 삽입한다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    const createId = sequentialIds("id");

    const result = insertTableColumn(editor, "table-1", 2, createId);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    expect(table?.attrs?.columns).toHaveLength(3);
    expect(table?.content?.[0]?.content).toHaveLength(3);
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
    // PIT-0004: table.columns가 새 열을 맨 앞에 둔다면, PM 문서의 물리 셀
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
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    const insertedCellId = table?.content?.[0]?.content?.[1]?.attrs?.cellId;
    expect(typeof insertedCellId).toBe("string");
    expect(activeCellId(editor)).toBe(insertedCellId);
  });
});

describe("표에서 행을 삭제한다", () => {
  it("지정 인덱스의 행을 삭제한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    const result = deleteTableRow(editor, "table-1", 0);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    expect(table?.content).toHaveLength(1);
    expect(table?.content?.[0]?.attrs?.rowId).toBe("row-2");
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

describe("표에서 열을 삭제한다", () => {
  it("지정 인덱스의 열을 삭제한다", () => {
    const editor = createTableFixtureEditor(docWithTable);

    const result = deleteTableColumn(editor, "table-1", 0);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    expect(table?.attrs?.columns).toHaveLength(1);
    expect(table?.content?.[0]?.content).toHaveLength(1);
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

describe("표의 행을 이동한다", () => {
  it("지정 인덱스로 행을 이동한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);

    const result = moveTableRow(editor, "table-1", 0, 1);

    expect(result).toEqual({ ok: true, value: undefined });
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    expect(table?.content?.[0]?.attrs?.rowId).toBe("row-2");
    expect(table?.content?.[1]?.attrs?.rowId).toBe("row-1");
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

describe("표의 열을 이동한다", () => {
  it("지정 인덱스로 열을 이동한다", () => {
    const editor = createTableFixtureEditor(docWithTable);

    const result = moveTableColumn(editor, "table-1", 0, 1);

    expect(result).toEqual({ ok: true, value: undefined });
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
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    expect(table?.attrs?.columns).toEqual([
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
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content?.[0]?.type).toBe("paragraph");
    expect(doc.content?.[0]?.content ?? []).toHaveLength(0);
    expect(doc.content?.[1]?.type).toBe("table");
  });

  it("삽입 직후 undo 1회로 트리거 텍스트와 표 삽입 이전 상태로 함께 복원된다", () => {
    const editor = createTableFixtureEditor(docWithSlashText);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    insertTable(editor, "para-1", { rows: 1, columns: 1 }, createId, {
      clearAfterBlockText: true,
    });
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
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
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    expect(table?.content).toHaveLength(2);
    expect(table?.content?.[0]?.content).toHaveLength(1);
    expect(table?.content?.[0]?.content?.[0]?.attrs).toMatchObject({
      cellId: "cell-1",
      rowspan: 2,
      colspan: 2,
    });
    expect(table?.content?.[1]?.content ?? []).toHaveLength(0);
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
  });

  it("병합 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON() as TiptapJsonNode;

    mergeTableCells(
      editor,
      "table-1",
      { row: 0, column: 0 },
      { row: 1, column: 1 },
    );
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("존재하지 않는 표 blockId는 TABLE_NOT_FOUND를 반환하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    const before = editor.getJSON() as TiptapJsonNode;

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
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
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
    const before = editor.getJSON() as TiptapJsonNode;

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
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
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
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
    expect(table?.content?.[0]?.content).toHaveLength(2);
    expect(table?.content?.[1]?.content).toHaveLength(2);
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
    expect(doc.content?.[0]?.content).toHaveLength(1);
    expect(doc.content?.[0]?.content?.[0]?.content).toHaveLength(2);
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
});
