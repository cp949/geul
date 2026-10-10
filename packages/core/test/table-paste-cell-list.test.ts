/**
 * 표 안 캐럿에 목록 항목이 든 클립보드 시퀀스를 붙일 때의 계약을 검증한다
 * (Issue #345). 수정 전에는 표 안 분기가 문단·제목만 셀에 합치고 목록 항목과
 * 그 children을 조용히 버렸다. 이제 목록 항목(중첩 children 포함)은 문단처럼
 * 셀 줄이 된다. 앞 블록은 좌상단 셀 앞에, 뒤 블록은 우하단 셀 뒤에 읽기
 * 순서로 붙는다. 접두어·들여쓰기는 없고, 블록 색은 줄 텍스트의 색 마크가
 * 된다. children 안 표는 둘 이상의 표와 같이 거절하고 문서를 바꾸지 않는다.
 * 표 밖 캐럿과 문단만 섞인 표 안 결과는 이전과 같다.
 */
import type { ClipboardContentBlock } from "@cp949/geul-io";
import type { InlineContent } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { getTableBlock } from "../src/table-commands.js";
import { pasteClipboardContent } from "../src/table-paste-commands.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  createTableFixtureEditor,
  docWithParagraph,
  docWithTwoRowTable,
  placeCaretInCell,
} from "./table-test-support.js";

/** 2x2 클립보드 표다. 셀 텍스트는 a, b / c, d다. */
const table2x2: ClipboardContentBlock = {
  type: "table",
  data: {
    columnCount: 2,
    rows: [
      ["a", "b"],
      ["c", "d"],
    ].map((texts) => ({
      cells: texts.map((text, columnIndex) => ({
        columnIndex,
        rowSpan: 1,
        columnSpan: 1,
        content: [{ text }],
      })),
    })),
  },
};

const bullet = (
  text: string,
  extra: Partial<
    Extract<ClipboardContentBlock, { type: "bulletListItem" }>
  > = {},
): ClipboardContentBlock => ({
  type: "bulletListItem",
  content: text === "" ? [] : [{ text }],
  ...extra,
});

/** 표 안 캐럿 붙여넣기 뒤 table-1의 네 셀 content를 읽는다. */
const cellContents = (editor: Editor): Array<InlineContent | undefined> => {
  const table = getTableBlock(editor, "table-1");
  if (!table.ok) throw new Error("표 조회 실패");
  return table.value.rows.flatMap((row) =>
    row.cells.map((cell) => cell.content),
  );
};

/** 표 안 캐럿 fixture에 시퀀스를 붙인다. */
const pasteInCell = (content: ClipboardContentBlock[]) => {
  const editor = createTableFixtureEditor(docWithTwoRowTable);
  placeCaretInCell(editor, "cell-1");
  const result = pasteClipboardContent(editor, content, sequentialIds("paste"));
  return { editor, result };
};

