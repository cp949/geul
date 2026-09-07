/**
 * HTML 내보내기와 기본 왕복 변환 계약을 검증한다.
 */
import type { Document, TableBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../../src/index.js";

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
    expect((table as TableBlock).headerColumns).toBe(1);
    expect((table as TableBlock).rows[0]?.cells.map((cell) => cell.id)).toEqual(
      ["reversed-cell-1", "reversed-cell-2"],
    );
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
});
