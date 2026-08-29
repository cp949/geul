/**
 * CodeBlock의 GFM export와 손실 분석을 검증한다.
 * source·language를 fenced code에 보존하고 CodeBlock을 인라인 mark 또는
 * 중첩 손실 대상으로 오인하지 않는다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { analyzeMarkdownLoss, exportMarkdown } from "../src/index.js";

describe("CodeBlock GFM 내보내기", () => {
  it("fence 충돌 source와 공백 포함 language를 fenced code에 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "code-1",
          type: "codeBlock",
          language: "My Lang",
          content: [{ text: "before```after\n\tliteral tab" }],
        },
      ],
    };

    expect(analyzeMarkdownLoss(document)).toEqual([]);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "````My&#x20;Lang\nbefore```after\n\tliteral tab\n````\n",
    });
  });

  it("빈 source와 없는 language를 metadata 없는 fenced code로 내보낸다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "code-empty", type: "codeBlock", content: [] }],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "```\n```\n",
    });
  });

  it("HTML entity 형태의 unknown language를 ampersand escape해 exact 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "code-entity-language",
          type: "codeBlock",
          language: "&copy;",
          content: [{ text: "source" }],
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "```&amp;copy;\nsource\n```\n",
    });
  });
});
