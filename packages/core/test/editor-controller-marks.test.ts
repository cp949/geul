import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 mark", () => {
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
});
