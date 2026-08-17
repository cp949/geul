import type { Document, InlineContent } from "@cp949/geul-model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 revision과 변경 이벤트", () => {
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
});
