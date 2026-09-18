/**
 * 삭제·복제·이동·들여쓰기·내어쓰기가 callout에도 다른 nestable 블록과
 * 동일하게 동작함을 최소 스모크로 고정한다(Issue #209 RD-002 DELTA-03).
 * 이 4개 범용 명령의 완료 조건 전체(경계·거절·undo 등)는 paragraph
 * 기준(`editor-controller-blocks.test.ts`, `indent-commands.test.ts`,
 * `block-move-commands.test.ts`)이 이미 소유한다 — quote/toggleListItem도
 * 전용 반복 테스트가 없다(readiness probe 실측). 여기서는 범용 명령이
 * 실제로 callout에도 적용됨(model의 `NestableBlockType` 편입만으로
 * 충분함)을 실증한다.
 */
import { describe, expect, it } from "vitest";

import {
  calloutBlock,
  documentOf,
  editorState,
  mounted,
  okResult,
  paragraphBlock,
  restored,
} from "./editor-controller-support.js";

describe("callout 범용 블록 명령", () => {
  it("삭제하고 undo 1회로 복원한다", () => {
    const source = calloutBlock("callout-1", "안내", "💡");
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.deleteBlock("callout-1")).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("tail", "꼬리"),
    ]);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("복제하면 icon·content·children을 보존한 새 블록이 바로 다음에 생긴다", () => {
    const child = paragraphBlock("child-1", "자식");
    const source = calloutBlock("callout-1", "안내", "💡", [child]);
    const { editor } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );

    const result = editor.commands.duplicateBlock("callout-1");
    expect(result.ok).toBe(true);

    expect(editor.getDocument().blocks[1]).toMatchObject({
      type: "callout",
      icon: "💡",
      content: [{ text: "안내" }],
      children: [{ type: "paragraph", content: [{ text: "자식" }] }],
    });
  });

  it("이동하면 문서 순서가 바뀌고 undo 1회로 복원한다", () => {
    const callout = calloutBlock("callout-1", "안내");
    const before1 = paragraphBlock("before-1", "one");
    const before2 = paragraphBlock("before-2", "two");
    const tail = paragraphBlock("tail", "꼬리");
    const { editor, tiptap } = mounted(
      documentOf(before1, before2, callout, tail),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.moveBlockBefore("callout-1", "before-1")).toEqual(
      okResult,
    );
    expect(editor.getDocument().blocks).toEqual([
      callout,
      before1,
      before2,
      tail,
    ]);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("들여쓰기는 앞 형제의 자식으로 옮기고 내어쓰기로 되돌린다", () => {
    const lead = paragraphBlock("lead", "앞");
    const callout = calloutBlock("callout-1", "안내");
    const tail = paragraphBlock("tail", "꼬리");
    const { editor } = mounted(documentOf(lead, callout, tail));

    expect(editor.commands.indentBlock("callout-1")).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      { ...lead, children: [callout] },
      tail,
    ]);

    expect(editor.commands.outdentBlock("callout-1")).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([lead, callout, tail]);
  });
});
