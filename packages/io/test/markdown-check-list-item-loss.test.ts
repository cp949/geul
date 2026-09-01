/**
 * 체크 목록의 GFM 중첩 손실 정책이 bulletListItem/numberedListItem과
 * 동일한지 fixture로 고정한다(RD-002 완료 조건 3번). spec §7.2는 체크
 * 목록을 "GFM이 직접 표현 가능한 것"(중첩 포함)으로 명시한다 — 별도
 * 규칙이 아니라 loss-analysis.ts의 기존 `isListItemBlockType` 기반 정책이
 * 이미 checkListItem에도 적용됨을 검증한다.
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
 * GFM이 보존하지 않는 안정 ID만 제거해 재귀 구조와 순서를 비교한다.
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

describe("체크 목록 GFM 중첩 손실 정책", () => {
  it("paragraph·heading·quote·divider·CodeBlock·list 자식을 손실 없이 재귀 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent",
          type: "checkListItem",
          checked: true,
          content: [{ text: "부모" }],
          children: [
            {
              id: "paragraph",
              type: "paragraph",
              content: [{ text: "후속 문단" }],
            },
            {
              id: "heading",
              type: "heading",
              level: 2,
              content: [{ text: "제목" }],
            },
            { id: "quote", type: "quote", content: [{ text: "인용" }] },
            { id: "divider", type: "divider" },
            {
              id: "code",
              type: "codeBlock",
              language: "typescript",
              content: [{ text: "코드" }],
            },
            {
              id: "child-list",
              type: "bulletListItem",
              content: [{ text: "하위 글머리" }],
            },
          ],
        },
      ],
    };

    expect(analyzeMarkdownLoss(document)).toEqual([]);
    const exported = exportMarkdown(document, { mode: "strict" });
    expect(exported).toEqual({
      ok: true,
      value:
        "* [x] 부모\n\n  후속 문단\n\n  ## 제목\n\n  > 인용\n\n  ---\n\n  ```typescript\n  코드\n  ```\n\n  * 하위 글머리\n",
    });
    if (!exported.ok) return;

    const imported = importMarkdown(exported.value);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.warnings).toEqual([]);
    expect(imported.value.document.blocks.map(blockMeaning)).toEqual(
      document.blocks.map(blockMeaning),
    );
  });

  it("빈 own content와 첫 paragraph child의 경계는 bulletListItem과 동일하게 strict export에서 NESTED_CHILDREN으로 거절한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "empty-list-parent",
          type: "checkListItem",
          checked: true,
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

  it("같은 경계에서 lossy export는 첫 paragraph를 own content로 승격하고 checked를 유지한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "empty-list-parent",
          type: "checkListItem",
          checked: true,
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

    const exported = exportMarkdown(document, { mode: "lossy" });
    expect(exported).toEqual({
      ok: true,
      value: {
        markdown: "* [x] 승격될 문단\n\n  3. 하위 번호\n",
        warnings: [
          {
            kind: "NESTED_CHILDREN",
            blockId: "empty-list-parent",
            message: expect.stringContaining("empty-list-parent"),
          },
        ],
      },
    });
  });
});
