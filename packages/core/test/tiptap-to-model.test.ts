/**
 * tiptap JSON(editor.getJSON() 형태)을 독자 문서 모델로 디코드하는
 * tiptapToModel의 계약을 확인한다. 이 경로는 라이브 에디터의 매 커맨드
 * 디스패치 뒤(readEditorDocument)를 타는데도 지금까지 직접 단위 테스트가
 * 없었다 — 카드 W 그릴링에서 발견해 추가했다.
 *
 * modelToTiptap 왕복 계약은 model-tiptap-round-trip.test.ts, PM 스키마의
 * 표-부모 구조 강제와 붙여넣기 평탄화는 block-container-schema.test.ts,
 * blockId 발급 재귀는 block-id-extension.test.ts, 네이티브 split/join
 * 유효성(D22)은 block-split-collapsed.test.ts로 책임별 분리했다.
 */
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import { sequentialIds, unusedIdFactory } from "./editor-controller-support.js";

describe("tiptap JSON을 독자 문서 모델로 디코드한다", () => {
  it("문단·헤딩·표를 한 문서 안에서 함께 디코드한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "para-1" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "hello" }],
            },
          ],
        },
        {
          type: "blockContainer",
          attrs: { blockId: "heading-1" },
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "title" }],
            },
          ],
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
      content: [
        {
          type: "blockContainer",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "x" }] },
          ],
        },
      ],
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
          type: "blockContainer",
          attrs: { blockId: "para-1" },
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "x", marks: [{ type: "highlight" }] },
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
          type: "blockContainer",
          attrs: { blockId: "para-1" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "x", marks: [{ type: "link" }] }],
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
        message: "Link mark requires an href",
      },
    });
  });
});

describe("손상된 blockContainer content 방어(트랙-4 즉시 리뷰 발견)", () => {
  it("blockContent/blockGroup 뒤에 여벌 노드가 있으면 무음 소실 대신 거절한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "p1" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "hi" }] },
            {
              type: "blockGroup",
              content: [
                {
                  type: "blockContainer",
                  attrs: { blockId: "c1" },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "child" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "stray" }],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 1, unusedIdFactory);

    expect(result.ok).toBe(false);
  });

  it("두 번째 자식이 blockGroup이 아니면 자식으로 무음 흡수하지 않고 거절한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "p1" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "hi" }] },
            {
              type: "paragraph",
              content: [{ type: "text", text: "not-a-group" }],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 1, unusedIdFactory);

    expect(result.ok).toBe(false);
  });
});

// hardBreak(RD-001) — inlineContentFromTiptap 단독 디코드 계약.
// modelToTiptap 왕복 계약은 model-tiptap-round-trip.test.ts가 소유한다.
describe("hardBreak 노드를 디코드한다(RD-001)", () => {
  it("text-hardBreak-text를 직전 항목과 병합해 하나의 텍스트 런으로 되돌린다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "p1" },
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "line1" },
                { type: "hardBreak" },
                { type: "text", text: "line2" },
              ],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 1, unusedIdFactory);

    expect(result).toEqual({
      ok: true,
      value: {
        formatVersion: 1,
        revision: 1,
        blocks: [
          {
            id: "p1",
            type: "paragraph",
            content: [{ text: "line1\nline2" }],
          },
        ],
      },
    });
  });

  it("마크가 다른 text와는 병합하지 않고 hardBreak 자체의 마크를 보존한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "p1" },
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "plain" },
                {
                  type: "hardBreak",
                  marks: [{ type: "bold" }],
                },
                { type: "text", text: "also plain" },
              ],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 1, unusedIdFactory);

    expect(result).toEqual({
      ok: true,
      value: {
        formatVersion: 1,
        revision: 1,
        blocks: [
          {
            id: "p1",
            type: "paragraph",
            content: [
              { text: "plain" },
              { text: "\n", marks: [{ type: "bold" }] },
              { text: "also plain" },
            ],
          },
        ],
      },
    });
  });
});
