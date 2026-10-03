/**
 * 여러 블록 선택 변환 계약 — `getSelectionBlocks()`가 선택 범위에 닿은 블록을
 * 모으고 `commands.setBlockTypes()`가 그 블록을 한 번에 바꾼다.
 * 변환 불가 블록은 건너뛰고 나머지를 바꾼다. 변환은 undo 1회로 되돌아간다.
 */
import type { Block } from "@cp949/geul-model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  listItemBlock as list,
  mounted,
  notApplicable,
  paragraphBlock as paragraph,
} from "./list-item-block-type-support.js";

const okResult = { ok: true, value: undefined } as const;

const codeBlock = (id: string, text: string): Block => ({
  id,
  type: "codeBlock",
  language: "text",
  content: [{ text }],
});

const divider = (id: string): Block => ({ id, type: "divider" });

/** firstId 블록 처음부터 lastId 블록 처음까지 선택한다. */
const selectAcross = (
  tiptap: ReturnType<typeof mounted>["tiptap"],
  firstId: string,
  lastId: string,
) => {
  tiptap.view.dispatch(
    tiptap.state.tr.setSelection(
      TextSelection.create(
        tiptap.state.doc,
        contentTextStart(tiptap, firstId),
        contentTextStart(tiptap, lastId) + 1,
      ),
    ),
  );
};

const types = (editor: ReturnType<typeof mounted>["editor"]) =>
  editor.getDocument().blocks.map((block) => block.type);

describe("getSelectionBlocks", () => {
  it("여러 블록에 걸친 선택은 닿은 블록을 문서 순서로 돌려준다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraph("a", "one"),
        list("b", "bulletListItem", "two"),
        paragraph("c", "three"),
        paragraph("d", "four"),
      ),
    );
    selectAcross(tiptap, "a", "c");
    expect(editor.getSelectionBlockType()).toBeNull();
    expect(editor.getSelectionBlocks()).toEqual([
      { blockId: "a", blockType: { type: "paragraph" } },
      { blockId: "b", blockType: { type: "bulletListItem" } },
      { blockId: "c", blockType: { type: "paragraph" } },
    ]);
  });

  it("부모와 자식에 걸친 선택은 둘 다 돌려준다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraph("a", "one", [paragraph("child", "nested")]),
        paragraph("b", "two"),
      ),
    );
    selectAcross(tiptap, "a", "child");
    expect(editor.getSelectionBlocks().map((block) => block.blockId)).toEqual([
      "a",
      "child",
    ]);
  });

  it("타입을 바꿀 수 없는 블록은 건너뛴다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraph("a", "one"), divider("hr"), paragraph("b", "two")),
    );
    selectAcross(tiptap, "a", "b");
    expect(editor.getSelectionBlocks().map((block) => block.blockId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("접힌 캐럿 선택은 블록 하나를 돌려준다", () => {
    const { editor } = mounted(
      documentOf(paragraph("a", "one"), paragraph("b", "two")),
    );
    expect(editor.getSelectionBlocks().map((block) => block.blockId)).toEqual([
      "a",
    ]);
  });
});

