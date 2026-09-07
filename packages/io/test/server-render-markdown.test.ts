/**
 * 순수 Node(서버) 환경에서 DOM 전역 없이 exportMarkdown/importMarkdown
 * 왕복이 동작함을 고정하는 회귀 테스트. `IO-009`(Issue #156 슬라이스9)
 * 판정 근거. `packages/io/tsconfig*.json`은 DOM lib을 포함하지 않아
 * bare `document` 식별자 자체가 컴파일되지 않는다 — 여기서는 `globalThis`
 * 인덱싱으로 런타임에 DOM 전역이 실제로 없는지 확인한다
 * (`server-render-html.test.ts`와 동일 관례).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";

const sampleDocument: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "heading-1",
      type: "heading",
      level: 1,
      content: [{ text: "서버 렌더 판정" }],
    },
    {
      id: "paragraph-1",
      type: "paragraph",
      content: [
        { text: "굵게", marks: [{ type: "bold" }] },
        { text: " 그리고 " },
        {
          text: "링크",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ],
    },
  ],
};

describe("서버 환경 Markdown 변환", () => {
  it("이 테스트가 실행되는 환경에는 DOM 전역이 실제로 없다", () => {
    const globalRecord = globalThis as Record<string, unknown>;
    expect(typeof globalRecord.document).toBe("undefined");
    expect(typeof globalRecord.window).toBe("undefined");
  });

  it("문서를 Markdown으로 내보내고 다시 가져와도 블록 내용이 보존된다", () => {
    const exported = exportMarkdown(sampleDocument, { mode: "strict" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const imported = importMarkdown(exported.value);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    expect(imported.value.document.blocks).toMatchObject([
      { type: "heading", level: 1, content: [{ text: "서버 렌더 판정" }] },
      {
        type: "paragraph",
        content: [
          { text: "굵게", marks: [{ type: "bold" }] },
          { text: " 그리고 " },
          {
            text: "링크",
            marks: [{ type: "link", href: "https://example.com" }],
          },
        ],
      },
    ]);
  });
});
