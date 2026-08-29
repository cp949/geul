/**
 * Issue #38 슬라이스 3이 저장 모델에 더하는 계약을 검증한다 — heading level
 * 4·5·6 수용, quote 블록(content + children)의 파싱과 재귀 검증, divider
 * 블록(id·type만 갖는 리프)의 엄격 거절, 그리고 전역 ID 유일성·깊이 상한이
 * quote children 트리에도 적용된다는 것. 기존 paragraph/heading의 children
 * 계약은 document-nesting.test.ts가, 평면 문서 계약은 document.test.ts가
 * 소유한다.
 */
import { describe, expect, it } from "vitest";

import type { Block, DividerBlock, QuoteBlock } from "../src/index.js";
import { parseDocument } from "../src/index.js";
import { buildNestedChainDocument } from "./nested-chain-support.js";

/**
 * 블록 배열 하나를 formatVersion 1·revision 0 문서로 감싼다. 이 파일의
 * 모든 fixture가 문서 봉투가 아니라 블록 형상만 다루므로 봉투는 한 곳에서
 * 만든다.
 */
const documentOf = (blocks: unknown[]) => ({
  formatVersion: 1,
  revision: 0,
  blocks,
});

/**
 * 주어진 level의 heading 하나로 된 문서를 만든다. level 수용·거절 테스트가
 * 같은 형상에서 level만 바꿔 비교하도록 한다.
 */
const headingDocument = (level: number) =>
  documentOf([
    {
      id: `heading-${level}`,
      type: "heading",
      level,
      content: [{ text: `level ${level}` }],
    },
  ]);

describe("heading level 1-6", () => {
  it("level 4·5·6 heading 문서가 parseDocument를 통과하고 level을 보존한다", () => {
    for (const level of [4, 5, 6]) {
      const input = headingDocument(level);
      expect(parseDocument(input)).toEqual({ ok: true, value: input });
    }
  });

  it("level 0과 7은 DOCUMENT_INVALID로 거절한다", () => {
    for (const level of [0, 7]) {
      expect(parseDocument(headingDocument(level))).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "level"] },
      });
    }
  });
});

describe("quote 블록", () => {
  it("content와 children을 가진 quote 문서가 파싱·검증을 통과하고 구조를 보존한다", () => {
    const input = documentOf([
      {
        id: "quote-1",
        type: "quote",
        content: [
          { text: "quoted", marks: [{ type: "bold" }, { type: "italic" }] },
        ],
        children: [
          {
            id: "child-paragraph",
            type: "paragraph",
            content: [{ text: "p" }],
          },
          {
            id: "child-quote",
            type: "quote",
            content: [{ text: "nested" }],
            children: [
              { id: "grandchild", type: "heading", level: 6, content: [] },
            ],
          },
        ],
      },
    ]);

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });

  it("quote 자신의 content mark 순서 위반이 DOCUMENT_INVALID다", () => {
    // 정규 순서는 bold가 italic보다 앞이다 — 뒤집힌 순서는 index 0에서 어긋난다.
    const input = documentOf([
      {
        id: "quote-1",
        type: "quote",
        content: [
          { text: "wrong", marks: [{ type: "italic" }, { type: "bold" }] },
        ],
      },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "marks", 0],
      },
    });
  });

  it("quote children 깊은 위치(깊이 3)의 텍스트 위반이 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      {
        id: "depth-1",
        type: "quote",
        content: [],
        children: [
          {
            id: "depth-2",
            type: "quote",
            content: [],
            children: [
              {
                id: "depth-3",
                type: "quote",
                content: [{ text: "bad\u0000text" }],
              },
            ],
          },
        ],
      },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "children", 0, "children", 0, "content", 0, "text"],
      },
    });
  });
});

describe("divider 블록", () => {
  it("id·type만 있는 divider가 통과한다", () => {
    const input = documentOf([{ id: "divider-1", type: "divider" }]);

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });

  it("divider에 content가 있으면 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      { id: "divider-1", type: "divider", content: [{ text: "smuggled" }] },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });
  });

  it("divider에 children이 있으면 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      {
        id: "divider-1",
        type: "divider",
        children: [{ id: "smuggled", type: "paragraph", content: [] }],
      },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });
  });
});

describe("전역 ID 유일성·깊이 상한의 quote 편입", () => {
  it("quote children 안의 블록이 최상위 블록과 같은 id를 가지면 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      {
        id: "duplicate",
        type: "quote",
        content: [],
        children: [
          {
            id: "inner",
            type: "quote",
            content: [],
            children: [{ id: "duplicate", type: "paragraph", content: [] }],
          },
        ],
      },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "children", 0, "children", 0, "id"],
      },
    });
  });

  it("quote children으로 정확히 64단계는 통과하고 65단계는 DOCUMENT_LIMIT_EXCEEDED다", () => {
    const within = buildNestedChainDocument(64, "quote");
    expect(parseDocument(within)).toEqual({ ok: true, value: within });

    expect(parseDocument(buildNestedChainDocument(65, "quote"))).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_LIMIT_EXCEEDED" },
    });
  });

  it("divider가 paragraph·heading·quote의 자식 위치에 있어도 유효하다", () => {
    const input = documentOf([
      {
        id: "paragraph-1",
        type: "paragraph",
        content: [],
        children: [{ id: "divider-in-paragraph", type: "divider" }],
      },
      {
        id: "heading-1",
        type: "heading",
        level: 4,
        content: [],
        children: [{ id: "divider-in-heading", type: "divider" }],
      },
      {
        id: "quote-1",
        type: "quote",
        content: [],
        children: [{ id: "divider-in-quote", type: "divider" }],
      },
    ]);

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });

  it("quote children 안의 표에도 표 전용 검증이 적용돼 열 너비 위반이 DOCUMENT_INVALID다", () => {
    // 이 테스트가 지는 변이: visitTableBlocks가 quote children으로 내려가지
    // 않으면(quote를 divider처럼 리프로 취급하면) 표가 순회에서 빠져 통과한다.
    const input = documentOf([
      {
        id: "quote-1",
        type: "quote",
        content: [],
        children: [
          {
            id: "table-1",
            type: "table",
            columns: [{ id: "col-1", width: 0 }],
            rows: [
              {
                id: "row-1",
                cells: [
                  {
                    id: "cell-1",
                    columnId: "col-1",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [],
                  },
                ],
              },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
        ],
      },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "children", 0, "columns", 0, "width"],
      },
    });
  });
});

describe("공개 export", () => {
  it("QuoteBlock·DividerBlock·Block 타입을 패키지 index에서 import해 값을 만들 수 있다", () => {
    // 판정은 typecheck(tsconfig.test.json)가 한다 — export가 빠지면 import와
    // satisfies가 컴파일 오류다. 런타임 단언은 값이 Block union에 실제로
    // 들어간다는 것만 확인한다.
    const quote = {
      id: "quote-1",
      type: "quote",
      content: [{ text: "q" }],
      children: [{ id: "divider-1", type: "divider" }],
    } satisfies QuoteBlock;
    const divider = { id: "divider-2", type: "divider" } satisfies DividerBlock;
    const blocks = [quote, divider] satisfies Block[];

    expect(parseDocument(documentOf(blocks))).toMatchObject({ ok: true });
  });
});
