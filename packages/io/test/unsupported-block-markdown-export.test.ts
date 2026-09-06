/**
 * top-level CustomBlock(model, RD-002-DELTA-01)이 포함된 문서를 exportMarkdown에
 * 넣으면 mode(strict/lossy)와 무관하게 MARKDOWN_DOCUMENT_INVALID로 명시적으로
 * 거절하는지 확인한다 — CustomBlock의 markdown 렌더러(registry,
 * RD-002-DELTA-11)가 아직 없어 조용히 무시하거나 잘못된 markdown을 낼 수 없다
 * (io/export-html.ts와 같은 임시 거절 패턴, RD-002-DELTA-07).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { analyzeMarkdownLoss, exportMarkdown } from "../src/index.js";
import { buildDocument, paragraphBlock } from "./fixtures/quote-divider-document.js";

const widget = { id: "widget-1", type: "myWidget", content: "none" as const };

const documentWithCustomBlock: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [paragraphBlock("p1", "hi"), widget],
};

describe("MARKDOWN_DOCUMENT_INVALID: top-level CustomBlock export 거절", () => {
  it("strict 모드에서 top-level CustomBlock이 있으면 MARKDOWN_DOCUMENT_INVALID를 반환한다", () => {
    const result = exportMarkdown(documentWithCustomBlock, { mode: "strict" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_DOCUMENT_INVALID",
        message: expect.stringContaining("myWidget"),
      },
    });
  });

  it("lossy 모드에서도 top-level CustomBlock이 있으면 손실 경고 대신 MARKDOWN_DOCUMENT_INVALID를 반환한다", () => {
    const result = exportMarkdown(documentWithCustomBlock, { mode: "lossy" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_DOCUMENT_INVALID",
        message: expect.stringContaining("myWidget"),
      },
    });
  });

  it("CustomBlock이 없는 기존 문서는 회귀 없이 그대로 export된다(양쪽 모드)", () => {
    const document = buildDocument([paragraphBlock("p1", "hi")]);

    expect(exportMarkdown(document, { mode: "strict" }).ok).toBe(true);
    expect(exportMarkdown(document, { mode: "lossy" }).ok).toBe(true);
  });

  it("analyzeMarkdownLoss는 top-level CustomBlock을 크래시 없이 건너뛴다(exportMarkdown이 이미 거절을 전담)", () => {
    expect(() => analyzeMarkdownLoss(documentWithCustomBlock)).not.toThrow();
    expect(analyzeMarkdownLoss(documentWithCustomBlock)).toEqual([]);
  });
});
