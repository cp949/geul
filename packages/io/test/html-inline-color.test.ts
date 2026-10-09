// 인라인 textColor/backgroundColor mark의 HTML export/import 왕복 검증
// (Issue #38 슬라이스 8, RD-004 DELTA-01). span/style 인코딩과 D1이 요구하는
// 마크당-1-span 중첩, 외부 HTML의 결합 style import, 비정규 색상 무시를 고정한다.
import type { Document, InlineContent } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

/** HTML을 가져와 첫 블록의 인라인 content를 돌려준다. 가져오기가 실패하면 예외를 던진다. */
function importedContent(html: string): InlineContent {
  const result = importHtml(html);
  if (!result.ok) throw new Error(result.error.message);
  const block = result.value.document.blocks[0];
  if (
    block === undefined ||
    !("content" in block) ||
    !Array.isArray(block.content)
  ) {
    throw new Error("첫 블록에 인라인 content가 없다");
  }
  return block.content;
}

describe("인라인 색상 mark HTML export", () => {
  it("textColor 단독 mark를 span style=color로 낸다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            { text: "red", marks: [{ type: "textColor", color: "#FF0000" }] },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<p data-geul-block-id="paragraph-1"><span style="color:#FF0000">red</span></p>',
    );
  });

  it("backgroundColor 단독 mark를 span style=background-color로 낸다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            {
              text: "highlighted",
              marks: [{ type: "backgroundColor", color: "#FFFF00" }],
            },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<p data-geul-block-id="paragraph-1"><span style="background-color:#FFFF00">highlighted</span></p>',
    );
  });

  it("D1: textColor+backgroundColor가 함께 있으면 마크당 span 하나씩 중첩한다(병합 단일 span 아님)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            {
              text: "both",
              marks: [
                { type: "textColor", color: "#112233" },
                { type: "backgroundColor", color: "#AABBCC" },
              ],
            },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<p data-geul-block-id="paragraph-1"><span style="color:#112233"><span style="background-color:#AABBCC">both</span></span></p>',
    );
  });

  it("표 셀 인라인 콘텐츠에도 같은 span 인코딩을 쓴다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "table-1",
          type: "table",
          columns: [{ id: "column-1", width: 160 }],
          rows: [
            {
              id: "row-1",
              cells: [
                {
                  id: "cell-1",
                  columnId: "column-1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [
                    {
                      text: "cell text",
                      marks: [{ type: "textColor", color: "#00FF00" }],
                    },
                  ],
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 0,
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain(
      '<span style="color:#00FF00">cell text</span>',
    );
  });
});

describe("인라인 색상 mark HTML import", () => {
  it("span style=color를 textColor mark로 읽는다", () => {
    const result = importHtml(
      '<p data-geul-block-id="paragraph-1"><span style="color:#FF0000">red</span></p>',
    );
    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "paragraph-1",
              type: "paragraph",
              content: [
                {
                  text: "red",
                  marks: [{ type: "textColor", color: "#FF0000" }],
                },
              ],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("한 span에 color·background-color가 동시에 있으면 두 mark 모두 보존한다(외부 HTML 대비)", () => {
    const result = importHtml(
      '<p data-geul-block-id="paragraph-1"><span style="color:#112233;background-color:#AABBCC">both</span></p>',
    );
    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "paragraph-1",
              type: "paragraph",
              content: [
                {
                  text: "both",
                  marks: [
                    { type: "textColor", color: "#112233" },
                    { type: "backgroundColor", color: "#AABBCC" },
                  ],
                },
              ],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("소문자 hex 색상 값은 대문자로 정규화해 mark를 만든다(parseStyleDeclarations 재사용, 표 셀 색상과 동일 동작)", () => {
    const result = importHtml(
      '<p data-geul-block-id="paragraph-1"><span style="color:#ff0000">plain</span></p>',
    );
    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "paragraph-1",
              type: "paragraph",
              content: [
                {
                  text: "plain",
                  marks: [{ type: "textColor", color: "#FF0000" }],
                },
              ],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("named color·hsl() 같은 지원 밖 값도 mark 없이 무시한다(문서 전체를 거절하지 않음)", () => {
    const result = importHtml(
      '<p data-geul-block-id="paragraph-1"><span style="color:red">named</span></p>',
    );
    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "paragraph-1",
              type: "paragraph",
              content: [{ text: "named" }],
            },
          ],
        },
        warnings: [],
      },
    });
  });
});

