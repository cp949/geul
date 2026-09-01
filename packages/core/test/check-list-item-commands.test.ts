/**
 * `toggleCheckListItemChecked(blockId)` 명령(RD-001 DELTA-03)을 production
 * EditorController 경계에서 검증한다. checked 반전 양방향, undo 1회 복원,
 * 대상 부재·타입 불일치 거절, 형제·자식 블록 무변경을 다룬다. 체크박스
 * 클릭 UI·Slash 메뉴·Turn into는 이 DELTA의 범위 밖이다(그릴링 Q1).
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  documentOf,
  editorState,
  mounted,
  notApplicable,
  okResult,
  paragraphBlock,
  restored,
} from "./editor-controller-support.js";

/** listItemBlock은 ListItemBlockType(bullet/numbered)만 받으므로 여기서 checkListItem 리터럴을 직접 만든다(G-TST-002, check-list-item-editing-ux.test.ts와 동일). */
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

describe("toggleCheckListItemChecked", () => {
  it("checked: false인 항목을 true로 반전한다", () => {
    const source = checkListItemBlock("check-1", "본문", false);
    const { editor, tiptap } = mounted(documentOf(source, paragraphBlock("tail", "꼬리")));
    const before = editorState(editor, tiptap);

    expect(editor.commands.toggleCheckListItemChecked("check-1")).toEqual(
      okResult,
    );

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        checkListItemBlock("check-1", "본문", true),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("checked: true인 항목을 false로 반전한다", () => {
    const source = checkListItemBlock("check-1", "본문", true);
    const { editor } = mounted(documentOf(source, paragraphBlock("tail", "꼬리")));

    expect(editor.commands.toggleCheckListItemChecked("check-1")).toEqual(
      okResult,
    );

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        checkListItemBlock("check-1", "본문", false),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });
  });

  it("존재하지 않는 blockId는 BLOCK_NOT_FOUND를 반환하고 문서·selection을 그대로 둔다", () => {
    const source = checkListItemBlock("check-1", "본문", false);
    const { editor, tiptap } = mounted(documentOf(source, paragraphBlock("tail", "꼬리")));
    const before = editorState(editor, tiptap);

    expect(editor.commands.toggleCheckListItemChecked("missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("checkListItem이 아닌 블록에는 COMMAND_NOT_APPLICABLE을 반환하고 문서·selection을 그대로 둔다", () => {
    const source = paragraphBlock("para-1", "본문");
    const { editor, tiptap } = mounted(documentOf(source, paragraphBlock("tail", "꼬리")));
    const before = editorState(editor, tiptap);

    expect(editor.commands.toggleCheckListItemChecked("para-1")).toEqual(
      notApplicable("toggleCheckListItemChecked"),
    );

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("형제·자식 블록의 content·attrs는 건드리지 않고 대상의 checked만 바꾼다", () => {
    const child = checkListItemBlock("child-1", "자식", false);
    const source = checkListItemBlock("check-1", "본문", false, [child]);
    const sibling = checkListItemBlock("sibling-1", "형제", true);
    const tail = paragraphBlock("tail", "꼬리");
    const { editor } = mounted(documentOf(source, sibling, tail));

    expect(editor.commands.toggleCheckListItemChecked("check-1")).toEqual(
      okResult,
    );

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        checkListItemBlock("check-1", "본문", true, [child]),
        sibling,
        tail,
      ),
      revision: 1,
    });
  });
});
