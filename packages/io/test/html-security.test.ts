/**
 * HTML import/export의 보안 경계를 확인하는 테스트.
 * 위험한 요소·속성·URL 제거와, 제거 사실이 경고로 보고되는지를 다룬다.
 */
import { readFileSync } from "node:fs";

import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

const dangerousFixture = readFileSync(
  new URL("./fixtures/dangerous.html", import.meta.url),
  "utf8",
);

describe("HTML 보안", () => {
  it("문단 앞의 주석은 무시하고 본문만 가져온다", () => {
    expect(importHtml("<!--note--><p>ok</p>")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "html-1",
              type: "paragraph",
              content: [{ text: "ok" }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("주석만 있는 HTML은 빈 문서로 가져온다", () => {
    expect(importHtml("<!--note-->")).toEqual({
      ok: true,
      value: {
        document: { formatVersion: 1, revision: 0, blocks: [] },
        warnings: [],
      },
    });
  });

  it("주석 안의 script 텍스트는 위험한 HTML로 취급하지 않는다", () => {
    const result = importHtml("<!--<script>alert(1)</script>--><p>safe</p>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "safe" }],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("실행 가능한 HTML을 제거한다", () => {
    const result = importHtml(dangerousFixture);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_ELEMENT_REMOVED",
          element: "script",
        }),
        expect.objectContaining({
          kind: "UNSAFE_ELEMENT_REMOVED",
          element: "img",
        }),
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "p",
          attribute: "onClick",
        }),
        expect.objectContaining({
          kind: "UNSAFE_URL_REMOVED",
          element: "a",
          attribute: "href",
        }),
      ]),
    );

    const exported = exportHtml(result.value.document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    expect(exported.value).not.toMatch(
      /script|onerror|onclick|javascript:|data:text\/html/i,
    );
    expect(exported.value).not.toMatch(
      /(?:\s|<)(?:style|class|id|src|on\w+|data-arbitrary|data-__proto__|__proto__|constructor|prototype)=/i,
    );
    expect(exported.value).not.toMatch(/<\/?(?:svg|style|img|iframe|object)/i);
  });

  it("지원하는 링크와 상대 경로는 남기고 위험한 링크만 제거한다", () => {
    const result = importHtml(
      '<p data-be-block-id="links"><a href="//evil.example">scheme-relative</a><a href="tel:+821012345678">phone</a><a href="/safe">relative</a></p>',
    );

    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "links",
              type: "paragraph",
              content: [
                { text: "scheme-relative" },
                {
                  text: "phone",
                  marks: [{ type: "link", href: "tel:+821012345678" }],
                },
                {
                  text: "relative",
                  marks: [{ type: "link", href: "/safe" }],
                },
              ],
            },
          ],
        },
        warnings: [
          expect.objectContaining({
            kind: "UNSAFE_URL_REMOVED",
            element: "a",
            attribute: "href",
          }),
        ],
      },
    });
  });

  it.each([
    "\\evil.example",
    "/\\evil.example",
    "\\/evil.example",
  ])("브라우저가 authority로 해석하는 변형 링크를 경고와 함께 제거한다 — %s", (href) => {
    const result = importHtml(`<p><a href="${href}">unsafe</a></p>`);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks[0]).toMatchObject({
      type: "paragraph",
      content: [{ text: "unsafe" }],
    });
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_URL_REMOVED",
        element: "a",
        attribute: "href",
      }),
    ]);
  });

  it("안전하지만 지원하지 않는 블록을 정화 후 강등하면 경고한다", () => {
    const result = importHtml("<aside>Loose <strong>text</strong></aside>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [
          { text: "Loose " },
          { text: "text", marks: [{ type: "bold" }] },
        ],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "aside",
      }),
    ]);
  });

  it("C0 제어문자·짝 없는 surrogate가 섞인 문단은 throw 없이 제거하고 경고한다", () => {
    const html = `<p>bad\u0001\u000b${String.fromCharCode(0xd800)}text</p>`;
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "badtext" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_CODE_POINT_REMOVED",
        element: "p",
      }),
    ]);
  });

  it("같은 조건을 헤딩(h1-h3)에도 적용한다", () => {
    const html = `<h2>bad\u0001text</h2>`;
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "heading",
        level: 2,
        content: [{ text: "badtext" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_CODE_POINT_REMOVED",
        element: "h2",
      }),
    ]);
  });

  it("제어문자 제거로 빈 조각이 사라지면 같은 mark를 가진 이웃 조각을 병합한다", () => {
    const html = `<p><strong>abc</strong><em>\u0001</em><strong>def</strong></p>`;
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "abcdef", marks: [{ type: "bold" }] }],
      },
    ]);
  });

  it("표 직속 비섹션 자식(caption)의 제어문자도 표 앞 문단에서 제거하고 경고한다", () => {
    const html = `<table><caption>Cap\u0001tion</caption><tbody><tr><td>a</td></tr></tbody></table>`;
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const [paragraph, table] = result.value.document.blocks;
    expect(paragraph).toMatchObject({
      type: "paragraph",
      content: [{ text: "Caption" }],
    });
    expect(table?.type).toBe("table");
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_CODE_POINT_REMOVED",
          element: "caption",
        }),
      ]),
    );
  });

  it("금지 코드포인트가 없는 입력은 UNSAFE_CODE_POINT_REMOVED 경고를 만들지 않는다", () => {
    const result = importHtml("<p>clean text</p>");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.warnings).toEqual([]);
  });

  it("공백으로 위장한 실행 가능 URL은 내보내지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "unsafe-link",
          type: "paragraph",
          content: [
            {
              text: "unsafe",
              marks: [{ type: "link", href: " javascript:alert(1)" }],
            },
          ],
        },
      ],
    };

    const result = exportHtml(document);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Unsafe URL was exported");
    expect(result.error.code).toBe("HTML_DOCUMENT_INVALID");
  });

  it("제어문자로 위장한 실행 가능 URL은 내보내지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "unsafe-control-link",
          type: "paragraph",
          content: [
            {
              text: "unsafe",
              marks: [{ type: "link", href: "java\nscript:alert(1)" }],
            },
          ],
        },
      ],
    };

    expect(exportHtml(document)).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  it("과도한 span은 열 생성으로 확장하지 않고 거부한다", () => {
    let idCalls = 0;
    const result = importHtml(
      '<table><tbody><tr><td colspan="100001">oversized</td></tr></tbody></table>',
      {
        createId: () => {
          idCalls += 1;
          return `generated-${idCalls}`;
        },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
    expect(idCalls).toBeLessThan(20);
  });

  it("추론 열 10000개는 허용하고 10001개는 모델 할당 전에 거부한다", () => {
    const atLimit = importHtml(
      `<table><tbody><tr>${"<td>x</td>".repeat(10_000)}</tr></tbody></table>`,
    );
    expect(atLimit.ok).toBe(true);
    if (!atLimit.ok) throw new Error(atLimit.error.message);
    const table = atLimit.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected table block");
    expect(table.columns).toHaveLength(10_000);
    expect(table.rows[0]?.cells).toHaveLength(10_000);

    let idCalls = 0;
    const excessive = importHtml(
      `<table><tbody><tr>${"<td>x</td>".repeat(10_001)}</tr></tbody></table>`,
      {
        createId: () => {
          idCalls += 1;
          return `generated-${idCalls}`;
        },
      },
    );
    expect(excessive).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
    expect(idCalls).toBeLessThan(20);
  });

  it("과도한 colgroup은 열 생성 전에 거부한다", () => {
    let idCalls = 0;
    const result = importHtml(
      `<table><colgroup>${"<col>".repeat(10_001)}</colgroup></table>`,
      {
        createId: () => {
          idCalls += 1;
          return `generated-${idCalls}`;
        },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
    expect(idCalls).toBeLessThan(20);
  });

  it("셀의 style 속성은 import에서 제거되고 경고로 보고된다", () => {
    const result = importHtml(
      '<table><tbody><tr><td style="color:#FF0000">a</td></tr></tbody></table>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings).toContainEqual(
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "td",
        attribute: "style",
      }),
    );
  });
});
