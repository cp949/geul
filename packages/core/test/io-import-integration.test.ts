import { describe, expect, it } from "vitest";

import { importHtml, importMarkdown } from "../../io/src/index.js";
import { canonicalizeTextMarks } from "../../model/src/index.js";
import { createEditor } from "../src/index.js";

describe("IO와 core 연동", () => {
  it("중첩된 중복 HTML mark도 공용 정규화를 거치면 허용한다", () => {
    const imported = importHtml(
      '<p data-be-block-id="html-duplicate"><strong><strong>x</strong></strong></p>',
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);

    const editor = createEditor({ initialDocument: imported.value.document });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      id: "html-duplicate",
      content: [{ text: "x", marks: [{ type: "bold" }] }],
    });
  });

  it("정규화된 중복 mark로 만든 문서를 허용한다", () => {
    const marks = canonicalizeTextMarks([
      { type: "bold" },
      { type: "link", href: "https://example.com" },
      { type: "bold" },
      { type: "link", href: "https://example.com" },
    ]);
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "canonicalized-duplicates",
            type: "paragraph",
            content: [{ text: "marked", marks }],
          },
        ],
      },
    });

    expect(editor.getDocument().blocks[0]).toMatchObject({
      content: [
        {
          text: "marked",
          marks: [
            { type: "link", href: "https://example.com" },
            { type: "bold" },
          ],
        },
      ],
    });
  });

  it("HTML에서 가져온 결합 mark를 추가 정규화 없이 허용한다", () => {
    const imported = importHtml(
      '<p data-be-block-id="html-combined"><em><code><strong><a href="https://example.com"><u><s>combined</s></u></a></strong></code></em></p>',
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);

    const editor = createEditor({ initialDocument: imported.value.document });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      id: "html-combined",
      content: [
        {
          text: "combined",
          marks: [
            { type: "link", href: "https://example.com" },
            { type: "bold" },
            { type: "code" },
            { type: "italic" },
            { type: "strike" },
            { type: "underline" },
          ],
        },
      ],
    });
  });

  it("GFM에서 가져온 결합 mark를 추가 정규화 없이 허용한다", () => {
    const imported = importMarkdown(
      "~~[***`combined`***](https://example.com)~~",
      { createId: () => "gfm-combined" },
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);

    const editor = createEditor({ initialDocument: imported.value.document });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      id: "gfm-combined",
      content: [
        {
          text: "combined",
          marks: [
            { type: "link", href: "https://example.com" },
            { type: "bold" },
            { type: "code" },
            { type: "italic" },
            { type: "strike" },
          ],
        },
      ],
    });
  });
});
