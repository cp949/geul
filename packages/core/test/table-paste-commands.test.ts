/**
 * TabularData 붙여넣기가 문서 어디에 표를 만드는지 검증한다. 문단 걸침
 * 선택, 전체 선택, GapCursor, 표 안팎 등 호출 시점의 선택 상태별로 표가
 * 놓이는 위치와 캐럿 이동, undo 단계를 다루고, 문단이 섞인 클립보드
 * 시퀀스의 삽입도 함께 본다. 거절 경로는 table-paste-validation.test.ts가
 * 맡는다.
 */
import type { ClipboardContentBlock, TabularData } from "@cp949/geul-io";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import {
  pasteClipboardContent,
  pasteTabularData,
} from "../src/table-commands.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  cellJson,
  createTableFixtureEditor,
  docWithParagraph,
  docWithTable,
  docWithTwoRowTable,
  oneByOneData,
  placeCaretInCell,
} from "./table-test-support.js";

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

describe("표에 표 형태 데이터를 붙여넣는다", () => {
  it("두 문단에 걸친 선택에서 호출하면 선택을 지우고 캐럿을 새 표로 옮긴다", () => {
    const editor = createTableFixtureEditor(docWithTwoParagraphs);
    // "hello"의 "e"부터 "world"의 "w" 뒤까지 — 두 최상위 블록에 걸친 선택.
    editor.commands.setTextSelection({ from: 2, to: 9 });
    const createId = sequentialIds("paste");

    const result = pasteTabularData(editor, oneByOneData("A"), createId);

    expect(result.ok).toBe(true);
    // 선택 삭제로 두 문단이 "h" + "orld"로 병합되고 그 뒤에 표가 생긴다 —
    // 다른 에디터와 같은 "붙여넣기는 선택을 대체한다" 계약(Issue #29).
    const doc = editor.getJSON() as TiptapJsonNode;
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
    const doc = editor.getJSON() as TiptapJsonNode;
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

  it("전체 선택(Ctrl+A) 붙여넣기가 선택을 대체하고 표를 만든다", () => {
    const editor = createTableFixtureEditor(docWithTwoParagraphs);
    editor.commands.selectAll();

    const result = pasteTabularData(
      editor,
      oneByOneData("A"),
      sequentialIds("paste"),
    );

    // AllSelection 삭제가 남기는 스키마 필러 문단은 BlockIdExtension의
    // appendTransaction이 돌기 전이라 blockId가 없다 — 삽입 위치가 blockId
    // 조회에 의존하면 여기서 PASTE_TARGET_NOT_FOUND로 무너진다(3차 리뷰
    // 재현). 필러 문단 뒤에 표가 생겨야 한다.
    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0]?.type).toBe("paragraph");
    expect(doc.content?.[0]?.content ?? []).toHaveLength(0);
    expect(doc.content?.[1]?.type).toBe("table");
    const { selection } = editor.state;
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.textContent).toBe("A");
    editor.destroy();
  });

  it("첫 블록 앞 GapCursor에서 붙여넣으면 표가 그 블록 앞에 생긴다", () => {
    const editor = createTableFixtureEditor(docWithTable);
    editor.view.dispatch(
      editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(0))),
    );

    const result = pasteTabularData(
      editor,
      oneByOneData("A"),
      sequentialIds("paste"),
    );

    // 커서가 기존 표 '앞'을 가리켰으므로 새 표는 기존 표 앞에 와야 한다 —
    // 커서가 가리키기 직전인 블록 '뒤'에 붙으면 표가 한 블록 아래로 밀린다.
    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0]?.type).toBe("table");
    expect(
      doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
    ).toBe("A");
    expect(doc.content?.[1]?.attrs?.blockId).toBe("table-1");
    editor.destroy();
  });

  it("표 안에서 표 밖으로 걸친 선택은 지우지 않고 표를 손상 없이 붙여넣는다", () => {
    // 문단 뒤에 첫 셀에 "ab"가 든 표 — 셀 안(anchor)에서 문단(head)으로
    // 드래그한 역방향 선택을 재현한다. isInTable은 $head만 보므로 이 선택은
    // 표 밖 분기로 들어간다.
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "para-1" },
          content: [{ type: "text", text: "hello" }],
        },
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
              content: [
                {
                  ...cellJson("cell-1", "col-1"),
                  content: [{ type: "text", text: "ab" }],
                },
                cellJson("cell-2", "col-2"),
              ],
            },
          ],
        },
      ],
    });
    // anchor=12(셀 "ab" 뒤), head=3(문단 중간) — prosemirror-tables의
    // normalizeSelection은 $to.parentOffset이 0이 아니라 개입하지 않는다.
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, 12, 3),
      ),
    );

    const result = pasteTabularData(
      editor,
      oneByOneData("A"),
      sequentialIds("paste"),
    );

    // 표를 부분적으로 걸친 범위를 deleteSelection으로 지우면 ReplaceStep이
    // 스키마 필러로 cellId 없는 셀을 만들어 모델과 에디터가 영구 desync된다
    // (3차 리뷰 재현) — 이런 선택은 지우지 않고 붙여넣기만 한다.
    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(3);
    expect(doc.content?.[0]?.content?.[0]?.text).toBe("hello");
    expect(doc.content?.[1]?.attrs?.blockId).toBe("table-1");
    expect(doc.content?.[1]?.content?.[0]?.content?.[0]?.attrs?.cellId).toBe(
      "cell-1",
    );
    expect(
      doc.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
    ).toBe("ab");
    expect(doc.content?.[2]?.type).toBe("table");
    const { selection } = editor.state;
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.textContent).toBe("A");
    editor.destroy();
  });

  it("표 밖 붙여넣기와 선택 삭제가 undo 1회로 함께 복원된다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const createId = sequentialIds("paste");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteTabularData(editor, oneByOneData("A"), createId);
    expect(result.ok).toBe(true);

    editor.commands.undo();

    // 선택 삭제와 표 삽입이 한 트랜잭션이어야 undo 1회로 원문이 돌아온다.
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
    editor.destroy();
  });

  it("붙여넣기 트랜잭션이 캐럿을 화면 안으로 스크롤하도록 표시한다", () => {
    // 네이티브 doPaste는 tr.scrollIntoView()를 보장한다 — 가로챈 붙여넣기가
    // 이를 생략하면 긴 문서에서 뷰포트 밖으로 커지는 표를 붙여넣었을 때
    // 캐럿은 옮겨졌는데 화면이 따라가지 않아 no-op처럼 보인다. 표 밖·표 안
    // 두 dispatch 경로 모두 검사한다.
    const outside = createTableFixtureEditor(docWithParagraph);
    outside.commands.setTextSelection(1);
    let dispatched: (typeof outside.state.tr)[] = [];
    const outsideDispatch = outside.view.dispatch.bind(outside.view);
    outside.view.dispatch = (transaction) => {
      dispatched.push(transaction);
      outsideDispatch(transaction);
    };
    expect(
      pasteTabularData(outside, oneByOneData("A"), sequentialIds("paste")).ok,
    ).toBe(true);
    expect(dispatched.at(-1)?.scrolledIntoView).toBe(true);
    outside.destroy();

    const inside = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(inside, "cell-1");
    dispatched = [];
    const insideDispatch = inside.view.dispatch.bind(inside.view);
    inside.view.dispatch = (transaction) => {
      dispatched.push(transaction);
      insideDispatch(transaction);
    };
    expect(
      pasteTabularData(inside, oneByOneData("x"), sequentialIds("paste")).ok,
    ).toBe(true);
    expect(dispatched.at(-1)?.scrolledIntoView).toBe(true);
    inside.destroy();
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
    const doc = editor.getJSON() as TiptapJsonNode;
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
    const table = (editor.getJSON() as TiptapJsonNode).content?.[0];
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

  it("붙여넣기 직후 undo 1회로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const createId = sequentialIds("paste");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteTabularData(editor, oneByOneData("x"), createId);
    expect(result.ok).toBe(true);

    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
    editor.destroy();
  });
});

