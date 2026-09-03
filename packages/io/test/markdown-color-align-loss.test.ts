// 인라인 색상 mark(DELTA-01)·블록 색상/정렬 props(DELTA-02)의 GFM 손실 카테고리
// 검증(Issue #38 슬라이스 8, RD-004 DELTA-03). export-markdown.ts의 strict/
// lossy 분기와 wrapNodes는 이미 일반화돼 있어 loss-analysis.ts의 감지만
// 고정한다.
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";

describe("인라인 색상·블록 색상/정렬 GFM 손실", () => {
  it("인라인 textColor mark를 INLINE_COLOR 손실로 보고하고 strict를 거절한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            { text: "red", marks: [{ type: "textColor", color: "#FF0000" }] },
          ],
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "INLINE_COLOR",
            blockId: "paragraph-1",
            message:
              "Block paragraph-1 contains inline text or background color",
          },
        ],
      },
    });
  });

  it("블록 레벨 textColor/backgroundColor를 BLOCK_COLOR 손실로 보고한다", () => {
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
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "BLOCK_COLOR",
            blockId: "paragraph-1",
            message: "Block paragraph-1 has text or background color",
          },
        ],
      },
    });
  });

  it("블록 레벨 textAlignment를 BLOCK_ALIGN 손실로 보고한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "heading-1",
          type: "heading",
          level: 2,
          content: [{ text: "title" }],
          textAlignment: "center",
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "BLOCK_ALIGN",
            blockId: "heading-1",
            message: "Block heading-1 has text alignment",
          },
        ],
      },
    });
  });

  it("세 손실이 한 블록에 공존하면 INLINE_COLOR·BLOCK_COLOR·BLOCK_ALIGN 순서로 보고한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            {
              text: "x",
              marks: [{ type: "backgroundColor", color: "#000000" }],
            },
          ],
          textColor: "#FF0000",
          textAlignment: "right",
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "INLINE_COLOR",
            blockId: "paragraph-1",
            message:
              "Block paragraph-1 contains inline text or background color",
          },
          {
            kind: "BLOCK_COLOR",
            blockId: "paragraph-1",
            message: "Block paragraph-1 has text or background color",
          },
          {
            kind: "BLOCK_ALIGN",
            blockId: "paragraph-1",
            message: "Block paragraph-1 has text alignment",
          },
        ],
      },
    });
  });

  it("표 셀 콘텐츠 안 인라인 색상 mark도 INLINE_COLOR로 감지한다(셀 자체 CELL_COLOR와 별개)", () => {
    const document: Document = {
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
                  content: [
                    {
                      text: "x",
                      marks: [{ type: "textColor", color: "#00FF00" }],
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

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "INLINE_COLOR",
            blockId: "table-1",
            rowId: "row-1",
            cellId: "cell-1",
            message: "Cell cell-1 contains inline text or background color",
          },
        ],
      },
    });
  });

  it("lossy 내보내기는 세 손실을 경고로 보고하고 텍스트 콘텐츠는 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            {
              text: "x",
              marks: [{ type: "backgroundColor", color: "#000000" }],
            },
          ],
          textColor: "#FF0000",
          textAlignment: "right",
        },
      ],
    };

    const losses = [
      {
        kind: "INLINE_COLOR",
        blockId: "paragraph-1",
        message: "Block paragraph-1 contains inline text or background color",
      },
      {
        kind: "BLOCK_COLOR",
        blockId: "paragraph-1",
        message: "Block paragraph-1 has text or background color",
      },
      {
        kind: "BLOCK_ALIGN",
        blockId: "paragraph-1",
        message: "Block paragraph-1 has text alignment",
      },
    ] as const;

    const lossy = exportMarkdown(document, { mode: "lossy" });
    expect(lossy.ok).toBe(true);
    if (!lossy.ok) throw new Error(lossy.error.message);
    expect(lossy.value.warnings).toEqual(losses);
    expect(importMarkdown(lossy.value.markdown)).toMatchObject({
      ok: true,
      value: {
        document: {
          blocks: [{ type: "paragraph", content: [{ text: "x" }] }],
        },
        warnings: [],
      },
    });
  });

  it("색상·정렬이 전혀 없으면 strict export가 정상 성공한다(회귀 확인)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "paragraph-1", type: "paragraph", content: [{ text: "plain" }] },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: expect.any(String),
    });
  });
});
