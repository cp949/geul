import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  documentWithTable,
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 표", () => {
  it("R0에서 표 문서를 원자적으로 거부한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept"),
      onChange: (event) => changes.push(event),
    });

    expect(editor.replaceDocument(documentWithTable)).toMatchObject({
      ok: false,
      error: { code: "EDITOR_FEATURE_UNAVAILABLE", feature: "table" },
    });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      type: "paragraph",
    });
    expect(editor.getDocument().revision).toBe(0);
    expect(changes).toEqual([]);
  });

  it("insertTable로 지정 블록 뒤에 표를 삽입하고 getDocument()가 표를 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });

    const result = editor.commands.insertTable("block-1", {
      rows: 2,
      columns: 2,
    });

    expect(result.ok).toBe(true);
    const document = editor.getDocument();
    expect(document.blocks).toHaveLength(2);
    const table = document.blocks[1];
    if (table?.type !== "table") throw new Error("Expected a table block");
    expect(table.rows).toHaveLength(2);
    expect(table.columns).toHaveLength(2);
    expect(table.rows[0]?.cells).toHaveLength(2);
  });

  it("insertTable 삽입 직후 undo 1회로 복원된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });
    const before = editor.getDocument();

    editor.commands.insertTable("block-1", { rows: 1, columns: 1 });

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });

  it("알 수 없는 블록 id에 대해 insertTable이 BLOCK_NOT_FOUND를 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    expect(
      editor.commands.insertTable("missing", { rows: 1, columns: 1 }),
    ).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("행 또는 열이 1보다 작으면 insertTable이 INVALID_TABLE_SIZE를 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    expect(
      editor.commands.insertTable("block-1", { rows: 0, columns: 1 }),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_TABLE_SIZE" },
    });
  });

  describe("표 조작 명령", () => {
    const editorWithTable = () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        createId: sequentialIds("id"),
      });
      const inserted = editor.commands.insertTable("block-1", {
        rows: 2,
        columns: 2,
      });
      if (!inserted.ok) throw new Error("표 삽입 fixture 준비 실패");
      return { editor, tableBlockId: inserted.value.blockId };
    };

    it("insertTableRow로 표에 행을 추가한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.insertTableRow(tableBlockId, 1)).toEqual({
        ok: true,
        value: undefined,
      });
      const table = editor.getDocument().blocks[1];
      if (table?.type !== "table") throw new Error("Expected a table block");
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
      const table = editor.getDocument().blocks[1];
      if (table?.type !== "table") throw new Error("Expected a table block");
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
      const table = editor.getDocument().blocks[1];
      if (table?.type !== "table") throw new Error("Expected a table block");
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
    // CellSelection.create는 $anchorCell.node(-1)이 table이길 기대한다 —
    // 셀 노드 바로 앞(= row content 안) 위치가 그 depth다. 셀 내부로 한 칸
    // 더 들어가면 node(-1)이 row가 되어 RangeError를 던진다.
    const findCellBoundaryPosition = (
      tiptap: ReturnType<typeof mountTiptapEditor>["tiptap"],
      cellId: string,
    ): number | null => {
      let found: number | null = null;
      tiptap.state.doc.descendants((node, pos) => {
        if (found !== null) return false;
        if (node.type.name === "tableCell" && node.attrs.cellId === cellId) {
          found = pos;
          return false;
        }
        return true;
      });
      return found;
    };

    // setTextSelection처럼 셀 내부에 캐럿을 두는 용도는 경계 위치 + 1이다.
    const findCellContentPosition = (
      tiptap: ReturnType<typeof mountTiptapEditor>["tiptap"],
      cellId: string,
    ): number | null => {
      const boundary = findCellBoundaryPosition(tiptap, cellId);
      return boundary === null ? null : boundary + 1;
    };

    const selectCellRange = (
      tiptap: ReturnType<typeof mountTiptapEditor>["tiptap"],
      anchorCellId: string,
      headCellId: string,
    ) => {
      const anchorPos = findCellBoundaryPosition(tiptap, anchorCellId);
      const headPos = findCellBoundaryPosition(tiptap, headCellId);
      if (anchorPos === null || headPos === null) {
        throw new Error("셀 fixture 준비 실패");
      }
      const selection = CellSelection.create(
        tiptap.state.doc,
        anchorPos,
        headPos,
      );
      tiptap.view.dispatch(tiptap.state.tr.setSelection(selection));
    };

    const editorWithTable = (rows: number, columns: number) => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        createId: sequentialIds("id"),
      });
      const inserted = editor.commands.insertTable("block-1", {
        rows,
        columns,
      });
      if (!inserted.ok) throw new Error("표 삽입 fixture 준비 실패");
      const table = editor.getDocument().blocks[1];
      if (table?.type !== "table") throw new Error("Expected a table block");
      const cellIds = table.rows.flatMap((row) =>
        row.cells.map((cell) => cell.id),
      );
      return {
        editor,
        tableBlockId: inserted.value.blockId,
        cellIds,
      };
    };

    const editorWithTwoByTwoTable = () => editorWithTable(2, 2);

    it("셀 범위를 드래그 선택하면 getTableCellSelection이 선택된 셀 id 전부를 보고한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
      const { tiptap } = mountTiptapEditor(editor);

      const [topLeft, , , bottomRight] = cellIds;
      if (topLeft === undefined || bottomRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      selectCellRange(tiptap, topLeft, bottomRight);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds,
        mergeable: true,
        splitCellId: null,
      });
    });

    it("mergeTableCells로 선택한 직사각형 범위를 병합한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      if (topLeft === undefined || bottomRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      selectCellRange(tiptap, topLeft, bottomRight);

      expect(editor.commands.mergeTableCells(tableBlockId)).toEqual({
        ok: true,
        value: undefined,
      });
      const table = editor.getDocument().blocks[1];
      if (table?.type !== "table") throw new Error("Expected a table block");
      expect(table.rows[0]?.cells).toHaveLength(1);
      expect(table.rows[0]?.cells[0]).toMatchObject({
        id: topLeft,
        rowSpan: 2,
        columnSpan: 2,
      });
    });

    it("병합 직후 undo 1회로 복원된다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      if (topLeft === undefined || bottomRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      selectCellRange(tiptap, topLeft, bottomRight);
      const before = editor.getDocument();

      editor.commands.mergeTableCells(tableBlockId);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toEqual(before.blocks);
    });

    it("셀 선택이 없으면 mergeTableCells를 거절하고 문서를 바꾸지 않는다", () => {
      const { editor, tableBlockId } = editorWithTwoByTwoTable();
      mountTiptapEditor(editor);
      const before = editor.getDocument();

      expect(editor.commands.mergeTableCells(tableBlockId)).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "mergeTableCells" },
      });
      expect(editor.getDocument()).toEqual(before);
    });

    it("병합된 셀에 캐럿을 두면 getTableCellSelection이 splitCellId를 보고한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      if (topLeft === undefined || bottomRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      selectCellRange(tiptap, topLeft, bottomRight);
      editor.commands.mergeTableCells(tableBlockId);

      const cellPos = findCellContentPosition(tiptap, topLeft);
      if (cellPos === null) throw new Error("병합된 셀 fixture 준비 실패");
      tiptap.commands.setTextSelection(cellPos);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds: [topLeft],
        mergeable: false,
        splitCellId: topLeft,
      });
    });

    it("splitTableCell로 병합된 셀을 원래 셀 개수로 되돌린다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
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
      const table = editor.getDocument().blocks[1];
      if (table?.type !== "table") throw new Error("Expected a table block");
      expect(table.rows[0]?.cells).toHaveLength(2);
      expect(table.rows[1]?.cells).toHaveLength(2);
    });

    it("분할 직후 undo 1회로 병합 상태로 복원된다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
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
      const { editor, tableBlockId } = editorWithTwoByTwoTable();
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
    // ($anchorCell.pos == $headCell.pos) 거절한다.
    const selectSingleCell = (
      tiptap: ReturnType<typeof mountTiptapEditor>["tiptap"],
      cellId: string,
    ) => {
      const cellPos = findCellBoundaryPosition(tiptap, cellId);
      if (cellPos === null) throw new Error("셀 fixture 준비 실패");
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(
          CellSelection.create(tiptap.state.doc, cellPos),
        ),
      );
    };

    it("병합되지 않은 셀 하나만 감싸는 CellSelection도 서식 대상으로 보고한다(병합/분할 후보는 아니다)", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft] = cellIds;
      if (topLeft === undefined) throw new Error("셀 fixture 준비 실패");

      selectSingleCell(tiptap, topLeft);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds: [topLeft],
        mergeable: false,
        splitCellId: null,
      });
    });

    it("병합된 셀 하나만 감싸는 CellSelection은 splitCellId를 보고한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      if (topLeft === undefined || bottomRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      selectCellRange(tiptap, topLeft, bottomRight);
      editor.commands.mergeTableCells(tableBlockId);

      selectSingleCell(tiptap, topLeft);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds: [topLeft],
        mergeable: false,
        splitCellId: topLeft,
      });
    });

    it("병합 셀을 가로지르는 CellSelection의 병합은 NOT_RECTANGULAR로 거절한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTable(2, 3);
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, topMiddle, topRight, , middleBottom] = cellIds;
      if (
        topLeft === undefined ||
        topMiddle === undefined ||
        topRight === undefined ||
        middleBottom === undefined
      ) {
        throw new Error("셀 fixture 준비 실패");
      }
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

  it("마운트된 표는 colgroup col로 모델 열 너비를 렌더하고 리사이즈를 반영한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });
    const { editable } = mountTiptapEditor(editor);
    const inserted = editor.commands.insertTable("block-1", {
      rows: 2,
      columns: 2,
    });
    if (!inserted.ok) throw new Error("표 삽입 fixture 준비 실패");

    const cols = editable.querySelectorAll<HTMLElement>("table colgroup col");
    expect(cols).toHaveLength(2);
    expect(cols[0]?.style.width).toBe("160px");

    expect(
      editor.commands.resizeTableColumn(inserted.value.blockId, 0, 240),
    ).toEqual({ ok: true, value: undefined });

    const resized =
      editable.querySelectorAll<HTMLElement>("table colgroup col");
    expect(resized[0]?.style.width).toBe("240px");
    // 마운트된 에디터를 남겨두면 PM DOMObserver의 지연 flush가 jsdom 해제
    // 이후에 실행되어 unhandled error가 된다.
    editor.destroy();
  });

  it("외부 HTML 표 붙여넣기는 표 노드로 파싱되지 않고 문서를 깨뜨리지 않는다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("paste"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(8);

    expect(() =>
      tiptap.commands.insertContent(
        "<table><tbody><tr><td>ext</td></tr></tbody></table>",
      ),
    ).not.toThrow();

    const document = editor.getDocument();
    expect(document.blocks.some((block) => block.type === "table")).toBe(false);
    expect(editor.commands.setText("block-1", "recovered")).toMatchObject({
      ok: true,
    });
    editor.destroy();
  });
});
