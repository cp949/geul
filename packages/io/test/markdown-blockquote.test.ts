/**
 * GFM export/import의 quote ↔ blockquote 매핑(BLK-005 재평가, Issue #151,
 * roadmap-workflow RD-001 DELTA-03)을 검증한다. `blockquoteToBlocks`는
 * `listBlocksFromNode`와 동일한 패턴을 쓴다 — mdast `blockquote`의 첫 자식이
 * paragraph면 그 내용을 quote의 own content로 삼고, 나머지 자식은
 * `blocksFromNodes`로 재귀 변환해 quote의 children으로 둔다(첫 자식이
 * paragraph가 아니면 own content는 빈 배열이고 첫 자식부터 children이다).
 * DELTA-02가 만든 export(quote children → GFM blockquote 중첩)와 대칭이라
 * 더 이상 문단마다 형제 quote로 쪼개거나 비문단 자식을 quote 밖으로
 * 다운그레이드하지 않는다 — `QUOTE_CHILD_DOWNGRADED`/`NESTED_QUOTE_FLATTENED`
 * 경고는 이 DELTA에서 제거됐다(만드는 코드가 없다). quote children의 GFM
 * 손실(strict 거절 대상, own-empty 모호성)과 export→import 전체 round-trip은
 * markdown-quote-loss.test.ts가 담당한다.
 */
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";
import {
  buildDocument,
  quoteBlock,
} from "./fixtures/quote-divider-document.js";
import { expectRoundTrip, importOk } from "./markdown-round-trip-support.js";

describe("quote ↔ blockquote 왕복", () => {
  it("children 없는 quote가 > 로 export되고 re-import로 원본이 복원된다", () => {
    const markdown = expectRoundTrip(
      buildDocument([quoteBlock("markdown-1", "인용")]),
    );

    expect(markdown).toContain("> 인용");
  });

  it("> A\\n>\\n> B import가 quote 하나(own content=A, children=[paragraph B])를 만든다(더 이상 형제로 쪼개지 않는다)", () => {
    const { document, warnings } = importOk("> A\n>\n> B");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [{ text: "A" }],
        children: [
          { id: "markdown-2", type: "paragraph", content: [{ text: "B" }] },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });
});

describe("blockquote 안 비문단·중첩 자식", () => {
  it("중첩 blockquote 안 번호 목록이 quote 계층 그대로 보존되고 각 목록은 quote 경계를 넘지 않고 독립적으로 1부터 시작한다", () => {
    const { document, warnings } = importOk("> 1. 바깥\n>\n> > 1. 안쪽");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [],
        children: [
          {
            id: "markdown-2",
            type: "numberedListItem",
            content: [{ text: "바깥" }],
          },
          {
            id: "markdown-3",
            type: "quote",
            content: [],
            children: [
              {
                id: "markdown-4",
                type: "numberedListItem",
                content: [{ text: "안쪽" }],
              },
            ],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("blockquote 안 목록이 quote children으로 보존된다(quote 밖으로 다운그레이드되지 않는다)", () => {
    const { document, warnings } = importOk("> - 항목");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [],
        children: [
          {
            id: "markdown-2",
            type: "bulletListItem",
            content: [{ text: "항목" }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("blockquote 안 heading·paragraph가 하나의 quote 아래 children으로 보존된다(더 이상 quote 밖 형제로 갈라지지 않는다)", () => {
    const { document, warnings } = importOk("> ## 제목\n>\n> 본문");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [],
        children: [
          {
            id: "markdown-2",
            type: "heading",
            level: 2,
            content: [{ text: "제목" }],
          },
          { id: "markdown-3", type: "paragraph", content: [{ text: "본문" }] },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("중첩 blockquote가 own content(첫 paragraph)와 children(quote-in-quote)으로 재귀 보존된다", () => {
    const { document, warnings } = importOk("> 바깥\n>\n> > 안쪽");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "quote",
        content: [{ text: "바깥" }],
        children: [
          { id: "markdown-2", type: "quote", content: [{ text: "안쪽" }] },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("blockquote import에 경고가 전혀 나지 않는다(paragraph·중첩 quote·heading 조합)", () => {
    const { warnings } = importOk("> A\n>\n> > 안쪽\n>\n> ## 제목");

    expect(warnings).toEqual([]);
  });
});

describe("GFM 폐쇄성", () => {
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
