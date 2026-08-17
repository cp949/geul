import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 mark", () => {
  it("undo 시 지원하는 mark와 heading 메타데이터를 복원한다", () => {
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
  ] as const)("현재 선택 영역에 $mark.type을 토글하고 한 번의 undo로 복원한다", ({
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

  it("collapsed 선택 영역의 mark 토글은 COMMAND_NOT_APPLICABLE을 반환하고 이벤트를 발행하지 않는다", () => {
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

  it("mark 토글이 연속되면 마지막 토글만 되돌린다", () => {
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

  it("현재 선택 영역의 활성 mark를 보고한다", () => {
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

  it("mark가 적용된 텍스트 안 collapsed 커서에서 mark를 보고한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });
    tiptap.commands.toggleBold();
    tiptap.commands.setTextSelection(3);

    expect(editor.getSelectionMarks()).toEqual(["bold"]);
  });

  it("mark가 없는 텍스트의 collapsed 커서에서는 활성 mark가 없다고 보고한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.getSelectionMarks()).toEqual([]);
  });

  it("destroy 이후에는 활성 mark가 없다고 보고한다", () => {
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
