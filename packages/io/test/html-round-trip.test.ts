import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

const documentWithMergedTable: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "table-1",
      type: "table",
      columns: [
        { id: "column-1", width: 160 },
        { id: "column-2", width: 240 },
      ],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 2,
              content: [{ text: "Header", marks: [{ type: "bold" }] }],
              textColor: "#112233",
              backgroundColor: "#AABBCC",
            },
          ],
        },
        {
          id: "row-2",
          cells: [
            {
              id: "cell-2",
              columnId: "column-1",
              rowSpan: 2,
              columnSpan: 1,
              content: [{ text: "Row header" }],
            },
            {
              id: "cell-3",
              columnId: "column-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "Body" }],
            },
          ],
        },
        {
          id: "row-3",
          cells: [
            {
              id: "cell-4",
              columnId: "column-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [],
            },
          ],
        },
      ],
      headerRows: 1,
      headerColumns: 1,
    },
  ],
};

describe("HTML 왕복 변환", () => {
  it("id·병합 셀·너비·헤더·색상을 왕복 변환에서 보존한다", () => {
    const exported = exportHtml(documentWithMergedTable);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document: documentWithMergedTable, warnings: [] },
    });
    expect(exported.value).toBe(
      '<table data-be-block-id="table-1" data-be-header-rows="1" data-be-header-columns="1"><colgroup><col data-be-column-id="column-1" data-be-width="160"><col data-be-column-id="column-2" data-be-width="240"></colgroup><thead><tr data-be-row-id="row-1"><th data-be-cell-id="cell-1" data-be-column-id="column-1" rowspan="1" colspan="2" data-be-text-color="#112233" data-be-background-color="#AABBCC"><strong>Header</strong></th></tr></thead><tbody><tr data-be-row-id="row-2"><th data-be-cell-id="cell-2" data-be-column-id="column-1" rowspan="2" colspan="1" scope="row">Row header</th><td data-be-cell-id="cell-3" data-be-column-id="column-2" rowspan="1" colspan="1">Body</td></tr><tr data-be-row-id="row-3"><td data-be-cell-id="cell-4" data-be-column-id="column-2" rowspan="1" colspan="1"></td></tr></tbody></table>',
    );
  });

  it("저장 배열의 순서가 뒤집혀 있어도 브라우저 논리 열 순서로 직렬화한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "reversed-table",
          type: "table",
          columns: [
            { id: "reversed-column-1", width: 160 },
            { id: "reversed-column-2", width: 160 },
          ],
          rows: [
            {
              id: "reversed-row-1",
              cells: [
                {
                  id: "reversed-cell-2",
                  columnId: "reversed-column-2",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Body" }],
                },
                {
                  id: "reversed-cell-1",
                  columnId: "reversed-column-1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Header" }],
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 1,
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain(
      '<tr data-be-row-id="reversed-row-1"><th data-be-cell-id="reversed-cell-1"',
    );
    expect(exported.value.indexOf("reversed-cell-1")).toBeLessThan(
      exported.value.indexOf("reversed-cell-2"),
    );

    const imported = importHtml(exported.value);
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);
    const table = imported.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected a table");
    expect(table.headerColumns).toBe(1);
    expect(table.rows[0]?.cells.map((cell) => cell.id)).toEqual([
      "reversed-cell-1",
      "reversed-cell-2",
    ]);
  });

  it("헤더 셀이 본문 행까지 걸치면 thead 없이 헤더 메타데이터를 유지한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "cross-group-table",
          type: "table",
          columns: [
            { id: "cross-column-1", width: 160 },
            { id: "cross-column-2", width: 160 },
          ],
          rows: [
            {
              id: "cross-row-1",
              cells: [
                {
                  id: "cross-cell-1",
                  columnId: "cross-column-1",
                  rowSpan: 2,
                  columnSpan: 1,
                  content: [{ text: "Row and column header" }],
                },
                {
                  id: "cross-cell-2",
                  columnId: "cross-column-2",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Column header" }],
                },
              ],
            },
            {
              id: "cross-row-2",
              cells: [
                {
                  id: "cross-cell-3",
                  columnId: "cross-column-2",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Body" }],
                },
              ],
            },
          ],
          headerRows: 1,
          headerColumns: 1,
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).not.toContain("<thead>");
    expect(exported.value).toContain(
      'data-be-header-rows="1" data-be-header-columns="1"',
    );
    expect(exported.value).toContain(
      '<tbody><tr data-be-row-id="cross-row-1"><th data-be-cell-id="cross-cell-1"',
    );
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("mark 중첩 순서를 정규화하고 인접한 동일 인라인 mark를 병합한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
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

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<p data-be-block-id="paragraph-1"><a href="https://example.com"><strong><em><u><s><code>marked</code></s></u></em></strong></a></p>',
    );

    expect(
      importHtml(
        '<p data-be-block-id="paragraph-2"><strong>A</strong><strong>B</strong></p>',
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "paragraph-2",
              type: "paragraph",
              content: [{ text: "AB", marks: [{ type: "bold" }] }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("안전한 LF는 왕복 변환하고 정규화되지 않은 모델 텍스트는 거부한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "line-breaks",
          type: "paragraph",
          content: [{ text: "line 1\nline 2" }],
        },
      ],
    };
    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain("line 1<br>line 2");
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });

    for (const invalidText of ["line 1\r\nline 2", "nul\u0000text"]) {
      expect(
        exportHtml({
          ...document,
          blocks: [
            {
              id: "invalid-text",
              type: "paragraph",
              content: [{ text: invalidText }],
            },
          ],
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "HTML_DOCUMENT_INVALID" },
      });
    }
  });

  it("ID의 제어문자를 HTML 직렬화 전에 거부한다", () => {
    expect(
      exportHtml({
        formatVersion: 1,
        revision: 0,
        blocks: [{ id: "unsafe\nid", type: "paragraph", content: [] }],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  it("link mark가 여러 개인 문서는 중첩 anchor를 만들지 않고 거부한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "multiple-links",
          type: "paragraph",
          content: [
            {
              text: "invalid links",
              marks: [
                { type: "link", href: "https://outer.example" },
                { type: "link", href: "https://inner.example" },
              ],
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

  it("평범한 HTML 표는 주입된 id와 col 너비로 가져온다", () => {
    const ids = Array.from(
      { length: 10 },
      (_, index) => `generated-${index + 1}`,
    );
    const result = importHtml(
      '<table><colgroup><col width="120"><col width="180"></colgroup><thead><tr><th colspan="2">Header</th></tr></thead><tbody><tr><th scope="row" rowspan="2">Row</th><td>B</td></tr><tr><td>C</td></tr></tbody></table>',
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
              id: "generated-1",
              type: "table",
              columns: [
                { id: "generated-2", width: 120 },
                { id: "generated-3", width: 180 },
              ],
              rows: [
                {
                  id: "generated-4",
                  cells: [
                    {
                      id: "generated-5",
                      columnId: "generated-2",
                      rowSpan: 1,
                      columnSpan: 2,
                      content: [{ text: "Header" }],
                    },
                  ],
                },
                {
                  id: "generated-6",
                  cells: [
                    {
                      id: "generated-7",
                      columnId: "generated-2",
                      rowSpan: 2,
                      columnSpan: 1,
                      content: [{ text: "Row" }],
                    },
                    {
                      id: "generated-8",
                      columnId: "generated-3",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "B" }],
                    },
                  ],
                },
                {
                  id: "generated-9",
                  cells: [
                    {
                      id: "generated-10",
                      columnId: "generated-3",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "C" }],
                    },
                  ],
                },
              ],
              headerRows: 1,
              headerColumns: 1,
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("알 수 없는 최상위 텍스트는 문단으로 강등하고 revision을 초기화한다", () => {
    const ids = ["paragraph-generated", "heading-generated"];
    expect(
      importHtml("<aside>Loose <strong>text</strong></aside><h2>Title</h2>", {
        createId: () => ids.shift() ?? "unexpected-id",
      }),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "paragraph-generated",
              type: "paragraph",
              content: [
                { text: "Loose " },
                { text: "text", marks: [{ type: "bold" }] },
              ],
            },
            {
              id: "heading-generated",
              type: "heading",
              level: 2,
              content: [{ text: "Title" }],
            },
          ],
        },
        warnings: [
          expect.objectContaining({
            kind: "SAFE_BLOCK_DOWNGRADED",
            element: "aside",
          }),
        ],
      },
    });

    const revised: Document = {
      formatVersion: 1,
      revision: 42,
      blocks: [{ id: "stable", type: "paragraph", content: [] }],
    };
    const exported = exportHtml(revised);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).not.toContain("42");
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: {
        document: { ...revised, revision: 0 },
        warnings: [],
      },
    });
  });

  it("보존된 정규 id 옆에서도 기본 생성 id가 겹치지 않는다", () => {
    expect(
      importHtml('<p data-be-block-id="html-1">Preserved</p><p>Generated</p>'),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "html-1",
              type: "paragraph",
              content: [{ text: "Preserved" }],
            },
            {
              id: "html-2",
              type: "paragraph",
              content: [{ text: "Generated" }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("가져온 표 그리드가 잘못되면 HTML_DOCUMENT_INVALID로 감싼다", () => {
    expect(
      importHtml(
        '<table><colgroup><col width="160"></colgroup><tbody><tr><td colspan="2">Too wide</td></tr></tbody></table>',
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  it("셀 align을 왕복 변환에서 보존한다", () => {
    const documentWithAlign: Document = {
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
                  content: [{ text: "Centered" }],
                  align: "center",
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 0,
        },
      ],
    };

    const exported = exportHtml(documentWithAlign);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain('data-be-align="center"');

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document: documentWithAlign, warnings: [] },
    });
  });

  it("셀 align과 배경색을 함께 왕복 변환에서 보존한다", () => {
    const documentWithAlignAndColor: Document = {
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
                  content: [{ text: "Centered" }],
                  align: "center",
                  backgroundColor: "#AABBCC",
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 0,
        },
      ],
    };

    const exported = exportHtml(documentWithAlignAndColor);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain('data-be-align="center"');
    expect(exported.value).toContain('data-be-background-color="#AABBCC"');

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document: documentWithAlignAndColor, warnings: [] },
    });
  });

  it("importHtml도 tfoot이 tbody보다 먼저 오면 head→body→foot 순서로 파싱한다", () => {
    const html =
      "<table><thead><tr><td>H</td></tr></thead>" +
      "<tfoot><tr><td>F</td></tr></tfoot>" +
      "<tbody><tr><td>B</td></tr></tbody></table>";

    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const table = result.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected a table");
    expect(table.rows.map((row) => row.cells[0]?.content)).toEqual([
      [{ text: "H" }],
      [{ text: "B" }],
      [{ text: "F" }],
    ]);
  });

  it("import 경로에서도 caption이 표 앞 문단이 된다", () => {
    const html =
      "<table><caption>Sales 2026</caption>" +
      "<tbody><tr><td>a</td></tr></tbody></table>";

    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toHaveLength(2);
    const [paragraph, table] = result.value.document.blocks;
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") throw new Error("Expected paragraph");
    expect(paragraph.content).toEqual([{ text: "Sales 2026" }]);
    expect(table?.type).toBe("table");
  });

  it("import 경로에서도 공백·제로폭 caption은 문단을 만들지 않는다", () => {
    const html =
      "<table><caption>\u200B\u00A0\u00A0</caption>" +
      "<tbody><tr><td>a</td></tr></tbody></table>";

    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toHaveLength(1);
    expect(result.value.document.blocks[0]?.type).toBe("table");
  });

  it("허용 목록 밖 data-be-align 값은 import 전체를 HTML_DOCUMENT_INVALID로 거절한다", () => {
    const html =
      '<table data-be-block-id="table-1"><colgroup><col data-be-column-id="column-1" data-be-width="160"></colgroup><tbody><tr data-be-row-id="row-1"><td data-be-cell-id="cell-1" data-be-column-id="column-1" rowspan="1" colspan="1" data-be-align="justify"></td></tr></tbody></table>';

    const result = importHtml(html);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("HTML_DOCUMENT_INVALID");
  });
});
