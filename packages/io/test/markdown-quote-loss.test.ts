/**
 * quote children의 GFM 손실 분석(D3, spec §7.2)을 검증한다. GFM(mdast)의
 * blockquote 노드는 문단 하나만 담을 수 있어 quote의 children(재귀, 임의
 * 깊이)을 표현할 수 없다 — paragraph/heading과 같은 NESTED_CHILDREN 손실
 * 규칙을 그대로 따른다: strict export는 거절하고, lossy export는 quote
 * 자신과 children을 형제로 평탄화하며 경고를 남긴다. D8(quote children을
 * import가 만들지 않는 계약)은 markdown-blockquote.test.ts가 담당한다.
 */
import { describe, expect, it } from "vitest";

import {
  analyzeMarkdownLoss,
  exportMarkdown,
  importMarkdown,
} from "../src/index.js";
import {
  buildDocument,
  dividerBlock,
  quoteBlock,
} from "./fixtures/quote-divider-document.js";

describe("quote children의 GFM 손실(D3)", () => {
  it("children 있는 quote의 strict export가 MARKDOWN_LOSS_NOT_ALLOWED로 실패하고 losses에 NESTED_CHILDREN(blockId)이 있다", () => {
    const document = buildDocument([
      quoteBlock("parent-quote", "부모 인용", [
        {
          id: "child-paragraph",
          type: "paragraph",
          content: [{ text: "자식 문단" }],
        },
      ]),
    ]);

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "NESTED_CHILDREN",
            blockId: "parent-quote",
            message: expect.stringContaining("parent-quote"),
          },
        ],
      },
    });
  });

  it("lossy export가 quote 자신과 children을 형제로 평탄화하고 NESTED_CHILDREN 경고의 blockId가 평탄화 산출과 일치한다", () => {
    const document = buildDocument([
      quoteBlock("parent-quote", "부모 인용", [
        {
          id: "child-paragraph",
          type: "paragraph",
          content: [{ text: "자식 문단" }],
        },
      ]),
    ]);

    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value.warnings).toEqual([
      {
        kind: "NESTED_CHILDREN",
        blockId: "parent-quote",
        message: expect.stringContaining("parent-quote"),
      },
    ]);

    const imported = importMarkdown(exported.value.markdown);
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);
    expect(imported.value.warnings).toEqual([]);
    expect(imported.value.document.blocks).toMatchObject([
      { type: "quote", content: [{ text: "부모 인용" }] },
      { type: "paragraph", content: [{ text: "자식 문단" }] },
    ]);
  });

  it("quote children 안의 quote도 재귀로 손실 분석된다", () => {
    const document = buildDocument([
      quoteBlock("outer-quote", "바깥 인용", [
        quoteBlock("inner-quote", "안쪽 인용", [
          {
            id: "grandchild-paragraph",
            type: "paragraph",
            content: [{ text: "손자 문단" }],
          },
        ]),
      ]),
    ]);

    expect(analyzeMarkdownLoss(document)).toEqual([
      {
        kind: "NESTED_CHILDREN",
        blockId: "outer-quote",
        message: expect.stringContaining("outer-quote"),
      },
      {
        kind: "NESTED_CHILDREN",
        blockId: "inner-quote",
        message: expect.stringContaining("inner-quote"),
      },
    ]);
  });

  // DELTA-07a 이전 unsupported-block-export.test.ts에서 그대로 이전.
  it("analyzeMarkdownLoss가 quote·divider 문서에서 예외를 던지지 않고 quote의 children만 NESTED_CHILDREN으로 기록한다", () => {
    const divider = dividerBlock("divider-1");
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
