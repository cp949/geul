import type { Document, InlineContent } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import {
  createEditor,
  type DocumentChangeEvent,
  type EditorController,
} from "../src/index.js";

const paragraphDocument = (text: string, revision = 0): Document => ({
  formatVersion: 1,
  revision,
  blocks: [
    {
      id: "block-1",
      type: "paragraph",
      content: [{ text }],
    },
  ],
});

const sequentialIds = (prefix: string) => {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
};

const documentWithContent = (content: InlineContent): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [{ id: "block-1", type: "paragraph", content }],
});

const mountTiptapEditor = (
  editor: EditorController,
): { editable: HTMLElement; tiptap: TiptapEditor } => {
  const container = document.createElement("div");
  editor.mount(container);
  const editable = container.querySelector<
    HTMLElement & { editor?: TiptapEditor }
  >("[contenteditable='true']");
  if (editable?.editor === undefined) {
    throw new Error("Mounted Tiptap editor was not available");
  }
  return { editable, tiptap: editable.editor };
};

const editorState = (editor: EditorController, tiptap: TiptapEditor) => ({
  document: editor.getDocument(),
  selection: tiptap.state.selection.toJSON(),
  storedMarks: tiptap.state.storedMarks?.map((mark) => mark.toJSON()) ?? null,
  tiptapDocument: tiptap.state.doc.toJSON(),
});

const documentWithTable: Document = {
  formatVersion: 1,
  revision: 9,
  blocks: [
    {
      id: "table-1",
      type: "table",
      columns: [{ id: "column-1", width: 160 }],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "unsupported" }],
            },
          ],
        },
      ],
      headerRows: 0,
      headerColumns: 0,
    },
  ],
};

