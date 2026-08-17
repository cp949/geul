import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  documentWithContent,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 문서 검증", () => {
  it("atomically rejects malformed replacement documents", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept", 3),
      onChange: (event) => changes.push(event),
    });

    expect(editor.replaceDocument({ formatVersion: 1 })).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
    expect(editor.getDocument()).toEqual(paragraphDocument("kept", 3));
    expect(changes).toEqual([]);
  });

  it("rejects an empty text run before creating an editor", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent([{ text: "" }]),
      }),
    ).toThrow(TypeError);
  });

  it("rejects an empty mark set before creating an editor", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent([
          { text: "noncanonical", marks: [] },
        ]),
      }),
    ).toThrow(TypeError);
  });

  it("rejects a blockless document before creating an editor", () => {
    expect(() =>
      createEditor({
        initialDocument: { formatVersion: 1, revision: 0, blocks: [] },
      }),
    ).toThrow(TypeError);
  });

  it("rejects adjacent inline runs with identical marks before creating an editor", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent([
          { text: "left", marks: [{ type: "bold" }] },
          { text: "right", marks: [{ type: "bold" }] },
        ]),
      }),
    ).toThrow(TypeError);
  });

  it("rejects noncanonical mark ordering before creating an editor", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent([
          {
            text: "ordered",
            marks: [
              { type: "link", href: "https://example.com" },
              { type: "bold" },
              { type: "italic" },
              { type: "underline" },
              { type: "strike" },
              { type: "code" },
            ],
          },
        ]),
      }),
    ).toThrow(TypeError);
  });

  it.each([
    {
      name: "a blockless document",
      document: {
        formatVersion: 1,
        revision: 0,
        blocks: [],
      } satisfies Document,
    },
    {
      name: "an empty text run",
      document: documentWithContent([{ text: "" }]),
    },
    {
      name: "an empty mark set",
      document: documentWithContent([{ text: "noncanonical", marks: [] }]),
    },
    {
      name: "adjacent identical inline runs",
      document: documentWithContent([
        { text: "left", marks: [{ type: "italic" }] },
        { text: "right", marks: [{ type: "italic" }] },
      ]),
    },
    {
      name: "noncanonical mark ordering",
      document: documentWithContent([
        {
          text: "ordered",
          marks: [{ type: "italic" }, { type: "bold" }],
        },
      ]),
    },
  ])("atomically rejects $name on replace", ({ document: replacement }) => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept", 3),
      onChange: (event) => changes.push(event),
    });

    expect(editor.replaceDocument(replacement)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
    expect(editor.getDocument()).toEqual(paragraphDocument("kept", 3));
    expect(changes).toEqual([]);
  });
});
