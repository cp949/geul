import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";

describe("Markdown 강등 경고", () => {
  it("목록 항목과 중첩 항목의 경계를 경고와 함께 문단으로 보존한다", () => {
    const result = importMarkdown(
      "- First item\n- Second item\n  - Nested item",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "paragraph",
        content: [{ text: "First item" }],
      },
      {
        id: "markdown-2",
        type: "paragraph",
        content: [{ text: "Second item" }],
      },
      {
        id: "markdown-3",
        type: "paragraph",
        content: [{ text: "Nested item" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "LIST_DOWNGRADED",
        blockId: "markdown-1",
      }),
      expect.objectContaining({
        kind: "LIST_DOWNGRADED",
        blockId: "markdown-2",
      }),
      expect.objectContaining({
        kind: "LIST_DOWNGRADED",
        blockId: "markdown-3",
      }),
    ]);
  });

  it("이미지의 alt와 대상 주소를 경고와 함께 보이는 텍스트로 보존한다", () => {
    const result = importMarkdown(
      "Before ![Diagram](https://example.com/image.png) after",
    );
    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [
                {
                  text: "Before Diagram (https://example.com/image.png) after",
                },
              ],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("fenced code를 강등 경고 없이 CodeBlock으로 보존한다", () => {
    expect(importMarkdown("```ts\nconst x = 1;\nconst y = 2;\n```")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "codeBlock",
              language: "typescript",
              content: [{ text: "const x = 1;\nconst y = 2;" }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("GFM 표의 열 정렬을 그 열의 모든 셀에 매핑한다", () => {
    const result = importMarkdown(
      "| Left | Right |\n| :--- | ---: |\n| 1 | 2 |",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.warnings).toEqual([]);
    const table = result.value.document.blocks[0];
    if (table?.type !== "table") throw new Error("Expected a table");
    expect(table.rows[0]?.cells.map((c) => c.align)).toEqual(["left", "right"]);
    expect(table.rows[1]?.cells.map((c) => c.align)).toEqual(["left", "right"]);
  });

  it("정렬 구문이 없는 열은 align을 지정하지 않는다", () => {
    const result = importMarkdown("| A | B |\n| - | - |\n| 1 | 2 |");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const table = result.value.document.blocks[0];
    if (table?.type !== "table") throw new Error("Expected a table");
    expect(table.rows[0]?.cells.map((c) => c.align)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("children이 있는 문서를 lossy로 내보내면 형제로 평탄화되고 재수입해도 계층 없이 콘텐츠를 보존한다", () => {
    const nestedDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent-paragraph",
          type: "paragraph",
          content: [{ text: "Parent" }],
          children: [
            {
              id: "child-heading",
              type: "heading",
              level: 2,
              content: [{ text: "Child heading" }],
              children: [
                {
                  id: "grandchild-paragraph",
                  type: "paragraph",
                  content: [{ text: "Grandchild" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const exported = exportMarkdown(nestedDocument, { mode: "lossy" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value.warnings).toEqual([
      {
        kind: "NESTED_CHILDREN",
        blockId: "parent-paragraph",
        message:
          "Block parent-paragraph has nested children; GFM export flattens them into sibling blocks",
      },
      {
        kind: "NESTED_CHILDREN",
        blockId: "child-heading",
        message:
          "Block child-heading has nested children; GFM export flattens them into sibling blocks",
      },
    ]);

    const imported = importMarkdown(exported.value.markdown);
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);
    expect(imported.value.warnings).toEqual([]);
    expect(imported.value.document.blocks).toMatchObject([
      { type: "paragraph", content: [{ text: "Parent" }] },
      { type: "heading", level: 2, content: [{ text: "Child heading" }] },
      { type: "paragraph", content: [{ text: "Grandchild" }] },
    ]);
  });
});
