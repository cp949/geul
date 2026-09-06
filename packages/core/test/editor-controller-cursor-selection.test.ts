import { describe, expect, it } from "vitest";
import type { Block } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  dividerBlock,
  expectDividerNodeSelection,
  headingBlock,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";

// 리터럴 자체는 저장 배열 순서(rows[0].cells)를 col-2, col-1 역순으로 적었지만
// (G-TBL-001, model-to-tiptap.ts), ProductionEditorSession이 매 커밋(초기
// 로드 포함)마다 PM에서 문서를 다시 읽어들여 session.getDocument()가 돌려주는
// row.cells는 항상 PM 물리 순서(col-1, col-2)로 정규화된다 — 이 fixture는
// "첫 번째 셀 = rows[0].cells[0]"이 실제로 물리 좌상단(cell-1)과 일치함을
// 고정한다(RD-003-DELTA-01 "## 결과" — columnIndexMap 기반 재정렬은
// mutation 검증으로 도달 불가능함을 확인해 제거했다).
const reversedStorageOrderTable: Block = {
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
          id: "cell-2",
          columnId: "col-2",
          rowSpan: 1,
          columnSpan: 1,
          content: [{ text: "b" }],
        },
        {
          id: "cell-1",
          columnId: "col-1",
          rowSpan: 1,
          columnSpan: 1,
          content: [{ text: "a" }],
        },
      ],
    },
  ],
  headerRows: 0,
  headerColumns: 0,
};

// reversedStorageOrderTable 안의 cellId 콘텐츠 시작 위치를 독립적으로
// 찾는다(구현부의 firstTableCellRange를 재사용하지 않는다 — 자기 자신으로
// 자기 자신을 검증하는 순환을 피한다).
const cellContentStart = (
  tiptap: { state: { doc: import("@tiptap/pm/model").Node } },
  cellId: string,
): number => {
  let found: number | null = null;
  tiptap.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "tableCell" && node.attrs.cellId === cellId) {
      found = pos + 1;
      return false;
    }
    return true;
  });
  if (found === null) throw new Error(`cell ${cellId} 조회 실패`);
  return found;
};

describe("에디터 컨트롤러 커서·선택 setter API(DOC-007) — setTextCursorPosition", () => {
  it("텍스트 블록에서 placement: start는 콘텐츠 맨 앞에 캐럿을 놓는다(완료 조건 1)", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("block-1", "hello")),
    );

    const result = editor.setTextCursorPosition("block-1", "start");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(tiptap.state.selection.toJSON()).toEqual({
      type: "text",
      anchor: contentTextStart(tiptap, "block-1"),
      head: contentTextStart(tiptap, "block-1"),
    });
  });

  it("텍스트 블록에서 placement: end는 콘텐츠 맨 끝에 캐럿을 놓는다(완료 조건 1)", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("block-1", "hello")),
    );

    const result = editor.setTextCursorPosition("block-1", "end");

    expect(result).toEqual({ ok: true, value: undefined });
    const end = contentTextStart(tiptap, "block-1") + "hello".length;
    expect(tiptap.state.selection.toJSON()).toEqual({
      type: "text",
      anchor: end,
      head: end,
    });
  });

  it("placement 생략 시 기본값은 start다", () => {
    const { editor, tiptap } = mounted(
      documentOf(headingBlock("block-1", 2, "title")),
    );

    editor.setTextCursorPosition("block-1");

    expect(tiptap.state.selection.toJSON()).toEqual({
      type: "text",
      anchor: contentTextStart(tiptap, "block-1"),
      head: contentTextStart(tiptap, "block-1"),
    });
  });

  it("codeBlock에서도 같은 blockContainer 오프셋으로 동작한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(codeBlockBlock("block-1", "const x = 1;")),
    );

    editor.setTextCursorPosition("block-1", "end");

    const end = contentTextStart(tiptap, "block-1") + "const x = 1;".length;
    expect(tiptap.state.selection.toJSON()).toEqual({
      type: "text",
      anchor: end,
      head: end,
    });
  });

  it("텍스트 없는 leaf 블록은 NodeSelection으로 대체된다(완료 조건 2)", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("p1", "one"),
        dividerBlock("d1"),
        paragraphBlock("p2", "two"),
      ),
    );

    const result = editor.setTextCursorPosition("d1");

    expect(result).toEqual({ ok: true, value: undefined });
    expectDividerNodeSelection(tiptap, "d1");
  });

  it("table 블록은 물리 좌상단 셀(저장 순서 아님)의 시작/끝으로 매핑된다(완료 조건 3)", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("before", "b"),
        reversedStorageOrderTable,
        paragraphBlock("after", "a"),
      ),
    );

    const startResult = editor.setTextCursorPosition("table-1", "start");
    expect(startResult).toEqual({ ok: true, value: undefined });
    const cellStart = cellContentStart(tiptap, "cell-1");
    expect(tiptap.state.selection.toJSON()).toEqual({
      type: "text",
      anchor: cellStart,
      head: cellStart,
    });

    const endResult = editor.setTextCursorPosition("table-1", "end");
    expect(endResult).toEqual({ ok: true, value: undefined });
    const cellEnd = cellStart + "a".length;
    expect(tiptap.state.selection.toJSON()).toEqual({
      type: "text",
      anchor: cellEnd,
      head: cellEnd,
    });
  });

  it("알 수 없는 blockId에 대해 BLOCK_NOT_FOUND를 반환한다(완료 조건 4)", () => {
    const { editor } = mounted(documentOf(paragraphBlock("block-1", "one")));

    const result = editor.setTextCursorPosition("missing");

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("문서(모델 트리)를 바꾸지 않는다 — onChange가 발화하지 않는다(완료 조건 8)", () => {
    const { editor, changes } = mounted(
      documentOf(paragraphBlock("block-1", "hello")),
    );
    const before = editor.getDocument();

    editor.setTextCursorPosition("block-1", "end");

    expect(changes).toHaveLength(0);
    expect(editor.getDocument()).toEqual(before);
  });
});

