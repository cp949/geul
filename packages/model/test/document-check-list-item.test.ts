/**
 * checkListItem 블록의 공개 저장 모델과 재귀 검증을 확인한다(Issue #38
 * 슬라이스 6 RD-001). toggleListItem(RD-003)·bulletListItem/numberedListItem
 * (슬라이스5)과 같은 재귀 nestable 분기를 타는지, `checked` 필드 하나가
 * 저장 계약을 어떻게 좁히는지를 회귀로 고정한다.
 */
import { describe, expect, it } from "vitest";

import {
  type Block,
  type CheckListItemBlock,
  parseDocument,
} from "../src/index.js";

/** 블록 배열 하나를 formatVersion 1·revision 0 문서로 감싼다. */
const documentOf = (blocks: unknown[]) => ({
  formatVersion: 1,
  revision: 0,
  blocks,
});

/**
 * checkListItem children만 이어 붙인 지정 깊이의 문서를 만든다. 다른 목록
 * 항목과 마찬가지로 64단 깊이 상한을 공유하는지 검증한다.
 */
const nestedCheckListDocument = (depth: number): unknown => {
  let item: unknown = {
    id: `check-${depth}`,
    type: "checkListItem",
    content: [],
    checked: false,
  };
  for (let current = depth - 1; current >= 1; current -= 1) {
    item = {
      id: `check-${current}`,
      type: "checkListItem",
      content: [],
      checked: false,
      children: [item],
    };
  }
  return { formatVersion: 1, revision: 0, blocks: [item] };
};

describe("checkListItem 공개 모델", () => {
  it("content·checked·children을 가진 checkListItem을 공개 Block union으로 소비하고 parseDocument가 보존한다", () => {
    const checkItem: CheckListItemBlock = {
      id: "check-1",
      type: "checkListItem",
      content: [{ text: "체크 항목" }],
      checked: true,
      children: [
        { id: "child-1", type: "paragraph", content: [{ text: "자식" }] },
      ],
    };
    const blocks: Block[] = [checkItem];
    const input = { formatVersion: 1, revision: 0, blocks };

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });

  it.each([true, false])("checked: %s는 그대로 보존된다", (checked) => {
    const input = documentOf([
      { id: "check-1", type: "checkListItem", content: [], checked },
    ]);

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("checkListItem strict 형상과 checked 필드 검증", () => {
  it("checked 필드가 없는 checkListItem을 DOCUMENT_INVALID로 거절한다", () => {
    const input = documentOf([
      { id: "check-1", type: "checkListItem", content: [] },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "checked"],
      },
    });
  });

  it.each(["true", 1, null, undefined, {}])(
    "checked가 boolean이 아닌 값(%s)이면 DOCUMENT_INVALID로 거절한다",
    (checked) => {
      const input = documentOf([
        { id: "check-1", type: "checkListItem", content: [], checked },
      ]);

      // zod가 위반 값 종류에 따라 경로를 블록 루트(["blocks", 0]) 또는
      // 필드까지("checked" 추가)로 다르게 보고한다 — 두 경로 모두 유효한
      // DOCUMENT_INVALID이므로 code만 고정한다(document-list-items.test.ts의
      // 혼합 위반 테스트와 같은 선례).
      expect(parseDocument(input)).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID" },
      });
    },
  );

  it("미선언 필드(예: 목록 항목 전용 startNumber)를 DOCUMENT_INVALID로 거절한다", () => {
    for (const extra of [{ startNumber: 1 }, { unexpected: true }]) {
      expect(
        parseDocument(
          documentOf([
            {
              id: "check-1",
              type: "checkListItem",
              content: [],
              checked: false,
              ...extra,
            },
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
        id: "check-1",
        type: "checkListItem",
        checked: false,
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

describe("checkListItem이 다른 목록 항목과 동일한 재귀 검증을 받는다(D2 회귀)", () => {
  it("표 전용 필드(columns/rows) 없이도 예외 없이 content 검증을 받는다 — 표 분기로 캐스트되지 않는다", () => {
    // 이 테스트가 지는 변이: checkListItem이 isNestableBlockType에서 빠지면
    // validateBlocksAt이 이 블록을 표로 캐스트해 block.columns.entries()를
    // 호출하려다 TypeError로 죽거나(columns undefined), 표 전용 검증 부재로
    // 이 content 위반을 놓치고 통과시킨다.
    const input = documentOf([
      {
        id: "check-1",
        type: "checkListItem",
        checked: false,
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

  it("전역 ID 유일성이 checkListItem children 트리 전체에 적용된다", () => {
    const input = documentOf([
      {
        id: "duplicate",
        type: "checkListItem",
        checked: false,
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
        id: "check-1",
        type: "checkListItem",
        checked: false,
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

  it("checkListItem children도 64단까지 통과하고 65단부터 DOCUMENT_LIMIT_EXCEEDED다", () => {
    expect(parseDocument(nestedCheckListDocument(64))).toMatchObject({
      ok: true,
    });
    expect(parseDocument(nestedCheckListDocument(65))).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_LIMIT_EXCEEDED" },
    });
  });
});
