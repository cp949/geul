/**
 * EditorController의 caret·텍스트 선택 조회와 블록별 중첩 action 상태를
 * 실제 ProseMirror selection 및 재귀 블록 문서에서 검증한다.
 */
import { AllSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 선택 영역 조회", () => {
  it("블록별 들여쓰기와 내어쓰기 가능 상태를 core 판정에서 보고한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "parent",
            type: "paragraph",
            content: [{ text: "parent" }],
            children: [
              {
                id: "first",
                type: "paragraph",
                content: [{ text: "first" }],
              },
              {
                id: "second",
                type: "paragraph",
                content: [{ text: "second" }],
              },
            ],
          },
        ],
      },
    });

    try {
      expect(editor.getBlockNestingActionState("parent")).toEqual({
        canIndent: false,
        canOutdent: false,
      });
      expect(editor.getBlockNestingActionState("first")).toEqual({
        canIndent: false,
        canOutdent: true,
      });
      expect(editor.getBlockNestingActionState("second")).toEqual({
        canIndent: true,
        canOutdent: true,
      });
      expect(editor.getBlockNestingActionState("missing")).toEqual({
        canIndent: false,
        canOutdent: false,
      });
    } finally {
      editor.destroy();
    }
  });

  it("revision이 최댓값이면 구조상 가능한 중첩 action도 불가로 보고하고 명령과 일치한다", () => {
    const changes: unknown[] = [];
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: Number.MAX_SAFE_INTEGER,
        blocks: [
          {
            id: "parent",
            type: "paragraph",
            content: [{ text: "parent" }],
            children: [
              {
                id: "first",
                type: "paragraph",
                content: [{ text: "first" }],
              },
              {
                id: "target",
                type: "paragraph",
                content: [{ text: "target" }],
              },
            ],
          },
        ],
      },
      onChange: (event) => changes.push(event),
    });
    const before = editor.getDocument();

    try {
      expect(editor.getBlockNestingActionState("target")).toEqual({
        canIndent: false,
        canOutdent: false,
      });
      expect(editor.commands.indentBlock("target")).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "indentBlock" },
      });
      expect(editor.commands.outdentBlock("target")).toEqual({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "outdentBlock" },
      });
      expect(editor.getDocument()).toEqual(before);
      expect(changes).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("collapsed 커서 위치의 블록, 타입과 텍스트를 보고한다", () => {
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

  it("제목 안 collapsed 커서에서 heading level을 보고한다", () => {
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

  it("범위 선택에서는 caret 블록 컨텍스트가 null이다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 4 });

    expect(editor.getCaretBlockContext()).toBeNull();
  });

  it("destroy 이후에는 caret 블록 컨텍스트가 null이다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    editor.destroy();

    expect(editor.getCaretBlockContext()).toBeNull();
  });

  it("범위 선택의 블록 id와 타입을 보고한다", () => {
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

  it("제목 안 범위 선택에서 heading level을 보고한다", () => {
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

  it("collapsed 선택 영역의 블록 id와 타입을 보고한다", () => {
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

  it("destroy 이후에는 선택 영역 블록 타입이 null이다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 4 });

    editor.destroy();

    expect(editor.getSelectionBlockType()).toBeNull();
  });

  it("블록이 하나인 문서의 전체 선택에서 블록 타입을 보고한다", () => {
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

  it("전체 선택이 여러 블록에 걸치면 선택 영역 블록 타입이 null이다", () => {
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