describe("인라인 색상 mark HTML 왕복", () => {
  it("textColor 단독 mark가 export→import 왕복에서 동일 문서로 복원된다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            { text: "red", marks: [{ type: "textColor", color: "#FF0000" }] },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("backgroundColor 단독 mark가 export→import 왕복에서 동일 문서로 복원된다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            {
              text: "highlighted",
              marks: [{ type: "backgroundColor", color: "#FFFF00" }],
            },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("textColor+backgroundColor 동시 지정이 중첩 span으로 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            {
              text: "both",
              marks: [
                { type: "textColor", color: "#112233" },
                { type: "backgroundColor", color: "#AABBCC" },
              ],
            },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("인라인 색상 mark와 기존 6종 mark가 함께 있어도 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            {
              text: "styled",
              marks: [
                { type: "bold" },
                { type: "textColor", color: "#00FF00" },
              ],
            },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });
});

// Issue #331: 색이 다른 인접 span을 첫 색으로 합치지 않는다.
describe("인접 span 색 mark 병합 (Issue #331)", () => {
  it("textColor가 다른 인접 span은 각자 색을 가진 두 조각으로 읽는다", () => {
    expect(
      importedContent(
        '<p><span style="color:#ff0000">a</span><span style="color:#0000ff">b</span></p>',
      ),
    ).toEqual([
      { text: "a", marks: [{ type: "textColor", color: "#FF0000" }] },
      { text: "b", marks: [{ type: "textColor", color: "#0000FF" }] },
    ]);
  });

  it("구문 강조처럼 색이 모두 다른 인접 span 셋은 조각 셋으로 읽는다", () => {
    expect(
      importedContent(
        '<p><span style="color:#569cd6">const</span><span style="color:#d4d4d4"> x = </span><span style="color:#b5cea8">1</span></p>',
      ),
    ).toEqual([
      { text: "const", marks: [{ type: "textColor", color: "#569CD6" }] },
      { text: " x = ", marks: [{ type: "textColor", color: "#D4D4D4" }] },
      { text: "1", marks: [{ type: "textColor", color: "#B5CEA8" }] },
    ]);
  });

  it("backgroundColor가 다른 인접 span은 두 조각으로 읽는다", () => {
    expect(
      importedContent(
        '<p><span style="background-color:#ff0000">a</span><span style="background-color:#0000ff">b</span></p>',
      ),
    ).toEqual([
      { text: "a", marks: [{ type: "backgroundColor", color: "#FF0000" }] },
      { text: "b", marks: [{ type: "backgroundColor", color: "#0000FF" }] },
    ]);
  });

  it("span 사이에 마크 없는 텍스트가 있으면 조각 셋으로 읽는다", () => {
    expect(
      importedContent(
        '<p><span style="color:#ff0000">a</span>x<span style="color:#0000ff">b</span></p>',
      ),
    ).toEqual([
      { text: "a", marks: [{ type: "textColor", color: "#FF0000" }] },
      { text: "x" },
      { text: "b", marks: [{ type: "textColor", color: "#0000FF" }] },
    ]);
  });

  it("같은 textColor의 인접 span은 한 조각으로 합친다", () => {
    expect(
      importedContent(
        '<p><span style="color:#ff0000">a</span><span style="color:#ff0000">b</span></p>',
      ),
    ).toEqual([
      { text: "ab", marks: [{ type: "textColor", color: "#FF0000" }] },
    ]);
  });

  it("대소문자만 다른 같은 hex 색의 인접 span은 한 조각으로 합친다", () => {
    expect(
      importedContent(
        '<p><span style="color:#ff0000">a</span><span style="color:#FF0000">b</span></p>',
      ),
    ).toEqual([
      { text: "ab", marks: [{ type: "textColor", color: "#FF0000" }] },
    ]);
  });

  it("같은 backgroundColor의 인접 span은 한 조각으로 합친다", () => {
    expect(
      importedContent(
        '<p><span style="background-color:#ff0000">a</span><span style="background-color:#ff0000">b</span></p>',
      ),
    ).toEqual([
      { text: "ab", marks: [{ type: "backgroundColor", color: "#FF0000" }] },
    ]);
  });

  it("색 이름은 읽지 않으므로 인접 span이 마크 없는 한 조각이 된다", () => {
    expect(
      importedContent(
        '<p><span style="color:red">a</span><span style="color:blue">b</span></p>',
      ),
    ).toEqual([{ text: "ab" }]);
  });
});
