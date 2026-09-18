/**
 * `setCalloutIcon(blockId, icon)` 명령(Issue #209 RD-002 DELTA-02)을
 * production EditorController 경계에서 검증한다. icon 설정·교체, undo 1회
 * 복원, 대상 부재·타입 불일치·빈 문자열 거절, 형제·자식 블록 무변경을
 * 다룬다(toggle-collapse-commands.test.ts와 동형). EmojiPicker UI 연동은
 * 이 DELTA의 범위 밖이다(RD-004).
 */
import { describe, expect, it } from "vitest";

import {
  calloutBlock,
  documentOf,
  editorState,
  mounted,
  notApplicable,
  okResult,
  paragraphBlock,
  restored,
} from "./editor-controller-support.js";

describe("setCalloutIcon", () => {
  it("icon이 없는 callout에 icon을 설정한다", () => {
    const source = calloutBlock("callout-1", "안내");
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setCalloutIcon("callout-1", "💡")).toEqual(okResult);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        calloutBlock("callout-1", "안내", "💡"),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("기존 icon을 다른 값으로 교체한다", () => {
    const source = calloutBlock("callout-1", "안내", "💡");
    const { editor } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );

    expect(editor.commands.setCalloutIcon("callout-1", "⚠️")).toEqual(okResult);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        calloutBlock("callout-1", "안내", "⚠️"),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });
  });

  it("존재하지 않는 blockId는 BLOCK_NOT_FOUND를 반환하고 문서·selection을 그대로 둔다", () => {
    const source = calloutBlock("callout-1", "안내");
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setCalloutIcon("missing", "💡")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("callout이 아닌 블록에는 COMMAND_NOT_APPLICABLE을 반환하고 문서·selection을 그대로 둔다", () => {
    const source = paragraphBlock("para-1", "본문");
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setCalloutIcon("para-1", "💡")).toEqual(
      notApplicable("setCalloutIcon"),
    );

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("빈 문자열 icon은 COMMAND_NOT_APPLICABLE로 거절하고 문서·selection을 그대로 둔다", () => {
    const source = calloutBlock("callout-1", "안내", "💡");
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setCalloutIcon("callout-1", "")).toEqual(
      notApplicable("setCalloutIcon"),
    );

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("형제·자식 블록의 content·attrs는 건드리지 않고 대상의 icon만 바꾼다", () => {
    const child = paragraphBlock("child-1", "자식");
    const source = calloutBlock("callout-1", "본문", undefined, [child]);
    const sibling = calloutBlock("sibling-1", "형제", "⚠️");
    const tail = paragraphBlock("tail", "꼬리");
    const { editor } = mounted(documentOf(source, sibling, tail));

    expect(editor.commands.setCalloutIcon("callout-1", "💡")).toEqual(okResult);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        calloutBlock("callout-1", "본문", "💡", [child]),
        sibling,
        tail,
      ),
      revision: 1,
    });
  });
});
