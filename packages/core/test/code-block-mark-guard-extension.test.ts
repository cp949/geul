/**
 * CodeBlock mark 단축키 guard의 실제 DOM keydown 우선순위와 selection
 * 재동기화를 검증한다. CodeBlock에서는 소비 후 dispatch 없는 no-op,
 * 일반 문단에서는 StarterKit 폴스루를 요구한다.
 */
import type { Document, TextMark } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { AllSelection, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { selectionIntersectsCodeBlock } from "../src/code-block-mark-guard-extension.js";
import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  editorState,
  mountTiptapEditor,
  paragraphBlock,
} from "./editor-controller-support.js";
import { withNativeCaret } from "./native-selection-test-support.js";

const shortcutDocument: Document = documentOf(
  paragraphBlock("paragraph", "plain"),
  {
    id: "code",
    type: "codeBlock",
    content: [{ text: "code" }],
    language: "text",
  },
  paragraphBlock("tail", "tail"),
);

const shortcutCases: ReadonlyArray<{
  key: string;
  shiftKey?: boolean;
  mark: TextMark["type"];
}> = [
  { key: "b", mark: "bold" },
  { key: "i", mark: "italic" },
  { key: "u", mark: "underline" },
  { key: "s", shiftKey: true, mark: "strike" },
  { key: "e", mark: "code" },
];

const shiftedLetterShortcutCases = ["B", "I", "U"] as const;

/**
 * EditorView가 설치한 실제 keydown listener로 Mod 단축키를 보내 plugin
 * priority와 preventDefault 소비 여부를 함께 관찰한다.
 */
const dispatchModKeydown = (
  editor: Editor,
  key: string,
  shiftKey = false,
): boolean => {
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey: true,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  editor.view.dom.dispatchEvent(event);
  return event.defaultPrevented;
};

/**
 * 네이티브 DOM caret과 PM live selection을 서로 다른 블록에 둬 클릭 직후
 * stale selection을 재현한다. body 부착과 selection 정리는 공용 helper가
 * 소유한다(G-TST-003).
 */
const withStaleCaret = (
  editor: Editor,
  nativeBlockId: string,
  liveBlockId: string,
  run: () => void,
): void => {
  const nativePosition = contentTextStart(editor, nativeBlockId) + 1;
  const livePosition = contentTextStart(editor, liveBlockId) + 1;
  const domPoint = editor.view.domAtPos(nativePosition);

  withNativeCaret(
    editor.view.dom,
    () => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.near(editor.state.doc.resolve(livePosition)),
        ),
      );
      run();
    },
    domPoint.node,
    domPoint.offset,
  );
};

describe("CodeBlock mark 단축키 guard", () => {
  it.each(shortcutCases)(
    "CodeBlock caret의 Mod-$key 단축키를 dispatch 없이 소비한다",
    ({ key, shiftKey }) => {
      const editor = createEditor({ initialDocument: shortcutDocument });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 1);
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchModKeydown(tiptap, key, shiftKey)).toBe(true);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(editorState(editor, tiptap)).toEqual(before);
      dispatchSpy.mockRestore();
    },
  );

  it.each(shiftedLetterShortcutCases)(
    "CodeBlock caret의 Mod-%s 대문자 단축키를 dispatch 없이 소비한다",
    (key) => {
      const editor = createEditor({ initialDocument: shortcutDocument });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 1);
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchModKeydown(tiptap, key, true)).toBe(true);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(editorState(editor, tiptap)).toEqual(before);
      dispatchSpy.mockRestore();
    },
  );

  it("CodeBlock 문자를 교차하는 DOM 범위 선택의 mark 단축키를 소비한다", () => {
    const editor = createEditor({ initialDocument: shortcutDocument });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({
      from: contentTextStart(tiptap, "paragraph"),
      to: contentTextStart(tiptap, "code") + 1,
    });
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchModKeydown(tiptap, "b")).toBe(true);
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    dispatchSpy.mockRestore();
  });

  it("NodeSelection과 AllSelection은 CodeBlock 실제 문자 교차 여부로 판정한다", () => {
    const editor = createEditor({ initialDocument: shortcutDocument });
    const { tiptap } = mountTiptapEditor(editor);
    const codeNodePosition = contentTextStart(tiptap, "code") - 1;

    expect(
      selectionIntersectsCodeBlock(
        tiptap.state.doc,
        NodeSelection.create(tiptap.state.doc, codeNodePosition),
      ),
    ).toBe(true);
    expect(
      selectionIntersectsCodeBlock(
        tiptap.state.doc,
        new AllSelection(tiptap.state.doc),
      ),
    ).toBe(true);

    const emptyEditor = createEditor({
      initialDocument: documentOf(
        { id: "empty-code", type: "codeBlock", content: [] },
        paragraphBlock("empty-tail", ""),
      ),
    });
    const { tiptap: emptyTiptap } = mountTiptapEditor(emptyEditor);
    expect(
      selectionIntersectsCodeBlock(
        emptyTiptap.state.doc,
        new AllSelection(emptyTiptap.state.doc),
      ),
    ).toBe(false);
  });

  it.each(shortcutCases)(
    "일반 문단의 Mod-$key 단축키는 StarterKit으로 폴스루해 $mark mark를 적용한다",
    ({ key, shiftKey, mark }) => {
      const editor = createEditor({ initialDocument: shortcutDocument });
      const { tiptap } = mountTiptapEditor(editor);
      const start = contentTextStart(tiptap, "paragraph");
      tiptap.commands.setTextSelection({ from: start, to: start + 5 });

      expect(dispatchModKeydown(tiptap, key, shiftKey)).toBe(true);
      expect(editor.getDocument().blocks[0]).toMatchObject({
        content: [{ text: "plain", marks: [{ type: mark }] }],
      });
    },
  );

  it("native caret만 CodeBlock으로 이동한 forward stale 상태를 소비한다", () => {
    const editor = createEditor({ initialDocument: shortcutDocument });
    const { tiptap } = mountTiptapEditor(editor);

    withStaleCaret(tiptap, "code", "paragraph", () => {
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchModKeydown(tiptap, "b")).toBe(true);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(editorState(editor, tiptap)).toEqual(before);
      dispatchSpy.mockRestore();
    });
  });

  it("live caret만 CodeBlock에 남은 reverse stale 상태도 소비한다", () => {
    const editor = createEditor({ initialDocument: shortcutDocument });
    const { tiptap } = mountTiptapEditor(editor);

    withStaleCaret(tiptap, "paragraph", "code", () => {
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchModKeydown(tiptap, "b")).toBe(true);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(editorState(editor, tiptap)).toEqual(before);
      dispatchSpy.mockRestore();
    });
  });
});
