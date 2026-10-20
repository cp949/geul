// 링크 target의 GFM 손실 검증(Issue #424, RD-001-DELTA-02). GFM 링크 `[text](url)`에는
// target을 실을 수 없다. strict는 거절하고 lossy는 링크를 유지한 채 LINK_TARGET으로 보고한다.
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";

const linkMarks = (target?: string) => [
  {
    type: "link" as const,
    href: "https://e.com",
    ...(target === undefined ? {} : { target }),
  },
];

const paragraphDocument = (target?: string): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "p1",
      type: "paragraph",
      content: [{ text: "t", marks: linkMarks(target) }],
    },
  ],
});

const tableDocument: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "t1",
      type: "table",
      headerRows: 0,
      headerColumns: 0,
      columns: [{ id: "c1", width: 160 }],
      rows: [
        {
          id: "r1",
          cells: [
            {
              id: "x1",
              columnId: "c1",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "t", marks: linkMarks("_blank") }],
            },
          ],
        },
      ],
    },
  ],
};

describe("링크 target GFM 손실", () => {
  it("strict는 LINK_TARGET으로 거절한다", () => {
    expect(
      exportMarkdown(paragraphDocument("_blank"), { mode: "strict" }),
    ).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "LINK_TARGET",
            blockId: "p1",
            message:
              "Block p1 contains a link with a target; GFM links cannot carry it",
          },
        ],
      },
    });
  });

  it("lossy는 링크 글자와 URL을 유지하고 LINK_TARGET을 보고한다", () => {
    expect(
      exportMarkdown(paragraphDocument("_self"), { mode: "lossy" }),
    ).toEqual({
      ok: true,
      value: {
        markdown: "[t](https://e.com)\n",
        warnings: [
          {
            kind: "LINK_TARGET",
            blockId: "p1",
            message:
              "Block p1 contains a link with a target; GFM links cannot carry it",
          },
        ],
      },
    });
  });

  it("표 셀 링크의 target도 셀 위치와 함께 보고한다", () => {
    const result = exportMarkdown(tableDocument, { mode: "lossy" });
    expect(result.ok).toBe(true);
    if (!result.ok || typeof result.value === "string") return;
    // 머리글 행이 없는 표라 HEADER_ROW 등 다른 손실이 함께 나온다. LINK_TARGET만 본다.
    expect(result.value.warnings).toContainEqual({
      kind: "LINK_TARGET",
      blockId: "t1",
      rowId: "r1",
      cellId: "x1",
      message:
        "Cell x1 contains a link with a target; GFM links cannot carry it",
    });
  });

  it("target이 없는 링크는 손실이 아니다", () => {
    expect(exportMarkdown(paragraphDocument(), { mode: "strict" })).toEqual({
      ok: true,
      value: "[t](https://e.com)\n",
    });
  });
});
