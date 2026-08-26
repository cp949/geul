/**
 * tiptap JSON(editor.getJSON() 형태)을 독자 문서 모델로 디코드하는
 * tiptapToModel의 계약을 확인한다. 이 경로는 라이브 에디터의 매 커맨드
 * 디스패치 뒤(readEditorDocument)를 타는데도 지금까지 직접 단위 테스트가
 * 없었다 — 카드 W 그릴링에서 발견해 추가한다.
 */
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import { describe, expect, it } from "vitest";
import { sequentialIds } from "./editor-controller-support.js";

describe("tiptap JSON을 독자 문서 모델로 디코드한다", () => {
  it("문단·헤딩·표를 한 문서 안에서 함께 디코드한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "para-1" },
          content: [{ type: "text", text: "hello" }],
        },
        {
          type: "heading",
          attrs: { blockId: "heading-1", level: 2 },
          content: [{ type: "text", text: "title" }],
        },
        {
          type: "table",
          attrs: {
            blockId: "table-1",
            columns: [{ id: "col-1", width: 160 }],
            headerRows: 0,
            headerColumns: 0,
          },
          content: [
            {
              type: "tableRow",
              attrs: { rowId: "row-1" },
              content: [
                {
                  type: "tableCell",
                  attrs: { cellId: "cell-1", columnId: "col-1" },
                  content: [{ type: "text", text: "cell" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result).toEqual({
      ok: true,
      value: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "para-1", type: "paragraph", content: [{ text: "hello" }] },
          {
            id: "heading-1",
            type: "heading",
            level: 2,
            content: [{ text: "title" }],
          },
          {
            id: "table-1",
            type: "table",
            columns: [{ id: "col-1", width: 160 }],
            rows: [
              {
                id: "row-1",
                cells: [
                  {
                    id: "cell-1",
                    columnId: "col-1",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "cell" }],
                  },
                ],
              },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
        ],
      },
    });
  });

  it("blockId가 없는 블록에는 createId로 새 id를 발급한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
    };

    const result = tiptapToModel(json, 0, sequentialIds("gen"));

    expect(result).toEqual({
      ok: true,
      value: {
        formatVersion: 1,
        revision: 0,
        blocks: [{ id: "gen-1", type: "paragraph", content: [{ text: "x" }] }],
      },
    });
  });

  it("표 셀 attrs가 없는 필드(rowspan/colspan 등)는 기본값으로 채운다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { blockId: "table-1", columns: [{ id: "col-1", width: 160 }] },
          content: [
            {
              type: "tableRow",
              attrs: { rowId: "row-1" },
              content: [
                {
                  type: "tableCell",
                  attrs: { cellId: "cell-1", columnId: "col-1" },
                  content: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result).toEqual({
      ok: true,
      value: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "table-1",
            type: "table",
            columns: [{ id: "col-1", width: 160 }],
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
                ],
              },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
        ],
      },
    });
  });

  it("cellId가 없으면 빈 문자열로 접었다가 문서 검증에서 깨끗하게 거절한다(크래시 아님)", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { blockId: "table-1", columns: [{ id: "col-1", width: 160 }] },
          content: [
            {
              type: "tableRow",
              attrs: { rowId: "row-1" },
              content: [
                {
                  type: "tableCell",
                  attrs: { columnId: "col-1" },
                  content: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("DOCUMENT_INVALID");
  });

  it("문단에서 인식하지 못하는 mark를 만나면 조용히 버리지 않고 거절한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "para-1" },
          content: [
            { type: "text", text: "x", marks: [{ type: "highlight" }] },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        message: "Unsupported mark: highlight",
      },
    });
  });

  it("표 셀 안에서 인식하지 못하는 mark를 만나도 같은 정책으로 거절한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { blockId: "table-1", columns: [{ id: "col-1", width: 160 }] },
          content: [
            {
              type: "tableRow",
              attrs: { rowId: "row-1" },
              content: [
                {
                  type: "tableCell",
                  attrs: { cellId: "cell-1", columnId: "col-1" },
                  content: [
                    { type: "text", text: "x", marks: [{ type: "highlight" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        message: "Unsupported mark: highlight",
      },
    });
  });

  it("link mark인데 href가 없으면 거절한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "para-1" },
          content: [{ type: "text", text: "x", marks: [{ type: "link" }] }],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        message: "Link mark requires an href",
      },
    });
  });
});
