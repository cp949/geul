/**
 * quote·divider 블록의 export 임시 거절을 확인하는 테스트.
 * `Block` union에 quote·divider가 들어왔지만(DELTA-01) quote·divider의 GFM
 * 매핑은 아직 없다 — 그 사이 exportMarkdown이 TypeError 같은 손상 없이
 * MARKDOWN_DOCUMENT_INVALID로 명시 실패해야 한다(DELTA-01a). HTML 경로는
 * divider(<hr>, DELTA-06)와 quote(<blockquote>, DELTA-06a) 매핑이 모두 들어와
 * 거절 대상이 없다 — 여기서는 GFM 거절이 남아 있는 채 HTML만 성공하는 대비를
 * 고정한다. 남은 GFM 매핑이 들어오는 DELTA-07·07a가 이 파일의 해당 케이스를
 * 교체한다.
 */
import { describe, expect, it } from "vitest";

import type { MarkdownExportError, Result } from "../src/index.js";
import {
  analyzeMarkdownLoss,
  exportHtml,
  exportMarkdown,
} from "../src/index.js";
import {
  buildDocument,
  dividerBlock,
  headingBlock,
  paragraphBlock,
  quoteBlock,
} from "./fixtures/quote-divider-document.js";

type RejectionCode = "MARKDOWN_DOCUMENT_INVALID";

/**
 * export 결과가 지정 오류 코드로 실패했고 메시지에 거절된 블록의 id와 type이
 * 모두 담겼는지 단언한다. `ok: false`만 보고 통과시키면 HTML_SERIALIZE_FAILED
 * 같은 우연한 실패(TypeError를 try가 삼킨 경우)와 구분되지 않으므로 코드를
 * 정확히 비교한다.
 */
const expectUnsupportedBlockRejection = (
  result: Result<unknown, MarkdownExportError>,
  code: RejectionCode,
  block: { id: string; type: "quote" | "divider" },
): void => {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
  const message = "message" in result.error ? result.error.message : undefined;
  expect(message).toContain(block.id);
  expect(message).toContain(block.type);
};

/**
 * exportMarkdown을 strict·lossy 두 모드로 호출해 둘 다 같은 블록을 같은
 * 코드로 거절하는지 단언한다. 두 모드는 analyzeMarkdownLoss 분기 앞에서
 * 갈라지므로 한쪽만 검사하면 다른 쪽의 조용한 직렬화를 놓친다.
 */
const expectMarkdownRejectionInBothModes = (
  document: Parameters<typeof exportMarkdown>[0],
  block: { id: string; type: "quote" | "divider" },
): void => {
  expectUnsupportedBlockRejection(
    exportMarkdown(document, { mode: "strict" }),
    "MARKDOWN_DOCUMENT_INVALID",
    block,
  );
  expectUnsupportedBlockRejection(
    exportMarkdown(document, { mode: "lossy" }),
    "MARKDOWN_DOCUMENT_INVALID",
    block,
  );
};

describe("미지원 블록 export의 임시 거절(DELTA-07·07a가 교체)", () => {
  const quote = quoteBlock("quote-1", "인용");
  const divider = dividerBlock("divider-1");

  // DELTA-06a: quote는 HTML 거절 대상에서 빠졌다 — 왕복 형상 상세는
  // html-blockquote.test.ts가 고정하고, 여기서는 GFM 거절(아래)과 대비되는
  // HTML 성공만 본다.
  it("quote 문서의 exportHtml이 <blockquote data-be-block-id>로 성공한다", () => {
    expect(exportHtml(buildDocument([quote]))).toEqual({
      ok: true,
      value: '<blockquote data-be-block-id="quote-1"><p>인용</p></blockquote>',
    });
  });

  // DELTA-06: divider는 HTML 거절 대상에서 빠졌다 — GFM 거절이 그대로인 채
  // HTML만 통과시키는지를 여기서 고정한다.
  it("divider 문서의 exportHtml이 <hr data-be-block-id>로 성공한다", () => {
    expect(exportHtml(buildDocument([divider]))).toEqual({
      ok: true,
      value: '<hr data-be-block-id="divider-1">',
    });
  });

  it("quote 문서의 exportMarkdown(strict·lossy)이 문단으로 조용히 직렬화되지 않고 MARKDOWN_DOCUMENT_INVALID로 실패한다", () => {
    expectMarkdownRejectionInBothModes(buildDocument([quote]), quote);
  });

  it("divider 문서의 exportMarkdown(strict·lossy)이 TypeError를 호출자에 전파하지 않고 MARKDOWN_DOCUMENT_INVALID로 실패한다", () => {
    const document = buildDocument([divider]);

    expect(() => exportMarkdown(document, { mode: "strict" })).not.toThrow();
    expect(() => exportMarkdown(document, { mode: "lossy" })).not.toThrow();
    expectMarkdownRejectionInBothModes(document, divider);
  });

  it("children 안의 quote·divider는 GFM만 같은 코드로 거절하고 HTML은 거절하지 않는다", () => {
    const paragraphWithQuoteChild = paragraphBlock("paragraph-1", "부모 문단", [
      quote,
    ]);
    const headingWithDividerChild = headingBlock("heading-1", 2, "부모 제목", [
      divider,
    ]);

    // children 안 quote·divider의 HTML 왕복 형상 자체는
    // html-blockquote.test.ts·html-heading-divider.test.ts가 고정한다 —
    // 여기서는 GFM 거절이 남아 있고 HTML은 거절하지 않는다는 대비만 본다.
    const quoteNested = buildDocument([paragraphWithQuoteChild]);
    expect(exportHtml(quoteNested).ok).toBe(true);
    expectMarkdownRejectionInBothModes(quoteNested, quote);

    const dividerNested = buildDocument([headingWithDividerChild]);
    expect(exportHtml(dividerNested).ok).toBe(true);
    expectMarkdownRejectionInBothModes(dividerNested, divider);
  });

  it("analyzeMarkdownLoss가 quote·divider 문서에서 예외를 던지지 않고 quote의 children만 NESTED_CHILDREN으로 기록한다", () => {
    const document = buildDocument([
      quoteBlock("quote-parent", "부모 인용", [dividerBlock("divider-child")]),
      divider,
    ]);

    expect(() => analyzeMarkdownLoss(document)).not.toThrow();
    expect(analyzeMarkdownLoss(document)).toEqual([
      {
        kind: "NESTED_CHILDREN",
        blockId: "quote-parent",
        message: expect.stringContaining("quote-parent"),
      },
    ]);
    expect(analyzeMarkdownLoss(buildDocument([divider]))).toEqual([]);
  });
});
