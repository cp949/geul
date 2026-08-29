/**
 * CodeBlock의 indent/outdent가 nestable 부모 경계, 안정 ID 기반 선택 복원,
 * 단일 transaction·undo와 거절 원자성을 지키는지 공개 controller에서 검증한다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { DocumentChangeEvent } from "../src/index.js";
import {
  caretAt,
  documentOf,
  editorState,
  mounted,
  notApplicable,
  paragraphBlock,
  restored,
} from "./editor-controller-support.js";

const codeBlock = {
  id: "code",
  type: "codeBlock",
  content: [{ text: "const value = 1;" }],
  language: "javascript",
} satisfies Block;

const tail = paragraphBlock("tail", "tail");

type NestableParent = Extract<
  Block,
  { type: "paragraph" | "heading" | "quote" }
>;

const parentCases = [
  {
    name: "문단",
    parent: {
      id: "parent",
      type: "paragraph",
      content: [{ text: "parent" }],
    },
  },
  {
    name: "제목",
    parent: {
      id: "parent",
      type: "heading",
      level: 2,
      content: [{ text: "parent" }],
    } satisfies Block,
  },
  {
    name: "인용",
    parent: {
      id: "parent",
      type: "quote",
      content: [{ text: "parent" }],
    },
  },
] satisfies Array<{ name: string; parent: NestableParent }>;

describe("CodeBlock indent/outdent", () => {
  it.each(parentCases)(
    "$name 앞 형제의 자식으로 들여쓰고 다시 내어쓰며 값·action state·선택을 보존한다",
    ({ parent }) => {
      const { editor, tiptap } = mounted(documentOf(parent, codeBlock, tail));
      const sourceStart = caretAt(tiptap, "code").anchor;
      tiptap.commands.setTextSelection({
        from: sourceStart + 2,
        to: sourceStart + 8,
      });

      expect(editor.getBlockNestingActionState("code")).toEqual({
        canIndent: true,
        canOutdent: false,
      });
      expect(editor.commands.indentBlock("code")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument()).toEqual({
        ...documentOf({ ...parent, children: [codeBlock] }, tail),
        revision: 1,
      });
      expect(editor.getBlockNestingActionState("code")).toEqual({
        canIndent: false,
        canOutdent: true,
      });
      expect(tiptap.state.selection.toJSON()).toEqual({
        type: "text",
        anchor: caretAt(tiptap, "code").anchor + 2,
        head: caretAt(tiptap, "code").head + 8,
      });

      expect(editor.commands.outdentBlock("code")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument()).toEqual({
        ...documentOf(parent, codeBlock, tail),
        revision: 2,
      });
      expect(editor.getBlockNestingActionState("code")).toEqual({
        canIndent: true,
        canOutdent: false,
      });
      expect(tiptap.state.selection.toJSON()).toEqual({
        type: "text",
        anchor: caretAt(tiptap, "code").anchor + 2,
        head: caretAt(tiptap, "code").head + 8,
      });
    },
  );

  it("CodeBlock 다음 형제는 leaf 부모의 자식으로 들여쓸 수 없고 dispatch하지 않는다", () => {
    const target = paragraphBlock("target", "target");
    const { editor, tiptap } = mounted(documentOf(codeBlock, target, tail));
    const before = editorState(editor, tiptap);
    let dispatchCount = 0;
    const dispatch = tiptap.view.dispatch.bind(tiptap.view);
    tiptap.view.dispatch = (transaction) => {
      dispatchCount += 1;
      dispatch(transaction);
    };

    expect(editor.getBlockNestingActionState("target")).toEqual({
      canIndent: false,
      canOutdent: false,
    });
    expect(editor.commands.indentBlock("target")).toEqual(
      notApplicable("indentBlock"),
    );
    expect(dispatchCount).toBe(0);
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("들여쓰기와 내어쓰기 성공은 각각 한 번 dispatch하고 undo 한 번으로 문서와 선택을 복원한다", () => {
    const parent = paragraphBlock("parent", "parent");
    const indentInitialDocument = documentOf(parent, codeBlock, tail);
    const indentFixture = mounted(indentInitialDocument);
    indentFixture.tiptap.commands.setTextSelection(
      caretAt(indentFixture.tiptap, "code").anchor + 4,
    );
    const beforeIndent = editorState(
      indentFixture.editor,
      indentFixture.tiptap,
    );
    let indentDispatchCount = 0;
    const indentDispatch = indentFixture.tiptap.view.dispatch.bind(
      indentFixture.tiptap.view,
    );
    indentFixture.tiptap.view.dispatch = (transaction) => {
      indentDispatchCount += 1;
      indentDispatch(transaction);
    };

    expect(indentFixture.editor.commands.indentBlock("code")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(indentDispatchCount).toBe(1);
    expect(indentFixture.changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["code", "tail"],
        reason: "local",
      },
    ] satisfies DocumentChangeEvent[]);
    expect(indentFixture.editor.commands.undo()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editorState(indentFixture.editor, indentFixture.tiptap)).toEqual(
      restored(beforeIndent, 2),
    );
    expect(indentFixture.editor.commands.undo()).toEqual(notApplicable("undo"));

    const outdentInitialDocument = documentOf(
      paragraphBlock("parent", "parent", [codeBlock]),
      tail,
    );
    const outdentFixture = mounted(outdentInitialDocument);
    outdentFixture.tiptap.commands.setTextSelection(
      caretAt(outdentFixture.tiptap, "code").anchor + 4,
    );
    const beforeOutdent = editorState(
      outdentFixture.editor,
      outdentFixture.tiptap,
    );
    let outdentDispatchCount = 0;
    const outdentDispatch = outdentFixture.tiptap.view.dispatch.bind(
      outdentFixture.tiptap.view,
    );
    outdentFixture.tiptap.view.dispatch = (transaction) => {
      outdentDispatchCount += 1;
      outdentDispatch(transaction);
    };

    expect(outdentFixture.editor.commands.outdentBlock("code")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(outdentDispatchCount).toBe(1);
    expect(outdentFixture.editor.commands.undo()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editorState(outdentFixture.editor, outdentFixture.tiptap)).toEqual(
      restored(beforeOutdent, 2),
    );
    expect(outdentFixture.editor.commands.undo()).toEqual(
      notApplicable("undo"),
    );
  });

  it("leaf 부모 거절은 model·PM 문서와 선택·stored marks·revision·event·기존 undo를 보존한다", () => {
    const target = paragraphBlock("target", "target");
    const initialDocument = documentOf(codeBlock, target, tail);
    const { editor, changes, tiptap } = mounted(initialDocument);
    expect(editor.commands.setText("tail", "changed")).toEqual({
      ok: true,
      value: undefined,
    });
    tiptap.commands.setTextSelection(caretAt(tiptap, "target").anchor + 2);
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

    expect(editor.commands.indentBlock("target")).toEqual(
      notApplicable("indentBlock"),
    );
    expect(dispatchCount).toBe(0);
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual(changesBefore);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toEqual({
      ...initialDocument,
      revision: 2,
    });
  });
});
