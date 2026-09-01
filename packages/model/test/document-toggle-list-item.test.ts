/**
 * toggleListItem 블록의 공개 저장 모델과 재귀 검증을 확인한다(spec §4.4,
 * Issue #38 슬라이스 6 RD-003). 로드맵 D2 정정 — 이 타입은 ListItemBlockType이
 * 아닌 NestableBlockType에 직접 추가된다 — 이 실제로 재귀 nestable 분기를
 * 타는지, 표 전용 분기로 잘못 캐스트되지 않는지를 회귀로 고정한다.
 */
import { describe, expect, it } from "vitest";

import {
  type Block,
  parseDocument,
  type ToggleListItemBlock,
} from "../src/index.js";

/** 블록 배열 하나를 formatVersion 1·revision 0 문서로 감싼다. */
const documentOf = (blocks: unknown[]) => ({
  formatVersion: 1,
  revision: 0,
  blocks,
});

/**
 * toggleListItem children만 이어 붙인 지정 깊이의 문서를 만든다. 목록 항목과
 * 마찬가지로 64단 깊이 상한을 공유하는지 검증한다.
 */
const nestedToggleListDocument = (depth: number): unknown => {
  let item: unknown = {
    id: `toggle-${depth}`,
    type: "toggleListItem",
    content: [],
  };
  for (let current = depth - 1; current >= 1; current -= 1) {
    item = {
      id: `toggle-${current}`,
      type: "toggleListItem",
      content: [],
      children: [item],
    };
  }
  return { formatVersion: 1, revision: 0, blocks: [item] };
};

describe("toggleListItem 공개 모델", () => {
  it("content·collapsed·children을 가진 toggleListItem을 공개 Block union으로 소비하고 parseDocument가 보존한다", () => {
    const toggle: ToggleListItemBlock = {
      id: "toggle-1",
      type: "toggleListItem",
      content: [{ text: "토글 항목" }],
      collapsed: true,
      children: [
        { id: "child-1", type: "paragraph", content: [{ text: "자식" }] },
      ],
    };
    const blocks: Block[] = [toggle];
    const input = { formatVersion: 1, revision: 0, blocks };

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });

  it("collapsed가 없거나 false여도 유효하게 파싱된다(회귀 없음)", () => {
    for (const extra of [{}, { collapsed: false }]) {
      const input = documentOf([
        { id: "toggle-1", type: "toggleListItem", content: [], ...extra },
      ]);
      expect(parseDocument(input)).toEqual({ ok: true, value: input });
    }
  });
});

describe("toggleListItem strict 형상과 인라인 검증", () => {
  it("미선언 필드(예: 목록 항목 전용 startNumber)를 DOCUMENT_INVALID로 거절한다", () => {
    for (const extra of [{ startNumber: 1 }, { unexpected: true }]) {
      expect(
        parseDocument(
          documentOf([
            { id: "toggle-1", type: "toggleListItem", content: [], ...extra },
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
        id: "toggle-1",
        type: "toggleListItem",
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
});

describe("toggleListItem이 다른 nestable 블록과 동일한 재귀 검증을 받는다(D2 정정 회귀)", () => {
  it("표 전용 필드(columns/rows) 없이도 예외 없이 content 검증을 받는다 — 표 분기로 캐스트되지 않는다", () => {
    // 이 테스트가 지는 변이: toggleListItem이 isNestableBlockType에서 빠지면
    // validateBlocksAt이 이 블록을 표로 캐스트해 block.columns.entries()를
    // 호출하려다 TypeError로 죽거나(columns undefined), 표 전용 검증 부재로
    // 이 content 위반을 놓치고 통과시킨다.
    const input = documentOf([
      {
        id: "toggle-1",
        type: "toggleListItem",
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

  it("전역 ID 유일성이 toggleListItem children 트리 전체에 적용된다", () => {
    const input = documentOf([
      {
        id: "duplicate",
        type: "toggleListItem",
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

  it("children 안 임의 블록(표 포함)을 허용하고 표 전용 검증도 동일하게 적용된다", () => {
    const input = documentOf([
      {
        id: "toggle-1",
        type: "toggleListItem",
        content: [],
        children: [
          {
            id: "table-1",
            type: "table",
            columns: [{ id: "col-1", width: 99_999 }],
            rows: [],
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

  it("toggleListItem children도 64단까지 통과하고 65단부터 DOCUMENT_LIMIT_EXCEEDED다", () => {
    expect(parseDocument(nestedToggleListDocument(64))).toMatchObject({
      ok: true,
    });
    expect(parseDocument(nestedToggleListDocument(65))).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_LIMIT_EXCEEDED" },
    });
  });
});
