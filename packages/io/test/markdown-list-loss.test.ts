/**
 * GFM 목록 안팎에서 표현 불가능한 paragraph·heading·quote children만
 * NESTED_CHILDREN으로 분류하고 lossy 평탄화가 목록 계층을 보존하는지 검증한다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  analyzeMarkdownLoss,
  exportMarkdown,
  importMarkdown,
} from "../src/index.js";

type BlockMeaning = Record<string, unknown>;

/**
 * 안정 ID만 제거해 lossy export 뒤 남아야 하는 블록 계층과 형제 순서를
 * 비교한다. 이 fixture에는 ID 참조를 가진 표가 없다.
 */
const blockMeaning = (block: Block): BlockMeaning => {
  const withoutId = Object.fromEntries(
    Object.entries(block).filter(([key]) => key !== "id" && key !== "children"),
  );
  if (!("children" in block) || block.children === undefined) {
    return withoutId;
  }
  return {
    ...withoutId,
    children: block.children.map(blockMeaning),
  };
};

describe("GFM 목록 children 손실 분류", () => {
  it("빈 목록 content와 첫 paragraph child의 경계는 strict export에서 부모 목록의 NESTED_CHILDREN으로 거절한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "empty-list-parent",
          type: "bulletListItem",
          content: [],
          children: [
            {
              id: "first-paragraph",
              type: "paragraph",
              content: [{ text: "승격될 문단" }],
            },
            {
              id: "numbered-child",
              type: "numberedListItem",
              startNumber: 3,
              content: [{ text: "하위 번호" }],
            },
          ],
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "NESTED_CHILDREN",
            blockId: "empty-list-parent",
            message: expect.stringContaining("empty-list-parent"),
          },
        ],
      },
    });
  });

  it("lossy export는 첫 paragraph child를 빈 목록 content로 승격하고 나머지 목록 계층을 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "empty-list-parent",
          type: "bulletListItem",
          content: [],
          children: [
            {
              id: "first-paragraph",
              type: "paragraph",
              content: [{ text: "승격될 문단" }],
            },
            {
              id: "numbered-child",
              type: "numberedListItem",
              startNumber: 3,
              content: [{ text: "하위 번호" }],
              children: [
                {
                  id: "bullet-grandchild",
                  type: "bulletListItem",
                  content: [{ text: "깊은 글머리" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toEqual({
      markdown: "* 승격될 문단\n\n  3. 하위 번호\n\n     * 깊은 글머리\n",
      warnings: [
        {
          kind: "NESTED_CHILDREN",
          blockId: "empty-list-parent",
          message: expect.stringContaining("empty-list-parent"),
        },
      ],
    });

    const imported = importMarkdown(exported.value.markdown);
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);
    expect(imported.value.warnings).toEqual([]);
    expect(imported.value.document.blocks.map(blockMeaning)).toEqual([
      {
        type: "bulletListItem",
        content: [{ text: "승격될 문단" }],
        children: [
          {
            type: "numberedListItem",
            startNumber: 3,
            content: [{ text: "하위 번호" }],
            children: [
              {
                type: "bulletListItem",
                content: [{ text: "깊은 글머리" }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("승격된 첫 child가 비어 있고 그 뒤도 paragraph면 lossy export가 빈 own paragraph로 경계를 다시 표시한다", () => {
    // flattenBlocks는 한 블록당 한 번만 승격한다 — 빈 목록 content에 빈
    // paragraph를 승격해도 그 결과가 다시 "content 비고 첫 child가
    // paragraph"인 채로 남을 수 있다(2번째 child가 paragraph인 경우). 이
    // 잔여 모호함은 listNode가 own paragraph를 materialize해 표시한다.
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "residual",
          type: "bulletListItem",
          content: [],
          children: [
            { id: "p1", type: "paragraph", content: [] },
            { id: "p2", type: "paragraph", content: [{ text: "실제 텍스트" }] },
          ],
        },
      ],
    };

    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toEqual({
      markdown: "*\n\n  실제 텍스트\n",
      warnings: [
        {
          kind: "NESTED_CHILDREN",
          blockId: "residual",
          message: expect.stringContaining("residual"),
        },
      ],
    });
  });

  it("paragraph·heading·quote children만 strict export에서 NESTED_CHILDREN으로 거절한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-parent",
          type: "paragraph",
          content: [{ text: "문단" }],
          children: [{ id: "paragraph-child", type: "divider" }],
        },
        {
          id: "heading-parent",
          type: "heading",
          level: 2,
          content: [{ text: "제목" }],
          children: [{ id: "heading-child", type: "codeBlock", content: [] }],
        },
        {
          id: "quote-parent",
          type: "quote",
          content: [{ text: "인용" }],
          children: [
            {
              id: "list-child",
              type: "bulletListItem",
              content: [{ text: "목록" }],
              children: [
                {
                  id: "nested-list-child",
                  type: "numberedListItem",
                  startNumber: 3,
                  content: [{ text: "하위 목록" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const expectedLosses = [
      {
        kind: "NESTED_CHILDREN",
        blockId: "paragraph-parent",
        message: expect.stringContaining("paragraph-parent"),
      },
      {
        kind: "NESTED_CHILDREN",
        blockId: "heading-parent",
        message: expect.stringContaining("heading-parent"),
      },
      {
        kind: "NESTED_CHILDREN",
        blockId: "quote-parent",
        message: expect.stringContaining("quote-parent"),
      },
    ];

    expect(analyzeMarkdownLoss(document)).toEqual(expectedLosses);
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: expectedLosses,
      },
    });
  });

  it("lossy export는 표현 불가능한 부모만 형제로 평탄화하고 하위 목록 계층은 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "list-parent",
          type: "bulletListItem",
          content: [{ text: "부모" }],
          children: [
            {
              id: "paragraph-parent",
              type: "paragraph",
              content: [{ text: "문단" }],
              children: [
                {
                  id: "numbered-child",
                  type: "numberedListItem",
                  startNumber: 3,
                  content: [{ text: "번호" }],
                  children: [
                    {
                      id: "bullet-grandchild",
                      type: "bulletListItem",
                      content: [{ text: "깊은 목록" }],
                    },
                  ],
                },
              ],
            },
            {
              id: "heading-parent",
              type: "heading",
              level: 2,
              content: [{ text: "제목" }],
              children: [{ id: "divider-child", type: "divider" }],
            },
            {
              id: "quote-parent",
              type: "quote",
              content: [{ text: "인용" }],
              children: [
                {
                  id: "code-child",
                  type: "codeBlock",
                  content: [{ text: "코드" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value.warnings).toEqual([
      {
        kind: "NESTED_CHILDREN",
        blockId: "paragraph-parent",
        message: expect.stringContaining("paragraph-parent"),
      },
      {
        kind: "NESTED_CHILDREN",
        blockId: "heading-parent",
        message: expect.stringContaining("heading-parent"),
      },
      {
        kind: "NESTED_CHILDREN",
        blockId: "quote-parent",
        message: expect.stringContaining("quote-parent"),
      },
    ]);
    expect(exported.value.markdown).toBe(
      [
        "* 부모",
        "",
        "  문단",
        "",
        "  3. 번호",
        "",
        "     * 깊은 목록",
        "",
        "  ## 제목",
        "",
        "  ---",
        "",
        "  > 인용",
        "",
        "  ```",
        "  코드",
        "  ```",
        "",
      ].join("\n"),
    );

    const imported = importMarkdown(exported.value.markdown);
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);
    expect(imported.value.warnings).toEqual([]);
    expect(imported.value.document.blocks.map(blockMeaning)).toEqual([
      {
        type: "bulletListItem",
        content: [{ text: "부모" }],
        children: [
          { type: "paragraph", content: [{ text: "문단" }] },
          {
            type: "numberedListItem",
            startNumber: 3,
            content: [{ text: "번호" }],
            children: [
              {
                type: "bulletListItem",
                content: [{ text: "깊은 목록" }],
              },
            ],
          },
          { type: "heading", level: 2, content: [{ text: "제목" }] },
          { type: "divider" },
          { type: "quote", content: [{ text: "인용" }] },
          { type: "codeBlock", content: [{ text: "코드" }] },
        ],
      },
    ]);
  });
});
