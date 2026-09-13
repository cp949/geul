/**
 * toggleListItem의 caret·selection block type descriptor(RD-004 DELTA-04)를
 * production EditorController 경계에서 검증한다. 이 계약이 없으면
 * getCaretBlockContext()가 toggleListItem 안에서 null을 반환해 SlashMenu가
 * 열리지 않는다(check-list-item-block-type-descriptor.test.ts와 동형,
 * RD-001 DELTA-06 선례).
 */
import { describe, expect, it } from "vitest";

import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  listItemBlock,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";

describe("toggleListItem의 public block type descriptor", () => {
  it("caret이 toggleListItem 안에 있으면 blockId·text와 함께 toggleListItem descriptor를 보고한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        listItemBlock("toggle-1", "toggleListItem", "할 일"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "toggle-1") + 1);

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "toggle-1",
      blockType: { type: "toggleListItem" },
      text: "할 일",
    });
  });

  it("중첩 toggleListItem 자식 안 caret도 자식 blockId와 toggleListItem descriptor를 보고한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("parent", "부모", [
          listItemBlock("child-1", "toggleListItem", "자식 할 일"),
        ]),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "child-1") + 1);

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "child-1",
      blockType: { type: "toggleListItem" },
      text: "자식 할 일",
    });
  });

  it("toggleListItem 단일 범위 선택이 blockId와 toggleListItem descriptor를 보고한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        listItemBlock("toggle-1", "toggleListItem", "할 일"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    const start = contentTextStart(tiptap, "toggle-1");
    tiptap.commands.setTextSelection({ from: start, to: start + 2 });

    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "toggle-1",
      blockType: { type: "toggleListItem" },
    });
  });
});