describe("클립보드 시퀀스를 붙여넣는다", () => {
  const paragraphBlock = (text: string): ClipboardContentBlock => ({
    type: "paragraph",
    content: [{ text }],
  });
  const tableBlock = (text: string): ClipboardContentBlock => ({
    type: "table",
    data: {
      columnCount: 1,
      rows: [
        {
          cells: [
            { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [{ text }] },
          ],
        },
      ],
    },
  });

  it("표 밖에서 문단+표+문단 시퀀스를 한 트랜잭션으로 삽입한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const createId = sequentialIds("paste");

    const result = pasteClipboardContent(
      editor,
      [paragraphBlock("intro"), tableBlock("A"), paragraphBlock("outro")],
      createId,
    );

    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(4);
    expect(doc.content?.[0]?.content?.[0]?.text).toBe("hello");
    expect(doc.content?.[1]?.type).toBe("paragraph");
    expect(doc.content?.[1]?.content?.[0]?.text).toBe("intro");
    expect(doc.content?.[2]?.type).toBe("table");
    expect(
      doc.content?.[2]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
    ).toBe("A");
    expect(doc.content?.[3]?.type).toBe("paragraph");
    expect(doc.content?.[3]?.content?.[0]?.text).toBe("outro");
    // 새 문단도 안정 id를 받는다 — BlockIdExtension의 appendTransaction이
    // 같은 dispatch 안에서 사후 배정한다.
    const introBlockId = doc.content?.[1]?.attrs?.blockId;
    expect(typeof introBlockId).toBe("string");
    expect((introBlockId as string).length).toBeGreaterThan(0);
    // 캐럿은 삽입된 표의 좌상단 셀로 이동한다.
    const { selection } = editor.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.type.name).toBe("tableCell");
    expect(selection.$from.parent.textContent).toBe("A");
    editor.destroy();
  });

  it("undo 1회로 삽입 전 상태로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteClipboardContent(
      editor,
      [paragraphBlock("intro"), tableBlock("A")],
      sequentialIds("paste"),
    );
    expect(result.ok).toBe(true);

    editor.commands.undo();
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
    editor.destroy();
  });

  // 표 셀은 블록 자식을 가질 수 없으므로(model TableCell.content:
  // InlineContent) 문단을 별도 블록으로 끼울 자리가 없다. 그렇다고 버리면
  // 조용한 텍스트 손실이므로 읽기 순서 그대로 셀 인라인 콘텐츠에 합친다 —
  // 표 앞 문단은 좌상단 셀 앞에, 표 뒤 문단은 마지막 셀 뒤에 LF로 구분해
  // 붙인다.
  it("표 안에서 문단이 섞인 시퀀스는 문단 텍스트를 셀에 합쳐 보존한다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteClipboardContent(
      editor,
      [paragraphBlock("intro"), tableBlock("x"), paragraphBlock("outro")],
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    // 표 밖에 새 문단이 생기지 않는다 — 최상위 블록 수는 그대로다.
    expect(doc.content).toHaveLength(before.content?.length ?? 0);
    // 1×1 표라 좌상단 셀이 곧 마지막 셀이다 — intro/셀 텍스트/outro가
    // 문서 순서대로 한 셀에 들어간다.
    expect(
      doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
    ).toBe("intro\nx\noutro");
    editor.destroy();
  });

  it("표 안에서 앞뒤 문단은 붙여넣은 표의 좌상단·마지막 셀에 각각 합친다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");

    const result = pasteClipboardContent(
      editor,
      [
        paragraphBlock("intro"),
        {
          type: "table",
          data: {
            columnCount: 2,
            rows: [
              {
                cells: [
                  {
                    columnIndex: 0,
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "a" }],
                  },
                  {
                    columnIndex: 1,
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "b" }],
                  },
                ],
              },
            ],
          },
        },
        paragraphBlock("outro"),
      ],
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(true);
    const row = editor.getJSON() as TiptapJsonNode;
    const cells = row.content?.[0]?.content?.[0]?.content ?? [];
    expect(cells[0]?.content?.[0]?.text).toBe("intro\na");
    expect(cells[1]?.content?.[0]?.text).toBe("b\noutro");
    editor.destroy();
  });

  // 마크는 그대로 살아야 하고, 이웃한 같은 마크 런은 합쳐져야 한다 —
  // inlineContentViolation이 "adjacent inline runs with identical marks"를
  // 거절하므로 구분자를 끼워 넣는 쪽에서 병합 형태를 지켜야 한다.
  it("셀에 합칠 때 문단 마크를 보존하고 같은 마크 런은 합친다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");

    const result = pasteClipboardContent(
      editor,
      [
        {
          type: "paragraph",
          content: [{ text: "bold", marks: [{ type: "bold" }] }],
        },
        tableBlock("x"),
      ],
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    const cellContent =
      doc.content?.[0]?.content?.[0]?.content?.[0]?.content ?? [];
    expect(cellContent[0]?.text).toBe("bold");
    expect(cellContent[0]?.marks).toEqual([{ type: "bold" }]);
    expect(cellContent[1]?.text).toBe("\nx");
    expect(cellContent[1]?.marks).toBeUndefined();
    editor.destroy();
  });

  it("빈 시퀀스는 PASTE_TARGET_NOT_FOUND로 거절한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteClipboardContent(editor, [], sequentialIds("paste"));

    expect(result).toEqual({
      ok: false,
      error: { code: "PASTE_TARGET_NOT_FOUND" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
    editor.destroy();
  });

  it("문단 콘텐츠가 편집 가능 계약을 어기면 CLIPBOARD_CONTENT_INVALID로 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteClipboardContent(
      editor,
      [{ type: "paragraph", content: [{ text: "" }] }, tableBlock("A")],
      sequentialIds("paste"),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CLIPBOARD_CONTENT_INVALID",
        message: "Paragraph content contains an empty text run",
      },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
    editor.destroy();
  });
});
