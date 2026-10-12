/**
 * `setText`의 같은 값 판정이 hardBreak와 인라인 원소를 구분하는지 고정한다
 * (Issue #381, G-EDT-001).
 *
 * 이전 판정은 `textContent === text`였다. `textContent`는 hardBreak와 인라인
 * custom 원소를 빈 문자열로 센다. 줄바꿈이 든 같은 텍스트는 다름으로,
 * 줄바꿈이나 인라인 원소만 지우는 입력은 같음으로 잘못 판정했다.
 *
 * 다루는 축:
 * - 줄바꿈이 든 같은 텍스트 재적용은 history·문서·onChange를 바꾸지 않는다.
 * - 줄바꿈이나 인라인 원소만 다른 입력은 적용된다.
 * - 마크는 판정에 보지 않는다(D1). 마크가 붙은 같은 텍스트는 거절한다.
 * - 빈 문자열과 hardBreak·custom 혼합 입력의 경계.
 */
import type { Document } from "@cp949/geul-model";
import { undoDepth } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";

import type { CustomInlineContentDefinition } from "../src/index.js";
import {
  documentOf,
  editorState,
  mounted,
  notApplicable,
  paragraphBlock,
  restored,
} from "./editor-controller-support.js";

const tag: CustomInlineContentDefinition = {
  render: () => document.createElement("span"),
};

/** `a`, custom 인라인 원소, `b`를 가진 문단 문서. 줄바꿈은 `hardBreak`로 둘 수 있다. */
const customInlineDocument = (leading: string): Document =>
  documentOf(
    {
      id: "p",
      type: "paragraph",
      content: [
        { text: leading },
        { type: "custom", customType: "myTag" },
        { text: "b" },
      ],
    },
    paragraphBlock("tail", "t"),
  );

describe("setText 같은 값 판정 — hardBreak·인라인 원소(Issue #381)", () => {
  it("줄바꿈 든 같은 텍스트 재적용은 거절되고 history·문서·change가 그대로이며 undo가 직전 변경을 되돌린다", () => {
    const fixture = mounted(
      documentOf(paragraphBlock("p", "a\nb"), paragraphBlock("tail", "t")),
    );
    const { editor, tiptap, changes } = fixture;
    const before = editorState(editor, tiptap);

    expect(editor.commands.setText("p", "x\ny")).toEqual({
      ok: true,
      value: undefined,
    });
    const applied = editorState(editor, tiptap);
    const depth = undoDepth(tiptap.state);
    const changeCount = changes.length;

    expect(editor.commands.setText("p", "x\ny")).toEqual(
      notApplicable("setText"),
    );
    expect(editorState(editor, tiptap)).toEqual(applied);
    expect(changes.length).toBe(changeCount);
    expect(undoDepth(tiptap.state)).toBe(depth);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("줄바꿈만 지우는 setText는 적용된다", () => {
    const { editor } = mounted(
      documentOf(paragraphBlock("p", "a\nb"), paragraphBlock("tail", "t")),
    );

    expect(editor.commands.setText("p", "ab")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getBlock("p")).toEqual(paragraphBlock("p", "ab"));
  });

  it("인라인 custom 원소만 지우는 setText는 적용된다", () => {
    const { editor } = mounted(customInlineDocument("a"), {
      customInlineContent: { myTag: tag },
    });

    expect(editor.commands.setText("p", "ab")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getBlock("p")).toEqual(paragraphBlock("p", "ab"));
  });

  it("마크가 붙은 같은 텍스트는 마크를 보지 않고 거절하며 history·문서를 바꾸지 않는다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        {
          id: "p",
          type: "paragraph",
          content: [{ text: "hello", marks: [{ type: "bold" }] }],
        },
        paragraphBlock("tail", "t"),
      ),
    );
    const before = editorState(editor, tiptap);
    const depth = undoDepth(tiptap.state);

    expect(editor.commands.setText("p", "hello")).toEqual(
      notApplicable("setText"),
    );
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toHaveLength(0);
    expect(undoDepth(tiptap.state)).toBe(depth);
    expect(editor.getBlock("p")).toMatchObject({
      content: [{ text: "hello", marks: [{ type: "bold" }] }],
    });
  });

  it("hardBreak만 든 문단에 빈 문자열을 적용하면 빈 문단이 된다", () => {
    const { editor } = mounted(
      documentOf(paragraphBlock("p", "\n"), paragraphBlock("tail", "t")),
    );

    expect(editor.commands.setText("p", "")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getBlock("p")).toEqual(paragraphBlock("p", ""));
  });

  it("hardBreak와 custom 원소가 함께 든 문단에 같은 줄바꿈 텍스트를 적용하면 custom 원소만 사라진다", () => {
    const { editor } = mounted(customInlineDocument("a\n"), {
      customInlineContent: { myTag: tag },
    });

    expect(editor.commands.setText("p", "a\nb")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getBlock("p")).toEqual(paragraphBlock("p", "a\nb"));
  });
});