describe("editor controller", () => {
  it("increments revision and reports changed block ids", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.setText("block-1", "after")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().revision).toBe(1);
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1"],
        reason: "local",
      },
    ]);
  });

  it("undoes one public command as one change", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
    });
    editor.commands.setText("block-1", "after");

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toMatchObject({
      revision: 2,
      blocks: [{ content: [{ text: "before" }] }],
    });
  });

  it("atomically rejects table documents in R0", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept"),
      onChange: (event) => changes.push(event),
    });

    expect(editor.replaceDocument(documentWithTable)).toMatchObject({
      ok: false,
      error: { code: "EDITOR_FEATURE_UNAVAILABLE", feature: "table" },
    });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      type: "paragraph",
    });
    expect(editor.getDocument().revision).toBe(0);
    expect(changes).toEqual([]);
  });

  it("starts local revisions from the imported initial revision", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before", 7),
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.setText("block-1", "after")).toMatchObject({
      ok: true,
    });
    expect(editor.getDocument().revision).toBe(8);
    expect(changes).toEqual([
      {
        revision: 8,
        changedBlockIds: ["block-1"],
        reason: "local",
      },
    ]);
  });

  it("keeps rapid public commands in separate undo units", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
    });

    editor.commands.setText("block-1", "middle");
    editor.commands.setText("block-1", "after");
    expect(editor.commands.undo()).toMatchObject({ ok: true });

    expect(editor.getDocument()).toMatchObject({
      revision: 3,
      blocks: [{ content: [{ text: "middle" }] }],
    });
  });

  it("emits one revision for each undo and redo", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
      onChange: (event) => changes.push(event),
    });

    editor.commands.setText("block-1", "after");
    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.commands.redo()).toMatchObject({ ok: true });

    expect(editor.getDocument()).toMatchObject({
      revision: 3,
      blocks: [{ content: [{ text: "after" }] }],
    });
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1"],
        reason: "local",
      },
      {
        revision: 2,
        changedBlockIds: ["block-1"],
        reason: "undo",
      },
      {
        revision: 3,
        changedBlockIds: ["block-1"],
        reason: "redo",
      },
    ]);
  });

  it("ignores imported revision and clears history on replace", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before", 4),
      onChange: (event) => changes.push(event),
    });
    editor.commands.setText("block-1", "edited");

    expect(
      editor.replaceDocument(paragraphDocument("replacement", 99)),
    ).toEqual({ ok: true, value: undefined });

    expect(editor.getDocument()).toMatchObject({
      revision: 6,
      blocks: [{ content: [{ text: "replacement" }] }],
    });
    expect(editor.commands.undo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(changes.at(-1)).toEqual({
      revision: 6,
      changedBlockIds: ["block-1"],
      reason: "replace",
    });
  });

  it("reports reordered blocks as changed on replace", () => {
    const changes: DocumentChangeEvent[] = [];
    const initial: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
        { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
      ],
    };
    const editor = createEditor({
      initialDocument: initial,
      onChange: (event) => changes.push(event),
    });

    expect(
      editor.replaceDocument({
        ...initial,
        blocks: [initial.blocks[1], initial.blocks[0]],
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-2",
      "block-1",
    ]);
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1", "block-2"],
        reason: "replace",
      },
    ]);
  });

  it("does not emit or increment for failed and no-op commands", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("same"),
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.setText("block-1", "same")).toMatchObject({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
    });
    expect(editor.commands.undo()).toMatchObject({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(editor.commands.setText("missing", "changed")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(
      editor.replaceDocument(paragraphDocument("same", 100)),
    ).toMatchObject({
      ok: false,
      error: {
        code: "COMMAND_NOT_APPLICABLE",
        command: "replaceDocument",
      },
    });
    expect(editor.getDocument().revision).toBe(0);
    expect(changes).toEqual([]);
  });

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

  it("does not report a canonical marked block changed by another block edit", () => {
    const changes: DocumentChangeEvent[] = [];
    const canonicalMarks: InlineContent = [
      {
        text: "marked",
        marks: [
          { type: "link", href: "https://example.com" },
          { type: "bold" },
          { type: "code" },
          { type: "italic" },
          { type: "strike" },
          { type: "underline" },
        ],
      },
    ];
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "marked", type: "paragraph", content: canonicalMarks },
          {
            id: "target",
            type: "paragraph",
            content: [{ text: "before" }],
          },
        ],
      },
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.setText("target", "after")).toMatchObject({
      ok: true,
    });
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["target"],
        reason: "local",
      },
    ]);
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "marked",
      type: "paragraph",
      content: canonicalMarks,
    });
  });

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

  it("rejects setText before mutating at the maximum revision", () => {
    const changes: DocumentChangeEvent[] = [];
    const initial = paragraphDocument("before", Number.MAX_SAFE_INTEGER);
    const editor = createEditor({
      initialDocument: initial,
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);
    const selectionBefore = tiptap.state.selection.toJSON();

    expect(editor.commands.setText("block-1", "after")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
    });
    expect(editor.getDocument()).toEqual(initial);
    expect(tiptap.state.doc.textContent).toBe("before");
    expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
    expect(changes).toEqual([]);
  });

  it("filters a DOM transaction before document and selection mutation at maximum revision", () => {
    const changes: DocumentChangeEvent[] = [];
    const initial = paragraphDocument("before", Number.MAX_SAFE_INTEGER);
    const editor = createEditor({
      initialDocument: initial,
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(2);
    const selectionBefore = tiptap.state.selection.toJSON();
    const transaction = tiptap.state.tr.insertText("X", 2);
    transaction.setSelection(TextSelection.create(transaction.doc, 3));

    expect(() => tiptap.view.dispatch(transaction)).not.toThrow();
    expect(editor.getDocument()).toEqual(initial);
    expect(tiptap.state.doc.textContent).toBe("before");
    expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
    expect(changes).toEqual([]);
  });

  it("rejects replace before mutation at the maximum revision", () => {
    const changes: DocumentChangeEvent[] = [];
    const initial = paragraphDocument("before", Number.MAX_SAFE_INTEGER);
    const editor = createEditor({
      initialDocument: initial,
      onChange: (event) => changes.push(event),
    });

    expect(editor.replaceDocument(paragraphDocument("replacement"))).toEqual({
      ok: false,
      error: {
        code: "COMMAND_NOT_APPLICABLE",
        command: "replaceDocument",
      },
    });
    expect(editor.getDocument()).toEqual(initial);
    expect(changes).toEqual([]);
  });

  it("rejects undo when the previous command reached the maximum revision", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before", Number.MAX_SAFE_INTEGER - 1),
      onChange: (event) => changes.push(event),
    });
    expect(editor.commands.setText("block-1", "after")).toMatchObject({
      ok: true,
    });

    expect(editor.commands.undo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(editor.getDocument()).toEqual(
      paragraphDocument("after", Number.MAX_SAFE_INTEGER),
    );
    expect(changes).toHaveLength(1);
  });

  it("rejects redo when undo reached the maximum revision", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before", Number.MAX_SAFE_INTEGER - 2),
      onChange: (event) => changes.push(event),
    });
    editor.commands.setText("block-1", "after");
    expect(editor.commands.undo()).toMatchObject({ ok: true });

    expect(editor.commands.redo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "redo" },
    });
    expect(editor.getDocument()).toEqual(
      paragraphDocument("before", Number.MAX_SAFE_INTEGER),
    );
    expect(changes).toHaveLength(2);
  });

  it("returns defensive document copies", () => {
    const initial = paragraphDocument("original");
    const editor = createEditor({ initialDocument: initial });

    const inputBlock = initial.blocks[0];
    const inputItem =
      inputBlock?.type === "paragraph" ? inputBlock.content[0] : undefined;
    if (inputItem !== undefined) inputItem.text = "input";
    const returned = editor.getDocument();
    const returnedBlock = returned.blocks[0];
    const returnedItem =
      returnedBlock?.type === "paragraph"
        ? returnedBlock.content[0]
        : undefined;
    if (returnedItem !== undefined) returnedItem.text = "returned";

    expect(editor.getDocument()).toEqual(paragraphDocument("original"));
  });

  it("fails mutating commands structurally after destroy", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept"),
      onChange: (event) => changes.push(event),
    });
    editor.destroy();

    expect(editor.commands.setText("block-1", "changed")).toMatchObject({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
    });
    expect(editor.commands.undo()).toMatchObject({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(editor.commands.redo()).toMatchObject({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "redo" },
    });
    expect(
      editor.replaceDocument(paragraphDocument("replacement")),
    ).toMatchObject({
      ok: false,
      error: {
        code: "COMMAND_NOT_APPLICABLE",
        command: "replaceDocument",
      },
    });
    expect(editor.getDocument()).toEqual(paragraphDocument("kept"));
    expect(changes).toEqual([]);
  });

  it("restores supported marks and heading metadata on undo", () => {
    const markedHeading: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "heading-1",
          type: "heading",
          level: 3,
          content: [
            { text: "b", marks: [{ type: "bold" }] },
            { text: "i", marks: [{ type: "italic" }] },
            { text: "u", marks: [{ type: "underline" }] },
            { text: "s", marks: [{ type: "strike" }] },
            { text: "c", marks: [{ type: "code" }] },
            {
              text: "l",
              marks: [{ type: "link", href: "https://example.com" }],
            },
          ],
        },
      ],
    };
    const editor = createEditor({ initialDocument: markedHeading });
    editor.commands.setText("heading-1", "plain");

    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.getDocument()).toEqual({ ...markedHeading, revision: 2 });
  });

  it("renders block ids and keeps them stable across mount cycles", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const firstContainer = document.createElement("div");
    const secondContainer = document.createElement("div");

    editor.mount(firstContainer);
    expect(
      firstContainer.querySelector("p")?.getAttribute("data-be-block-id"),
    ).toBe("block-1");
    editor.unmount();
    editor.mount(secondContainer);

    expect(
      secondContainer.querySelector("p")?.getAttribute("data-be-block-id"),
    ).toBe("block-1");
    expect(editor.getDocument().blocks[0]?.id).toBe("block-1");
  });

  it.each([
    { command: "toggleBold", mark: { type: "bold" } },
    { command: "toggleItalic", mark: { type: "italic" } },
    { command: "toggleUnderline", mark: { type: "underline" } },
    { command: "toggleStrike", mark: { type: "strike" } },
    { command: "toggleCode", mark: { type: "code" } },
  ] as const)("toggles $mark.type on the current selection and undoes as one unit", ({
    command,
    mark,
  }) => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });

    expect(editor.commands[command]()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      revision: 1,
      blocks: [{ content: [{ text: "content", marks: [mark] }] }],
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

  it("returns COMMAND_NOT_APPLICABLE and does not emit for a mark toggle with a collapsed selection", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.commands.toggleBold()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "toggleBold" },
    });
    expect(tiptap.state.storedMarks).toBeNull();
    expect(editor.getDocument()).toEqual(paragraphDocument("content"));
    expect(changes).toEqual([]);
  });

  it("undoes only the latest mark toggle when toggles run consecutively", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });

    expect(editor.commands.toggleBold()).toMatchObject({ ok: true });
    expect(editor.commands.toggleUnderline()).toMatchObject({ ok: true });
    expect(editor.commands.undo()).toMatchObject({ ok: true });

    expect(editor.getDocument()).toMatchObject({
      revision: 3,
      blocks: [{ content: [{ text: "content", marks: [{ type: "bold" }] }] }],
    });
  });

  it("reports active marks for the current selection", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);

    tiptap.commands.setTextSelection({ from: 1, to: 8 });
    expect(editor.getSelectionMarks()).toEqual([]);

    tiptap.commands.toggleBold();
    tiptap.commands.toggleItalic();
    expect(editor.getSelectionMarks().sort()).toEqual(["bold", "italic"]);
  });

  it("reports the mark at a collapsed cursor inside marked text", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });
    tiptap.commands.toggleBold();
    tiptap.commands.setTextSelection(3);

    expect(editor.getSelectionMarks()).toEqual(["bold"]);
  });

  it("reports no active marks for a collapsed cursor in unmarked text", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.getSelectionMarks()).toEqual([]);
  });

  it("reports no active marks after destroy", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });
    tiptap.commands.toggleBold();

    editor.destroy();

    expect(editor.getSelectionMarks()).toEqual([]);
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

  it("assigns an injected id to a block created through the mounted editor", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: () => "block-2",
      onChange: (event) => changes.push(event),
    });
    const container = document.createElement("div");
    editor.mount(container);
    const editable = container.querySelector<HTMLElement>(
      "[contenteditable='true']",
    );

    expect(editable).not.toBeNull();
    editable?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-1",
      "block-2",
    ]);
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1", "block-2"],
        reason: "local",
      },
    ]);
  });

  it("inserts an empty paragraph after the given block and returns its id", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: () => "block-2",
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.insertParagraphAfter("block-1")).toEqual({
      ok: true,
      value: { blockId: "block-2" },
    });
    expect(editor.getDocument()).toMatchObject({
      revision: 1,
      blocks: [
        { id: "block-1", type: "paragraph", content: [{ text: "content" }] },
        { id: "block-2", type: "paragraph", content: [] },
      ],
    });
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-2"], reason: "local" },
    ]);
  });

  it("moves the selection into the newly inserted paragraph", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: () => "block-2",
    });
    const { tiptap } = mountTiptapEditor(editor);

    editor.commands.insertParagraphAfter("block-1");

    let newBlockPosition: number | null = null;
    tiptap.state.doc.forEach((node, offset) => {
      if (node.attrs.blockId === "block-2") newBlockPosition = offset;
    });
    expect(newBlockPosition).not.toBeNull();
    expect(tiptap.state.selection.from).toBe((newBlockPosition ?? 0) + 1);
  });

  it("undoes insertParagraphAfter as one unit", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    editor.commands.insertParagraphAfter("block-1");

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toMatchObject({
      revision: 2,
      blocks: [{ id: "block-1", content: [{ text: "content" }] }],
    });
  });

  it("returns BLOCK_NOT_FOUND for insertParagraphAfter with an unknown block id", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.insertParagraphAfter("missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(changes).toEqual([]);
  });

  it("changes a paragraph to a heading while preserving content and block id", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });

    expect(
      editor.commands.setBlockType("block-1", { type: "heading", level: 2 }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toMatchObject({
      revision: 1,
      blocks: [
        {
          id: "block-1",
          type: "heading",
          level: 2,
          content: [{ text: "content" }],
        },
      ],
    });
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
    ]);
  });

  it("changes a heading back to a paragraph while preserving content", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "block-1",
            type: "heading",
            level: 1,
            content: [{ text: "title" }],
          },
        ],
      },
    });

    expect(
      editor.commands.setBlockType("block-1", { type: "paragraph" }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toMatchObject({
      blocks: [
        { id: "block-1", type: "paragraph", content: [{ text: "title" }] },
      ],
    });
  });

  it("undoes setBlockType as one unit", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    editor.commands.setBlockType("block-1", { type: "heading", level: 1 });

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toMatchObject({
      revision: 2,
      blocks: [
        { id: "block-1", type: "paragraph", content: [{ text: "content" }] },
      ],
    });
  });

  it("clears content while changing type when clearContent is set", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("/heading"),
    });

    expect(
      editor.commands.setBlockType(
        "block-1",
        { type: "heading", level: 1 },
        { clearContent: true },
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toMatchObject({
      blocks: [{ id: "block-1", type: "heading", level: 1, content: [] }],
    });
  });

  it("clears and converts as one undo unit when clearContent is set", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("/heading"),
    });
    editor.commands.setBlockType(
      "block-1",
      { type: "heading", level: 1 },
      { clearContent: true },
    );

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toMatchObject({
      blocks: [
        { id: "block-1", type: "paragraph", content: [{ text: "/heading" }] },
      ],
    });
  });

  it("returns COMMAND_NOT_APPLICABLE for setBlockType with the same type", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });

    expect(
      editor.commands.setBlockType("block-1", { type: "paragraph" }),
    ).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setBlockType" },
    });
    expect(changes).toEqual([]);
  });

  it("returns BLOCK_NOT_FOUND for setBlockType with an unknown block id", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    expect(
      editor.commands.setBlockType("missing", { type: "paragraph" }),
    ).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("reports the block, type and text at a collapsed cursor", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "block-1",
      blockType: { type: "paragraph" },
      text: "content",
    });
  });

  it("reports the heading level at a collapsed cursor inside a heading", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "block-1",
            type: "heading",
            level: 2,
            content: [{ text: "title" }],
          },
        ],
      },
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(2);

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "block-1",
      blockType: { type: "heading", level: 2 },
      text: "title",
    });
  });

  it("returns null caret block context for a range selection", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 4 });

    expect(editor.getCaretBlockContext()).toBeNull();
  });

  it("returns null caret block context after destroy", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    editor.destroy();

    expect(editor.getCaretBlockContext()).toBeNull();
  });

  it("reports the block id and type for a range selection", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 4 });

    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "block-1",
      blockType: { type: "paragraph" },
    });
  });

  it("reports the heading level for a range selection inside a heading", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "block-1",
            type: "heading",
            level: 3,
            content: [{ text: "title" }],
          },
        ],
      },
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 4 });

    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "block-1",
      blockType: { type: "heading", level: 3 },
    });
  });

  it("reports the block id and type for a collapsed selection", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "block-1",
      blockType: { type: "paragraph" },
    });
  });

  it("returns null selection block type after destroy", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 4 });

    editor.destroy();

    expect(editor.getSelectionBlockType()).toBeNull();
  });

  it("reports the block type for a select-all selection in a single-block document", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)),
    );

    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "block-1",
      blockType: { type: "paragraph" },
    });
  });

  it("returns null selection block type when select-all spans multiple blocks", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
        ],
      },
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)),
    );

    expect(editor.getSelectionBlockType()).toBeNull();
  });

  it("지정한 대상 블록 앞으로 블록을 이동한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
          { id: "block-3", type: "paragraph", content: [{ text: "three" }] },
        ],
      },
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.moveBlockBefore("block-3", "block-1")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-3",
      "block-1",
      "block-2",
    ]);
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1", "block-2", "block-3"],
        reason: "local",
      },
    ]);
  });

  it("beforeBlockId가 null이면 블록을 문서 끝으로 이동한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
          { id: "block-3", type: "paragraph", content: [{ text: "three" }] },
        ],
      },
    });

    expect(editor.commands.moveBlockBefore("block-1", null)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-2",
      "block-3",
      "block-1",
    ]);
  });

  it("moveBlockBefore를 한 번의 undo로 복원한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
        ],
      },
    });
    editor.commands.moveBlockBefore("block-2", "block-1");

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-1",
      "block-2",
    ]);
  });

  it("이동해도 순서가 바뀌지 않으면 COMMAND_NOT_APPLICABLE을 반환한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
        ],
      },
    });

    expect(editor.commands.moveBlockBefore("block-1", "block-2")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlockBefore" },
    });
    expect(editor.commands.moveBlockBefore("block-2", null)).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlockBefore" },
    });
  });

  it("자기 자신 앞으로 이동하면 COMMAND_NOT_APPLICABLE을 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    expect(editor.commands.moveBlockBefore("block-1", "block-1")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlockBefore" },
    });
  });

  it("알 수 없는 blockId에 대해 moveBlockBefore가 BLOCK_NOT_FOUND를 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    expect(editor.commands.moveBlockBefore("missing", null)).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("알 수 없는 beforeBlockId에 대해 moveBlockBefore가 BLOCK_NOT_FOUND를 반환한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
        ],
      },
    });

    expect(editor.commands.moveBlockBefore("block-1", "missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("블록을 원본 바로 다음에 복제하고 새 블록 id를 반환한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: () => "block-2",
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.duplicateBlock("block-1")).toEqual({
      ok: true,
      value: { blockId: "block-2" },
    });
    expect(editor.getDocument()).toMatchObject({
      revision: 1,
      blocks: [
        { id: "block-1", type: "paragraph", content: [{ text: "content" }] },
        { id: "block-2", type: "paragraph", content: [{ text: "content" }] },
      ],
    });
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-2"], reason: "local" },
    ]);
  });

  it("복제된 블록에 텍스트와 mark를 그대로 복사한다", () => {
    const editor = createEditor({
      initialDocument: documentWithContent([
        { text: "bold text", marks: [{ type: "bold" }] },
      ]),
      createId: () => "block-2",
    });

    editor.commands.duplicateBlock("block-1");

    expect(editor.getDocument().blocks[1]).toMatchObject({
      id: "block-2",
      type: "paragraph",
      content: [{ text: "bold text", marks: [{ type: "bold" }] }],
    });
  });

  it("제목 블록을 복제하면 heading level을 보존한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "block-1",
            type: "heading",
            level: 2,
            content: [{ text: "title" }],
          },
        ],
      },
      createId: () => "block-2",
    });

    editor.commands.duplicateBlock("block-1");

    expect(editor.getDocument().blocks[1]).toMatchObject({
      id: "block-2",
      type: "heading",
      level: 2,
      content: [{ text: "title" }],
    });
  });

  it("복제 후 커서를 복제본 내용의 끝으로 이동한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: () => "block-2",
    });
    const { tiptap } = mountTiptapEditor(editor);

    editor.commands.duplicateBlock("block-1");

    let newBlockPosition: number | null = null;
    tiptap.state.doc.forEach((node, offset) => {
      if (node.attrs.blockId === "block-2") newBlockPosition = offset;
    });
    expect(newBlockPosition).not.toBeNull();
    const newBlockNode = tiptap.state.doc.nodeAt(newBlockPosition ?? 0);
    expect(newBlockNode).not.toBeNull();
    expect(tiptap.state.selection.from).toBe(
      (newBlockPosition ?? 0) + (newBlockNode?.nodeSize ?? 0) - 1,
    );
  });

  it("duplicateBlock을 한 번의 undo로 복원한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    editor.commands.duplicateBlock("block-1");

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toMatchObject({
      revision: 2,
      blocks: [{ id: "block-1", content: [{ text: "content" }] }],
    });
  });

  it("알 수 없는 블록 id에 대해 duplicateBlock이 BLOCK_NOT_FOUND를 반환한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.duplicateBlock("missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(changes).toEqual([]);
  });

  it("블록을 삭제한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
        ],
      },
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.deleteBlock("block-1")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      revision: 1,
      blocks: [{ id: "block-2", content: [{ text: "two" }] }],
    });
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-1", "block-2"], reason: "local" },
    ]);
  });

  it("deleteBlock을 한 번의 undo로 복원한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
        ],
      },
    });
    editor.commands.deleteBlock("block-1");

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-1",
      "block-2",
    ]);
  });

  it("문서에 블록이 하나만 남아있으면 deleteBlock이 COMMAND_NOT_APPLICABLE을 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    expect(editor.commands.deleteBlock("block-1")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "deleteBlock" },
    });
  });

  it("알 수 없는 블록 id에 대해 deleteBlock이 BLOCK_NOT_FOUND를 반환한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
        ],
      },
    });

    expect(editor.commands.deleteBlock("missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("insertTable로 지정 블록 뒤에 표를 삽입하고 getDocument()가 표를 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });

    const result = editor.commands.insertTable("block-1", {
      rows: 2,
      columns: 2,
    });

    expect(result.ok).toBe(true);
    const document = editor.getDocument();
    expect(document.blocks).toHaveLength(2);
    const table = document.blocks[1];
    if (table?.type !== "table") throw new Error("Expected a table block");
    expect(table.rows).toHaveLength(2);
    expect(table.columns).toHaveLength(2);
    expect(table.rows[0]?.cells).toHaveLength(2);
  });

  it("insertTable 삽입 직후 undo 1회로 복원된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });
    const before = editor.getDocument();

    editor.commands.insertTable("block-1", { rows: 1, columns: 1 });

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });

  it("알 수 없는 블록 id에 대해 insertTable이 BLOCK_NOT_FOUND를 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    expect(
      editor.commands.insertTable("missing", { rows: 1, columns: 1 }),
    ).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("행 또는 열이 1보다 작으면 insertTable이 INVALID_TABLE_SIZE를 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    expect(
      editor.commands.insertTable("block-1", { rows: 0, columns: 1 }),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_TABLE_SIZE" },
    });
  });

  describe("표 조작 명령", () => {
    const editorWithTable = () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        createId: sequentialIds("id"),
      });
      const inserted = editor.commands.insertTable("block-1", {
        rows: 2,
        columns: 2,
      });
      if (!inserted.ok) throw new Error("표 삽입 fixture 준비 실패");
      return { editor, tableBlockId: inserted.value.blockId };
    };

    it("insertTableRow로 표에 행을 추가한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.insertTableRow(tableBlockId, 1)).toEqual({
        ok: true,
        value: undefined,
      });
      const table = editor.getDocument().blocks[1];
      if (table?.type !== "table") throw new Error("Expected a table block");
      expect(table.rows).toHaveLength(3);
    });

    it("insertTableRow 삽입 직후 undo 1회로 복원된다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      editor.commands.insertTableRow(tableBlockId, 1);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toEqual(before.blocks);
    });

    it("insertTableColumn으로 표에 열을 추가한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.insertTableColumn(tableBlockId, 2)).toEqual({
        ok: true,
        value: undefined,
      });
      const table = editor.getDocument().blocks[1];
      if (table?.type !== "table") throw new Error("Expected a table block");
      expect(table.columns).toHaveLength(3);
    });

    it("moveTableRow로 표의 행을 이동한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.moveTableRow(tableBlockId, 0, 1)).toEqual({
        ok: true,
        value: undefined,
      });
    });

    it("moveTableRow 이동 직후 undo 1회로 복원된다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      editor.commands.moveTableRow(tableBlockId, 0, 1);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toEqual(before.blocks);
    });

    it("moveTableColumn으로 표의 열을 이동한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.moveTableColumn(tableBlockId, 0, 1)).toEqual({
        ok: true,
        value: undefined,
      });
    });

    it("resizeTableColumn으로 표의 열 너비를 조절한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.resizeTableColumn(tableBlockId, 0, 240)).toEqual({
        ok: true,
        value: undefined,
      });
      const table = editor.getDocument().blocks[1];
      if (table?.type !== "table") throw new Error("Expected a table block");
      expect(table.columns[0]?.width).toBe(240);
    });

    it("resizeTableColumn 조절 직후 undo 1회로 복원된다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      editor.commands.resizeTableColumn(tableBlockId, 0, 240);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks).toEqual(before.blocks);
    });

    it("허용 범위 밖 너비는 COLUMN_WIDTH_OUT_OF_RANGE를 반환한다", () => {
      const { editor, tableBlockId } = editorWithTable();

      expect(editor.commands.resizeTableColumn(tableBlockId, 0, 47)).toEqual({
        ok: false,
        error: { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: 47 },
      });
    });

    it("알 수 없는 표 blockId에 대해 TABLE_NOT_FOUND를 반환한다", () => {
      const { editor } = editorWithTable();

      expect(editor.commands.moveTableRow("missing", 0, 1)).toEqual({
        ok: false,
        error: { code: "TABLE_NOT_FOUND", blockId: "missing" },
      });
    });

    it("setText는 표 블록을 거부하고 문서를 바꾸지 않는다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      expect(editor.commands.setText(tableBlockId, "x")).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
      });
      expect(editor.getDocument()).toEqual(before);
    });

    it("setBlockType은 표 블록을 거부하고 문서를 바꾸지 않는다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      expect(
        editor.commands.setBlockType(tableBlockId, { type: "paragraph" }),
      ).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "setBlockType" },
      });
      expect(editor.getDocument()).toEqual(before);
    });

    it("duplicateBlock은 표 블록을 거부하고 문서를 바꾸지 않는다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      expect(editor.commands.duplicateBlock(tableBlockId)).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "duplicateBlock" },
      });
      expect(editor.getDocument()).toEqual(before);
    });

    it("동일 인덱스 행 이동은 undo 단계를 만들지 않는다", () => {
      const { editor, tableBlockId } = editorWithTable();
      const before = editor.getDocument();

      expect(editor.commands.moveTableRow(tableBlockId, 0, 0)).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "moveTableRow" },
      });
      expect(editor.getDocument()).toEqual(before);
      // phantom undo 단계가 없다면 undo 1회는 곧바로 표 삽입을 되돌린다.
      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(
        editor.getDocument().blocks.some((block) => block.type === "table"),
      ).toBe(false);
    });
  });

  it("마운트된 표는 colgroup col로 모델 열 너비를 렌더하고 리사이즈를 반영한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });
    const { editable } = mountTiptapEditor(editor);
    const inserted = editor.commands.insertTable("block-1", {
      rows: 2,
      columns: 2,
    });
    if (!inserted.ok) throw new Error("표 삽입 fixture 준비 실패");

    const cols = editable.querySelectorAll<HTMLElement>("table colgroup col");
    expect(cols).toHaveLength(2);
    expect(cols[0]?.style.width).toBe("160px");

    expect(
      editor.commands.resizeTableColumn(inserted.value.blockId, 0, 240),
    ).toEqual({ ok: true, value: undefined });

    const resized =
      editable.querySelectorAll<HTMLElement>("table colgroup col");
    expect(resized[0]?.style.width).toBe("240px");
    // 마운트된 에디터를 남겨두면 PM DOMObserver의 지연 flush가 jsdom 해제
    // 이후에 실행되어 unhandled error가 된다.
    editor.destroy();
  });

  it("외부 HTML 표 붙여넣기는 표 노드로 파싱되지 않고 문서를 깨뜨리지 않는다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("paste"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(8);

    expect(() =>
      tiptap.commands.insertContent(
        "<table><tbody><tr><td>ext</td></tr></tbody></table>",
      ),
    ).not.toThrow();

    const document = editor.getDocument();
    expect(document.blocks.some((block) => block.type === "table")).toBe(false);
    expect(editor.commands.setText("block-1", "recovered")).toMatchObject({
      ok: true,
    });
    editor.destroy();
  });
});
