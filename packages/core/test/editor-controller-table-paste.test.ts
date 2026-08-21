/**
 * 에디터 컨트롤러의 표 붙여넣기 경로를 실제 ClipboardEvent로 검증한다.
 * 마운트된 표의 colgroup 렌더, 외부 HTML 표·문단이 섞인 시퀀스·자기 복사
 * 래퍼의 붙여넣기, 셀 한도와 병합 충돌 거절이 이벤트를 소비하고 문서를
 * 보존하는지, pasteTabularData의 성공·거절 원인 전달을 다룬다.
 */
import type { TabularData } from "@cp949/geul-io";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  editorState,
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";
import {
  findCellBoundaryPosition,
  placeCaretInCell,
} from "./table-test-support.js";

// jsdom(27.x)은 Clipboard API(DataTransfer/ClipboardEvent)를 구현하지 않는다
// (jsdom/jsdom#1568) — 실제 ClipboardEvent를 가로채는 handlePaste 계약을
// 검증하려면 TablePasteExtension이 실제로 사용하는 표면(getData)만 최소로
// 폴리필한다. 이후 jsdom이 네이티브로 지원하게 되면 이 블록은 자동으로
// 건너뛴다.
if (typeof globalThis.DataTransfer === "undefined") {
  class JsdomDataTransfer {
    private readonly store = new Map<string, string>();

    setData(format: string, data: string): void {
      this.store.set(format, data);
    }

    getData(format: string): string {
      return this.store.get(format) ?? "";
    }
  }

  globalThis.DataTransfer = JsdomDataTransfer as unknown as typeof DataTransfer;
}

if (typeof globalThis.ClipboardEvent === "undefined") {
  class JsdomClipboardEvent extends Event {
    readonly clipboardData: DataTransfer | null;

    constructor(type: string, eventInit?: ClipboardEventInit) {
      super(type, eventInit);
      this.clipboardData = eventInit?.clipboardData ?? null;
    }
  }

  globalThis.ClipboardEvent =
    JsdomClipboardEvent as unknown as typeof ClipboardEvent;
}

