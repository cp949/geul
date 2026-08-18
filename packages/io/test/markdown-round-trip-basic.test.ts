import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";

const escapedDocument: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "paragraph-1",
      type: "paragraph",
      content: [
        { text: "pipe | back\\slash " },
        { text: "a`b", marks: [{ type: "code" }] },
        { text: " " },
        {
          text: "paren",
          marks: [{ type: "link", href: "https://example.com/a_(b)" }],
        },
        { text: " " },
        {
          text: "nested",
          marks: [{ type: "bold" }, { type: "italic" }, { type: "strike" }],
        },
      ],
    },
    {
      id: "table-1",
      type: "table",
      columns: [
        { id: "column-1", width: 160 },
        { id: "column-2", width: 160 },
      ],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "A | B" }],
            },
            {
              id: "cell-2",
              columnId: "column-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "Literal <br>" }],
            },
          ],
        },
        {
          id: "row-2",
          cells: [
            {
              id: "cell-3",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "back\\slash\nnext" }],
            },
            {
              id: "cell-4",
              columnId: "column-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "tick ` and |" }],
            },
          ],
        },
      ],
      headerRows: 1,
      headerColumns: 0,
    },
  ],
};

describe("Markdown 왕복 변환", () => {
  it("GFM의 제목·mark·링크·표를 가져온다", () => {
    const ids = Array.from(
      { length: 10 },
      (_, index) => `markdown-${index + 1}`,
    );
    const result = importMarkdown(
      "## Title\n\n**bold** *italic* ~~strike~~ `code` [link](https://example.com)\n\n| A | B |\n| - | - |\n| 1 | 2 |",
      { createId: () => ids.shift() ?? "unexpected-id" },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "heading",
              level: 2,
              content: [{ text: "Title" }],
            },
            {
              id: "markdown-2",
              type: "paragraph",
              content: [
                { text: "bold", marks: [{ type: "bold" }] },
                { text: " " },
                { text: "italic", marks: [{ type: "italic" }] },
                { text: " " },
                { text: "strike", marks: [{ type: "strike" }] },
                { text: " " },
                { text: "code", marks: [{ type: "code" }] },
                { text: " " },
                {
                  text: "link",
                  marks: [{ type: "link", href: "https://example.com" }],
                },
              ],
            },
            {
              id: "markdown-3",
              type: "table",
              columns: [
                { id: "markdown-4", width: 160 },
                { id: "markdown-5", width: 160 },
              ],
              rows: [
                {
                  id: "markdown-6",
                  cells: [
                    {
                      id: "markdown-7",
                      columnId: "markdown-4",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "A" }],
                    },
                    {
                      id: "markdown-8",
                      columnId: "markdown-5",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "B" }],
                    },
                  ],
                },
                {
                  id: "markdown-9",
                  cells: [
                    {
                      id: "markdown-10",
                      columnId: "markdown-4",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "1" }],
                    },
                    {
                      id: "unexpected-id",
                      columnId: "markdown-5",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "2" }],
                    },
                  ],
                },
              ],
              headerRows: 1,
              headerColumns: 0,
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("겹쳐 쓴 GFM mark를 공용 저장 순서로 정규화한다", () => {
    const result = importMarkdown(
      "~~[***`combined`***](https://example.com)~~",
      { createId: () => "combined-marks" },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "combined-marks",
              type: "paragraph",
              content: [
                {
                  text: "combined",
                  marks: [
                    { type: "link", href: "https://example.com" },
                    { type: "bold" },
                    { type: "code" },
                    { type: "italic" },
                    { type: "strike" },
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

  it("LF 텍스트는 왕복 변환하고 strict 내보내기는 정규화되지 않았거나 잘못된 문서를 거부한다", () => {
    const safe: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "safe-lf",
          type: "paragraph",
          content: [{ text: "line 1\nline 2" }],
        },
      ],
    };
    const exported = exportMarkdown(safe, { mode: "strict" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);
    expect(
      importMarkdown(exported.value, { createId: () => "safe-lf" }),
    ).toEqual({
      ok: true,
      value: { document: safe, warnings: [] },
    });

    for (const invalid of [
      {
        ...safe,
        blocks: [
          {
            id: "crlf",
            type: "paragraph" as const,
            content: [{ text: "line 1\r\nline 2" }],
          },
        ],
      },
      {
        ...safe,
        blocks: [
          {
            id: "nul",
            type: "paragraph" as const,
            content: [{ text: "nul\u0000text" }],
          },
        ],
      },
      {
        ...safe,
        blocks: [
          {
            id: "unsafe\nid",
            type: "paragraph" as const,
            content: [],
          },
        ],
      },
    ]) {
      expect(exportMarkdown(invalid, { mode: "strict" })).toMatchObject({
        ok: false,
        error: { code: "MARKDOWN_DOCUMENT_INVALID" },
      });
    }
  });

  it("이스케이프와 셀 줄바꿈을 GFM으로 엄격하게 왕복 변환한다", () => {
    const exported = exportMarkdown(escapedDocument, { mode: "strict" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);

    expect(exported.value).toContain("\\|");
    expect(exported.value).toContain("<br>");
    expect(exported.value).not.toContain("Literal <br>");

    const ids = [
      "paragraph-1",
      "table-1",
      "column-1",
      "column-2",
      "row-1",
      "cell-1",
      "cell-2",
      "row-2",
      "cell-3",
      "cell-4",
    ];
    expect(
      importMarkdown(exported.value, {
        createId: () => ids.shift() ?? "unexpected-id",
      }),
    ).toEqual({
      ok: true,
      value: { document: escapedDocument, warnings: [] },
    });
  });

  it("허용 깊이를 넘는 제목은 강등하고 원시 HTML은 표 줄바꿈을 제외하면 비활성으로 유지한다", () => {
    const result = importMarkdown(
      '#### Deep\n\n<div onclick="alert(1)">raw</div>\n\n| A |\n| - |\n| line<br />next |\n| literal<span>x</span> |',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toMatchObject([
      {
        id: "markdown-1",
        type: "paragraph",
        content: [{ text: "Deep" }],
      },
      {
        id: "markdown-2",
        type: "paragraph",
        content: [{ text: '<div onclick="alert(1)">raw</div>' }],
      },
      {
        id: "markdown-3",
        type: "table",
        rows: [
          { cells: [{ content: [{ text: "A" }] }] },
          { cells: [{ content: [{ text: "line\nnext" }] }] },
          { cells: [{ content: [{ text: "literal<span>x</span>" }] }] },
        ],
      },
    ]);
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "HEADING_DEPTH_DOWNGRADED",
          blockId: "markdown-1",
        }),
        expect.objectContaining({
          kind: "RAW_HTML_DOWNGRADED",
          blockId: "markdown-2",
        }),
        expect.objectContaining({
          kind: "RAW_HTML_DOWNGRADED",
          blockId: "markdown-3",
          rowId: "markdown-9",
          cellId: "markdown-10",
        }),
      ]),
    );
    expect(
      result.value.warnings.filter(
        (warning) =>
          warning.blockId === "markdown-3" && warning.rowId === "markdown-7",
      ),
    ).toEqual([]);
  });

  it("정렬이 있는 GFM 표를 가져와 lossy로 다시 내보내면 같은 정렬이 남는다", () => {
    const imported = importMarkdown(
      "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |",
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);

    const exported = exportMarkdown(imported.value.document, {
      mode: "lossy",
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value.warnings).toEqual([]);
    expect(exported.value.markdown).toContain(":---");
    // remark-stringify는 열 폭(헤더 텍스트 길이)에 맞춰 구분선 대시 개수를
    // 늘려 정렬한다("Center"는 6자이므로 ":----:") — 정확한 대시 개수가 아니라
    // 콜론-대시-콜론 형태(가운데 정렬 구문)의 존재만 확인한다.
    expect(exported.value.markdown).toMatch(/:-+:/);
    expect(exported.value.markdown).toContain("---:");
  });
});
