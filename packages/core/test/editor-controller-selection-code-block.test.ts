/**
 * EditorController.selectionIntersectsCodeBlock()이 core mark 가드와 같은
 * 판정(문자 구간 교차)을 보고하는지 실제 ProseMirror selection에서 검증한다.
 * UI(react 툴바)가 mark 버튼 비활성 판정에 이 메서드를 소비한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
} from "./editor-controller-support.js";

const documentWithCode: Document = documentOf(
  paragraphBlock("before", "left"),
  codeBlockBlock("code", "code", "text"),
  paragraphBlock("tail", "tail"),
);

const documentWithEmptyCode: Document = documentOf(
  paragraphBlock("before", "left"),
  codeBlockBlock("code", ""),
  paragraphBlock("tail", "tail"),
);

describe("에디터 컨트롤러 선택 영역 codeBlock 교차 조회", () => {
  it("선택이 codeBlock 문자 구간과 겹치면 true를 보고한다", () => {
    const editor = createEditor({ initialDocument: documentWithCode });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({
      from: contentTextStart(tiptap, "before"),
      to: contentTextStart(tiptap, "code") + 1,
    });

    expect(editor.selectionIntersectsCodeBlock()).toBe(true);
  });

  it("선택 끝점만 codeBlock 시작 경계에 닿으면 false를 보고한다", () => {
    const editor = createEditor({ initialDocument: documentWithCode });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({
      from: contentTextStart(tiptap, "before"),
      to: contentTextStart(tiptap, "code"),
    });

    expect(editor.selectionIntersectsCodeBlock()).toBe(false);
  });

  it("빈 codeBlock만 덮는 선택은 문자를 교차하지 않아 false를 보고한다", () => {
    const editor = createEditor({ initialDocument: documentWithEmptyCode });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({
      from: contentTextStart(tiptap, "before") + "left".length,
      to: contentTextStart(tiptap, "tail"),
    });

    expect(editor.selectionIntersectsCodeBlock()).toBe(false);
  });

  it("caret이 codeBlock 안이면 true를 보고한다", () => {
    const editor = createEditor({ initialDocument: documentWithCode });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 1);

    expect(editor.selectionIntersectsCodeBlock()).toBe(true);
  });

  it("caret이 codeBlock 밖이면 false를 보고한다", () => {
    const editor = createEditor({ initialDocument: documentWithCode });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "before") + 1);

    expect(editor.selectionIntersectsCodeBlock()).toBe(false);
  });

  it("destroy 이후에는 false를 보고한다", () => {
    const editor = createEditor({ initialDocument: documentWithCode });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 1);

    editor.destroy();

    expect(editor.selectionIntersectsCodeBlock()).toBe(false);
  });
});
