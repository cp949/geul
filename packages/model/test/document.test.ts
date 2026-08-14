import { describe, expect, it } from "vitest";
import {
  canonicalizeTextMarks,
  createEmptyDocument,
  isCanonicalTextMarks,
  isSupportedLinkHref,
  parseDocument,
} from "../src/index.js";

const documentWithLink = (href: string) => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "paragraph-link",
      type: "paragraph",
      content: [{ text: "link", marks: [{ type: "link", href }] }],
    },
  ],
});

const documentWithText = (text: string) => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "paragraph-text",
      type: "paragraph",
      content: [{ text }],
    },
  ],
});

describe("independent document", () => {
  it("creates a stable versioned paragraph document", () => {
    const document = createEmptyDocument(() => "block-1");

    expect(document).toEqual({
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "block-1", type: "paragraph", content: [] }],
    });
  });

  it("rejects duplicated ids without throwing", () => {
    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "same", type: "paragraph", content: [] },
        { id: "same", type: "heading", level: 2, content: [] },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 1, "id"],
        message: "Duplicate id: same",
      },
    });
  });

  it("rejects unknown format versions", () => {
    expect(
      parseDocument({ formatVersion: 2, revision: 0, blocks: [] }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_FORMAT_UNSUPPORTED" },
    });
  });

  it("returns a structural copy of a valid document", () => {
    const input = {
      formatVersion: 1,
      revision: 3,
      blocks: [
        { id: "paragraph-1", type: "paragraph", content: [{ text: "Hello" }] },
      ],
    };
    const result = parseDocument(input);

    expect(result).toEqual({ ok: true, value: input });
    if (result.ok) {
      expect(result.value).not.toBe(input);
      expect(result.value.blocks).not.toBe(input.blocks);
    }
  });

  it("defines one canonical stored-mark order for every package", () => {
    expect(
      canonicalizeTextMarks([
        { type: "underline" },
        { type: "italic" },
        { type: "code" },
        { type: "link", href: "https://example.com" },
        { type: "strike" },
        { type: "bold" },
      ]),
    ).toEqual([
      { type: "link", href: "https://example.com" },
      { type: "bold" },
      { type: "code" },
      { type: "italic" },
      { type: "strike" },
      { type: "underline" },
    ]);
  });

  it("deduplicates equal marks into an idempotent canonical array", () => {
    const once = canonicalizeTextMarks([
      { type: "underline" },
      { type: "bold" },
      { type: "bold" },
      { type: "link", href: "https://example.com" },
      { type: "link", href: "https://example.com" },
      { type: "underline" },
    ]);

    expect(once).toEqual([
      { type: "link", href: "https://example.com" },
      { type: "bold" },
      { type: "underline" },
    ]);
    expect(isCanonicalTextMarks(once)).toBe(true);
    expect(canonicalizeTextMarks(once)).toEqual(once);
  });

  it("preserves conflicting links for structured document validation", () => {
    const marks = canonicalizeTextMarks([
      { type: "link", href: "https://first.example" },
      { type: "link", href: "https://second.example" },
    ]);

    expect(marks).toHaveLength(2);
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "conflicting-links",
            type: "paragraph",
            content: [{ text: "links", marks }],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 1],
      },
    });
  });

  it("accepts only canonical stored-mark arrays", () => {
    const canonical = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "canonical-marks",
          type: "paragraph",
          content: [
            {
              text: "marked",
              marks: [
                { type: "link", href: "https://example.com" },
                { type: "bold" },
                { type: "code" },
                { type: "italic" },
                { type: "strike" },
                { type: "underline" },
              ],
            },
          ],
        },
      ],
    };

    expect(parseDocument(canonical)).toMatchObject({ ok: true });
    expect(
      parseDocument({
        ...canonical,
        blocks: [
          {
            ...canonical.blocks[0],
            content: [
              {
                text: "marked",
                marks: [
                  { type: "link", href: "https://example.com" },
                  { type: "bold" },
                  { type: "italic" },
                  { type: "underline" },
                  { type: "strike" },
                  { type: "code" },
                ],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 2],
      },
    });
  });

  it("allows LF text but requires callers to normalize CRLF before storage", () => {
    expect(parseDocument(documentWithText("line 1\nline 2"))).toMatchObject({
      ok: true,
    });
    expect(parseDocument(documentWithText("line 1\r\nline 2"))).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "text"],
      },
    });
  });

  it.each([
    ["NUL", "text\u0000value"],
    ["tab", "text\tvalue"],
    ["DEL", "text\u007fvalue"],
    ["lone surrogate", `text${String.fromCharCode(0xd800)}value`],
  ])("rejects %s in inline text", (_name, text) => {
    expect(parseDocument(documentWithText(text))).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "text"],
      },
    });
  });

  it.each([
    ["LF", "block\nid"],
    ["CR", "block\rid"],
    ["NUL", "block\u0000id"],
    ["DEL", "block\u007fid"],
    ["lone surrogate", `block${String.fromCharCode(0xdfff)}id`],
  ])("rejects %s in stable IDs", (_name, id) => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [{ id, type: "paragraph", content: [] }],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "id"] },
    });
  });

  it("rejects non-safe or negative revisions", () => {
    expect(
      parseDocument({ formatVersion: 1, revision: -1, blocks: [] }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["revision"] },
    });
    expect(
      parseDocument({
        formatVersion: 1,
        revision: Number.MAX_SAFE_INTEGER + 1,
        blocks: [],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["revision"] },
    });
  });

  it("rejects duplicate ids across table entities", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "table-1",
            type: "table",
            columns: [{ id: "shared", width: 48 }],
            rows: [
              {
                id: "row-1",
                cells: [
                  {
                    id: "shared",
                    columnId: "shared",
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
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "rows", 0, "cells", 0, "id"],
      },
    });
  });

  it("allows supported link protocols and rejects unsupported ones", () => {
    for (const href of [
      "https://example.com",
      "http://example.com",
      "mailto:a@example.com",
      "tel:+821012345678",
      "/relative",
      "#section",
    ]) {
      expect(
        parseDocument({
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: `paragraph-${href}`,
              type: "paragraph",
              content: [{ text: "link", marks: [{ type: "link", href }] }],
            },
          ],
        }),
      ).toMatchObject({ ok: true });
    }

    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "paragraph-invalid-link",
            type: "paragraph",
            content: [
              {
                text: "link",
                marks: [{ type: "link", href: "javascript:alert(1)" }],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 0, "href"],
      },
    });
  });

  it("exports the document link policy as a reusable predicate", () => {
    expect(isSupportedLinkHref("https://example.com/encoded%20space")).toBe(
      true,
    );
    expect(isSupportedLinkHref("https://example.com/raw space")).toBe(false);
  });

  it.each([
    "https://example.com/raw space",
    "/relative\tpath",
    "java\nscript:alert(1)",
    "java\u0000script:alert(1)",
    "https://example.com/\u007fpath",
    "//example.com/protocol-relative",
    "\\evil.example",
    "/\\evil.example",
    "\\/evil.example",
  ])("rejects the raw-space, control, or protocol-relative link %s", (href) => {
    expect(parseDocument(documentWithLink(href))).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 0, "href"],
      },
    });
  });

  it.each([
    "https://example.com/encoded%20space",
    "/relative%09tab",
    "#encoded%7Fcontrol",
  ])("allows the percent-encoded link %s", (href) => {
    expect(parseDocument(documentWithLink(href))).toMatchObject({ ok: true });
  });

  it("rejects a second link mark on the same paragraph inline item", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "paragraph-duplicate-links",
            type: "paragraph",
            content: [
              {
                text: "nested links",
                marks: [
                  { type: "link", href: "https://outer.example" },
                  { type: "link", href: "https://inner.example" },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 1],
        message: "Inline item must contain at most one link mark",
      },
    });
  });

  it("rejects a second link mark in table cell inline content", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "table-duplicate-links",
            type: "table",
            columns: [{ id: "column-duplicate-links", width: 160 }],
            rows: [
              {
                id: "row-duplicate-links",
                cells: [
                  {
                    id: "cell-duplicate-links",
                    columnId: "column-duplicate-links",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [
                      {
                        text: "nested links",
                        marks: [
                          { type: "link", href: "/outer" },
                          { type: "link", href: "/inner" },
                        ],
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
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "rows", 0, "cells", 0, "content", 0, "marks", 1],
        message: "Inline item must contain at most one link mark",
      },
    });
  });

  it("keeps unsupported link URL validation ahead of link multiplicity", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "paragraph-invalid-duplicate-links",
            type: "paragraph",
            content: [
              {
                text: "nested links",
                marks: [
                  { type: "link", href: "https://safe.example" },
                  { type: "link", href: "javascript:alert(1)" },
                ],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 1, "href"],
        message: "Unsupported link URL",
      },
    });
  });

  it("rejects invalid table dimensions and colors", () => {
    const table = {
      id: "table-1",
      type: "table" as const,
      columns: [{ id: "column-1", width: 47 }],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "column-1",
              rowSpan: 0,
              columnSpan: 1,
              content: [],
              textColor: "#abcdef",
            },
          ],
        },
      ],
      headerRows: 0 as const,
      headerColumns: 0 as const,
    };

    expect(
      parseDocument({ formatVersion: 1, revision: 0, blocks: [table] }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "columns", 0, "width"],
      },
    });

    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [{ ...table, columns: [{ id: "column-1", width: 48 }] }],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "rows", 0, "cells", 0, "rowSpan"],
      },
    });

    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            ...table,
            columns: [{ id: "column-1", width: 48 }],
            rows: [
              {
                ...table.rows[0],
                cells: [{ ...table.rows[0].cells[0], rowSpan: 1 }],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "rows", 0, "cells", 0, "textColor"],
      },
    });
  });

  it("prioritizes width errors across tables before earlier color errors", () => {
    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "table-color",
          type: "table",
          columns: [{ id: "column-color", width: 48 }],
          rows: [
            {
              id: "row-color",
              cells: [
                {
                  id: "cell-color",
                  columnId: "column-color",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [],
                  textColor: "#abcdef",
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 0,
        },
        {
          id: "table-width",
          type: "table",
          columns: [{ id: "column-width", width: 47 }],
          rows: [],
          headerRows: 0,
          headerColumns: 0,
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 1, "columns", 0, "width"],
      },
    });
  });

  it("rejects tables whose logical cell count exceeds the document limit", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "large-table",
            type: "table",
            columns: Array.from({ length: 101 }, (_, index) => ({
              id: `column-${index}`,
              width: 48,
            })),
            rows: Array.from({ length: 100 }, (_, index) => ({
              id: `row-${index}`,
              cells: [],
            })),
            headerRows: 0,
            headerColumns: 0,
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_LIMIT_EXCEEDED", path: ["blocks", 0] },
    });
  });
});