describe("에디터 컨트롤러 커서·선택 setter API(DOC-008) — setSelection", () => {
  it("startBlockId 콘텐츠 시작부터 endBlockId 콘텐츠 끝까지 선택한다(완료 조건 5)", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("block-1", "one"), paragraphBlock("block-2", "two")),
    );

    const result = editor.setSelection("block-1", "block-2");

    expect(result).toEqual({ ok: true, value: undefined });
    const anchor = contentTextStart(tiptap, "block-1");
    const head = contentTextStart(tiptap, "block-2") + "two".length;
    expect(tiptap.state.selection.toJSON()).toEqual({
      type: "text",
      anchor,
      head,
    });
  });

  it("startBlockId가 문서 순서상 뒤여도 순서를 정규화하지 않는다(설계 결정)", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("block-1", "one"), paragraphBlock("block-2", "two")),
    );

    // 인자 순서를 문서 순서와 반대로 준다 — anchor는 여전히 startBlockId
    // (block-2) 콘텐츠 시작, head는 endBlockId(block-1) 콘텐츠 끝이어야
    // 한다("역방향" TextSelection).
    const result = editor.setSelection("block-2", "block-1");

    expect(result).toEqual({ ok: true, value: undefined });
    const anchor = contentTextStart(tiptap, "block-2");
    const head = contentTextStart(tiptap, "block-1") + "one".length;
    expect(tiptap.state.selection.toJSON()).toEqual({
      type: "text",
      anchor,
      head,
    });
    expect(anchor > head).toBe(true);
  });

  it("한쪽이라도 텍스트 블록이 아니면(leaf) COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 6)", () => {
    const { editor } = mounted(
      documentOf(
        paragraphBlock("p1", "one"),
        dividerBlock("d1"),
        paragraphBlock("p2", "two"),
      ),
    );

    const result = editor.setSelection("p1", "d1");

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setSelection" },
    });
  });

  it("한쪽이라도 table이면 COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 6)", () => {
    const { editor } = mounted(
      documentOf(
        paragraphBlock("before", "b"),
        reversedStorageOrderTable,
        paragraphBlock("after", "a"),
      ),
    );

    const result = editor.setSelection("before", "table-1");

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setSelection" },
    });
  });

  it("startBlockId를 찾지 못하면 BLOCK_NOT_FOUND를 반환한다(완료 조건 7)", () => {
    const { editor } = mounted(
      documentOf(paragraphBlock("block-1", "one"), paragraphBlock("block-2", "two")),
    );

    const result = editor.setSelection("missing", "block-2");

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("endBlockId를 찾지 못하면 BLOCK_NOT_FOUND를 반환한다(완료 조건 7)", () => {
    const { editor } = mounted(
      documentOf(paragraphBlock("block-1", "one"), paragraphBlock("block-2", "two")),
    );

    const result = editor.setSelection("block-1", "missing");

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("문서(모델 트리)를 바꾸지 않는다 — onChange가 발화하지 않는다(완료 조건 8)", () => {
    const { editor, changes } = mounted(
      documentOf(paragraphBlock("block-1", "one"), paragraphBlock("block-2", "two")),
    );
    const before = editor.getDocument();

    editor.setSelection("block-1", "block-2");

    expect(changes).toHaveLength(0);
    expect(editor.getDocument()).toEqual(before);
  });
});
