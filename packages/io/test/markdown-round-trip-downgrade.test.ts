import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";

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

  it("지원하지 않는 컨테이너 블록의 경계를 경고와 함께 보존한다", () => {
    const result = importMarkdown("> Quote one\n>\n> Quote two");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "paragraph",
        content: [{ text: "Quote one" }],
      },
      {
        id: "markdown-2",
        type: "paragraph",
        content: [{ text: "Quote two" }],
      },
    ]);
    expect(result.value.warnings).toEqual([
      {
        kind: "UNSUPPORTED_BLOCK_DOWNGRADED",
        blockId: "markdown-1",
        message: "Unsupported block blockquote was imported as paragraphs",
      },
    ]);
  });

  it("지원하지 않는 leaf 블록을 인라인 경고 중복 없이 보존한다", () => {
    expect(importMarkdown("```ts\nconst x = 1;\nconst y = 2;\n```")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "const x = 1;\nconst y = 2;" }],
            },
          ],
        },
        warnings: [
          {
            kind: "UNSUPPORTED_BLOCK_DOWNGRADED",
            blockId: "markdown-1",
            message: "Unsupported block code was imported as paragraphs",
          },
        ],
      },
    });
  });

  it("GFM 표의 정렬 메타데이터를 버릴 때 경고한다", () => {
    const result = importMarkdown(
      "| Left | Right |\n| :--- | ---: |\n| 1 | 2 |",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks[0]).toMatchObject({
      id: "markdown-1",
      type: "table",
      headerRows: 1,
      headerColumns: 0,
    });
    expect(result.value.warnings).toEqual([
      {
        kind: "TABLE_ALIGNMENT_DISCARDED",
        blockId: "markdown-1",
        message: "Table alignment was discarded during import",
      },
    ]);
  });
});
