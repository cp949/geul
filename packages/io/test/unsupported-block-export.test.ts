/**
 * top-level CustomBlock(model, RD-002-DELTA-01)이 포함된 문서를 exportHtml에
 * 넣으면 HTML_DOCUMENT_INVALID로 명시적으로 거절하는지 확인한다 — CustomBlock의
 * HTML 렌더러(registry, RD-002-DELTA-11)가 아직 없어 조용히 무시하거나 잘못된
 * HTML을 낼 수 없다(core의 EDITOR_FEATURE_UNAVAILABLE과 같은 임시 거절 패턴,
 * RD-002-DELTA-05).
 */
import type { Document } from "@cp949/geul-model";
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
