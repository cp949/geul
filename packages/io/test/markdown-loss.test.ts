import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";

const richTableDocument: Document = {
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
              content: [
                {
                  text: "Header",
                  marks: [{ type: "bold" }, { type: "underline" }],
                },
              ],
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
              content: [{ text: "Left" }],
            },
            {
              id: "cell-3",
              columnId: "column-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "Right" }],
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
              content: [{ text: "Bottom" }],
            },
          ],
        },
      ],
      headerRows: 1,
      headerColumns: 0,
    },
  ],
};

describe("Markdown 손실 처리", () => {
  it("strict 내보내기는 markdown을 생성하지 않고 지원하지 않는 표 기능을 모두 보고한다", () => {
    expect(exportMarkdown(richTableDocument, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "COLUMN_WIDTH",
            blockId: "table-1",
            message: "Column column-2 has non-default width 240",
          },
          {
            kind: "MERGED_CELL",
            blockId: "table-1",
            rowId: "row-1",
            cellId: "cell-1",
            message: "Cell cell-1 spans 1 rows and 2 columns",
          },
          {
            kind: "CELL_COLOR",
            blockId: "table-1",
            rowId: "row-1",
            cellId: "cell-1",
            message: "Cell cell-1 has text or background color",
          },
          {
            kind: "UNDERLINE",
            blockId: "table-1",
            rowId: "row-1",
            cellId: "cell-1",
            message: "Cell cell-1 contains underline formatting",
          },
          {
            kind: "MERGED_CELL",
            blockId: "table-1",
            rowId: "row-2",
            cellId: "cell-2",
            message: "Cell cell-2 spans 2 rows and 1 columns",
          },
        ],
      },
    });
  });

  it("lossy 내보내기는 병합 셀을 펼치고 손실이 발생하는 기능만 제거한다", () => {
    const exported = exportMarkdown(richTableDocument, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    expect(exported.value.warnings).toEqual([
      {
        kind: "COLUMN_WIDTH",
        blockId: "table-1",
        message: "Column column-2 has non-default width 240",
      },
      {
        kind: "MERGED_CELL",
        blockId: "table-1",
        rowId: "row-1",
        cellId: "cell-1",
        message: "Cell cell-1 spans 1 rows and 2 columns",
      },
      {
        kind: "CELL_COLOR",
        blockId: "table-1",
        rowId: "row-1",
        cellId: "cell-1",
        message: "Cell cell-1 has text or background color",
      },
      {
        kind: "UNDERLINE",
        blockId: "table-1",
        rowId: "row-1",
        cellId: "cell-1",
        message: "Cell cell-1 contains underline formatting",
      },
      {
        kind: "MERGED_CELL",
        blockId: "table-1",
        rowId: "row-2",
        cellId: "cell-2",
        message: "Cell cell-2 spans 2 rows and 1 columns",
      },
    ]);

    expect(importMarkdown(exported.value.markdown)).toMatchObject({
      ok: true,
      value: {
        document: {
          blocks: [
            {
              type: "table",
              columns: [{ width: 160 }, { width: 160 }],
              rows: [
                {
                  cells: [
                    {
                      content: [{ text: "Header", marks: [{ type: "bold" }] }],
                    },
                    { content: [] },
                  ],
                },
                {
                  cells: [
                    { content: [{ text: "Left" }] },
                    { content: [{ text: "Right" }] },
                  ],
                },
                {
                  cells: [{ content: [] }, { content: [{ text: "Bottom" }] }],
                },
              ],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("표 바깥의 밑줄 위치도 보고한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-underline",
          type: "paragraph",
          content: [{ text: "underlined", marks: [{ type: "underline" }] }],
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "UNDERLINE",
            blockId: "paragraph-underline",
            message: "Block paragraph-underline contains underline formatting",
          },
        ],
      },
    });
  });

  it("두 모드 모두 손실 분석 전에 잘못된 문서를 거부한다", () => {
    const invalidDocument = {
      ...richTableDocument,
      blocks: richTableDocument.blocks.map((block) =>
        block.type === "table"
          ? {
              ...block,
              columns: block.columns.map((column) => ({
                ...column,
                width: 47,
              })),
            }
          : block,
      ),
    } as Document;

    expect(exportMarkdown(invalidDocument, { mode: "strict" })).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_DOCUMENT_INVALID" },
    });
    expect(exportMarkdown(invalidDocument, { mode: "lossy" })).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_DOCUMENT_INVALID" },
    });
  });

  it("인라인 코드의 줄바꿈을 보고하고 lossy 내보내기는 셀 텍스트를 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "code-table",
          type: "table",
          columns: [{ id: "code-column", width: 160 }],
          rows: [
            {
              id: "code-header-row",
              cells: [
                {
                  id: "code-header-cell",
                  columnId: "code-column",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Header" }],
                },
              ],
            },
            {
              id: "code-body-row",
              cells: [
                {
                  id: "code-body-cell",
                  columnId: "code-column",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [
                    {
                      text: "line 1\nline 2",
                      marks: [{ type: "bold" }, { type: "code" }],
                    },
                  ],
                },
              ],
            },
          ],
          headerRows: 1,
          headerColumns: 0,
        },
      ],
    };

    const loss = {
      kind: "INLINE_CODE_NEWLINE",
      blockId: "code-table",
      rowId: "code-body-row",
      cellId: "code-body-cell",
      message: "Cell code-body-cell contains inline code with a newline",
    } as const;
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: { code: "MARKDOWN_LOSS_NOT_ALLOWED", losses: [loss] },
    });

    const lossy = exportMarkdown(document, { mode: "lossy" });
    expect(lossy.ok).toBe(true);
    if (!lossy.ok) throw new Error(lossy.error.message);
    expect(lossy.value.warnings).toEqual([loss]);
    expect(importMarkdown(lossy.value.markdown)).toMatchObject({
      ok: true,
      value: {
        document: {
          blocks: [
            {
              type: "table",
              rows: [
                { cells: [{ content: [{ text: "Header" }] }] },
                {
                  cells: [
                    {
                      content: [
                        { text: "line 1\nline 2", marks: [{ type: "bold" }] },
                      ],
                    },
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

  it("헤더 의미를 보고하고 lossy 내보내기는 GFM 형태로 정규화한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "header-table",
          type: "table",
          columns: [{ id: "header-column", width: 160 }],
          rows: [
            {
              id: "header-row",
              cells: [
                {
                  id: "header-cell",
                  columnId: "header-column",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Value" }],
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 1,
        },
      ],
    };
    const losses = [
      {
        kind: "HEADER_ROW",
        blockId: "header-table",
        message: "Table header-table has 0 header rows; GFM export uses 1",
      },
      {
        kind: "HEADER_COLUMN",
        blockId: "header-table",
        message: "Table header-table has 1 header columns; GFM export uses 0",
      },
    ] as const;

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: { code: "MARKDOWN_LOSS_NOT_ALLOWED", losses },
    });
    const lossy = exportMarkdown(document, { mode: "lossy" });
    expect(lossy.ok).toBe(true);
    if (!lossy.ok) throw new Error(lossy.error.message);
    expect(lossy.value.warnings).toEqual(losses);
    expect(importMarkdown(lossy.value.markdown)).toMatchObject({
      ok: true,
      value: {
        document: {
          blocks: [{ type: "table", headerRows: 1, headerColumns: 0 }],
        },
      },
    });
  });

  it("열 안에서 정렬이 갈리면 strict는 실패하고 lossy는 열 정렬을 비운 채 경고한다", () => {
    const mismatchedAlignDocument: Document = {
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
                  content: [{ text: "a" }],
                  align: "left",
                },
              ],
            },
            {
              id: "row-2",
              cells: [
                {
                  id: "cell-2",
                  columnId: "column-1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "b" }],
                  align: "right",
                },
              ],
            },
          ],
          headerRows: 1,
          headerColumns: 0,
        },
      ],
    };

    expect(exportMarkdown(mismatchedAlignDocument, { mode: "strict" })).toEqual(
      {
        ok: false,
        error: {
          code: "MARKDOWN_LOSS_NOT_ALLOWED",
          losses: [
            {
              kind: "COLUMN_ALIGN",
              blockId: "table-1",
              message: "Column column-1 has cells with different align values",
            },
          ],
        },
      },
    );

    const lossy = exportMarkdown(mismatchedAlignDocument, { mode: "lossy" });
    expect(lossy.ok).toBe(true);
    if (!lossy.ok) throw new Error(lossy.error.message);
    expect(lossy.value.warnings).toEqual([
      {
        kind: "COLUMN_ALIGN",
        blockId: "table-1",
        message: "Column column-1 has cells with different align values",
      },
    ]);
  });

  it("children이 있는 문단/헤딩은 깊이와 무관하게 모두 NESTED_CHILDREN 손실로 보고한다", () => {
    const nestedChildrenDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent-paragraph",
          type: "paragraph",
          content: [{ text: "Parent" }],
          children: [
            {
              id: "child-heading",
              type: "heading",
              level: 2,
              content: [{ text: "Child heading" }],
              children: [
                {
                  id: "grandchild-paragraph",
                  type: "paragraph",
                  content: [{ text: "Grandchild" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const losses = [
      {
        kind: "NESTED_CHILDREN",
        blockId: "parent-paragraph",
        message:
          "Block parent-paragraph has nested children; GFM export flattens them into sibling blocks",
      },
      {
        kind: "NESTED_CHILDREN",
        blockId: "child-heading",
        message:
          "Block child-heading has nested children; GFM export flattens them into sibling blocks",
      },
    ] as const;

    expect(exportMarkdown(nestedChildrenDocument, { mode: "strict" })).toEqual({
      ok: false,
      error: { code: "MARKDOWN_LOSS_NOT_ALLOWED", losses },
    });

    const lossy = exportMarkdown(nestedChildrenDocument, { mode: "lossy" });
    expect(lossy.ok).toBe(true);
    if (!lossy.ok) throw new Error(lossy.error.message);
    expect(lossy.value.warnings).toEqual(losses);
  });

  it("children이 빈 배열이면 NESTED_CHILDREN 손실을 보고하지 않는다", () => {
    const emptyChildrenDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-empty-children",
          type: "paragraph",
          content: [{ text: "No real children" }],
          children: [],
        },
      ],
    };

    expect(exportMarkdown(emptyChildrenDocument, { mode: "strict" })).toEqual({
      ok: true,
      value: expect.any(String),
    });
  });
});