describe("표 안 캐럿에 목록 항목이 든 클립보드를 붙인다", () => {
  it("표 앞 목록 항목은 좌상단 셀 앞에 줄로 붙는다", () => {
    const { editor, result } = pasteInCell([
      bullet("L1"),
      { type: "numberedListItem", content: [{ text: "L2" }] },
      table2x2,
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)).toEqual([
      [{ text: "L1\nL2\na" }],
      [{ text: "b" }],
      [{ text: "c" }],
      [{ text: "d" }],
    ]);
  });

  it("표 뒤 목록 항목은 우하단 셀 뒤에 줄로 붙는다", () => {
    const { editor, result } = pasteInCell([
      table2x2,
      bullet("T1"),
      { type: "numberedListItem", content: [{ text: "T2" }] },
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)).toEqual([
      [{ text: "a" }],
      [{ text: "b" }],
      [{ text: "c" }],
      [{ text: "d\nT1\nT2" }],
    ]);
  });

  it("앞뒤에 문단과 목록 항목이 섞이면 읽기 순서를 지킨다", () => {
    const { editor, result } = pasteInCell([
      { type: "paragraph", content: [{ text: "intro" }] },
      bullet("L1"),
      table2x2,
      bullet("T1"),
      { type: "paragraph", content: [{ text: "outro" }] },
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)).toEqual([
      [{ text: "intro\nL1\na" }],
      [{ text: "b" }],
      [{ text: "c" }],
      [{ text: "d\nT1\noutro" }],
    ]);
  });

  it("중첩 children은 깊이 우선으로 부모 다음 줄이 되고 접두어가 없다", () => {
    const { editor, result } = pasteInCell([
      bullet("A", {
        children: [
          bullet("B", {
            children: [{ type: "paragraph", content: [{ text: "C" }] }],
          }),
          { type: "heading", level: 2, content: [{ text: "D" }] },
          bullet("E"),
        ],
      }),
      bullet("F"),
      table2x2,
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)[0]).toEqual([{ text: "A\nB\nC\nD\nE\nF\na" }]);
  });

  it("목록 항목의 블록 색은 줄 텍스트의 색 마크가 되고 안쪽 같은 종류 마크가 이긴다", () => {
    const { editor, result } = pasteInCell([
      bullet("L1", { textColor: "#0000FF", backgroundColor: "#FFFF00" }),
      {
        type: "numberedListItem",
        content: [
          {
            text: "L2",
            marks: [{ type: "textColor", color: "#FF0000" }],
          },
        ],
        textColor: "#0000FF",
        children: [
          {
            type: "paragraph",
            content: [{ text: "child" }],
            backgroundColor: "#00FF00",
          },
        ],
      },
      table2x2,
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)[0]).toEqual([
      {
        text: "L1",
        marks: [
          { type: "textColor", color: "#0000FF" },
          { type: "backgroundColor", color: "#FFFF00" },
        ],
      },
      { text: "\n" },
      { text: "L2", marks: [{ type: "textColor", color: "#FF0000" }] },
      { text: "\n" },
      {
        text: "child",
        marks: [{ type: "backgroundColor", color: "#00FF00" }],
      },
      { text: "\na" },
    ]);
  });

  it("내용이 빈 목록 항목은 빈 줄을 내지 않고 그 children은 줄이 된다", () => {
    const { editor, result } = pasteInCell([
      bullet(""),
      bullet("x"),
      bullet("", {
        children: [{ type: "paragraph", content: [{ text: "y" }] }],
      }),
      table2x2,
      bullet(""),
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)).toEqual([
      [{ text: "x\ny\na" }],
      [{ text: "b" }],
      [{ text: "c" }],
      [{ text: "d" }],
    ]);
  });

  it("문단만 섞인 표 안 붙여넣기 결과는 이전과 같다", () => {
    const { editor, result } = pasteInCell([
      { type: "paragraph", content: [{ text: "intro" }] },
      table2x2,
      { type: "paragraph", content: [{ text: "outro" }] },
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)).toEqual([
      [{ text: "intro\na" }],
      [{ text: "b" }],
      [{ text: "c" }],
      [{ text: "d\noutro" }],
    ]);
  });
});

describe("표 안 캐럿에서 목록 항목 children 안 표를 거절한다", () => {
  const nestedTable = (): ClipboardContentBlock =>
    bullet("L1", { children: [table2x2] });

  it.each<[string, () => ClipboardContentBlock[]]>([
    [
      "최상위 표와 children 안 표가 함께 있으면",
      () => [nestedTable(), table2x2],
    ],
    [
      "children 안 표가 둘이면",
      () => [nestedTable(), bullet("L2", { children: [table2x2] })],
    ],
    [
      "중첩 children 깊이 안 표가 최상위 표와 함께 있으면",
      () => [
        bullet("L1", {
          children: [bullet("L2", { children: [table2x2] })],
        }),
        table2x2,
      ],
    ],
  ])(
    "%s CLIPBOARD_CONTENT_INVALID로 거절하고 문서를 바꾸지 않는다",
    (_label, build) => {
      const editor = createTableFixtureEditor(docWithTwoRowTable);
      placeCaretInCell(editor, "cell-1");
      const before = editor.getJSON() as TiptapJsonNode;
      const selectionBefore = editor.state.selection.toJSON();

      const result = pasteClipboardContent(
        editor,
        build(),
        sequentialIds("paste"),
      );

      expect(result).toEqual({
        ok: false,
        error: {
          code: "CLIPBOARD_CONTENT_INVALID",
          message: "Cannot paste multiple tables inside an existing table cell",
        },
      });
      expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
      expect(editor.state.selection.toJSON()).toEqual(selectionBefore);
    },
  );

  it("최상위 표 없이 children 안 표 하나만 있으면 PASTE_TARGET_NOT_FOUND로 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteClipboardContent(
      editor,
      [nestedTable(), bullet("L2")],
      sequentialIds("paste"),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "PASTE_TARGET_NOT_FOUND" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});

describe("표 밖 캐럿의 목록 항목 붙여넣기는 이전과 같다", () => {
  it("목록 항목이 셀 줄이 아니라 문서 블록으로 남는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);

    const result = pasteClipboardContent(
      editor,
      [bullet("L1"), bullet("L2"), table2x2],
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(true);
    const model = tiptapToModel(
      editor.getJSON() as TiptapJsonNode,
      0,
      sequentialIds("model"),
    );
    if (!model.ok) throw new Error(model.error.code);
    expect(model.value.blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "bulletListItem",
      "bulletListItem",
      "table",
    ]);
  });
});

