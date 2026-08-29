/**
 * CodeBlock에 임시로 지원되지 않는 텍스트·종류 변경 명령이
 * 문서·선택·이벤트·history를 보존하며 원자적으로 거절되는지 검증한다.
 */
import type { DocumentChangeEvent, EditorController } from "../src/index.js";
import { createEditor } from "../src/index.js";
import { describe, expect, it, vi } from "vitest";

import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  editorState,
  mountTiptapEditor,
  mounted,
  notApplicable,
  paragraphBlock,
  setBoldStoredMark,
} from "./editor-controller-support.js";

describe("CodeBlock 입력 검증과 명령 원자성", () => {
  it.each([
    { name: "setText", command: "setText" },
    { name: "setBlockType", command: "setBlockType" },
  ] as const)(
    "CodeBlock의 $name은 COMMAND_NOT_APPLICABLE이며 모든 상태와 history를 보존한다",
    ({ command }) => {
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
      expect(tiptap.state.storedMarks?.map((mark) => mark.toJSON())).toEqual([
        { type: "bold" },
      ]);
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      const result =
        command === "setText"
          ? editor.commands.setText("code", "changed")
          : editor.commands.setBlockType("code", { type: "paragraph" });

      expect(result).toEqual(notApplicable(command));
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
      expect(editor.commands.undo()).toEqual(notApplicable("undo"));
      dispatchSpy.mockRestore();
    },
  );

  it("setBlockType의 CodeBlock descriptor 입력은 compile-time과 runtime에서 원자적으로 거절된다", () => {
    type SetBlockTypeInput = Parameters<
      EditorController["commands"]["setBlockType"]
    >[1];
    const unsupported: SetBlockTypeInput = {
      // @ts-expect-error CodeBlock은 selection descriptor일 뿐 setBlockType 입력이 아니다.
      type: "codeBlock",
      language: "javascript",
    };
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: documentOf(paragraphBlock("kept", "before")),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    expect(editor.commands.setText("kept", "after")).toEqual({
      ok: true,
      value: undefined,
    });
    setBoldStoredMark(tiptap);
    changes.length = 0;
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(editor.commands.setBlockType("kept", unsupported)).toEqual(
      notApplicable("setBlockType"),
    );
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    dispatchSpy.mockRestore();

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("kept", "before"),
    );
  });
});
