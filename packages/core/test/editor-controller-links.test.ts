import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  documentWithContent,
  editorState,
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 링크", () => {
  it.each([
    "http://example.com",
    "https://example.com",
    "mailto:a@example.com",
    "tel:+821012345678",
    "/relative",
    "#fragment",
    "https://example.com/a–b",
  ])("allows the model link URL %s in mounted editor input", (href) => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });

    expect(tiptap.commands.setLink({ href })).toBe(true);
    expect(editor.getDocument()).toMatchObject({
      revision: 1,
      blocks: [
        {
          content: [{ text: "content", marks: [{ type: "link", href }] }],
        },
      ],
    });
  });

  it.each([
    "ftp://example.com",
    "ftps://example.com",
    "sms:+821012345678",
    "xmpp:user@example.com",
    "callto:+821012345678",
    "cid:content-id",
    " javascript:alert(1)",
    "java\nscript:alert(1)",
    "java﻿script:alert(1)",
  ])("rejects the non-model link URL %s in mounted editor input", (href) => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });

    expect(tiptap.commands.setLink({ href })).toBe(false);
    expect(editor.getDocument()).toEqual(paragraphDocument("content"));
    expect(changes).toEqual([]);
  });

  it("rejects a whitespace-obfuscated link before creating an editor", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent([
          {
            text: "unsafe",
            marks: [{ type: "link", href: " java\nscript:alert(1)" }],
          },
        ]),
      }),
    ).toThrow(TypeError);
  });

  it("atomically rejects a control-obfuscated link on replace", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept", 2),
      onChange: (event) => changes.push(event),
    });

    expect(
      editor.replaceDocument(
        documentWithContent([
          {
            text: "unsafe",
            marks: [{ type: "link", href: "java\tscript:alert(1)" }],
          },
        ]),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
    expect(editor.getDocument()).toEqual(paragraphDocument("kept", 2));
    expect(changes).toEqual([]);
  });

  it("filters an invalid browser link transaction without mutating or throwing", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const link = tiptap.schema.marks.link;
    if (link === undefined) throw new Error("Link mark is not registered");
    const transaction = tiptap.state.tr.addMark(
      1,
      8,
      link.create({ href: "ftp://example.com" }),
    );

    expect(() => tiptap.view.dispatch(transaction)).not.toThrow();
    expect(editor.getDocument()).toEqual(paragraphDocument("content"));
    expect(changes).toEqual([]);
    expect(() => editor.destroy()).not.toThrow();
  });

  it("filters an invalid stored link mark without affecting later plain typing", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const link = tiptap.schema.marks.link;
    if (link === undefined) throw new Error("Link mark is not registered");
    tiptap.commands.setTextSelection(8);
    const documentBefore = tiptap.state.doc.toJSON();
    const selectionBefore = tiptap.state.selection.toJSON();
    const storedMarksBefore = tiptap.state.storedMarks;

    const invalidStoredMark = tiptap.state.tr.setStoredMarks([
      link.create({ href: "ftp://example.com" }),
    ]);
    expect(invalidStoredMark.docChanged).toBe(false);
    tiptap.view.dispatch(invalidStoredMark);

    expect(tiptap.state.storedMarks).toEqual(storedMarksBefore);
    expect(tiptap.state.doc.toJSON()).toEqual(documentBefore);
    expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
    expect(editor.getDocument()).toEqual(paragraphDocument("content"));
    expect(changes).toEqual([]);

    expect(tiptap.commands.insertContent("!")).toBe(true);
    expect(editor.getDocument()).toEqual(paragraphDocument("content!", 1));
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
    ]);
  });

  it("allows a valid stored link mark to affect later typing", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const link = tiptap.schema.marks.link;
    if (link === undefined) throw new Error("Link mark is not registered");
    tiptap.commands.setTextSelection(8);

    tiptap.view.dispatch(
      tiptap.state.tr.setStoredMarks([
        link.create({ href: "https://example.com" }),
      ]),
    );

    expect(tiptap.state.storedMarks?.map((mark) => mark.toJSON())).toEqual([
      {
        type: "link",
        attrs: {
          href: "https://example.com",
          target: "_blank",
          rel: "noopener noreferrer nofollow",
          class: null,
          title: null,
        },
      },
    ]);
    expect(tiptap.commands.insertContent("!")).toBe(true);
    expect(editor.getDocument()).toEqual({
      ...documentWithContent([
        { text: "content" },
        {
          text: "!",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
      revision: 1,
    });
  });

  it("creates a link on the current selection and undoes as one unit", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });

    expect(editor.commands.setLink("https://example.com")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      revision: 1,
      blocks: [
        {
          content: [
            {
              text: "content",
              marks: [{ type: "link", href: "https://example.com" }],
            },
          ],
        },
      ],
    });
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
    ]);

    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.getDocument()).toMatchObject({
      revision: 2,
      blocks: [{ content: [{ text: "content" }] }],
    });
  });

  it("rejects an unsupported link URL without mutating the document", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });
    const stateBefore = editorState(editor, tiptap);

    expect(editor.commands.setLink("javascript:alert(1)")).toEqual({
      ok: false,
      error: { code: "LINK_HREF_REJECTED", href: "javascript:alert(1)" },
    });
    expect(editorState(editor, tiptap)).toEqual(stateBefore);
    expect(changes).toEqual([]);
  });

  it("returns COMMAND_NOT_APPLICABLE for setLink with a collapsed selection outside a link", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);
    const stateBefore = editorState(editor, tiptap);

    expect(editor.commands.setLink("https://example.com")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setLink" },
    });
    expect(editorState(editor, tiptap)).toEqual(stateBefore);
    expect(changes).toEqual([]);
  });

  it("updates the href at a collapsed cursor inside an existing link and undoes as one unit", () => {
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.commands.setLink("https://updated.example.com")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      blocks: [
        {
          content: [
            {
              text: "content",
              marks: [{ type: "link", href: "https://updated.example.com" }],
            },
          ],
        },
      ],
    });

    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.getDocument()).toMatchObject({
      blocks: [
        {
          content: [
            {
              text: "content",
              marks: [{ type: "link", href: "https://example.com" }],
            },
          ],
        },
      ],
    });
  });

  it("preserves editor state when setting the existing href is not applicable", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 2, to: 4 });
    const stateBefore = editorState(editor, tiptap);

    expect(editor.commands.setLink("https://example.com")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setLink" },
    });
    expect(editorState(editor, tiptap)).toEqual(stateBefore);
    expect(changes).toEqual([]);
  });

  it("preserves a collapsed selection when setting its existing href", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);
    const stateBefore = editorState(editor, tiptap);

    expect(editor.commands.setLink("https://example.com")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setLink" },
    });
    expect(editorState(editor, tiptap)).toEqual(stateBefore);
    expect(changes).toEqual([]);
  });

  it("removes the link at the current selection and undoes as one unit", () => {
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });

    expect(editor.commands.unsetLink()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      blocks: [{ content: [{ text: "content" }] }],
    });

    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.getDocument()).toMatchObject({
      blocks: [
        {
          content: [
            {
              text: "content",
              marks: [{ type: "link", href: "https://example.com" }],
            },
          ],
        },
      ],
    });
  });

  it("removes the link at a collapsed cursor inside it", () => {
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.commands.unsetLink()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      blocks: [{ content: [{ text: "content" }] }],
    });
  });

  it("returns COMMAND_NOT_APPLICABLE for unsetLink outside a link", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });

    expect(editor.commands.unsetLink()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "unsetLink" },
    });
  });

  it("reports the href at a collapsed cursor inside a link", () => {
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.getSelectionLink()).toEqual({ href: "https://example.com" });
  });

  it("reports no active link for a collapsed cursor outside a link", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.getSelectionLink()).toBeNull();
  });

  it("reports no active link after destroy", () => {
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    editor.destroy();

    expect(editor.getSelectionLink()).toBeNull();
  });
});
