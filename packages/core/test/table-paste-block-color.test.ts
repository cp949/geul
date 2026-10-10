/**
 * 클립보드 시퀀스 블록의 자기 색(textColor·backgroundColor, Issue #343)이
 * 붙여넣기 뒤 어디에 남는지 검증한다. 표 밖 캐럿이면 블록 속성으로, 표 안
 * 캐럿이면 셀에 합친 텍스트의 색 마크로 남는다. 안쪽 같은 종류 마크 우선,
 * 비canonical 색 거절과 거절 시 문서 불변도 함께 본다. 시퀀스 삽입 위치와
 * 그 밖의 계약 위반은 table-paste-commands.test.ts가 맡는다.
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

/** 셀 하나짜리 표 블록이다. 문단 경계와 셀 합치기를 보는 최소 입력이다. */
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

/** 표 안 캐럿 붙여넣기 뒤 table-1의 좌상단 셀 content를 읽는다. */
const firstCellContent = (editor: Editor): InlineContent | undefined => {
  const table = getTableBlock(editor, "table-1");
  if (!table.ok) throw new Error("표 조회 실패");
  return table.value.rows[0]?.cells[0]?.content;
};

describe("클립보드 블록 색을 붙여넣는다", () => {
  it("표 밖에서 붙인 문단·heading·목록 항목(중첩 포함)의 블록 색이 문서 model 블록에 남는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    editor.commands.setTextSelection(1);

    const result = pasteClipboardContent(
      editor,
      [
        { type: "paragraph", content: [{ text: "p" }], textColor: "#0000FF" },
        {
          type: "heading",
          level: 2,
          content: [{ text: "h" }],
          backgroundColor: "#FFFF00",
        },
        tableBlock("A"),
        {
          type: "bulletListItem",
          content: [{ text: "item" }],
          textColor: "#FF0000",
          children: [
            {
              type: "paragraph",
              content: [{ text: "child" }],
              backgroundColor: "#00FF00",
            },
          ],
        },
      ],
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(true);
    const model = tiptapToModel(
      editor.getJSON() as TiptapJsonNode,
      0,
      sequentialIds("model"),
    );
    if (!model.ok) throw new Error(model.error.code);
    const [, paragraph, heading, table, item] = model.value.blocks;
    expect(paragraph).toMatchObject({
      type: "paragraph",
      textColor: "#0000FF",
    });
    expect(paragraph).not.toHaveProperty("backgroundColor");
    expect(heading).toMatchObject({
      type: "heading",
      backgroundColor: "#FFFF00",
    });
    expect(heading).not.toHaveProperty("textColor");
    expect(table?.type).toBe("table");
    expect(item).toMatchObject({
      type: "bulletListItem",
      textColor: "#FF0000",
      children: [{ type: "paragraph", backgroundColor: "#00FF00" }],
    });
  });

  it("표 안 캐럿에서 앞뒤 문단·heading의 블록 색은 셀에 합친 텍스트의 색 마크가 된다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");

    const result = pasteClipboardContent(
      editor,
      [
        {
          type: "paragraph",
          content: [{ text: "intro" }],
          textColor: "#0000FF",
        },
        tableBlock("x"),
        {
          type: "heading",
          level: 1,
          content: [{ text: "outro" }],
          backgroundColor: "#FFFF00",
        },
      ],
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(true);
    // 구분자 LF와 표 셀 텍스트는 마크가 없다. 블록 색은 그 블록의 run에만 얹힌다.
    expect(firstCellContent(editor)).toEqual([
      { text: "intro", marks: [{ type: "textColor", color: "#0000FF" }] },
      { text: "\nx\n" },
      { text: "outro", marks: [{ type: "backgroundColor", color: "#FFFF00" }] },
    ]);
  });

  // #332 규칙: 중첩 색은 안쪽 우선이다. 블록 색은 run 마크의 바깥이다.
  it("안쪽에 같은 종류 색 마크가 있는 run은 안쪽 값이 남고 마크 순서는 canonical이다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");

    const result = pasteClipboardContent(
      editor,
      [
        {
          type: "paragraph",
          content: [
            {
              text: "a",
              marks: [
                { type: "bold" },
                { type: "textColor", color: "#FF0000" },
              ],
            },
            { text: "b" },
          ],
          textColor: "#0000FF",
          backgroundColor: "#FFFF00",
        },
        tableBlock("x"),
      ],
      sequentialIds("paste"),
    );

    expect(result.ok).toBe(true);
    expect(firstCellContent(editor)).toEqual([
      {
        text: "a",
        marks: [
          { type: "bold" },
          { type: "textColor", color: "#FF0000" },
          { type: "backgroundColor", color: "#FFFF00" },
        ],
      },
      {
        text: "b",
        marks: [
          { type: "textColor", color: "#0000FF" },
          { type: "backgroundColor", color: "#FFFF00" },
        ],
      },
      { text: "\nx" },
    ]);
  });

  it.each<[string, ClipboardContentBlock]>([
    [
      "문단 textColor가 색 이름이면",
      { type: "paragraph", content: [{ text: "p" }], textColor: "blue" },
    ],
    [
      "heading backgroundColor가 3자리 hex면",
      {
        type: "heading",
        level: 2,
        content: [{ text: "h" }],
        backgroundColor: "#00f",
      },
    ],
    [
      "목록 항목 중첩 child 문단 textColor가 소문자 hex면",
      {
        type: "bulletListItem",
        content: [{ text: "item" }],
        children: [
          {
            type: "paragraph",
            content: [{ text: "child" }],
            textColor: "#0000ff",
          },
        ],
      },
    ],
  ])(
    "표 밖에서 %s CLIPBOARD_CONTENT_INVALID로 거절하고 문서를 바꾸지 않는다",
    (_label, block) => {
      const editor = createTableFixtureEditor(docWithParagraph);
      editor.commands.setTextSelection(1);
      const before = editor.getJSON() as TiptapJsonNode;
      const selectionBefore = editor.state.selection.toJSON();

      const result = pasteClipboardContent(
        editor,
        [block, tableBlock("A")],
        sequentialIds("paste"),
      );

      expect(result).toEqual({
        ok: false,
        error: {
          code: "CLIPBOARD_CONTENT_INVALID",
          message: expect.stringContaining("is not a canonical color"),
        },
      });
      expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
      expect(editor.state.selection.toJSON()).toEqual(selectionBefore);
    },
  );

  it("표 안 캐럿에서 문단 블록 색이 비canonical이면 CLIPBOARD_CONTENT_INVALID로 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON() as TiptapJsonNode;
    const selectionBefore = editor.state.selection.toJSON();

    const result = pasteClipboardContent(
      editor,
      [
        { type: "paragraph", content: [{ text: "p" }], textColor: "blue" },
        tableBlock("x"),
      ],
      sequentialIds("paste"),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CLIPBOARD_CONTENT_INVALID",
        message: "Paragraph textColor is not a canonical color",
      },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
    expect(editor.state.selection.toJSON()).toEqual(selectionBefore);
  });
});
