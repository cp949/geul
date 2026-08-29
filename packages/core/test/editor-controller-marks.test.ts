/**
 * 에디터 컨트롤러의 인라인 mark 토글과 CodeBlock mark 금지 경계를 검증한다.
 * 성공·거절·undo에서 독자 문서와 ProseMirror 상태를 함께 고정한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it, vi } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  editorState,
  mountTiptapEditor,
  paragraphBlock,
  paragraphDocument,
  sequentialIds,
  setBoldStoredMark,
} from "./editor-controller-support.js";

const codeBlockMarkGuardDocument: Document = documentOf(
  paragraphBlock("before", "left"),
  {
    id: "code",
    type: "codeBlock",
    content: [{ text: "code" }],
    language: "text",
  },
  paragraphBlock("tail", "tail"),
);

describe("에디터 컨트롤러 mark", () => {
  it.each([
    "toggleBold",
    "toggleItalic",
    "toggleUnderline",
    "toggleStrike",
    "toggleCode",
  ] as const)(
    "CodeBlock 내부 caret에서 %s를 상태 변경 없이 CODE_BLOCK_MARK_NOT_ALLOWED로 거절한다",
    (command) => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: codeBlockMarkGuardDocument,
        onChange: (event) => changes.push(event),
      });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 1);
      setBoldStoredMark(tiptap);
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      expect(editor.commands[command]()).toEqual({
        ok: false,
        error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" },
      });
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
      dispatchSpy.mockRestore();
    },
  );

  it.each([
    "toggleBold",
    "toggleItalic",
    "toggleUnderline",
    "toggleStrike",
    "toggleCode",
  ] as const)(
    "CodeBlock 문자를 교차하는 선택에서 %s를 상태 변경 없이 거절한다",
    (command) => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: codeBlockMarkGuardDocument,
        onChange: (event) => changes.push(event),
      });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection({
        from: contentTextStart(tiptap, "before"),
        to: contentTextStart(tiptap, "code") + 1,
      });
      const before = editorState(editor, tiptap);

      expect(editor.commands[command]()).toEqual({
        ok: false,
        error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" },
      });
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
    },
  );

  it("선택 끝점만 CodeBlock 시작 경계에 닿으면 일반 텍스트에 mark를 적용한다", () => {
    const editor = createEditor({
      initialDocument: codeBlockMarkGuardDocument,
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({
      from: contentTextStart(tiptap, "before"),
      to: contentTextStart(tiptap, "code"),
    });

    expect(editor.commands.toggleBold()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks).toEqual([
      {
        ...paragraphBlock("before", "left"),
        content: [{ text: "left", marks: [{ type: "bold" }] }],
      },
      codeBlockMarkGuardDocument.blocks[1],
      paragraphBlock("tail", "tail"),
    ]);
  });

  it("CodeBlock 거절 7개가 기존 undo 이력과 전체 상태를 보존한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: codeBlockMarkGuardDocument,
      onChange: (event) => changes.push(event),
    });
    expect(editor.commands.setText("tail", "changed")).toEqual({
      ok: true,
      value: undefined,
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 1);
    setBoldStoredMark(tiptap);
    const before = editorState(editor, tiptap);
    const tiptapDocumentBefore = tiptap.state.doc;
    const selectionBefore = tiptap.state.selection;
    const storedMarksBefore = tiptap.state.storedMarks;

    const outcomes = [
      editor.commands.toggleBold(),
      editor.commands.toggleItalic(),
      editor.commands.toggleUnderline(),
      editor.commands.toggleStrike(),
      editor.commands.toggleCode(),
      editor.commands.setLink("javascript:alert(1)"),
      editor.commands.unsetLink(),
    ];

    expect(outcomes).toEqual(
      Array.from({ length: 7 }, () => ({
        ok: false,
        error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" },
      })),
    );
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(tiptap.state.doc).toBe(tiptapDocumentBefore);
    expect(tiptap.state.selection).toBe(selectionBefore);
    expect(tiptap.state.storedMarks).toBe(storedMarksBefore);
    expect(changes).toHaveLength(1);
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toMatchObject({
      revision: 2,
      blocks: codeBlockMarkGuardDocument.blocks,
    });
  });

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
    const editor = createEditor({
      initialDocument: markedHeading,
      createId: sequentialIds("gen"),
    });
    editor.commands.setText("heading-1", "plain");

    // heading으로 끝나는 문서라 로드 시점에 trailing paragraph(UI-010,
    // "gen-1")가 붙는다 — 로드 정규화는 히스토리 밖이라 undo는 setText만
    // 되돌리고 trailing은 남는다.
    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.getDocument()).toEqual({
      ...markedHeading,
      revision: 2,
      blocks: [
        ...markedHeading.blocks,
        { id: "gen-1", type: "paragraph", content: [] },
      ],
    });
  });

  it.each([
    { command: "toggleBold", mark: { type: "bold" } },
    { command: "toggleItalic", mark: { type: "italic" } },
    { command: "toggleUnderline", mark: { type: "underline" } },
    { command: "toggleStrike", mark: { type: "strike" } },
    { command: "toggleCode", mark: { type: "code" } },
  ] as const)(
    "현재 선택 영역에 $mark.type을 토글하고 한 번의 undo로 복원한다",
    ({ command, mark }) => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        onChange: (event) => changes.push(event),
      });
      const { tiptap } = mountTiptapEditor(editor);
      // 컨테이너가 문단을 감싸며 좌표가 1씩 밀렸다(D19) — 2가 "content"
      // 시작, 9가 그 끝이다.
      tiptap.commands.setTextSelection({ from: 2, to: 9 });

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
    },
  );

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
    // 컨테이너가 문단을 감싸며 좌표가 1씩 밀렸다(D19) — 2가 "content" 시작,
    // 9가 그 끝이다.
    tiptap.commands.setTextSelection({ from: 2, to: 9 });

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
