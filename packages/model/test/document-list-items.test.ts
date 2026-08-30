/**
 * 글머리·번호 목록 항목의 공개 저장 모델과 재귀 검증을 확인한다.
 * 목록의 다음 편집·변환 슬라이스가 이 모델 계약만 소비하도록 고정한다.
 */
import { describe, expect, it } from "vitest";

import {
  type Block,
  type BulletListItemBlock,
  type NumberedListItemBlock,
  parseDocument,
} from "../src/index.js";

/**
 * startNumber만 바꾼 번호 목록 문서를 만든다.
 * 경계값 검증이 목록의 다른 유효성 조건에 가려지지 않게 한다.
 */
const numberedDocument = (startNumber?: number) => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "numbered-1",
      type: "numberedListItem",
      content: [],
      ...(startNumber === undefined ? {} : { startNumber }),
    },
  ],
});

/**
 * 목록 항목 children만 이어 붙인 지정 깊이의 문서를 만든다.
 * 목록도 기존 text block과 같은 64단 깊이 상한을 공유하는지 검증한다.
 */
const nestedBulletListDocument = (depth: number): unknown => {
  let item: unknown = {
    id: `bullet-${depth}`,
    type: "bulletListItem",
    content: [],
  };
  for (let current = depth - 1; current >= 1; current -= 1) {
    item = {
      id: `bullet-${current}`,
      type: "bulletListItem",
      content: [],
      children: [item],
    };
  }
  return { formatVersion: 1, revision: 0, blocks: [item] };
};

describe("목록 항목 공개 모델", () => {
  it("글머리와 번호 목록 항목을 공개 Block union으로 소비하고 parseDocument가 보존한다", () => {
    const bullet: BulletListItemBlock = {
      id: "bullet-1",
      type: "bulletListItem",
      content: [{ text: "글머리" }],
    };
    const numbered: NumberedListItemBlock = {
      id: "numbered-1",
      type: "numberedListItem",
      content: [{ text: "번호" }],
      startNumber: 7,
    };
    const blocks: Block[] = [bullet, numbered];
    const input = { formatVersion: 1, revision: 0, blocks };

    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("번호 목록 시작 번호 저장 범위", () => {
  it.each([undefined, 0, 999_999_999])(
    "startNumber %s는 저장 범위 안이라 통과한다",
    (startNumber) => {
      const input = numberedDocument(startNumber);

      expect(parseDocument(input)).toEqual({ ok: true, value: input });
    },
  );

  it.each([-1, 1_000_000_000, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "startNumber %s는 DOCUMENT_INVALID와 정확한 경로로 거절된다",
    (startNumber) => {
      expect(parseDocument(numberedDocument(startNumber))).toMatchObject({
        ok: false,
        error: {
          code: "DOCUMENT_INVALID",
          path: ["blocks", 0, "startNumber"],
        },
      });
    },
  );
});

describe("목록 항목 strict 형상과 인라인 검증", () => {
  it("글머리 목록의 startNumber와 미선언 필드를 DOCUMENT_INVALID로 거절한다", () => {
    for (const extra of [{ startNumber: 1 }, { unexpected: true }]) {
      expect(
        parseDocument({
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "bullet-1",
              type: "bulletListItem",
              content: [],
              ...extra,
            },
          ],
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
      });
    }
  });

  it("번호 목록의 미선언 필드와 목록 항목의 잘못된 content·mark·id를 DOCUMENT_INVALID로 거절한다", () => {
    const invalidBlocks = [
      {
        id: "numbered-1",
        type: "numberedListItem",
        content: [],
        unexpected: true,
      },
      {
        id: "content-1",
        type: "bulletListItem",
        content: [{ text: "bad\u0000text" }],
      },
      {
        id: "mark-1",
        type: "numberedListItem",
        content: [{ text: "text", marks: [{ type: "bold" }, { type: "bold" }] }],
      },
      { id: "", type: "bulletListItem", content: [] },
    ];

    for (const block of invalidBlocks) {
      expect(
        parseDocument({ formatVersion: 1, revision: 0, blocks: [block] }),
      ).toMatchObject({ ok: false, error: { code: "DOCUMENT_INVALID" } });
    }
  });
});

describe("목록 항목 children 재귀 계약", () => {
  it("children에 임의 Block을 보존하고 중첩 CodeBlock language alias를 canonicalize한다", () => {
    const input = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "numbered-1",
          type: "numberedListItem",
          content: [],
          children: [
            { id: "divider-1", type: "divider" },
            {
              id: "code-1",
              type: "codeBlock",
              language: " JS ",
              content: [{ text: "const value = 1;" }],
            },
            {
              id: "paragraph-1",
              type: "paragraph",
              content: [{ text: "아래 문단" }],
            },
          ],
        },
      ],
    };

    expect(parseDocument(input)).toEqual({
      ok: true,
      value: {
        ...input,
        blocks: [
          {
            ...input.blocks[0]!,
            children: [
              input.blocks[0]!.children[0]!,
              { ...input.blocks[0]!.children[1]!, language: "javascript" },
              input.blocks[0]!.children[2]!,
            ],
          },
        ],
      },
    });
  });

  it("목록 children 안 표도 같은 표 검증을 받고 전역 중복 id를 DOCUMENT_INVALID로 거절한다", () => {
    const input = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "duplicate",
          type: "bulletListItem",
          content: [],
          children: [
            {
              id: "table-1",
              type: "table",
              columns: [{ id: "column-1", width: 99_999 }],
              rows: [],
              headerRows: 0,
              headerColumns: 0,
            },
            { id: "duplicate", type: "paragraph", content: [] },
          ],
        },
      ],
    };

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "children", 1, "id"],
      },
    });
  });

  it("목록 children 안 표의 열 너비 위반은 정확한 DOCUMENT_INVALID 경로로 거절된다", () => {
    expect(
      parseDocument({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "bullet-1",
            type: "bulletListItem",
            content: [],
            children: [
              {
                id: "table-1",
                type: "table",
                columns: [{ id: "column-1", width: 99_999 }],
                rows: [],
                headerRows: 0,
                headerColumns: 0,
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "children", 0, "columns", 0, "width"],
      },
    });
  });

  it("목록 children도 64단까지 통과하고 65단부터 DOCUMENT_LIMIT_EXCEEDED다", () => {
    expect(parseDocument(nestedBulletListDocument(64))).toMatchObject({
      ok: true,
    });
    expect(parseDocument(nestedBulletListDocument(65))).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_LIMIT_EXCEEDED" },
    });
  });
});
