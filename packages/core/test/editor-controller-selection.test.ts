import { AllSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 선택 영역 조회", () => {
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
});
