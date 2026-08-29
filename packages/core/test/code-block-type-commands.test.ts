/**
 * setBlockType이 일반 텍스트 블록과 CodeBlock 사이의 무손실 변환 및
 * CodeBlock language 갱신을 한 transaction과 한 undo 단위로 처리하는지
 * 검증한다. CodeBlock에서 지원하지 않는 setText 거절 계약도 함께 고정한다.
 */
import type { Block, Document } from "@cp949/geul-model";
import type { EditorController } from "../src/index.js";
import { describe, expect, it, vi } from "vitest";

import { contentTextStart } from "./block-test-support.js";
import {
  caretAt,
  documentOf,
  editorState,
  mounted,
  notApplicable,
  paragraphBlock,
  restored,
  setBoldStoredMark,
} from "./editor-controller-support.js";

describe("CodeBlock 종류 변경", () => {
  it("mark가 있는 문단을 기본 language text인 CodeBlock으로 바꾸며 id와 plain source를 보존한다", () => {
    const source: Block = {
      id: "source",
      type: "paragraph",
      content: [
        { text: "marked", marks: [{ type: "bold" }] },
        { text: " plain" },
      ],
    };
    const { editor, tiptap, changes } = mounted(
      documentOf(source, paragraphBlock("tail", "tail")),
    );
    const before = editorState(editor, tiptap);

    expect(
      editor.commands.setBlockType("source", { type: "codeBlock" }),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toEqual({
      formatVersion: 1,
      revision: 1,
      blocks: [
        {
          id: "source",
          type: "codeBlock",
          content: [{ text: "marked plain" }],
          language: "text",
        },
        paragraphBlock("tail", "tail"),
      ],
    });
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "source"));
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["source"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("clearContent로 문단을 빈 CodeBlock으로 바꾸고 빈 language를 text로 저장한다", () => {
    const { editor, changes } = mounted(
      documentOf(
        paragraphBlock("source", "/code"),
        paragraphBlock("tail", "tail"),
      ),
    );

    expect(
      editor.commands.setBlockType(
        "source",
        { type: "codeBlock", language: "" },
        { clearContent: true },
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "source",
      type: "codeBlock",
      content: [],
      language: "text",
    });
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["source"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("source", "/code"),
    );
  });

  it.each([
    {
      source: {
        id: "source",
        type: "heading",
        level: 2,
        content: [{ text: "heading" }],
      } as Block,
      expectedContent: [{ text: "heading" }],
      language: " JS ",
      expectedLanguage: "javascript",
    },
    {
      source: {
        id: "source",
        type: "quote",
        content: [{ text: "quote" }],
      } as Block,
      expectedContent: [{ text: "quote" }],
      language: "Custom Lang",
      expectedLanguage: "Custom Lang",
    },
  ])(
    "$source.type 블록의 language $language 입력을 $expectedLanguage 저장형으로 바꾼다",
    ({ source, expectedContent, language, expectedLanguage }) => {
      const { editor } = mounted(
        documentOf(source, paragraphBlock("tail", "tail")),
      );

      expect(
        editor.commands.setBlockType("source", {
          type: "codeBlock",
          language,
        }),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks[0]).toEqual({
        id: "source",
        type: "codeBlock",
        content: expectedContent,
        language: expectedLanguage,
      });
    },
  );

  it("자식이 있는 일반 블록은 CodeBlock으로 바꾸지 않고 상태와 history를 보존한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("parent", "parent", [paragraphBlock("child", "child")]),
        paragraphBlock("tail", "tail"),
      ),
    );
    setBoldStoredMark(tiptap);
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(
      editor.commands.setBlockType("parent", { type: "codeBlock" }),
    ).toEqual(notApplicable("setBlockType"));
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    dispatchSpy.mockRestore();
  });

  it.each([
    {
      descriptor: { type: "paragraph" } as const,
      expected: { type: "paragraph" },
    },
    {
      descriptor: { type: "heading", level: 3 } as const,
      expected: { type: "heading", level: 3 },
    },
    { descriptor: { type: "quote" } as const, expected: { type: "quote" } },
  ])(
    "CodeBlock을 $descriptor.type 블록으로 바꾸며 id와 source를 보존하고 language를 제거한다",
    ({ descriptor, expected }) => {
      const initial: Document = documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "line 1\nline 2" }],
          language: "typescript",
        },
        paragraphBlock("tail", "tail"),
      );
      const { editor, tiptap, changes } = mounted(initial);
      const before = editorState(editor, tiptap);

      expect(editor.commands.setBlockType("code", descriptor)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument().blocks[0]).toEqual({
        id: "code",
        ...expected,
        content: [{ text: "line 1\nline 2" }],
      });
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["code"], reason: "local" },
      ]);
      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    },
  );

  it("literal Tab이 있는 CodeBlock은 일반 블록 변환을 원자적으로 거절한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "before\tafter" }],
          language: "text",
        },
        paragraphBlock("tail", "tail"),
      ),
    );
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(editor.commands.setBlockType("code", { type: "paragraph" })).toEqual(
      notApplicable("setBlockType"),
    );
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    dispatchSpy.mockRestore();
  });

  it("clearContent이면 literal Tab이 있는 CodeBlock도 빈 일반 블록으로 바꾼다", () => {
    const { editor } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "before\tafter" }],
          language: "text",
        },
        paragraphBlock("tail", "tail"),
      ),
    );

    expect(
      editor.commands.setBlockType(
        "code",
        { type: "paragraph" },
        { clearContent: true },
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "code",
      type: "paragraph",
      content: [],
    });
  });
});

