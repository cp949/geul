/**
 * setCodeBlockWrap(RD-001 DELTA-02, Issue #194)을 고정한다. codeBlock
 * 전용 boolean attr setter로, kind 가드가 여러 값이 아니라 단일 타입
 * (`node.type.name === "codeBlock"`)이라는 점만 media 계열 setter들과
 * 다르고 "찾기→가드→setNodeMarkup 1회" 골격은 동일하다
 * (block-attribute-commands.ts runSetMediaShowPreviewCommand 참고).
 */
import { describe, expect, it } from "vitest";

import {
  codeBlockBlock,
  documentOf,
  editorState,
  mounted,
  notApplicable,
  okResult,
  paragraphBlock,
  restored,
  tailParagraphBlock,
} from "./editor-controller-support.js";

describe("setCodeBlockWrap", () => {
  it("codeBlock 대상에 boolean 값을 단일 트랜잭션으로 세팅하고 undo 1회로 복원한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        codeBlockBlock("code-1", "const a = 1", "javascript"),
        tailParagraphBlock,
      ),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setCodeBlockWrap("code-1", true)).toEqual(okResult);
    expect(editor.getDocument().blocks[0]).toEqual({
      ...codeBlockBlock("code-1", "const a = 1", "javascript"),
      wrap: true,
    });
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["code-1"], reason: "local" },
    ]);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("false로 다시 세팅하면 wrap이 false로 저장된다(off로 되돌리기)", () => {
    // codeBlockBlock의 반환 타입은 넓은 Block 유니온이라 그 결과를
    // 스프레드해 wrap을 더하면(TS) excess-property 검사가 다른 Block
    // 멤버(heading 등) 기준으로 거절한다 — documentOf 인자 자리에서만
    // 이 좁힘이 필요해 여기는 리터럴을 직접 쓴다.
    const { editor } = mounted(
      documentOf({
        id: "code-1",
        type: "codeBlock",
        content: [{ text: "const a = 1" }],
        wrap: true,
      }),
    );

    expect(editor.commands.setCodeBlockWrap("code-1", false)).toEqual(okResult);
    expect(editor.getDocument().blocks[0]).toEqual({
      ...codeBlockBlock("code-1", "const a = 1"),
      wrap: false,
    });
  });

  it("codeBlock이 아닌 대상은 COMMAND_NOT_APPLICABLE이고 문서를 바꾸지 않는다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(paragraphBlock("p-1", "paragraph")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setCodeBlockWrap("p-1", true)).toEqual(
      notApplicable("setCodeBlockWrap"),
    );
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
  });

  it("알 수 없는 blockId는 BLOCK_NOT_FOUND이고 문서를 바꾸지 않는다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(codeBlockBlock("code-1", "source")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setCodeBlockWrap("missing", true)).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
  });
});