describe("setBlockTypes", () => {
  it("여러 문단을 글머리 목록으로 한 번에 바꾸고 undo 1회로 되돌린다", () => {
    const { editor, changes, tiptap } = mounted(
      documentOf(
        paragraph("a", "one"),
        paragraph("b", "two"),
        paragraph("c", "three"),
        paragraph("d", "four"),
      ),
    );
    selectAcross(tiptap, "a", "c");
    const selection = tiptap.state.selection.toJSON();
    changes.length = 0;
    expect(
      editor.commands.setBlockTypes(["a", "b", "c"], {
        type: "bulletListItem",
      }),
    ).toEqual(okResult);
    expect(types(editor)).toEqual([
      "bulletListItem",
      "bulletListItem",
      "bulletListItem",
      "paragraph",
    ]);
    expect(editor.getDocument().blocks[1]).toEqual(
      list("b", "bulletListItem", "two"),
    );
    expect(tiptap.state.selection.toJSON()).toEqual(selection);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["a", "b", "c"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(types(editor)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
  });

  it("여러 목록 항목을 일반 텍스트로 바꾼다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        list("a", "bulletListItem", "one"),
        list("b", "numberedListItem", "two"),
        list("c", "toggleListItem", "three"),
        paragraph("tail", "tail"),
      ),
    );
    selectAcross(tiptap, "a", "c");
    expect(
      editor.commands.setBlockTypes(["a", "b", "c"], { type: "paragraph" }),
    ).toEqual(okResult);
    expect(types(editor)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
  });

  it("이미 같은 타입인 블록은 건너뛰고 나머지만 바꾼다", () => {
    const { editor, changes } = mounted(
      documentOf(
        list("a", "bulletListItem", "one"),
        paragraph("b", "two"),
        paragraph("tail", "tail"),
      ),
    );
    changes.length = 0;
    expect(
      editor.commands.setBlockTypes(["a", "b"], { type: "bulletListItem" }),
    ).toEqual(okResult);
    expect(types(editor)).toEqual([
      "bulletListItem",
      "bulletListItem",
      "paragraph",
    ]);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["b"], reason: "local" },
    ]);
  });

  it("코드 블록은 건너뛰고 나머지를 바꾼다", () => {
    const { editor } = mounted(
      documentOf(
        paragraph("a", "one"),
        codeBlock("code", "x"),
        paragraph("b", "two"),
        paragraph("tail", "tail"),
      ),
    );
    expect(
      editor.commands.setBlockTypes(["a", "code", "b"], {
        type: "bulletListItem",
      }),
    ).toEqual(okResult);
    expect(types(editor)).toEqual([
      "bulletListItem",
      "codeBlock",
      "bulletListItem",
      "paragraph",
    ]);
  });

  it("바뀔 블록이 없으면 거절하고 문서를 건드리지 않는다", () => {
    const { editor, changes } = mounted(
      documentOf(
        list("a", "bulletListItem", "one"),
        list("b", "bulletListItem", "two"),
      ),
    );
    changes.length = 0;
    expect(
      editor.commands.setBlockTypes(["a", "b"], { type: "bulletListItem" }),
    ).toEqual(notApplicable("setBlockType"));
    expect(changes).toEqual([]);
  });

  it("대상이 코드 블록이면 거절한다", () => {
    const { editor } = mounted(
      documentOf(paragraph("a", "one"), paragraph("b", "two")),
    );
    expect(
      editor.commands.setBlockTypes(["a", "b"], { type: "codeBlock" }),
    ).toEqual(notApplicable("setBlockType"));
    expect(types(editor)).toEqual(["paragraph", "paragraph"]);
  });

  it("없는 블록 id가 섞이면 BLOCK_NOT_FOUND로 거절하고 아무것도 바꾸지 않는다", () => {
    const { editor } = mounted(
      documentOf(paragraph("a", "one"), paragraph("b", "two")),
    );
    expect(
      editor.commands.setBlockTypes(["a", "ghost"], { type: "quote" }),
    ).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "ghost" },
    });
    expect(types(editor)).toEqual(["paragraph", "paragraph"]);
  });

  it("빈 id 목록은 거절한다", () => {
    const { editor } = mounted(documentOf(paragraph("a", "one")));
    expect(editor.commands.setBlockTypes([], { type: "quote" })).toEqual(
      notApplicable("setBlockType"),
    );
  });

  it("번호 목록의 startNumber는 첫 블록에만 적용한다", () => {
    const { editor } = mounted(
      documentOf(
        paragraph("a", "one"),
        paragraph("b", "two"),
        paragraph("tail", "tail"),
      ),
    );
    expect(
      editor.commands.setBlockTypes(["a", "b"], {
        type: "numberedListItem",
        startNumber: 5,
      }),
    ).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      list("a", "numberedListItem", "one", { startNumber: 5 }),
      list("b", "numberedListItem", "two"),
      paragraph("tail", "tail"),
    ]);
  });
});
