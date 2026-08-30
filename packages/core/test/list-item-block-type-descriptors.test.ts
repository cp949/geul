/**
 * 목록 항목의 public primitive descriptor를 caret·selection 조회 경계에서
 * 검증한다. ProseMirror node를 직접 읽지 않고 EditorController 반환값만 본다.
 */
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  listItemBlock as list,
  mountTiptapEditor,
  paragraphBlock as paragraph,
} from "./list-item-block-type-support.js";

describe("목록 항목의 public block type descriptor", () => {
  it("최상위 글머리 목록 안 캐럿이 안정 blockId·text와 글머리 descriptor를 보고한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        list("bullet", "bulletListItem", "글머리"),
        paragraph("tail", "tail"),
      ),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "bullet") + 1);

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "bullet",
      blockType: { type: "bulletListItem" },
      text: "글머리",
    });
  });

  it("번호 목록 descriptor는 PM null을 생략하고 명시 startNumber 0을 보존한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        list("implicit", "numberedListItem", "기본 번호"),
        list("zero", "numberedListItem", "0번", { startNumber: 0 }),
        list("explicit", "numberedListItem", "42번", { startNumber: 42 }),
        paragraph("tail", "tail"),
      ),
    });
    const { tiptap } = mountTiptapEditor(editor);

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "implicit"));
    expect(editor.getCaretBlockContext()?.blockType).toEqual({
      type: "numberedListItem",
    });

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "zero"));
    expect(editor.getCaretBlockContext()?.blockType).toEqual({
      type: "numberedListItem",
      startNumber: 0,
    });

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "explicit"));
    expect(editor.getCaretBlockContext()?.blockType).toEqual({
      type: "numberedListItem",
      startNumber: 42,
    });
  });

  it("중첩 글머리·번호 목록 안 캐럿이 각 자식 blockId와 descriptor를 보고한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        paragraph("parent", "부모", [
          list("bullet-child", "bulletListItem", "글머리 자식"),
          list("numbered-child", "numberedListItem", "번호 자식", {
            startNumber: 7,
          }),
        ]),
        paragraph("tail", "tail"),
      ),
    });
    const { tiptap } = mountTiptapEditor(editor);

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "bullet-child") + 1,
    );
    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "bullet-child",
      blockType: { type: "bulletListItem" },
      text: "글머리 자식",
    });

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "numbered-child") + 1,
    );

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "numbered-child",
      blockType: { type: "numberedListItem", startNumber: 7 },
      text: "번호 자식",
    });
  });

  it("중첩 글머리 목록 안 단일 범위 선택이 자식 blockId와 descriptor를 보고한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        paragraph("parent", "부모", [
          list("child", "bulletListItem", "자식 목록"),
        ]),
        paragraph("tail", "tail"),
      ),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const start = contentTextStart(tiptap, "child");
    tiptap.commands.setTextSelection({ from: start, to: start + 2 });

    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "child",
      blockType: { type: "bulletListItem" },
    });
  });

  it("목록 범위 selection descriptor는 단일 목록만 보고 부모·자식·복수 블록 경계는 null이다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        list("first", "numberedListItem", "첫 목록", { startNumber: 3 }),
        paragraph("parent", "부모", [
          list("child", "bulletListItem", "자식 목록"),
        ]),
        list("last", "bulletListItem", "마지막 목록"),
        paragraph("tail", "tail"),
      ),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const firstStart = contentTextStart(tiptap, "first");
    const parentStart = contentTextStart(tiptap, "parent");
    const childStart = contentTextStart(tiptap, "child");
    const lastStart = contentTextStart(tiptap, "last");

    tiptap.commands.setTextSelection({ from: firstStart, to: firstStart + 2 });
    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "first",
      blockType: { type: "numberedListItem", startNumber: 3 },
    });

    tiptap.commands.setTextSelection({ from: parentStart, to: childStart + 1 });
    expect(editor.getSelectionBlockType()).toBeNull();

    tiptap.commands.setTextSelection({ from: firstStart, to: lastStart + 1 });
    expect(editor.getSelectionBlockType()).toBeNull();
  });
});
