/**
 * toggleListItem·isToggleable heading의 caret·selection block type
 * descriptor(RD-004 DELTA-04)를 production EditorController 경계에서
 * 검증한다. 이 계약이 없으면 getCaretBlockContext()가 toggleListItem 안에서
 * null을 반환해 SlashMenu가 열리지 않는다(check-list-item-block-type-descriptor.test.ts와
 * 동형, RD-001 DELTA-06 선례). heading의 isToggleable 보고는 checkListItem
 * 선례에 없던 새 축이라 이 파일에서 함께 검증한다.
 */
import type { Block } from "@cp949/geul-model";
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

describe("isToggleable heading의 public block type descriptor", () => {
  /** listItemBlock/paragraphBlock은 heading을 조립하지 않으므로 여기서 heading 리터럴을 직접 만든다(G-TST-002). */
  const headingBlock = (
    id: string,
    level: 1 | 2 | 3 | 4 | 5 | 6,
    text: string,
    isToggleable?: boolean,
  ): Block => ({
    id,
    type: "heading",
    level,
    content: [{ text }],
    ...(isToggleable === undefined ? {} : { isToggleable }),
  });

  it("caret이 isToggleable:true heading 안에 있으면 descriptor에 isToggleable:true가 포함된다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        headingBlock("h-1", 2, "토글 제목", true),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "h-1") + 1);

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "h-1",
      blockType: { type: "heading", level: 2, isToggleable: true },
      text: "토글 제목",
    });
  });

  it("caret이 isToggleable이 없는 일반 heading 안에 있으면 descriptor에 isToggleable 키가 없다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        headingBlock("h-1", 2, "일반 제목"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "h-1") + 1);

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "h-1",
      blockType: { type: "heading", level: 2 },
      text: "일반 제목",
    });
  });
});
