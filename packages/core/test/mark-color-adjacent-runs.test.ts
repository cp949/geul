/**
 * 색(textColor·backgroundColor)이 다른 인접 텍스트 런이 core 경계를 지나도
 * 합쳐지거나 거절되지 않는지 확인한다(Issue #331). model→PM 인코드의 인접 동일
 * 마크 거절, PM JSON→model과 라이브 PM 표 셀→model의 pushRun 병합,
 * io 가져오기 결과의 core 수용을 함께 다룬다. 같은 색 인접 런은 계속
 * 거절·병합되는지도 고정한다.
 */
import type { Document, InlineContent, TableBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../../io/src/index.js";
import { createEditor } from "../src/index.js";
import {
  modelToTiptap,
  tableBlockToTiptapJson,
} from "../src/model-to-tiptap.js";
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import {
  tableBlockToTiptapNode,
  tiptapNodeToTableBlock,
} from "../src/table-model-codec.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import { sequentialIds } from "./editor-controller-support.js";
import { emptyDocSchema } from "./table-test-support.js";

const red = { type: "textColor", color: "#FF0000" } as const;
const blue = { type: "textColor", color: "#0000FF" } as const;
const redBackground = { type: "backgroundColor", color: "#FF0000" } as const;
const blueBackground = { type: "backgroundColor", color: "#0000FF" } as const;

/** 문단 하나짜리 문서를 만든다. */
function paragraphDocument(content: InlineContent): Document {
  return {
    formatVersion: 1,
    revision: 4,
    blocks: [{ id: "paragraph-1", type: "paragraph", content }],
  };
}

/** 셀 하나짜리 표 블록을 만든다. */
function tableWithCell(content: InlineContent): TableBlock {
  return {
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
            content,
          },
        ],
      },
    ],
    headerRows: 0,
    headerColumns: 0,
  };
}

/** modelToTiptap이 성공해야 하는 문서를 PM JSON으로 바꾼다. */
function encoded(document: Document): TiptapJsonNode {
  const result = modelToTiptap(document);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const colorCases: Array<{ name: string; content: InlineContent }> = [
  {
    name: "textColor 값",
    content: [
      { text: "a", marks: [red] },
      { text: "b", marks: [blue] },
    ],
  },
  {
    name: "backgroundColor 값",
    content: [
      { text: "a", marks: [redBackground] },
      { text: "b", marks: [blueBackground] },
    ],
  },
  {
    name: "굵게+textColor 조합의 textColor 값",
    content: [
      { text: "a", marks: [{ type: "bold" }, red] },
      { text: "b", marks: [{ type: "bold" }, blue] },
    ],
  },
];

describe("색이 다른 인접 런의 model→PM 인코드", () => {
  for (const { name, content } of colorCases) {
    it(`${name}이 다른 인접 런 문단을 거절하지 않는다`, () => {
      expect(modelToTiptap(paragraphDocument(content)).ok).toBe(true);
    });
  }

  it("표 셀 안의 색이 다른 인접 런도 거절하지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        tableWithCell([
          { text: "a", marks: [red] },
          { text: "b", marks: [blue] },
        ]),
      ],
    };
    expect(modelToTiptap(document).ok).toBe(true);
  });

  it("색이 같은 인접 런은 계속 거절한다", () => {
    const result = modelToTiptap(
      paragraphDocument([
        { text: "a", marks: [red] },
        { text: "b", marks: [red] },
      ]),
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        message:
          "Block paragraph-1 contains adjacent inline runs with identical marks",
      },
    });
  });

  it("textColor만 같고 backgroundColor가 다른 인접 런은 거절하지 않는다", () => {
    const result = modelToTiptap(
      paragraphDocument([
        { text: "a", marks: [red, redBackground] },
        { text: "b", marks: [red, blueBackground] },
      ]),
    );
    expect(result.ok).toBe(true);
  });
});