describe("에디터 컨트롤러 표", () => {
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

  it("외부 HTML 표 붙여넣기가 표 노드로 파싱되고 undo 1회로 복원된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("paste"),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();

    const data = new DataTransfer();
    data.setData(
      "text/html",
      "<table><tbody><tr><td>ext</td></tr></tbody></table>",
    );
    editable.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );

    const document = editor.getDocument();
    expect(document.blocks.some((block) => block.type === "table")).toBe(true);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    const afterUndo = editor.getDocument();
    expect(afterUndo.blocks.some((block) => block.type === "table")).toBe(
      false,
    );

    editor.destroy();
  });

  it("표 앞뒤에 문단이 섞인 클립보드 붙여넣기가 문단과 표를 모두 보존한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("paste"),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();

    const data = new DataTransfer();
    data.setData(
      "text/html",
      "<p>intro</p><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table><p>outro</p>",
    );
    editable.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );

    const document = editor.getDocument();
    const introIndex = document.blocks.findIndex(
      (block) =>
        block.type === "paragraph" && block.content[0]?.text === "intro",
    );
    const tableIndex = document.blocks.findIndex(
      (block) => block.type === "table",
    );
    const outroIndex = document.blocks.findIndex(
      (block) =>
        block.type === "paragraph" && block.content[0]?.text === "outro",
    );
    expect(introIndex).toBeGreaterThanOrEqual(0);
    expect(introIndex).toBeLessThan(tableIndex);
    expect(tableIndex).toBeLessThan(outroIndex);
    const table = document.blocks[tableIndex];
    if (table?.type === "table") {
      expect(table.rows[0]?.cells[0]?.content[0]?.text).toBe("a");
      expect(table.rows[0]?.cells[1]?.content[0]?.text).toBe("b");
    }

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(
      editor.getDocument().blocks.some((block) => block.type === "table"),
    ).toBe(false);

    editor.destroy();
  });

  it("자기 복사가 만드는 div data-pm-slice 래퍼 붙여넣기도 문단과 표를 보존한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("paste"),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();

    const data = new DataTransfer();
    data.setData(
      "text/html",
      '<div data-pm-slice="1 1 []"><p>intro</p>' +
        "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>" +
        "<p>outro</p></div>",
    );
    editable.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );

    const document = editor.getDocument();
    expect(document.blocks.some((block) => block.type === "table")).toBe(true);
    expect(
      document.blocks.some(
        (block) =>
          block.type === "paragraph" && block.content[0]?.text === "intro",
      ),
    ).toBe(true);
    expect(
      document.blocks.some(
        (block) =>
          block.type === "paragraph" && block.content[0]?.text === "outro",
      ),
    ).toBe(true);

    editor.destroy();
  });

  // 커서가 이미 표 안이면 문단을 블록으로 끼울 자리가 없다(표 셀은
  // InlineContent만 담는다). 버리면 조용한 텍스트 손실이므로 읽기 순서대로
  // 셀 텍스트에 합친다 — 표 앞 문단은 좌상단 셀 앞에, 표 뒤 문단은 마지막
  // 셀 뒤에 붙는다.
  it("표 안에 혼합 클립보드를 붙이면 표 밖 문단 텍스트가 셀에 합쳐진다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("paste"),
    });
    const inserted = editor.commands.insertTable("block-1", {
      rows: 1,
      columns: 2,
    });
    if (!inserted.ok) throw new Error("표 삽입 fixture 준비 실패");
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();

    const insertedTable = editor.getDocument().blocks[1];
    if (insertedTable?.type !== "table") {
      throw new Error("Expected a table block");
    }
    const topLeft = insertedTable.rows[0]?.cells[0]?.id;
    if (topLeft === undefined) throw new Error("셀 fixture 준비 실패");
    placeCaretInCell(tiptap, topLeft);

    const data = new DataTransfer();
    data.setData(
      "text/html",
      "<p>intro</p><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table><p>outro</p>",
    );
    editable.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );

    const document = editor.getDocument();
    const table = document.blocks.find((block) => block.type === "table");
    if (table?.type !== "table") throw new Error("표 블록이 없다");
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "intro\na" }]);
    expect(table.rows[0]?.cells[1]?.content).toEqual([{ text: "b\noutro" }]);
    // 표 밖에 새 문단이 생기지 않는다.
    expect(
      document.blocks.filter((block) => block.type === "paragraph"),
    ).toHaveLength(1);

    // 모델↔에디터가 어긋나면 readEditorDocument()가 TypeError로 터진다.
    expect(editor.commands.setText("block-1", "next")).toEqual({
      ok: true,
      value: undefined,
    });

    editor.destroy();
  });

  it("탭이 섞인 HTML 표를 붙여넣어도 모델과 에디터가 어긋나지 않는다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("paste"),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();

    const data = new DataTransfer();
    data.setData(
      "text/html",
      "<table>\n\t<tbody>\n\t\t<tr>\n\t\t\t<td>Alice\tSmith</td>\n\t\t</tr>\n\t</tbody>\n</table>",
    );
    editable.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );

    const document = editor.getDocument();
    const table = document.blocks.find((block) => block.type === "table");
    expect(table).toBeDefined();
    if (table?.type !== "table") throw new Error("표 블록이 없다");
    expect(table.rows[0]?.cells[0]?.content).toEqual([{ text: "Alice Smith" }]);

    // 붙여넣기 이후에도 다른 명령이 정상 동작해야 한다 — 모델↔에디터가
    // 어긋나면 readEditorDocument()가 TypeError로 터진다.
    expect(editor.commands.setText("block-1", "next")).toEqual({
      ok: true,
      value: undefined,
    });

    editor.destroy();
  });

  it("10,000셀을 넘는 클립보드 표는 이벤트만 소비하고 문서를 바꾸지 않는다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("paste"),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();
    const before = editor.getDocument();

    const cells = Array.from({ length: 101 }, () => "<td>x</td>").join("");
    const rows = Array.from({ length: 101 }, () => `<tr>${cells}</tr>`).join(
      "",
    );
    const htmlData = new DataTransfer();
    htmlData.setData("text/html", `<table><tbody>${rows}</tbody></table>`);
    editable.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: htmlData,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(editor.getDocument().blocks).toEqual(before.blocks);

    const tsvLine = Array.from({ length: 101 }, () => "x").join("\t");
    const tsvData = new DataTransfer();
    tsvData.setData(
      "text/plain",
      Array.from({ length: 101 }, () => tsvLine).join("\n"),
    );
    editable.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: tsvData,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(editor.getDocument().blocks).toEqual(before.blocks);

    editor.destroy();
  });

  /**
   * 세로 병합(rowSpan=2) 셀 안에 캐럿을 둔 2x2 표 에디터를 만든다. 이
   * 상태에서 1행짜리 클립보드 표를 붙여넣으면 병합 셀의 아래쪽 절반이 어느
   * 셀에도 속하지 않게 되어 pasteTabularData가 PASTE_MERGE_CONFLICT로
   * 거절한다 — 명령 레벨 거절 경로를 실제 ClipboardEvent로 재현하는 fixture다.
   */
  const editorWithMergedCellCaret = () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("paste"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const inserted = editor.commands.insertTable("block-1", {
      rows: 2,
      columns: 2,
    });
    if (!inserted.ok) throw new Error("표 삽입 fixture 준비 실패");
    const table = editor.getDocument().blocks[1];
    if (table?.type !== "table") throw new Error("Expected a table block");
    const [topLeft, bottomLeft] = [
      table.rows[0]?.cells[0]?.id,
      table.rows[1]?.cells[0]?.id,
    ];
    if (topLeft === undefined || bottomLeft === undefined) {
      throw new Error("셀 fixture 준비 실패");
    }

    const topLeftPos = findCellBoundaryPosition(tiptap, topLeft);
    const bottomLeftPos = findCellBoundaryPosition(tiptap, bottomLeft);
    if (topLeftPos === null || bottomLeftPos === null) {
      throw new Error("셀 fixture 준비 실패");
    }

    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        CellSelection.create(tiptap.state.doc, topLeftPos, bottomLeftPos),
      ),
    );
    const merged = editor.commands.mergeTableCells(inserted.value.blockId);
    if (!merged.ok) throw new Error("셀 병합 fixture 준비 실패");

    // 병합 셀 안으로 캐럿을 옮긴다 — selectedRect의 anchor가 (0,0)이 된다.
    placeCaretInCell(tiptap, topLeft);
    editable.focus();

    return { editor, editable, tiptap };
  };

  it("병합 충돌로 거절된 TSV 붙여넣기는 이벤트를 소비하고 문서를 보존한다", () => {
    const { editor, editable, tiptap } = editorWithMergedCellCaret();
    const before = editorState(editor, tiptap);

    const data = new DataTransfer();
    data.setData("text/plain", "x\ty");
    editable.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );

    // 파싱은 성공했으므로 명령이 PASTE_MERGE_CONFLICT로 거절해도 이벤트는
    // 소비된다. 기본 붙여넣기로 폴백하면 preserveWhitespace 파싱이 탭을 그대로
    // 문서에 넣어 readEditorDocument()가 TypeError로 터지고 모델↔에디터가
    // 영구히 어긋난다. 거절된 명령은 문서·selection·stored mark를 모두
    // 보존한다(PIT-0003).
    expect(editorState(editor, tiptap)).toEqual(before);

    // 붙여넣기 이후에도 다른 명령이 정상 동작해야 한다 — 어긋났다면
    // readEditorDocument()가 TypeError를 던진다.
    expect(editor.commands.setText("block-1", "next")).toEqual({
      ok: true,
      value: undefined,
    });

    editor.destroy();
  });

  it("병합 충돌로 거절된 HTML 붙여넣기는 이벤트를 소비하고 문서를 보존한다", () => {
    const { editor, editable, tiptap } = editorWithMergedCellCaret();
    const before = editorState(editor, tiptap);

    const data = new DataTransfer();
    data.setData(
      "text/html",
      "<table><tbody><tr><td>x</td><td>y</td></tr></tbody></table>",
    );
    editable.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );

    // HTML 경로는 desync까지 가지는 않지만 기본 붙여넣기로 폴백하면 표
    // 구조가 소실된 채 텍스트만 들어간다 — 역시 "전체 거부" 계약 위반이다.
    expect(editorState(editor, tiptap)).toEqual(before);

    editor.destroy();
  });

  it("pasteTabularData가 표 밖에서 새 표를 만들고 undo 1회로 복원된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(1);

    const data: TabularData = {
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

    const result = editor.commands.pasteTabularData(data);
    expect(result.ok).toBe(true);

    const document = editor.getDocument();
    expect(document.blocks.some((block) => block.type === "table")).toBe(true);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    const afterUndo = editor.getDocument();
    expect(afterUndo.blocks.some((block) => block.type === "table")).toBe(
      false,
    );

    editor.destroy();
  });

  it("손상된 표에 붙여넣으면 TABLE_NODE_INVALID 원인 message를 공개 에러로 전달한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    expect(
      editor.commands.insertTable("block-1", { rows: 1, columns: 1 }).ok,
    ).toBe(true);

    // 셀의 columnId를 존재하지 않는 열로 바꿔 표를 손상시킨다 — 검증 훅이
    // 던지지만 상태는 이미 손상된 채 남는다.
    let cellPos = -1;
    tiptap.state.doc.descendants((node, pos) => {
      if (node.type.name === "tableCell") {
        cellPos = pos;
        return false;
      }
      return true;
    });
    const attrs = tiptap.state.doc.nodeAt(cellPos)?.attrs;
    expect(() =>
      tiptap.view.dispatch(
        tiptap.state.tr.setNodeMarkup(cellPos, undefined, {
          ...attrs,
          columnId: "ghost",
        }),
      ),
    ).toThrow();
    tiptap.commands.setTextSelection(cellPos + 2);

    const data: TabularData = {
      columnCount: 1,
      rows: [
        {
          cells: [
            {
              columnIndex: 0,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "x" }],
            },
          ],
        },
      ],
    };

    // runVoidTableCommand 경로는 TABLE_NODE_INVALID의 message를 캡처하는데
    // pasteTabularData 클로저만 캡처가 빠져 message가 ""로 나갔다 — 원인
    // message 보존 계약(Issue #30)이 이 경로에서만 깨진다.
    const result = editor.commands.pasteTabularData(data);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TABLE_NODE_INVALID");
      if (result.error.code === "TABLE_NODE_INVALID") {
        expect(result.error.message).not.toBe("");
      }
    }

    // 손상 상태로 두면 mount 헬퍼의 cleanup destroy()가 readEditorDocument에서
    // 던진다 — columnId를 원복해 표를 유효하게 되돌린 뒤 destroy한다.
    tiptap.view.dispatch(
      tiptap.state.tr.setNodeMarkup(cellPos, undefined, {
        ...tiptap.state.doc.nodeAt(cellPos)?.attrs,
        columnId: attrs?.columnId,
      }),
    );
    editor.destroy();
  });

  it("pasteTabularData가 invalid한 데이터의 거절 원인 message를 공개 에러로 전달한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(1);

    // 인라인 텍스트 계약 위반(탭 포함) — io validateTabularData가 만든 원인
    // message가 controller 경계에서 소실되지 않아야 한다(Issue #30).
    const invalid: TabularData = {
      columnCount: 1,
      rows: [
        {
          cells: [
            {
              columnIndex: 0,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "a\tb" }],
            },
          ],
        },
      ],
    };

    expect(editor.commands.pasteTabularData(invalid)).toEqual({
      ok: false,
      error: {
        code: "TABULAR_DATA_INVALID",
        message: "Cell text at row 0, cell 0 is not valid inline text",
      },
    });

    editor.destroy();
  });
});