// Issue #351: li 안 pre·hr는 목록 항목의 자식 codeBlock·divider다. 셀은 블록을
// 가질 수 없어 codeBlock은 글자의 줄마다 셀 줄이 되고 divider는 줄이 없다.
describe("표 안 캐럿에 목록 항목 자식 codeBlock·divider가 든 클립보드를 붙인다 (Issue #351)", () => {
  it("codeBlock 글자는 줄마다 셀 줄이 되고 들여쓰기를 지킨다", () => {
    const { editor, result } = pasteInCell([
      bullet("L", {
        children: [{ type: "codeBlock", text: "if (x) {\n  y();\n}" }],
      }),
      table2x2,
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)[0]).toEqual([
      { text: "L\nif (x) {\n  y();\n}\na" },
    ]);
  });

  it("codeBlock 글자의 Tab은 지워 셀 텍스트 검증에 걸리지 않는다", () => {
    const { editor, result } = pasteInCell([
      bullet("L", {
        children: [{ type: "codeBlock", text: "x\n\ty\n\t\nz" }],
      }),
      table2x2,
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)[0]).toEqual([{ text: "L\nx\ny\nz\na" }]);
  });

  it("divider는 줄을 내지 않는다", () => {
    const { editor, result } = pasteInCell([
      bullet("L", {
        children: [
          { type: "divider" },
          { type: "paragraph", content: [{ text: "after" }] },
        ],
      }),
      table2x2,
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)[0]).toEqual([{ text: "L\nafter\na" }]);
  });

  it("codeBlock 안 빈 줄은 건너뛰고 뒤 표 아래 자식도 읽기 순서를 지킨다", () => {
    const { editor, result } = pasteInCell([
      table2x2,
      bullet("T", {
        children: [{ type: "codeBlock", text: "a\n\nb" }, { type: "divider" }],
      }),
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)[3]).toEqual([{ text: "d\nT\na\nb" }]);
  });

  it("codeBlock 안 공백뿐인 줄과 Tab뿐인 줄도 빈 줄로 건너뛰고 글자가 있는 줄의 들여쓰기는 지킨다", () => {
    const { editor, result } = pasteInCell([
      table2x2,
      bullet("T", {
        children: [{ type: "codeBlock", text: "a\n   \n\t\n  b" }],
      }),
    ]);

    expect(result.ok).toBe(true);
    expect(cellContents(editor)[3]).toEqual([{ text: "d\nT\na\n  b" }]);
  });

  it("children 안에 codeBlock·divider만 있어도 표 개수를 셀 때 예외를 내지 않는다", () => {
    const { result } = pasteInCell([
      bullet("L", {
        children: [{ type: "codeBlock", text: "x" }, { type: "divider" }],
      }),
      table2x2,
    ]);

    expect(result.ok).toBe(true);
  });

  it("children 안 codeBlock 옆 표는 둘 이상의 표와 같이 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = pasteClipboardContent(
      editor,
      [
        bullet("L", { children: [{ type: "codeBlock", text: "x" }, table2x2] }),
        table2x2,
      ],
      sequentialIds("paste"),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CLIPBOARD_CONTENT_INVALID",
        message: "Cannot paste multiple tables inside an existing table cell",
      },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});
