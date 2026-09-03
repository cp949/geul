// TextBlockProps(textColor/backgroundColor/textAlignment)의 HTML
// export/import 왕복 검증(Issue #38 슬라이스 8, RD-004 DELTA-02).
// paragraph/heading/quote/목록 4종(bulletListItem/numberedListItem/
// checkListItem/toggleListItem) 7개 블록 타입이 data-be-text-color/
// data-be-background-color/data-be-text-alignment로 왕복하는지 고정한다.
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

describe("블록 props HTML export", () => {
  it("paragraph의 textColor/backgroundColor/textAlignment를 data-be-*로 낸다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [{ text: "styled" }],
          textColor: "#FF0000",
          backgroundColor: "#FFFF00",
          textAlignment: "center",
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<p data-be-block-id="paragraph-1" data-be-text-color="#FF0000" data-be-background-color="#FFFF00" data-be-text-alignment="center">styled</p>',
    );
  });

  it("quote의 props를 blockquote 요소에 낸다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "quote-1",
          type: "quote",
          content: [{ text: "quoted" }],
          textColor: "#112233",
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<blockquote data-be-block-id="quote-1" data-be-text-color="#112233"><p>quoted</p></blockquote>',
    );
  });

  it("bulletListItem의 props를 li 요소에 낸다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "item-1",
          type: "bulletListItem",
          content: [{ text: "item" }],
          backgroundColor: "#AABBCC",
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<ul><li data-be-block-id="item-1" data-be-background-color="#AABBCC">item</li></ul>',
    );
  });

  it("toggleListItem의 props를 summary 요소에 낸다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "toggle-1",
          type: "toggleListItem",
          content: [{ text: "toggle" }],
          textAlignment: "right",
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<details data-be-block-id="toggle-1" data-be-toggleable="true" open><summary data-be-block-id="toggle-1" data-be-text-alignment="right">toggle</summary></details>',
    );
  });
});

describe("블록 props HTML import", () => {
  it("paragraph의 data-be-*를 textColor/backgroundColor/textAlignment로 읽는다", () => {
    const result = importHtml(
      '<p data-be-block-id="paragraph-1" data-be-text-color="#FF0000" data-be-background-color="#FFFF00" data-be-text-alignment="center">styled</p>',
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
              content: [{ text: "styled" }],
              textColor: "#FF0000",
              backgroundColor: "#FFFF00",
              textAlignment: "center",
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("허용 목록 밖 data-be-text-alignment 값은 import 전체를 HTML_DOCUMENT_INVALID로 거절한다", () => {
    const result = importHtml(
      '<p data-be-block-id="paragraph-1" data-be-text-alignment="justify">x</p>',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("HTML_DOCUMENT_INVALID");
  });
});

describe("블록 props HTML 왕복", () => {
  it("heading의 세 props가 모두 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "heading-1",
          type: "heading",
          level: 2,
          content: [{ text: "title" }],
          textColor: "#00FF00",
          backgroundColor: "#123456",
          textAlignment: "left",
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

  it("quote의 props가 children과 함께 있어도 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "quote-1",
          type: "quote",
          content: [{ text: "quoted" }],
          textColor: "#112233",
          children: [
            { id: "child-1", type: "paragraph", content: [{ text: "child" }] },
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

  it("numberedListItem/checkListItem의 props가 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "numbered-1",
          type: "numberedListItem",
          content: [{ text: "one" }],
          textAlignment: "center",
        },
        {
          id: "check-1",
          type: "checkListItem",
          content: [{ text: "todo" }],
          checked: true,
          backgroundColor: "#AABBCC",
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

  it("toggleListItem의 props가 collapsed·children과 함께 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "toggle-1",
          type: "toggleListItem",
          content: [{ text: "toggle" }],
          collapsed: true,
          textColor: "#FF00FF",
          children: [
            { id: "child-1", type: "paragraph", content: [{ text: "child" }] },
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

  it("isToggleable heading의 props가 <details> 래핑 경로를 통해 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "heading-1",
          type: "heading",
          level: 3,
          content: [{ text: "title" }],
          isToggleable: true,
          collapsed: false,
          textColor: "#00FF00",
          textAlignment: "right",
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

  it("props 중 하나만 있어도 그것만 왕복한다(전부-아니면-전무 아님)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [{ text: "only color" }],
          textColor: "#ABCDEF",
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).not.toContain("data-be-background-color");
    expect(exported.value).not.toContain("data-be-text-alignment");
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("DELTA-01 인라인 색상 mark와 블록 props가 한 문서에 공존해도 서로 간섭하지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            {
              text: "inline",
              marks: [{ type: "textColor", color: "#FF0000" }],
            },
          ],
          backgroundColor: "#FFFF00",
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

  it("bulletListItem의 props가 children과 함께 있어도 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "item-1",
          type: "bulletListItem",
          content: [{ text: "parent" }],
          textColor: "#010203",
          children: [
            {
              id: "child-1",
              type: "bulletListItem",
              content: [{ text: "child" }],
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
