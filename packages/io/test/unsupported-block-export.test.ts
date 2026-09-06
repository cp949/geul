/**
 * top-level CustomBlock(model, RD-002-DELTA-01)이 포함된 문서를 exportHtml에
 * 넣을 때의 계약을 확인한다. `customBlockToHtml`에 등록되지 않은 타입은
 * HTML_DOCUMENT_INVALID로 명시적으로 거절된다 — exportHtml은 strict/lossy
 * 모드가 없어(spec §4.5 시그니처) 미등록은 항상 즉시 거절로 충분하다(RD-003).
 * 등록된 타입은 그 렌더러의 출력이 결과 HTML에 raw로 그대로 포함된다(두 번째
 * describe). 뒤이은 세 번째 describe(RD-002-DELTA-16)는 `customBlockToHtml`과
 * 무관하게 block **내부** inline 레벨 커스텀 원소·CustomTextMark를 여전히
 * 무조건 거절한다 — `customInlineContent`/`customStyles`는 이 RD(RD-003)
 * 범위 밖이다.
 */
import type { CustomBlock, Document, TableBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml } from "../src/index.js";
import {
  buildDocument,
  paragraphBlock,
} from "./fixtures/quote-divider-document.js";

const widget = { id: "widget-1", type: "myWidget", content: "none" as const };

const documentWithCustomBlock: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [paragraphBlock("p1", "hi"), widget],
};

describe("HTML_DOCUMENT_INVALID: 미등록 top-level CustomBlock export 거절", () => {
  it("등록되지 않은 top-level CustomBlock이 있으면 HTML_DOCUMENT_INVALID를 반환하고 message에 custom type을 포함한다", () => {
    const result = exportHtml(documentWithCustomBlock);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "HTML_DOCUMENT_INVALID",
        message: expect.stringContaining("myWidget"),
      },
    });
  });

  it("다른 타입만 등록돼 있으면 미등록 타입은 여전히 거절된다", () => {
    const result = exportHtml(documentWithCustomBlock, {
      customBlockToHtml: { otherWidget: () => "<span/>" },
    });

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

describe("customBlockToHtml: 등록된 CustomBlock 렌더(RD-003)", () => {
  const renderer = (block: CustomBlock): string =>
    `<div data-widget-id="${block.id}">rendered</div>`;

  it("등록된 렌더러의 출력이 결과 HTML에 raw로 그대로 포함된다", () => {
    const result = exportHtml(documentWithCustomBlock, {
      customBlockToHtml: { myWidget: renderer },
    });

    expect(result).toEqual({
      ok: true,
      value: expect.stringContaining(
        '<div data-widget-id="widget-1">rendered</div>',
      ),
    });
  });

  it('content:"inline" 모드 CustomBlock이 등록돼도 blocksInlineContentViolation에서 크래시하지 않는다', () => {
    const inlineWidget = {
      id: "widget-2",
      type: "myInlineWidget",
      content: "inline" as const,
    };
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [inlineWidget],
    };

    const result = exportHtml(document, {
      customBlockToHtml: { myInlineWidget: renderer },
    });

    expect(result).toEqual({
      ok: true,
      value: expect.stringContaining(
        '<div data-widget-id="widget-2">rendered</div>',
      ),
    });
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
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [table],
    };

    expect(exportHtml(document)).toEqual({
      ok: false,
      error: {
        code: "HTML_DOCUMENT_INVALID",
        message: expect.stringContaining("myWidgetInline"),
      },
    });
  });
});