describe("색이 다른 인접 런의 PM JSON 왕복", () => {
  for (const { name, content } of colorCases) {
    it(`${name}이 다른 조각이 model→PM→model 왕복에서 유지된다`, () => {
      const document = paragraphDocument(content);
      expect(
        tiptapToModel(encoded(document), 4, sequentialIds("generated")),
      ).toEqual({ ok: true, value: document });
    });
  }

  it("hardBreak를 품은 런 뒤의 다른 색 런이 합쳐지지 않는다", () => {
    const document = paragraphDocument([
      { text: "a\nb", marks: [red] },
      { text: "c", marks: [blue] },
    ]);
    expect(
      tiptapToModel(encoded(document), 4, sequentialIds("generated")),
    ).toEqual({ ok: true, value: document });
  });

  it("hardBreak를 사이에 둔 같은 색 런은 계속 하나로 합친다", () => {
    const document = paragraphDocument([{ text: "a\nb", marks: [red] }]);
    expect(
      tiptapToModel(encoded(document), 4, sequentialIds("generated")),
    ).toEqual({ ok: true, value: document });
  });

  it("hardBreak 앞뒤 텍스트의 색이 다르면 hardBreak를 앞쪽 런에 두고 조각을 나눈다", () => {
    const pm: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "paragraph-1" },
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "a",
                  marks: [{ type: "textColor", attrs: { color: "#FF0000" } }],
                },
                {
                  type: "hardBreak",
                  marks: [{ type: "textColor", attrs: { color: "#FF0000" } }],
                },
                {
                  type: "text",
                  text: "b",
                  marks: [{ type: "textColor", attrs: { color: "#0000FF" } }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(tiptapToModel(pm, 4, sequentialIds("generated"))).toEqual({
      ok: true,
      value: paragraphDocument([
        { text: "a\n", marks: [red] },
        { text: "b", marks: [blue] },
      ]),
    });
  });
});

describe("색이 다른 인접 text 노드의 PM JSON 디코드", () => {
  it("modelToTiptap을 거치지 않은 PM JSON도 색이 다른 text 노드를 합치지 않는다", () => {
    const pm: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "paragraph-1" },
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "a",
                  marks: [{ type: "textColor", attrs: { color: "#FF0000" } }],
                },
                {
                  type: "text",
                  text: "b",
                  marks: [{ type: "textColor", attrs: { color: "#0000FF" } }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(tiptapToModel(pm, 4, sequentialIds("generated"))).toEqual({
      ok: true,
      value: paragraphDocument([
        { text: "a", marks: [red] },
        { text: "b", marks: [blue] },
      ]),
    });
  });
});

describe("색이 다른 인접 런의 표 셀 경로", () => {
  it("표 셀 JSON 경로에서 색이 다른 조각이 유지된다", () => {
    const table = tableWithCell([
      { text: "a\nb", marks: [red] },
      { text: "c", marks: [blue] },
    ]);
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [table],
    };
    expect(
      tiptapToModel(
        { type: "doc", content: [tableBlockToTiptapJson(table)] },
        0,
        sequentialIds("generated"),
      ),
    ).toEqual({ ok: true, value: document });
  });

  it("라이브 PM 표 셀 경로에서 색이 다른 조각이 유지된다", () => {
    const table = tableWithCell([
      { text: "a\nb", marks: [red] },
      { text: "c", marks: [blue] },
    ]);
    const node = tableBlockToTiptapNode(emptyDocSchema(), table);
    expect(tiptapNodeToTableBlock(node)).toEqual({ ok: true, value: table });
  });

  it("라이브 PM 표 셀 경로에서 backgroundColor가 다른 조각이 유지된다", () => {
    const table = tableWithCell([
      { text: "a", marks: [redBackground] },
      { text: "b", marks: [blueBackground] },
    ]);
    const node = tableBlockToTiptapNode(emptyDocSchema(), table);
    expect(tiptapNodeToTableBlock(node)).toEqual({ ok: true, value: table });
  });

  it("라이브 PM 표 셀 경로에서 hardBreak 뒤의 같은 색 조각은 계속 합친다", () => {
    const table = tableWithCell([{ text: "a\nb", marks: [red] }]);
    const node = tableBlockToTiptapNode(emptyDocSchema(), table);
    expect(tiptapNodeToTableBlock(node)).toEqual({ ok: true, value: table });
  });
});

describe("io 가져오기 결과의 core 수용", () => {
  it("색이 다른 인접 span을 가져온 문서를 보정 없이 편집기가 받아들인다", () => {
    const imported = importHtml(
      '<p data-geul-block-id="colored"><span style="color:#ff0000">a</span><span style="color:#0000ff">b</span></p>',
    );
    if (!imported.ok) throw new Error(imported.error.message);

    const editor = createEditor({ initialDocument: imported.value.document });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      id: "colored",
      content: [
        { text: "a", marks: [red] },
        { text: "b", marks: [blue] },
      ],
    });
  });
});
