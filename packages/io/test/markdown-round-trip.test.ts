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

  it("가져오기 경계에서 생성된 id를 검증한다", () => {
    expect(
      importMarkdown("Paragraph\n\nAnother", { createId: () => "duplicate" }),
    ).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_DOCUMENT_INVALID" },
    });
  });

  it("논리 셀 10000개까지 허용하고 그보다 큰 표는 일찍 거부한다", () => {
    const tableSource = (rowCount: number, columnCount: number): string => {
      const row = `| ${Array.from({ length: columnCount }, () => "x").join(" | ")} |`;
      const delimiter = `| ${Array.from({ length: columnCount }, () => "-").join(" | ")} |`;
      return [
        row,
        delimiter,
        ...Array.from({ length: rowCount - 1 }, () => row),
      ].join("\n");
    };

    expect(importMarkdown(tableSource(100, 100))).toMatchObject({ ok: true });

    let idCalls = 0;
    expect(
      importMarkdown(tableSource(101, 100), {
        createId: () => {
          idCalls += 1;
          return `oversized-${idCalls}`;
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_DOCUMENT_INVALID" },
    });
    expect(idCalls).toBeLessThan(20);
  });

  it("목록 항목과 중첩 항목의 경계를 경고와 함께 문단으로 보존한다", () => {
    const result = importMarkdown(
      "- First item\n- Second item\n  - Nested item",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "paragraph",
        content: [{ text: "First item" }],
      },
      {
        id: "markdown-2",
        type: "paragraph",
        content: [{ text: "Second item" }],
      },
      {
        id: "markdown-3",
        type: "paragraph",
        content: [{ text: "Nested item" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "LIST_DOWNGRADED",
        blockId: "markdown-1",
      }),
      expect.objectContaining({
        kind: "LIST_DOWNGRADED",
        blockId: "markdown-2",
      }),
      expect.objectContaining({
        kind: "LIST_DOWNGRADED",
        blockId: "markdown-3",
      }),
    ]);
  });

  it("이미지의 alt와 대상 주소를 경고와 함께 보이는 텍스트로 보존한다", () => {
    const result = importMarkdown(
      "Before ![Diagram](https://example.com/image.png) after",
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
              type: "paragraph",
              content: [
                {
                  text: "Before Diagram (https://example.com/image.png) after",
                },
              ],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("지원하지 않는 컨테이너 블록의 경계를 경고와 함께 보존한다", () => {
    const result = importMarkdown("> Quote one\n>\n> Quote two");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "paragraph",
        content: [{ text: "Quote one" }],
      },
      {
        id: "markdown-2",
        type: "paragraph",
        content: [{ text: "Quote two" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      {
        kind: "UNSUPPORTED_BLOCK_DOWNGRADED",
        blockId: "markdown-1",
        message: "Unsupported block blockquote was imported as paragraphs",
      },
    ]);
  });

  it("지원하지 않는 leaf 블록을 인라인 경고 중복 없이 보존한다", () => {
    expect(importMarkdown("```ts\nconst x = 1;\nconst y = 2;\n```")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "const x = 1;\nconst y = 2;" }],
            },
          ],
        },
        warnings: [
          {
            kind: "UNSUPPORTED_BLOCK_DOWNGRADED",
            blockId: "markdown-1",
            message: "Unsupported block code was imported as paragraphs",
          },
        ],
      },
    });
  });

  it("GFM 표의 정렬 메타데이터를 버릴 때 경고한다", () => {
    const result = importMarkdown(
      "| Left | Right |\n| :--- | ---: |\n| 1 | 2 |",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks[0]).toMatchObject({
      id: "markdown-1",
      type: "table",
      headerRows: 1,
      headerColumns: 0,
    });
    expect(result.value.warnings).toEqual([
      {
        kind: "TABLE_ALIGNMENT_DISCARDED",
        blockId: "markdown-1",
        message: "Table alignment was discarded during import",
      },
    ]);
  });

  it("이미지 참조를 변환 전에 해석하고 정의는 문서에 남기지 않는다", () => {
    expect(
      importMarkdown(
        "Before ![Diagram][Diagram Ref] after\n\n[diagram ref]: https://example.com/image.png",
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [
                {
                  text: "Before Diagram (https://example.com/image.png) after",
                },
              ],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("정의가 없는 이미지 참조는 alt와 정규화된 식별자로 보존한다", () => {
    expect(importMarkdown("Before ![Diagram][Missing Ref] after")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "Before Diagram [missing ref] after" }],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("정의가 없는 collapsed 이미지 참조를 원본 텍스트에서 복원한다", () => {
    expect(importMarkdown("Before ![Diagram][] after")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "Before Diagram [diagram] after" }],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("정의가 없는 shortcut 이미지 참조를 원본 텍스트에서 복원한다", () => {
    expect(importMarkdown("Before ![Diagram] after")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "Before Diagram [diagram] after" }],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("collapsed와 shortcut 이미지 참조를 각자의 인라인 위치에서 해석한다", () => {
    expect(
      importMarkdown(
        "Collapsed ![Diagram][]\n\nShortcut ![Diagram]\n\n[diagram]: https://example.com/image.png",
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [
                {
                  text: "Collapsed Diagram (https://example.com/image.png)",
                },
              ],
            },
            {
              id: "markdown-2",
              type: "paragraph",
              content: [
                {
                  text: "Shortcut Diagram (https://example.com/image.png)",
                },
              ],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-2",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("이스케이프된 이미지 참조 문법은 복원하지 않는다", () => {
    expect(
      importMarkdown("Before \\![Diagram][] and \\![Diagram] after"),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "Before ![Diagram][] and ![Diagram] after" }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it.each([
    "![Diagram][",
    "![Diagram][missing",
  ])("깨진 이미지 참조 문자열은 경고 없이 그대로 보존한다 — %s", (source) => {
    expect(importMarkdown(source)).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: source }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("구두점이 뒤따르는 깨진 이미지 참조를 그대로 보존한다", () => {
    expect(importMarkdown("Before ![Diagram][missing.")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "Before ![Diagram][missing." }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("링크 참조도 같은 정의 조회 경로로 해석한다", () => {
    expect(
      importMarkdown(
        "Before [Guide][Project Docs] after\n\n[project docs]: https://example.com/docs",
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [
                { text: "Before " },
                {
                  text: "Guide",
                  marks: [{ type: "link", href: "https://example.com/docs" }],
                },
                { text: " after" },
              ],
            },
          ],
        },
        warnings: [],
      },
    });
  });
});
