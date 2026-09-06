/**
 * top-level CustomBlock(model, RD-002-DELTA-01)이 포함된 문서를 exportHtml에
 * 넣으면 HTML_DOCUMENT_INVALID로 명시적으로 거절하는지 확인한다 — CustomBlock의
 * HTML 렌더러(registry, RD-002-DELTA-11)가 아직 없어 조용히 무시하거나 잘못된
 * HTML을 낼 수 없다(core의 EDITOR_FEATURE_UNAVAILABLE과 같은 임시 거절 패턴,
 * RD-002-DELTA-05). 뒤이은 describe 블록(RD-002-DELTA-16)은 같은 임시 거절
 * 정책을 block **내부** inline 레벨 커스텀 원소·CustomTextMark에도 적용한다 —
 * top-level 게이트만으로는 걸러지지 않는 크래시 경로를 막는다.
 */
import type { Document, TableBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml } from "../src/index.js";
import { buildDocument, paragraphBlock } from "./fixtures/quote-divider-document.js";

const widget = { id: "widget-1", type: "myWidget", content: "none" as const };

const documentWithCustomBlock: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [paragraphBlock("p1", "hi"), widget],
};

describe("HTML_DOCUMENT_INVALID: top-level CustomBlock export 거절", () => {
  it("top-level CustomBlock이 있으면 HTML_DOCUMENT_INVALID를 반환하고 message에 custom type을 포함한다", () => {
    const result = exportHtml(documentWithCustomBlock);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "HTML_DOCUMENT_INVALID",
        message: expect.stringContaining("myWidget"),
      },
    });
  });

  it("CustomBlock이 없는 기존 문서는 회귀 없이 그대로 export된다", () => {
    const result = exportHtml(buildDocument([paragraphBlock("p1", "hi")]));

    expect(result.ok).toBe(true);
  });
});

describe("HTML_DOCUMENT_INVALID: inline-level 커스텀 원소·마크 export 거절(RD-002-DELTA-16)", () => {
  it("paragraph content 안의 커스텀 inline 원소가 있으면 HTML_DOCUMENT_INVALID를 반환한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          content: [{ type: "custom", customType: "myWidgetInline" }],
        },
      ],
    };

    expect(exportHtml(document)).toEqual({
      ok: false,
      error: {
        code: "HTML_DOCUMENT_INVALID",
        message: expect.stringContaining("myWidgetInline"),
      },
    });
  });

  it("미등록 CustomTextMark가 있으면 HTML_DOCUMENT_INVALID를 반환한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          content: [{ text: "hi", marks: [{ type: "myMark" }] }],
        },
      ],
    };

    expect(exportHtml(document)).toEqual({
      ok: false,
      error: {
        code: "HTML_DOCUMENT_INVALID",
        message: expect.stringContaining("myMark"),
      },
    });
  });

  it("table cell 안의 커스텀 inline 원소도 재귀로 거절한다", () => {
    const table: TableBlock = {
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
              content: [{ type: "custom", customType: "myWidgetInline" }],
            },
          ],
        },
      ],
      headerRows: 0,
      headerColumns: 0,
    };
    const document: Document = { formatVersion: 1, revision: 0, blocks: [table] };

    expect(exportHtml(document)).toEqual({
      ok: false,
      error: {
        code: "HTML_DOCUMENT_INVALID",
        message: expect.stringContaining("myWidgetInline"),
      },
    });
  });
});