describe("CodeBlock language 변경", () => {
  it.each([
    { input: "", expected: "text" },
    { input: " JS ", expected: "javascript" },
    { input: "Custom Lang", expected: "Custom Lang" },
  ])(
    "language $input 입력을 $expected 저장형으로 바꾸고 selection을 보존하며 undo 1회로 복원한다",
    ({ input, expected }) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(
          {
            id: "code",
            type: "codeBlock",
            content: [{ text: "source" }],
            language: "typescript",
          },
          paragraphBlock("tail", "tail"),
        ),
      );
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 3);
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      expect(
        editor.commands.setBlockType("code", {
          type: "codeBlock",
          language: input,
        }),
      ).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks[0]).toEqual({
        id: "code",
        type: "codeBlock",
        content: [{ text: "source" }],
        language: expected,
      });
      expect(tiptap.state.selection.toJSON()).toEqual(before.selection);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["code"], reason: "local" },
      ]);
      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
      dispatchSpy.mockRestore();
    },
  );

  it.each(["bad\nlanguage", "bad\u0000language", "bad\u007flanguage"])(
    "제어 문자가 있는 language %s는 mutation 전에 원자적으로 거절한다",
    (language) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(
          {
            id: "code",
            type: "codeBlock",
            content: [{ text: "source" }],
            language: "javascript",
          },
          paragraphBlock("tail", "tail"),
        ),
      );
      setBoldStoredMark(tiptap);
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      expect(
        editor.commands.setBlockType("code", { type: "codeBlock", language }),
      ).toEqual(notApplicable("setBlockType"));
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
      expect(editor.commands.undo()).toEqual(notApplicable("undo"));
      dispatchSpy.mockRestore();
    },
  );

  it("현재 저장형과 같은 canonical language는 dispatch와 history가 없는 성공 no-op이다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "source" }],
          language: "javascript",
        },
        paragraphBlock("tail", "tail"),
      ),
    );
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(
      editor.commands.setBlockType("code", {
        type: "codeBlock",
        language: "JS",
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    dispatchSpy.mockRestore();
  });
});

describe("CodeBlock setText 거절", () => {
  it("CodeBlock의 setText는 COMMAND_NOT_APPLICABLE이며 모든 상태와 history를 보존한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        {
          id: "code",
          type: "codeBlock",
          content: [{ text: "source" }],
          language: "javascript",
        },
        paragraphBlock("tail", "tail"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 2);
    setBoldStoredMark(tiptap);
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(editor.commands.setText("code", "changed")).toEqual(
      notApplicable("setText"),
    );
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    dispatchSpy.mockRestore();
  });

  it("setBlockType 공개 입력이 CodeBlock descriptor를 수용한다", () => {
    const descriptor: Parameters<
      EditorController["commands"]["setBlockType"]
    >[1] = { type: "codeBlock", language: "javascript" };

    expect(descriptor).toEqual({
      type: "codeBlock",
      language: "javascript",
    });
  });
});
