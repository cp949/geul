/**
 * `toggleHeadingCollapse(blockId)`/`toggleListItemCollapse(blockId)` 명령
 * (RD-004 DELTA-01)을 production EditorController 경계에서 검증한다.
 * `collapsed` 반전 양방향, undo 1회 복원, 대상 부재·타입 불일치 거절,
 * heading의 `isToggleable` guard, 형제·자식 블록 무변경을 다룬다.
 * 트라이앵글 클릭 UI·Slash 메뉴·Turn into는 이 DELTA의 범위 밖이다
 * (RD-004.md DELTA-03·DELTA-04).
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

/**
 * heading 리터럴을 만든다. isToggleable/collapsed는 지정할 때만 필드를
 * 채운다 — 부재가 곧 model 필드 부재와 대응하는 계약(RD-003)을 그대로
 * 반영한다. check-list-item-commands.test.ts의 checkListItemBlock과 같은
 * 이유로 이 파일 전용 리터럴 빌더로 둔다(첫 사용처, G-TST-002 대상 아님).
 */
const headingBlock = (
  id: string,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  text: string,
  options?: { isToggleable?: boolean; collapsed?: boolean; children?: Block[] },
): Block => ({
  id,
  type: "heading",
  level,
  content: text === "" ? [] : [{ text }],
  ...(options?.isToggleable === undefined
    ? {}
    : { isToggleable: options.isToggleable }),
  ...(options?.collapsed === undefined ? {} : { collapsed: options.collapsed }),
  ...(options?.children === undefined ? {} : { children: options.children }),
});

/** toggleListItem 리터럴을 만든다. collapsed 부재/명시를 headingBlock과 동일하게 구분한다. */
const toggleListItemBlock = (
  id: string,
  text: string,
  options?: { collapsed?: boolean; children?: Block[] },
): Block => ({
  id,
  type: "toggleListItem",
  content: text === "" ? [] : [{ text }],
  ...(options?.collapsed === undefined ? {} : { collapsed: options.collapsed }),
  ...(options?.children === undefined ? {} : { children: options.children }),
});

describe("toggleHeadingCollapse", () => {
  it("collapsed가 없는 isToggleable heading을 collapsed: true로 반전한다", () => {
    const source = headingBlock("h-1", 2, "제목", { isToggleable: true });
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.toggleHeadingCollapse("h-1")).toEqual(okResult);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        headingBlock("h-1", 2, "제목", { isToggleable: true, collapsed: true }),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("collapsed: true인 heading을 collapsed: false로 반전한다", () => {
    const source = headingBlock("h-1", 3, "제목", {
      isToggleable: true,
      collapsed: true,
    });
    const { editor } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );

    expect(editor.commands.toggleHeadingCollapse("h-1")).toEqual(okResult);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        headingBlock("h-1", 3, "제목", {
          isToggleable: true,
          collapsed: false,
        }),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });
  });

  it("level 등 나머지 attrs를 그대로 보존한다", () => {
    const source = headingBlock("h-1", 5, "제목", { isToggleable: true });
    const { editor } = mounted(documentOf(source));

    expect(editor.commands.toggleHeadingCollapse("h-1")).toEqual(okResult);

    const [result] = editor.getDocument().blocks;
    expect(result).toMatchObject({ level: 5, isToggleable: true });
  });

  it("존재하지 않는 blockId는 BLOCK_NOT_FOUND를 반환하고 문서·selection을 그대로 둔다", () => {
    const source = headingBlock("h-1", 2, "제목", { isToggleable: true });
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.toggleHeadingCollapse("missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("heading이 아닌 블록에는 COMMAND_NOT_APPLICABLE을 반환하고 문서·selection을 그대로 둔다", () => {
    const source = paragraphBlock("para-1", "본문");
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.toggleHeadingCollapse("para-1")).toEqual(
      notApplicable("toggleHeadingCollapse"),
    );

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("isToggleable이 아닌 heading에는 COMMAND_NOT_APPLICABLE을 반환한다(collapsed:true는 isToggleable:true인 heading만 가질 수 있다)", () => {
    const source = headingBlock("h-1", 2, "제목");
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.toggleHeadingCollapse("h-1")).toEqual(
      notApplicable("toggleHeadingCollapse"),
    );

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("형제·자식 블록의 content·attrs는 건드리지 않고 대상의 collapsed만 바꾼다", () => {
    const child = paragraphBlock("child-1", "자식");
    const source = headingBlock("h-1", 2, "본문", {
      isToggleable: true,
      children: [child],
    });
    const sibling = headingBlock("sibling-1", 2, "형제", {
      isToggleable: true,
      collapsed: true,
    });
    const tail = paragraphBlock("tail", "꼬리");
    const { editor } = mounted(documentOf(source, sibling, tail));

    expect(editor.commands.toggleHeadingCollapse("h-1")).toEqual(okResult);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        headingBlock("h-1", 2, "본문", {
          isToggleable: true,
          collapsed: true,
          children: [child],
        }),
        sibling,
        tail,
      ),
      revision: 1,
    });
  });
});

describe("toggleListItemCollapse", () => {
  it("collapsed가 없는 toggleListItem을 collapsed: true로 반전한다", () => {
    const source = toggleListItemBlock("toggle-1", "항목");
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.toggleListItemCollapse("toggle-1")).toEqual(
      okResult,
    );

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        toggleListItemBlock("toggle-1", "항목", { collapsed: true }),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("collapsed: true인 toggleListItem을 collapsed: false로 반전한다", () => {
    const source = toggleListItemBlock("toggle-1", "항목", {
      collapsed: true,
    });
    const { editor } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );

    expect(editor.commands.toggleListItemCollapse("toggle-1")).toEqual(
      okResult,
    );

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        toggleListItemBlock("toggle-1", "항목", { collapsed: false }),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });
  });

  it("존재하지 않는 blockId는 BLOCK_NOT_FOUND를 반환하고 문서·selection을 그대로 둔다", () => {
    const source = toggleListItemBlock("toggle-1", "항목");
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.toggleListItemCollapse("missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("toggleListItem이 아닌 블록에는 COMMAND_NOT_APPLICABLE을 반환하고 문서·selection을 그대로 둔다", () => {
    const source = paragraphBlock("para-1", "본문");
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.toggleListItemCollapse("para-1")).toEqual(
      notApplicable("toggleListItemCollapse"),
    );

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("형제·자식 블록의 content·attrs는 건드리지 않고 대상의 collapsed만 바꾼다", () => {
    const child = paragraphBlock("child-1", "자식");
    const source = toggleListItemBlock("toggle-1", "본문", {
      children: [child],
    });
    const sibling = toggleListItemBlock("sibling-1", "형제", {
      collapsed: true,
    });
    const tail = paragraphBlock("tail", "꼬리");
    const { editor } = mounted(documentOf(source, sibling, tail));

    expect(editor.commands.toggleListItemCollapse("toggle-1")).toEqual(
      okResult,
    );

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        toggleListItemBlock("toggle-1", "본문", {
          collapsed: true,
          children: [child],
        }),
        sibling,
        tail,
      ),
      revision: 1,
    });
  });
});
