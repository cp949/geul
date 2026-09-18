/**
 * callout 블록(BLK-020)의 공개 저장 모델과 재귀 검증을 확인한다(설계
 * `docs/specs/2026-09-18-callout-block-design.md` §2, Issue #209 RD-001).
 * paragraph/heading/quote/목록4종/toggleListItem이 공유하는 nestable 패턴을
 * 재사용하는 8번째 멤버라 toggleListItem 회귀 테스트(D2 정정 — 표 분기로
 * 잘못 캐스트되지 않는지)와 같은 구조를 그대로 적용한다.
 */
import { describe, expect, it } from "vitest";

import { type Block, type CalloutBlock, parseDocument } from "../src/index.js";

/** 블록 배열 하나를 formatVersion 1·revision 0 문서로 감싼다. */
const documentOf = (blocks: unknown[]) => ({
  formatVersion: 1,
  revision: 0,
  blocks,
});

/** callout children만 이어 붙인 지정 깊이의 문서를 만든다. */
const nestedCalloutDocument = (depth: number): unknown => {
  let item: unknown = {
    id: `callout-${depth}`,
    type: "callout",
    content: [],
  };
  for (let current = depth - 1; current >= 1; current -= 1) {
    item = {
      id: `callout-${current}`,
      type: "callout",
      content: [],
      children: [item],
    };
  }
  return { formatVersion: 1, revision: 0, blocks: [item] };
};

describe("callout 공개 모델", () => {
  it("content·icon·children을 가진 callout을 공개 Block union으로 소비하고 parseDocument가 보존한다", () => {
    const callout: CalloutBlock = {
      id: "callout-1",
      type: "callout",
      content: [{ text: "안내" }],
      icon: "💡",
      children: [
        { id: "child-1", type: "paragraph", content: [{ text: "자식" }] },
      ],
    };
    const blocks: Block[] = [callout];
    const input = { formatVersion: 1, revision: 0, blocks };

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });

  it("icon이 없어도 유효하게 파싱된다(optional)", () => {
    const input = documentOf([
      { id: "callout-1", type: "callout", content: [] },
    ]);
    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("callout strict 형상과 인라인 검증", () => {
  it("미선언 필드(예: 목록 항목 전용 startNumber)를 DOCUMENT_INVALID로 거절한다", () => {
    for (const extra of [{ startNumber: 1 }, { unexpected: true }]) {
      expect(
        parseDocument(
          documentOf([
            { id: "callout-1", type: "callout", content: [], ...extra },
          ]),
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
      });
    }
  });

  it("content mark 순서 위반을 DOCUMENT_INVALID로 거절한다", () => {
    const input = documentOf([
      {
        id: "callout-1",
        type: "callout",
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

  it("빈 문자열 icon을 DOCUMENT_INVALID로 거절한다", () => {
    const input = documentOf([
      { id: "callout-1", type: "callout", content: [], icon: "" },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "icon"] },
    });
  });

  it("제어문자를 포함한 icon을 DOCUMENT_INVALID로 거절한다", () => {
    const input = documentOf([
      {
        id: "callout-1",
        type: "callout",
        content: [],
        icon: "💡" + String.fromCharCode(0),
      },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "icon"] },
    });
  });

  it("backgroundColor 정규형 검증(TextBlockProps)이 callout에도 적용된다", () => {
    const input = documentOf([
      {
        id: "callout-1",
        type: "callout",
        content: [],
        backgroundColor: "#fef7e0",
      },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "backgroundColor"],
      },
    });
  });
});

describe("callout이 다른 nestable 블록과 동일한 재귀 검증을 받는다", () => {
  it("표 전용 필드(columns/rows) 없이도 예외 없이 content 검증을 받는다 — 표 분기로 캐스트되지 않는다", () => {
    // 이 테스트가 지는 변이: callout이 isNestableBlockType에서 빠지면
    // validateBlocksAt이 이 블록을 표로 캐스트해 block.columns.entries()를
    // 호출하려다 TypeError로 죽거나(columns undefined), 표 전용 검증 부재로
    // 이 content 위반을 놓치고 통과시킨다(toggleListItem D2 정정과 동일 위험).
    const input = documentOf([
      {
        id: "callout-1",
        type: "callout",
        content: [{ text: "bad" + String.fromCharCode(0) + "text" }],
      },
    ]);

    expect(() => parseDocument(input)).not.toThrow();
    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "content", 0, "text"],
      },
    });
  });

  it("전역 ID 유일성이 callout children 트리 전체에 적용된다", () => {
    const input = documentOf([
      {
        id: "duplicate",
        type: "callout",
        content: [],
        children: [{ id: "duplicate", type: "paragraph", content: [] }],
      },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "children", 0, "id"],
      },
    });
  });

  it("callout children도 64단까지 통과하고 65단부터 DOCUMENT_LIMIT_EXCEEDED다", () => {
    expect(parseDocument(nestedCalloutDocument(64))).toMatchObject({
      ok: true,
    });
    expect(parseDocument(nestedCalloutDocument(65))).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_LIMIT_EXCEEDED" },
    });
  });
});
