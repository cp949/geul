import { readFileSync } from "node:fs";

import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

const dangerousFixture = readFileSync(
  new URL("./fixtures/dangerous.html", import.meta.url),
  "utf8",
);

describe("HTML security", () => {
  it("ignores a comment before semantic paragraph content", () => {
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

  it("returns an empty document for comment-only HTML", () => {
    expect(importHtml("<!--note-->")).toEqual({
      ok: true,
      value: {
        document: { formatVersion: 1, revision: 0, blocks: [] },
        warnings: [],
      },
    });
  });

  it("does not treat script text inside a comment as unsafe HTML", () => {
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

  it("removes executable HTML", () => {
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

  it("drops unsafe links while preserving supported and relative links", () => {
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
  ])("drops the browser authority variant %s with a warning", (href) => {
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

  it("warns when a safe unsupported block is downgraded after sanitization", () => {
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

  it("does not export a whitespace-obfuscated executable URL", () => {
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

  it("does not export an executable URL obfuscated with control characters", () => {
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

  it("rejects oversized spans without expanding them into generated columns", () => {
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

  it("accepts 10000 inferred columns and rejects 10001 before model allocation", () => {
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

  it("rejects an excessive explicit colgroup before generating columns", () => {
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
});
