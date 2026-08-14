import { describe, expect, it } from "vitest";

import { importHtml, importMarkdown } from "../../io/src/index.js";
import { canonicalizeTextMarks } from "../../model/src/index.js";
import { createEditor } from "../src/index.js";

describe("IO to core integration", () => {
  it("accepts nested duplicate HTML marks after shared canonicalization", () => {
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

  it("accepts a document built from canonicalized duplicate marks", () => {
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

  it("accepts HTML-imported combined marks without another canonicalization step", () => {
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

  it("accepts GFM-imported combined marks without another canonicalization step", () => {
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
