/**
 * fenced·indented GFM code가 CodeBlock 저장 정규형으로 import되는지 검증한다.
 * source·language 보존과 표현할 수 없는 meta의 구조화된 warning을 함께 다룬다.
 */
import { describe, expect, it } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";

describe("CodeBlock GFM 가져오기", () => {
  it("fenced code를 model이 정규화한 language와 CodeBlock으로 가져온다", () => {
    expect(
      importMarkdown("``` JS \nconst value = 1;\n```", {
        createId: () => "code-fenced",
      }),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "code-fenced",
              type: "codeBlock",
              language: "javascript",
              content: [{ text: "const value = 1;" }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("language가 없는 빈 fenced code를 빈 CodeBlock으로 가져온다", () => {
    expect(
      importMarkdown("```\n```", { createId: () => "code-empty" }),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [{ id: "code-empty", type: "codeBlock", content: [] }],
        },
        warnings: [],
      },
    });
  });

  it("네 칸 들여쓴 code를 language 없는 CodeBlock으로 가져와 fenced 정규형으로 내보낸다", () => {
    const imported = importMarkdown("    first\n    second", {
      createId: () => "code-indented",
    });

    expect(imported).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "code-indented",
              type: "codeBlock",
              content: [{ text: "first\nsecond" }],
            },
          ],
        },
        warnings: [],
      },
    });
    if (!imported.ok) throw new Error(imported.error.message);
    expect(exportMarkdown(imported.value.document, { mode: "strict" })).toEqual(
      {
        ok: true,
        value: "```\nfirst\nsecond\n```\n",
      },
    );
  });

  it("CRLF·CR만 LF로 바꾸고 공백·literal Tab·내부와 후행 LF·fence 문자를 보존한다", () => {
    const imported = importMarkdown(
      "````\r\n  first\t \rsecond```tail\r\n\r\n````",
      { createId: () => "code-exact" },
    );

    expect(imported).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "code-exact",
              type: "codeBlock",
              content: [{ text: "  first\t \nsecond```tail\n" }],
            },
          ],
        },
        warnings: [],
      },
    });
    if (!imported.ok) throw new Error(imported.error.message);
    expect(exportMarkdown(imported.value.document, { mode: "strict" })).toEqual(
      {
        ok: true,
        value: "````\n  first\t \nsecond```tail\n\n````\n",
      },
    );
  });

  it("unknown·entity language를 이중 decode나 importer 보정 없이 exact 보존한다", () => {
    let sequence = 0;
    const imported = importMarkdown(
      "```My&#x20;Lang\nfirst\n```\n\n```&amp;copy;\nsecond\n```",
      { createId: () => `code-language-${(sequence += 1)}` },
    );

    expect(imported).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "code-language-1",
              type: "codeBlock",
              language: "My Lang",
              content: [{ text: "first" }],
            },
            {
              id: "code-language-2",
              type: "codeBlock",
              language: "&copy;",
              content: [{ text: "second" }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("non-empty meta만 최종 CodeBlock blockId로 1회 경고한다", () => {
    let sequence = 0;

    expect(
      importMarkdown(
        '```ts title="example"\nfirst\n```\n\n```js   \nsecond\n```',
        { createId: () => `code-meta-${(sequence += 1)}` },
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "code-meta-1",
              type: "codeBlock",
              language: "typescript",
              content: [{ text: "first" }],
            },
            {
              id: "code-meta-2",
              type: "codeBlock",
              language: "javascript",
              content: [{ text: "second" }],
            },
          ],
        },
        warnings: [
          {
            kind: "CODE_BLOCK_META_DROPPED",
            blockId: "code-meta-1",
            message: "Code block meta was dropped during import",
          },
        ],
      },
    });
  });

  it("parser가 변형하는 NUL CodeBlock source를 MARKDOWN_DOCUMENT_INVALID로 거절한다", () => {
    expect(importMarkdown("```\nbefore\u0000after\n```")).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "MARKDOWN_DOCUMENT_INVALID" }),
    });
  });
});
