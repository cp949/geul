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

describe("독립 문서 모델", () => {
  it("빈 문서를 만들면 버전과 리비전이 고정된 문단 문서가 나온다", () => {
    const document = createEmptyDocument(() => "block-1");

    expect(document).toEqual({
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "block-1", type: "paragraph", content: [] }],
    });
  });

  it("중복된 id는 예외를 던지지 않고 검증 실패로 보고한다", () => {
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

  it("지원하지 않는 formatVersion은 거부한다", () => {
    expect(
      parseDocument({ formatVersion: 2, revision: 0, blocks: [] }),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_FORMAT_UNSUPPORTED" },
    });
  });

  it("유효한 문서는 구조를 복사해 반환한다", () => {
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

  it("저장용 mark를 모든 패키지가 공유하는 하나의 정규 순서로 정렬한다", () => {
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

  it("동일한 mark는 중복을 제거해 멱등한 정규 배열로 만든다", () => {
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

  it("충돌하는 link mark는 문서 검증이 판정하도록 그대로 남긴다", () => {
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

  it("정규 순서를 따르는 저장용 mark 배열만 허용한다", () => {
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

  it("LF 텍스트는 허용하고 CRLF는 저장 전에 호출자가 정규화하도록 거부한다", () => {
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
  ])("인라인 텍스트에 %s 문자가 있으면 거부한다", (_name, text) => {
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
  ])("안정 ID에 %s 문자가 있으면 거부한다", (_name, id) => {
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

  it("음수이거나 안전 정수 범위를 벗어난 revision은 거부한다", () => {
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

  it("표 구성 요소끼리 id가 중복되면 거부한다", () => {
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

  it("지원하는 링크 프로토콜만 허용하고 나머지는 거부한다", () => {
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

  it("문서의 링크 정책을 재사용 가능한 술어 함수로 공개한다", () => {
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
  ])("공백·제어문자·프로토콜 상대 경로가 든 링크를 거부한다 — %s", (href) => {
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
  ])("퍼센트 인코딩된 링크는 허용한다 — %s", (href) => {
    expect(parseDocument(documentWithLink(href))).toMatchObject({ ok: true });
  });

  it("같은 문단 인라인 항목에 두 번째 link mark가 오면 거부한다", () => {
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

  it("표 셀 인라인 내용에 두 번째 link mark가 오면 거부한다", () => {
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

  it("지원하지 않는 링크 URL 검사를 link 중복 검사보다 먼저 수행한다", () => {
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

  it("표의 잘못된 크기 값과 색상 값을 거부한다", () => {
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

  it("정렬 값이 허용 목록 밖이면 거부한다", () => {
    const table = {
      id: "table-1",
      type: "table" as const,
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
              content: [],
              align: "justify",
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
        path: ["blocks", 0, "rows", 0, "cells", 0, "align"],
      },
    });
  });

  it("허용 목록 안 정렬 값은 그대로 통과한다", () => {
    const table = {
      id: "table-1",
      type: "table" as const,
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
              content: [],
              align: "center" as const,
            },
          ],
        },
      ],
      headerRows: 0 as const,
      headerColumns: 0 as const,
    };

    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [table],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsedTable = result.value.blocks[0];
    if (parsedTable?.type !== "table") throw new Error("Expected a table");
    expect(parsedTable.rows[0]?.cells[0]?.align).toBe("center");
  });

  it("여러 표가 있으면 뒤쪽 표의 width 오류를 앞쪽 표의 색상 오류보다 먼저 보고한다", () => {
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

  it("논리 셀 수가 문서 한도를 넘는 표는 거부한다", () => {
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
