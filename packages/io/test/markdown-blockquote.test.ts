/**
 * GFM export/import의 quote ↔ blockquote 매핑(D8, spec §7.2, DELTA-07a)을
 * 검증한다. children 없는 quote는 `> `로 왕복하고(D8), import는 blockquote
 * 안 문단마다 형제 quote로 분해해 children을 만들지 않는다 — import 직후
 * 문서가 strict export에 실패하는 비대칭을 막는다. blockquote 안 비문단
 * 자식(heading 등)은 일반 블록 매핑으로 풀리며 QUOTE_CHILD_DOWNGRADED
 * 경고를 남기고, 중첩 blockquote는 같은 규칙을 재귀 적용한 뒤
 * NESTED_QUOTE_FLATTENED 경고를 남긴다. quote children의 GFM 손실(D3,
 * strict 거절·lossy 평탄화)은 markdown-quote-loss.test.ts가 담당한다.
 */
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";
import {
  buildDocument,
  quoteBlock,
} from "./fixtures/quote-divider-document.js";
import { expectRoundTrip, importOk } from "./markdown-round-trip-support.js";

describe("quote ↔ blockquote 왕복(D8)", () => {
  it("children 없는 quote가 > 로 export되고 re-import로 원본이 복원된다", () => {
    const markdown = expectRoundTrip(
      buildDocument([quoteBlock("markdown-1", "인용")]),
    );

    expect(markdown).toContain("> 인용");
  });

  it("> A\\n>\\n> B import가 children 없는 형제 quote 2개를 만든다", () => {
    const { document, warnings } = importOk("> A\n>\n> B");

    expect(document.blocks).toEqual([
      { id: "markdown-1", type: "quote", content: [{ text: "A" }] },
      { id: "markdown-2", type: "quote", content: [{ text: "B" }] },
    ]);
    expect(warnings).toEqual([]);
  });
});

describe("blockquote 안 비문단·중첩 자식(D8)", () => {
  it("blockquote 안 heading이 일반 heading 블록으로 풀리고 QUOTE_CHILD_DOWNGRADED 경고가 1회 기록된다", () => {
    const { document, warnings } = importOk("> ## 제목\n>\n> 본문");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "heading",
        level: 2,
        content: [{ text: "제목" }],
      },
      { id: "markdown-2", type: "quote", content: [{ text: "본문" }] },
    ]);
    expect(warnings).toEqual([
      {
        kind: "QUOTE_CHILD_DOWNGRADED",
        blockId: "markdown-1",
        message: expect.stringContaining("heading"),
      },
    ]);
  });

  it("중첩 blockquote가 같은 규칙으로 재귀 분해되고 NESTED_QUOTE_FLATTENED 경고가 남는다", () => {
    const { document, warnings } = importOk("> 바깥\n>\n> > 안쪽");

    expect(document.blocks).toEqual([
      { id: "markdown-1", type: "quote", content: [{ text: "바깥" }] },
      { id: "markdown-2", type: "quote", content: [{ text: "안쪽" }] },
    ]);
    expect(warnings).toEqual([
      {
        kind: "NESTED_QUOTE_FLATTENED",
        blockId: "markdown-2",
        message: expect.stringContaining("blockquote"),
      },
    ]);
  });

  it("blockquote import에 UNSUPPORTED_BLOCK_DOWNGRADED가 더 이상 나지 않는다", () => {
    const { warnings } = importOk("> A\n>\n> > 안쪽\n>\n> ## 제목");

    expect(
      warnings.some(
        (warning) => warning.kind === "UNSUPPORTED_BLOCK_DOWNGRADED",
      ),
    ).toBe(false);
  });
});

describe("D8 폐쇄성", () => {
  it("blockquote·h4-h6·thematicBreak·표를 포함한 대표 GFM 문서를 import한 결과의 strict export가 항상 성공한다", () => {
    const source = [
      "#### 소제목4",
      "",
      "##### 소제목5",
      "",
      "###### 소제목6",
      "",
      "> 인용문 1",
      ">",
      "> 인용문 2",
      "",
      "---",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");

    const { document } = importOk(source);

    const exported = exportMarkdown(document, { mode: "strict" });
    expect(exported.ok).toBe(true);
  });
});
