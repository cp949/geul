/**
 * checkListItem의 caret·selection block type descriptor(RD-001 DELTA-06)를
 * production EditorController 경계에서 검증한다. 이 계약이 없으면
 * getCaretBlockContext()가 checkListItem 안에서 null을 반환해 SlashMenu가
 * 열리지 않는다(block-type-descriptor.test.ts의 leaf 매핑 단위 테스트와
 * 별개로, 실제 PM node → descriptor 경로를 EditorController로 고정한다).
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";

/** listItemBlock은 ListItemBlockType(bullet/numbered)만 받으므로 여기서 checkListItem 리터럴을 직접 만든다(G-TST-002, check-list-item-commands.test.ts와 동일). */
const checkListItemBlock = (
  id: string,
  text: string,
  checked: boolean,
  children?: Block[],
): Block => ({
  id,
  type: "checkListItem",
  checked,
  content: text === "" ? [] : [{ text }],
  ...(children === undefined ? {} : { children }),
});

describe("checkListItem의 public block type descriptor", () => {
  it("caret이 checkListItem 안에 있으면 blockId·text와 함께 checkListItem descriptor를 보고한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        checkListItemBlock("task-1", "할 일", false),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "task-1") + 1);

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "task-1",
      blockType: { type: "checkListItem" },
      text: "할 일",
    });
  });

  it("중첩 checkListItem 자식 안 caret도 자식 blockId와 checkListItem descriptor를 보고한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("parent", "부모", [
          checkListItemBlock("child-1", "자식 할 일", true),
        ]),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "child-1") + 1);

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "child-1",
      blockType: { type: "checkListItem" },
      text: "자식 할 일",
    });
  });

  it("checkListItem 단일 범위 선택이 blockId와 checkListItem descriptor를 보고한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        checkListItemBlock("task-1", "할 일", false),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    const start = contentTextStart(tiptap, "task-1");
    tiptap.commands.setTextSelection({ from: start, to: start + 2 });

    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "task-1",
      blockType: { type: "checkListItem" },
    });
  });
});
