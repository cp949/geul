/**
 * 에디터 컨트롤러의 표 조작 명령을 검증한다. 행·열 삽입과 이동, 열 너비
 * 조절, 표 블록을 거부해야 하는 일반 블록 명령, 셀 병합·분할과 선택 보고,
 * Tab/Shift+Tab 셀 탐색, 셀 안 Enter/Shift+Enter 소비 계약과 undo 단계를
 * 만들지 않아야 하는 no-op 방어 동작을 다룬다. 문서 로드와 표 삽입은
 * editor-controller-table-load.test.ts, 붙여넣기는
 * editor-controller-table-paste.test.ts가 맡는다.
 */
import type { Editor as TiptapEditor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  editorWithTable,
  mountTiptapEditor,
  tableBlockOf,
} from "./editor-controller-support.js";
import {
  activeCellId,
  findCellBoundaryPosition,
  placeCaretInCell,
  selectCellRange,
  selectSingleCell,
} from "./table-test-support.js";

describe("에디터 컨트롤러 표", () => {
  describe("표 조작 명령", () => {
    it("insertTableRow로 표에 행을 추가한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.insertTableRow(tableBlockId, 1)).toEqual({
        ok: true,
        value: undefined,
      });
      const table = tableBlockOf(editor);
      expect(table.rows).toHaveLength(3);
    });

    it("insertTableRow 삽입 직후 undo 1회로 복원된다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      editor.commands.insertTableRow(tableBlockId, 1);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toEqual(before.blocks);
    });

    it("insertTableColumn으로 표에 열을 추가한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.insertTableColumn(tableBlockId, 2)).toEqual({
        ok: true,
        value: undefined,
      });
      const table = tableBlockOf(editor);
      expect(table.columns).toHaveLength(3);
    });

    it("moveTableRow로 표의 행을 이동한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.moveTableRow(tableBlockId, 0, 1)).toEqual({
        ok: true,
        value: undefined,
      });
    });

    it("moveTableRow 이동 직후 undo 1회로 복원된다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      editor.commands.moveTableRow(tableBlockId, 0, 1);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toEqual(before.blocks);
    });

    it("moveTableColumn으로 표의 열을 이동한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.moveTableColumn(tableBlockId, 0, 1)).toEqual({
        ok: true,
        value: undefined,
      });
    });

    it("resizeTableColumn으로 표의 열 너비를 조절한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.resizeTableColumn(tableBlockId, 0, 240)).toEqual({
        ok: true,
        value: undefined,
      });
      const table = tableBlockOf(editor);
      expect(table.columns[0]?.width).toBe(240);
    });

    it("resizeTableColumn 조절 직후 undo 1회로 복원된다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      editor.commands.resizeTableColumn(tableBlockId, 0, 240);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toEqual(before.blocks);
    });

    it("허용 범위 밖 너비는 COLUMN_WIDTH_OUT_OF_RANGE를 반환한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.resizeTableColumn(tableBlockId, 0, 47)).toEqual({
        ok: false,
        error: { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: 47 },
      });
    });

    it("알 수 없는 표 blockId에 대해 TABLE_NOT_FOUND를 반환한다", () => {
      const { editor } = editorWithTable();

      expect(editor.commands.moveTableRow("missing", 0, 1)).toEqual({
        ok: false,
        error: { code: "TABLE_NOT_FOUND", blockId: "missing" },
      });
    });

    it("setText는 표 블록을 거부하고 문서를 바꾸지 않는다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      expect(editor.commands.setText(tableBlockId, "x")).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
      });
      expect(editor.getDocument()).toEqual(before);
    });

    it("setBlockType은 표 블록을 거부하고 문서를 바꾸지 않는다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      expect(
        editor.commands.setBlockType(tableBlockId, { type: "paragraph" }),
      ).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "setBlockType" },
      });
      expect(editor.getDocument()).toEqual(before);
    });

    it("duplicateBlock은 표 블록을 거부하고 문서를 바꾸지 않는다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      expect(editor.commands.duplicateBlock(tableBlockId)).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "duplicateBlock" },
      });
      expect(editor.getDocument()).toEqual(before);
    });

    it("동일 인덱스 행 이동은 undo 단계를 만들지 않는다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      expect(editor.commands.moveTableRow(tableBlockId, 0, 0)).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "moveTableRow" },
      });
      expect(editor.getDocument()).toEqual(before);
      // phantom undo 단계가 없다면 undo 1회는 곧바로 표 삽입을 되돌린다.
      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(
        editor.getDocument().blocks.some((block) => block.type === "table"),
      ).toBe(false);
    });
  });

  describe("표 셀 병합·분할", () => {
    it("셀 범위를 드래그 선택하면 getTableCellSelection이 선택된 셀 id 전부를 보고한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);

      const [topLeft, , , bottomRight] = cellIds;
      selectCellRange(tiptap, topLeft, bottomRight);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds,
        splitCellId: null,
      });
    });

    it("mergeTableCells로 선택한 직사각형 범위를 병합한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      selectCellRange(tiptap, topLeft, bottomRight);

      expect(editor.commands.mergeTableCells(tableBlockId)).toEqual({
        ok: true,
        value: undefined,
      });
      const table = tableBlockOf(editor);
      expect(table.rows[0]?.cells).toHaveLength(1);
      expect(table.rows[0]?.cells[0]).toMatchObject({
        id: topLeft,
        rowSpan: 2,
        columnSpan: 2,
      });
    });

    it("병합 직후 undo 1회로 복원된다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      selectCellRange(tiptap, topLeft, bottomRight);
      const before = editor.getDocument();

      editor.commands.mergeTableCells(tableBlockId);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toEqual(before.blocks);
    });

    it("셀 선택이 없으면 mergeTableCells를 거절하고 문서를 바꾸지 않는다", () => {
      const { editor, tableBlockId } = editorWithTable(2, 2);
      mountTiptapEditor(editor);
      const before = editor.getDocument();

      expect(editor.commands.mergeTableCells(tableBlockId)).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "mergeTableCells" },
      });
      expect(editor.getDocument()).toEqual(before);
    });

    it("병합된 셀에 캐럿을 두면 getTableCellSelection이 splitCellId를 보고한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      if (topLeft === undefined || bottomRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      selectCellRange(tiptap, topLeft, bottomRight);
      editor.commands.mergeTableCells(tableBlockId);

      placeCaretInCell(tiptap, topLeft);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds: [topLeft],
        splitCellId: topLeft,
      });
    });

    it("splitTableCell로 병합된 셀을 원래 셀 개수로 되돌린다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      if (topLeft === undefined || bottomRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      selectCellRange(tiptap, topLeft, bottomRight);
      editor.commands.mergeTableCells(tableBlockId);

      expect(editor.commands.splitTableCell(tableBlockId, topLeft)).toEqual({
        ok: true,
        value: undefined,
      });
      const table = tableBlockOf(editor);
      expect(table.rows[0]?.cells).toHaveLength(2);
      expect(table.rows[1]?.cells).toHaveLength(2);
    });

    it("분할 직후 undo 1회로 병합 상태로 복원된다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      if (topLeft === undefined || bottomRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      selectCellRange(tiptap, topLeft, bottomRight);
      editor.commands.mergeTableCells(tableBlockId);
      const merged = editor.getDocument();

      editor.commands.splitTableCell(tableBlockId, topLeft);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toEqual(merged.blocks);
    });

    it("존재하지 않는 cellId는 CELL_NOT_FOUND를 반환하고 문서를 바꾸지 않는다", () => {
      const { editor, tableBlockId } = editorWithTable(2, 2);
      mountTiptapEditor(editor);
      const before = editor.getDocument();

      expect(editor.commands.splitTableCell(tableBlockId, "missing")).toEqual({
        ok: false,
        error: { code: "CELL_NOT_FOUND", cellId: "missing" },
      });
      expect(editor.getDocument()).toEqual(before);
    });

    // tableEditing 플러그인의 handleTripleClick과 normalizeSelection은 셀
    // 하나만 감싸는 CellSelection을 만든다(@tiptap/pm/tables) — 삼중 클릭
    // 한 번으로 재현된다. prosemirror-tables의 mergeCells도 이 경우를
    // ($anchorCell.pos == $headCell.pos) 거절한다. 아래 두 테스트가 그 상태를
    // selectSingleCell로 재현한다.
    it("병합되지 않은 셀 하나만 감싸는 CellSelection도 서식 대상으로 보고한다(병합/분할 후보는 아니다)", () => {
      const { editor, tableBlockId, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft] = cellIds;

      selectSingleCell(tiptap, topLeft);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds: [topLeft],
        splitCellId: null,
      });
    });

    it("병합된 셀 하나만 감싸는 CellSelection은 splitCellId를 보고한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      selectCellRange(tiptap, topLeft, bottomRight);
      editor.commands.mergeTableCells(tableBlockId);

      selectSingleCell(tiptap, topLeft);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds: [topLeft],
        splitCellId: topLeft,
      });
    });

    it("병합 셀을 가로지르는 CellSelection의 병합은 NOT_RECTANGULAR로 거절한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTable(2, 3);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, topMiddle, topRight, , middleBottom] = cellIds;
      // 첫 행의 왼쪽 두 셀을 병합해 (0,0)-(0,1)을 덮는 셀을 만든다.
      selectCellRange(tiptap, topLeft, topMiddle);
      editor.commands.mergeTableCells(tableBlockId);
      const before = editor.getDocument();

      // 둘째 행 가운데 셀 ~ 첫 행 오른쪽 셀은 열 1-2, 행 0-1의 직사각형이지만
      // 병합 셀이 열 0에서 이 범위 안으로 걸쳐 들어온다.
      selectCellRange(tiptap, middleBottom, topRight);

      expect(editor.commands.mergeTableCells(tableBlockId)).toEqual({
        ok: false,
        error: { code: "NOT_RECTANGULAR" },
      });
      expect(editor.getDocument()).toEqual(before);
    });
  });

  describe("표 키보드 셀 탐색", () => {
    const pressTab = (editable: HTMLElement, shiftKey = false) => {
      editable.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    };

    it("Tab 키 입력은 같은 행의 다음 셀로 캐럿을 옮긴다", () => {
      const { editor, cellIds } = editorWithTable(2, 2);
      const { editable, tiptap } = mountTiptapEditor(editor);
      const [topLeft, topRight] = cellIds;
      if (topLeft === undefined || topRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      placeCaretInCell(tiptap, topLeft);

      pressTab(editable);

      expect(activeCellId(tiptap)).toBe(topRight);
    });

    it("Shift+Tab 키 입력은 이전 셀로 캐럿을 옮긴다", () => {
      const { editor, cellIds } = editorWithTable(2, 2);
      const { editable, tiptap } = mountTiptapEditor(editor);
      const [topLeft, topRight] = cellIds;
      if (topLeft === undefined || topRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      placeCaretInCell(tiptap, topRight);

      pressTab(editable, true);

      expect(activeCellId(tiptap)).toBe(topLeft);
    });

    it("표의 마지막 셀에서 Tab 키 입력은 새 행을 추가하고 undo 1회로 복원된다", () => {
      const { editor, cellIds } = editorWithTable(2, 2);
      const { editable, tiptap } = mountTiptapEditor(editor);
      const lastCellId = cellIds[cellIds.length - 1];
      if (lastCellId === undefined) throw new Error("셀 fixture 준비 실패");
      placeCaretInCell(tiptap, lastCellId);
      const before = editor.getDocument();

      pressTab(editable);

      const table = tableBlockOf(editor);
      expect(table.rows).toHaveLength(3);
      expect(activeCellId(tiptap)).toBe(table.rows[2]?.cells[0]?.id);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toEqual(before.blocks);
    });
  });

  describe("표 셀 Enter와 Shift+Enter", () => {
    /**
     * 셀 안 keydown을 실 keymap 체인으로 디스패치한다. 수정 전(RED 단계)에는
     * 코어 Enter 체인 폴스루가 셀·행을 분할해 중복 ID로 문서를 오염시키고
     * readEditorDocument가 동기 TypeError를 던진다 — 그대로 두면 afterEach의
     * destroy()가 같은 오염 문서를 읽으며 재-throw해 실패 원인을 가리고
     * 마운트된 에디터가 남는다(G-TST-003). 오염 transaction을 undo로 되돌린
     * 뒤 원래 오류를 다시 던져 RED가 재현 오류 하나로만 실패하게 한다.
     * 수정 후(GREEN)에는 catch 경로에 들어오지 않는다.
     */
    const dispatchCellKeydown = (
      tiptap: TiptapEditor,
      key: string,
      shiftKey = false,
    ): boolean => {
      try {
        return dispatchKeydown(tiptap, key, shiftKey);
      } catch (error) {
        tiptap.commands.undo();
        throw error;
      }
    };

    it("빈 셀의 Enter 키 입력은 행을 분할하지 않고 아래 행 같은 열 셀로 캐럿을 옮긴다", () => {
      const { editor, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , bottomLeft] = cellIds;
      if (topLeft === undefined || bottomLeft === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      placeCaretInCell(tiptap, topLeft);
      const before = editor.getDocument();

      const consumed = dispatchCellKeydown(tiptap, "Enter");

      expect(consumed).toBe(true);
      expect(activeCellId(tiptap)).toBe(bottomLeft);
      expect(editor.getDocument()).toEqual(before);
    });

    it("셀 텍스트 중간의 Enter 키 입력은 셀을 분할하지 않고 아래 행 같은 열 셀로 캐럿을 옮긴다", () => {
      const { editor, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , bottomLeft] = cellIds;
      if (topLeft === undefined || bottomLeft === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      placeCaretInCell(tiptap, topLeft);
      expect(tiptap.commands.insertContent("가나다라")).toBe(true);
      const boundary = findCellBoundaryPosition(tiptap, topLeft);
      if (boundary === null) throw new Error("셀 fixture 준비 실패");
      // "가나|다라" — 텍스트 중간 캐럿이 splitBlock 폴스루의 재현 조건이다.
      tiptap.commands.setTextSelection(boundary + 3);
      const before = editor.getDocument();

      const consumed = dispatchCellKeydown(tiptap, "Enter");

      expect(consumed).toBe(true);
      expect(activeCellId(tiptap)).toBe(bottomLeft);
      expect(editor.getDocument()).toEqual(before);
    });

    it("마지막 행 셀의 Enter 키 입력은 셀을 분할하지 않고 문서와 캐럿을 그대로 둔다", () => {
      const { editor, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const bottomRight = cellIds[3];
      if (bottomRight === undefined) throw new Error("셀 fixture 준비 실패");
      placeCaretInCell(tiptap, bottomRight);
      const before = editor.getDocument();
      const selectionBefore = tiptap.state.selection.toJSON();

      const consumed = dispatchCellKeydown(tiptap, "Enter");

      expect(consumed).toBe(true);
      expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
      expect(editor.getDocument()).toEqual(before);
    });

    it("셀 안 Shift+Enter 키 입력은 소비되고 문서와 캐럿을 그대로 둔다", () => {
      const { editor, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft] = cellIds;
      if (topLeft === undefined) throw new Error("셀 fixture 준비 실패");
      placeCaretInCell(tiptap, topLeft);
      const before = editor.getDocument();
      const selectionBefore = tiptap.state.selection.toJSON();

      const consumed = dispatchCellKeydown(tiptap, "Enter", true);

      expect(consumed).toBe(true);
      expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
      expect(editor.getDocument()).toEqual(before);
    });

    it("셀 범위 선택 중 Enter 키 입력도 소비되고 문서를 바꾸지 않는다", () => {
      const { editor, cellIds } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft] = cellIds;
      selectSingleCell(tiptap, topLeft);
      const before = editor.getDocument();

      const consumed = dispatchCellKeydown(tiptap, "Enter");

      expect(consumed).toBe(true);
      expect(editor.getDocument()).toEqual(before);
    });

    it("표 밖 문단의 Enter 키 입력은 기존대로 블록을 분할한다", () => {
      const { editor } = editorWithTable(2, 2);
      const { tiptap } = mountTiptapEditor(editor);
      // paragraphDocument("content")의 block-1 텍스트 중간에 캐럿을 둔다.
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-1") + 3);
      const blocksBefore = editor.getDocument().blocks.length;

      const consumed = dispatchKeydown(tiptap, "Enter");

      expect(consumed).toBe(true);
      expect(editor.getDocument().blocks).toHaveLength(blocksBefore + 1);
    });
  });
});
