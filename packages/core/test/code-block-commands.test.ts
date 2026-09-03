/**
 * CodeBlock에 적용하는 타입 비종속 블록 명령의 값·안정 ID·선택·원자성과
 * undo 계약을 공개 EditorController.commands 경계에서 검증한다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { DocumentChangeEvent } from "../src/index.js";
import {
  caretAt,
  documentOf,
  editorState,
  mounted,
  paragraphBlock,
  restored,
} from "./editor-controller-support.js";

/**
 * 명령 fixture가 source와 optional language 보존을 직접 비교할 수 있도록
 * 저장 정규형 CodeBlock을 만든다.
 */
function codeBlock(id: string, source: string, language?: string): Block {
  return {
    id,
    type: "codeBlock",
    content: source === "" ? [] : [{ text: source }],
    ...(language === undefined ? {} : { language }),
  };
}

describe("CodeBlock 타입 비종속 블록 명령", () => {
  it("최상위 CodeBlock을 삭제하고 선택과 문서를 undo 한 번으로 복원한다", () => {
    const initialDocument = documentOf(
      codeBlock("code-1", "const value = 1;", "javascript"),
      paragraphBlock("tail", "tail"),
    );
    const { editor, changes, tiptap } = mounted(initialDocument);
    tiptap.commands.setTextSelection(caretAt(tiptap, "code-1").anchor + 6);
    const before = editorState(editor, tiptap);
    let dispatchCount = 0;
    const dispatch = tiptap.view.dispatch.bind(tiptap.view);
    tiptap.view.dispatch = (transaction) => {
      dispatchCount += 1;
      dispatch(transaction);
    };

    expect(editor.commands.deleteBlock("code-1")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(dispatchCount).toBe(1);
    expect(editorState(editor, tiptap)).toEqual({
      document: {
        ...documentOf(paragraphBlock("tail", "tail")),
        revision: 1,
      },
      selection: caretAt(tiptap, "tail"),
      storedMarks: null,
      tiptapDocument: tiptap.state.doc.toJSON(),
    });
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["code-1", "tail"],
        reason: "local",
      },
    ] satisfies DocumentChangeEvent[]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("중첩 CodeBlock을 삭제하고 같은 부모의 형제와 부모 귀속을 보존한다", () => {
    const nestedCode = codeBlock("code-1", "nested", "typescript");
    const childTail = paragraphBlock("child-tail", "child tail");
    const parent = paragraphBlock("parent", "parent", [nestedCode, childTail]);
    const topTail = paragraphBlock("top-tail", "top tail");
    const { editor, changes, tiptap } = mounted(documentOf(parent, topTail));
    tiptap.commands.setTextSelection(caretAt(tiptap, "code-1").anchor + 3);
    const before = editorState(editor, tiptap);
    let dispatchCount = 0;
    const dispatch = tiptap.view.dispatch.bind(tiptap.view);
    tiptap.view.dispatch = (transaction) => {
      dispatchCount += 1;
      dispatch(transaction);
    };

    expect(editor.commands.deleteBlock("code-1")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(dispatchCount).toBe(1);
    expect(editor.getDocument()).toEqual({
      ...documentOf(paragraphBlock("parent", "parent", [childTail]), topTail),
      revision: 1,
    });
    expect(tiptap.state.selection.toJSON()).toEqual(
      caretAt(tiptap, "child-tail"),
    );
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["code-1", "child-tail"],
        reason: "local",
      },
    ] satisfies DocumentChangeEvent[]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("CodeBlock 복제는 내용과 language를 보존하고 복제본 id만 새로 발급한다", () => {
    const source = "const value = 1;";
    const original = codeBlock("code-1", source, "javascript");
    const tail = paragraphBlock("tail", "tail");
    const { editor, changes, tiptap } = mounted(documentOf(original, tail));
    tiptap.commands.setTextSelection(caretAt(tiptap, "code-1").anchor + 4);
    const before = editorState(editor, tiptap);
    let dispatchCount = 0;
    const dispatch = tiptap.view.dispatch.bind(tiptap.view);
    tiptap.view.dispatch = (transaction) => {
      dispatchCount += 1;
      dispatch(transaction);
    };

    expect(editor.commands.duplicateBlock("code-1")).toEqual({
      ok: true,
      value: { blockId: "id-1" },
    });
    expect(dispatchCount).toBe(1);
    expect(editor.getDocument()).toEqual({
      ...documentOf(original, codeBlock("id-1", source, "javascript"), tail),
      revision: 1,
    });
    expect(tiptap.state.selection.toJSON()).toEqual({
      ...caretAt(tiptap, "id-1"),
      anchor: caretAt(tiptap, "id-1").anchor + source.length,
      head: caretAt(tiptap, "id-1").head + source.length,
    });
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["tail", "id-1"],
        reason: "local",
      },
    ] satisfies DocumentChangeEvent[]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("최상위 CodeBlock을 같은 부모 형제 앞으로 값 손실 없이 이동한다", () => {
    const first = paragraphBlock("first", "first");
    const code = codeBlock("code-1", "let moved = true;", "typescript");
    const tail = paragraphBlock("tail", "tail");
    const { editor, changes, tiptap } = mounted(documentOf(first, code, tail));
    tiptap.commands.setTextSelection(caretAt(tiptap, "code-1").anchor + 4);
    const before = editorState(editor, tiptap);
    let dispatchCount = 0;
    const dispatch = tiptap.view.dispatch.bind(tiptap.view);
    tiptap.view.dispatch = (transaction) => {
      dispatchCount += 1;
      dispatch(transaction);
    };

    expect(editor.commands.moveBlockBefore("code-1", "first")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(dispatchCount).toBe(1);
    expect(editor.getDocument()).toEqual({
      ...documentOf(code, first, tail),
      revision: 1,
    });
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["first", "code-1"],
        reason: "local",
      },
    ] satisfies DocumentChangeEvent[]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("중첩 CodeBlock을 같은 부모 형제 범위에서 값 손실 없이 이동한다", () => {
    const first = paragraphBlock("child-first", "first");
    const code = codeBlock("code-1", "nested moved", "bash");
    const last = paragraphBlock("child-last", "last");
    const parent = paragraphBlock("parent", "parent", [first, code, last]);
    const topTail = paragraphBlock("top-tail", "top tail");
    const { editor, changes, tiptap } = mounted(documentOf(parent, topTail));
    tiptap.commands.setTextSelection(caretAt(tiptap, "code-1").anchor + 3);
    const before = editorState(editor, tiptap);
    let dispatchCount = 0;
    const dispatch = tiptap.view.dispatch.bind(tiptap.view);
    tiptap.view.dispatch = (transaction) => {
      dispatchCount += 1;
      dispatch(transaction);
    };

    expect(editor.commands.moveBlockBefore("code-1", "child-first")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(dispatchCount).toBe(1);
    expect(editor.getDocument()).toEqual({
      ...documentOf(
        paragraphBlock("parent", "parent", [code, first, last]),
        topTail,
      ),
      revision: 1,
    });
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["child-first", "code-1"],
        reason: "local",
      },
    ] satisfies DocumentChangeEvent[]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("CodeBlock 다음 형제에 새 문단을 삽입하고 그 문단으로 선택을 옮긴다", () => {
    const code = codeBlock("code-1", "insert after", "python");
    const tail = paragraphBlock("tail", "tail");
    const { editor, changes, tiptap } = mounted(documentOf(code, tail));
    tiptap.commands.setTextSelection(caretAt(tiptap, "code-1").anchor + 2);
    const before = editorState(editor, tiptap);
    let dispatchCount = 0;
    const dispatch = tiptap.view.dispatch.bind(tiptap.view);
    tiptap.view.dispatch = (transaction) => {
      dispatchCount += 1;
      dispatch(transaction);
    };

    expect(editor.commands.insertParagraphAfter("code-1")).toEqual({
      ok: true,
      value: { blockId: "id-1" },
    });
    expect(dispatchCount).toBe(1);
    expect(editor.getDocument()).toEqual({
      ...documentOf(code, paragraphBlock("id-1", ""), tail),
      revision: 1,
    });
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-1"));
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["tail", "id-1"],
        reason: "local",
      },
    ] satisfies DocumentChangeEvent[]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("중첩 CodeBlock 뒤에는 같은 부모의 다음 형제로 새 문단을 삽입한다", () => {
    const code = codeBlock("code-1", "nested insert", "kotlin");
    const childTail = paragraphBlock("child-tail", "child tail");
    const parent = paragraphBlock("parent", "parent", [code, childTail]);
    const topTail = paragraphBlock("top-tail", "top tail");
    const { editor, changes, tiptap } = mounted(documentOf(parent, topTail));
    tiptap.commands.setTextSelection(caretAt(tiptap, "code-1").anchor + 4);
    const before = editorState(editor, tiptap);
    let dispatchCount = 0;
    const dispatch = tiptap.view.dispatch.bind(tiptap.view);
    tiptap.view.dispatch = (transaction) => {
      dispatchCount += 1;
      dispatch(transaction);
    };

    expect(editor.commands.insertParagraphAfter("code-1")).toEqual({
      ok: true,
      value: { blockId: "id-1" },
    });
    expect(dispatchCount).toBe(1);
    expect(editor.getDocument()).toEqual({
      ...documentOf(
        paragraphBlock("parent", "parent", [
          code,
          paragraphBlock("id-1", ""),
          childTail,
        ]),
        topTail,
      ),
      revision: 1,
    });
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-1"));
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["child-tail", "id-1"],
        reason: "local",
      },
    ] satisfies DocumentChangeEvent[]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("CodeBlock generic command의 unknown ID와 no-op 거절은 전체 상태와 기존 undo를 보존한다", () => {
    // Issue #125(D1)부터 moveBlockBefore는 cross-parent 이동을 허용한다 —
    // 이 테스트는 그와 무관하게 여전히 거절되는 경우(BLOCK_NOT_FOUND, 같은
    // 부모 안 이미 그 자리인 no-op)만 남긴다. cross-parent 성공은 아래
    // "CodeBlock의 cross-parent moveBlockBefore가 성공하고..." 테스트가
    // 검증한다.
    const code = codeBlock("code-1", "reject", "text");
    const childTail = paragraphBlock("child-tail", "child tail");
    const firstParent = paragraphBlock("parent-1", "parent one", [
      code,
      childTail,
    ]);
    const topTail = paragraphBlock("top-tail", "tail");
    const { editor, changes, tiptap } = mounted(
      documentOf(firstParent, topTail),
    );
    expect(editor.commands.setText("top-tail", "changed")).toEqual({
      ok: true,
      value: undefined,
    });
    tiptap.commands.setTextSelection(
      caretAt(tiptap, "top-tail").anchor + "changed".length,
    );
    expect(tiptap.commands.setMark("bold")).toBe(true);
    const before = editorState(editor, tiptap);
    expect(before.storedMarks).toEqual([{ type: "bold" }]);
    const changesBefore = [...changes];
    let dispatchCount = 0;
    const dispatch = tiptap.view.dispatch.bind(tiptap.view);
    tiptap.view.dispatch = (transaction) => {
      dispatchCount += 1;
      dispatch(transaction);
    };

    expect(editor.commands.deleteBlock("missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.commands.duplicateBlock("missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.commands.insertParagraphAfter("missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.commands.moveBlockBefore("missing", null)).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.commands.moveBlockBefore("code-1", "missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.commands.moveBlockBefore("code-1", "child-tail")).toEqual({
      ok: false,
      error: {
        code: "COMMAND_NOT_APPLICABLE",
        command: "moveBlockBefore",
      },
    });
    expect(dispatchCount).toBe(0);
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual(changesBefore);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toEqual({
      ...documentOf(firstParent, topTail),
      revision: 2,
    });
  });

  it("CodeBlock의 cross-parent moveBlockBefore가 성공하고 language·content를 보존하며 undo 1회로 복원된다(Issue #125 D1)", () => {
    const code = codeBlock("code-1", "reject", "text");
    const childTail = paragraphBlock("child-tail", "child tail");
    const firstParent = paragraphBlock("parent-1", "parent one", [
      code,
      childTail,
    ]);
    const otherChild = paragraphBlock("other-child", "other");
    const secondParent = paragraphBlock("parent-2", "parent two", [otherChild]);
    const topTail = paragraphBlock("top-tail", "tail");
    const { editor } = mounted(
      documentOf(firstParent, secondParent, topTail),
    );
    const before = editor.getDocument();

    expect(editor.commands.moveBlockBefore("code-1", "other-child")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks).toMatchObject([
      { id: "parent-1", children: [{ id: "child-tail" }] },
      {
        id: "parent-2",
        children: [
          {
            id: "code-1",
            type: "codeBlock",
            language: "text",
            content: [{ text: "reject" }],
          },
          { id: "other-child" },
        ],
      },
      { id: "top-tail" },
    ]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });
});
