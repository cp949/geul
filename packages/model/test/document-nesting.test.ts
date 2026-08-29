/**
 * 중첩 블록(children)의 보존·재귀 검증·깊이 상한을 검증한다. 기존 평면
 * 문서 계약은 document.test.ts가 소유한다 — 이 파일은 DELTA-01(#38)이
 * 추가하는 children 관련 계약만 다룬다.
 */
import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/index.js";
import {
  buildNestedChainDocument,
  type NestedFixtureBlock,
} from "./nested-chain-support.js";

describe("children 필드 보존과 표 거절", () => {
  it("children이 있는 문서가 parseDocument 통과 후에도 children을 유지한다", () => {
    const input = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent",
          type: "paragraph",
          content: [{ text: "parent" }],
          children: [
            { id: "child", type: "paragraph", content: [{ text: "child" }] },
          ],
        },
      ],
    };

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });

  it("TableBlock에 children을 넣으면 DOCUMENT_INVALID로 거절되고 문서가 변경되지 않는다", () => {
    const input = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "table-1",
          type: "table",
          columns: [{ id: "col-1", width: 48 }],
          rows: [],
          headerRows: 0,
          headerColumns: 0,
          children: [{ id: "smuggled", type: "paragraph", content: [] }],
        },
      ],
    };

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
  });

  it("표를 다른 블록의 자식으로 넣는 것은 통과한다", () => {
    // 격자가 유효한 최소 표(1열 1행 1셀). 종전 fixture(rows: [])는 최상위
    // 배치라면 TABLE_GRID_INVALID(INVALID_GRID_SIZE)로 거절되는 무효 표였고,
    // 중첩 표가 표 전용 검증을 우회하던 결함 덕에 통과해 왔다(트랙-6 정정).
    const input = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent",
          type: "paragraph",
          content: [],
          children: [
            {
              id: "table-1",
              type: "table",
              columns: [{ id: "col-1", width: 48 }],
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
      ],
    };

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("트리 전체 재귀 검증", () => {
  it("서로 다른 깊이의 두 블록이 같은 id를 가지면 DOCUMENT_INVALID다", () => {
    const input = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "duplicate",
          type: "paragraph",
          content: [],
          children: [{ id: "duplicate", type: "paragraph", content: [] }],
        },
      ],
    };

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "children", 0, "id"],
      },
    });
  });

  it("깊이 3 이상에서 텍스트 위반이 있으면 DOCUMENT_INVALID로 거절된다", () => {
    const input = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "depth-1",
          type: "paragraph",
          content: [],
          children: [
            {
              id: "depth-2",
              type: "paragraph",
              content: [],
              children: [
                {
                  id: "depth-3",
                  type: "paragraph",
                  content: [{ text: "bad\u0000text" }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "children", 0, "children", 0, "content", 0, "text"],
      },
    });
  });
});

// 표 전용 검증(열 너비·셀 속성·크기 상한·격자)이 깊이와 무관하게 같은
// 규칙으로 적용되는지 확인하기 위해, 주어진 표 블록을 paragraph의 자식으로
// 감싼 문서를 만든다. 각 테스트는 최상위 배치라면 거절될 표를 그대로 넣는다.
const wrapTableAsChild = (table: Record<string, unknown>) => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "parent",
      type: "paragraph",
      content: [],
      children: [table],
    },
  ],
});

describe("중첩 표의 표 전용 검증(트랙-6 회귀)", () => {
  it("중첩 표의 열 너비 위반은 최상위와 동일하게 DOCUMENT_INVALID로 거절된다", () => {
    const input = wrapTableAsChild({
      id: "table-1",
      type: "table",
      columns: [{ id: "col-1", width: 99999 }],
      rows: [],
      headerRows: 0,
      headerColumns: 0,
    });

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "children", 0, "columns", 0, "width"],
      },
    });
  });

  it("중첩 표의 셀 rowSpan 위반은 최상위와 동일하게 DOCUMENT_INVALID로 거절된다", () => {
    const input = wrapTableAsChild({
      id: "table-1",
      type: "table",
      columns: [{ id: "col-1", width: 48 }],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "col-1",
              rowSpan: 0,
              columnSpan: 1,
              content: [],
            },
          ],
        },
      ],
      headerRows: 0,
      headerColumns: 0,
    });

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "children", 0, "rows", 0, "cells", 0, "rowSpan"],
      },
    });
  });

  it("중첩 표의 열 개수 상한 초과는 최상위와 동일하게 DOCUMENT_LIMIT_EXCEEDED로 거절된다", () => {
    const input = wrapTableAsChild({
      id: "table-1",
      type: "table",
      columns: Array.from({ length: 10001 }, (_, index) => ({
        id: `col-${index}`,
        width: 48,
      })),
      rows: [],
      headerRows: 0,
      headerColumns: 0,
    });

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_LIMIT_EXCEEDED",
        path: ["blocks", 0, "children", 0],
      },
    });
  });

  it("중첩 표의 미피복 격자는 최상위와 동일하게 TABLE_GRID_INVALID로 거절된다", () => {
    const input = wrapTableAsChild({
      id: "table-1",
      type: "table",
      columns: [
        { id: "col-1", width: 48 },
        { id: "col-2", width: 48 },
      ],
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
    });

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "TABLE_GRID_INVALID",
        path: ["blocks", 0, "children", 0],
      },
    });
  });
});

describe("MAX_NESTING_DEPTH=64 경계", () => {
  it("정확히 64단계 중첩 문서는 통과한다", () => {
    expect(parseDocument(buildNestedChainDocument(64))).toMatchObject({
      ok: true,
    });
  });

  it("65단계 중첩 문서는 DOCUMENT_LIMIT_EXCEEDED로 거절된다", () => {
    expect(parseDocument(buildNestedChainDocument(65))).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_LIMIT_EXCEEDED" },
    });
  });

  it("64단계 문서의 최심 블록에 빈 children 배열이 있어도 통과한다", () => {
    // children: []는 스키마상 유효하고 자식이 없다는 뜻이다 — 검증·변환의
    // 다른 층(validateBlocksAt, model-to-tiptap)은 전부 "자식 없음"으로
    // 접는데 깊이 카운터만 한 단계로 세면 정상 64단 외부 JSON이 오거절된다
    // (트랙-6 정정).
    const document = buildNestedChainDocument(64);
    let deepest = document.blocks[0] as NestedFixtureBlock;
    while (deepest.children !== undefined) {
      deepest = deepest.children[0] as NestedFixtureBlock;
    }
    deepest.children = [];

    expect(parseDocument(document)).toMatchObject({ ok: true });
  });
});

describe("재귀 검증 스택 안전(PIT-0034)", () => {
  it("5,000단 조작된 children 체인이 RangeError 없이 DOCUMENT_LIMIT_EXCEEDED를 반환한다", () => {
    const result = parseDocument(buildNestedChainDocument(5000));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_LIMIT_EXCEEDED" },
    });
  });
});
