/**
 * heading의 isToggleable/collapsed 저장 불변식을 검증한다(spec §4.1, Issue
 * #38 슬라이스 6 RD-003). collapsed는 isToggleable: true인 heading만 가질 수
 * 있다 — 위반은 DOCUMENT_INVALID로 위반 heading의 path를 가리키며 거절된다.
 * level 1-6 자체 계약은 document-heading-quote-divider.test.ts가 소유한다 —
 * 이 파일은 새 필드 두 개만 다룬다.
 */
import { describe, expect, it } from "vitest";

import type { HeadingBlock } from "../src/index.js";
import { parseDocument } from "../src/index.js";

/** 블록 배열 하나를 formatVersion 1·revision 0 문서로 감싼다. */
const documentOf = (blocks: unknown[]) => ({
  formatVersion: 1,
  revision: 0,
  blocks,
});

describe("heading isToggleable/collapsed 불변식", () => {
  it("collapsed: true이면서 isToggleable이 없는 heading은 DOCUMENT_INVALID로 거절되고 path가 그 heading의 collapsed를 가리킨다", () => {
    const input = documentOf([
      {
        id: "heading-1",
        type: "heading",
        level: 1,
        content: [],
        collapsed: true,
      },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "collapsed"],
      },
    });
  });

  it("collapsed: true이면서 isToggleable: false인 heading도 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      {
        id: "heading-1",
        type: "heading",
        level: 1,
        content: [],
        isToggleable: false,
        collapsed: true,
      },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "collapsed"] },
    });
  });

  it("children 안(깊이 2)의 위반 heading도 정확한 path로 거절된다", () => {
    const input = documentOf([
      {
        id: "parent",
        type: "paragraph",
        content: [],
        children: [
          {
            id: "nested-heading",
            type: "heading",
            level: 2,
            content: [],
            collapsed: true,
          },
        ],
      },
    ]);

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "children", 0, "collapsed"],
      },
    });
  });

  it.each([
    ["collapsed 없음", {}],
    ["collapsed: false", { collapsed: false }],
    ["collapsed: true", { collapsed: true }],
  ])(
    "isToggleable: true + %s heading 문서가 유효하게 파싱되고 필드가 보존된다",
    (_label, extra) => {
      const input = documentOf([
        {
          id: "heading-1",
          type: "heading",
          level: 3,
          content: [{ text: "토글 제목" }],
          isToggleable: true,
          ...extra,
        },
      ]);

      expect(parseDocument(input)).toEqual({ ok: true, value: input });
    },
  );

  it("isToggleable/collapsed가 둘 다 없는 기존 heading은 그대로 통과한다(회귀 없음)", () => {
    const input = documentOf([
      {
        id: "heading-1",
        type: "heading",
        level: 1,
        content: [{ text: "제목" }],
      },
    ]);

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("공개 export", () => {
  it("HeadingBlock이 isToggleable/collapsed 필드를 typecheck 대상으로 허용한다", () => {
    // 판정은 typecheck(tsconfig.test.json)가 한다 — 필드가 타입에서 빠지면
    // satisfies가 컴파일 오류다.
    const heading = {
      id: "heading-1",
      type: "heading",
      level: 1,
      content: [],
      isToggleable: true,
      collapsed: true,
    } satisfies HeadingBlock;

    expect(parseDocument(documentOf([heading]))).toMatchObject({ ok: true });
  });
});
