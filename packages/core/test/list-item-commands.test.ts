/**
 * 글머리·번호 목록 항목에 적용하는 generic block command와 indent/outdent를
 * production EditorController 경계에서 검증한다. 값·안정 ID·selection·원자성,
 * undo 단위와 Issue #125의 하위 트리 인지 duplicateBlock·cross-parent
 * moveBlockBefore가 목록 판별자·startNumber를 보존하는지를 함께 고정한다.
 */
import type { Block } from "@cp949/geul-model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import {
  caretAt,
  documentOf,
  editorState,
  mounted,
  notApplicable,
  paragraphBlock,
  restored,
  setBoldStoredMark,
} from "./editor-controller-support.js";

/**
 * command fixture가 목록 판별자와 `startNumber` 부재·명시 값, children을
 * 독립 리터럴로 비교할 수 있도록 저장 정규형 목록 항목을 만든다.
 */
function listItemBlock(
  id: string,
  type: "bulletListItem" | "numberedListItem",
  text: string,
  options?: { startNumber?: number; children?: Block[] },
): Block {
  return {
    id,
    type,
    content: text === "" ? [] : [{ text }],
    ...(type === "numberedListItem" && options?.startNumber !== undefined
      ? { startNumber: options.startNumber }
      : {}),
    ...(options?.children === undefined ? {} : { children: options.children }),
  };
}

/**
 * 구조 이동 전후 selection을 안정 ID 기준 상대 오프셋으로 비교한다.
 * 절대 position이 달라져도 같은 목록 콘텐츠 범위를 가리키는지 판정한다.
 */
function selectionOffsets(
  tiptap: ReturnType<typeof mounted>["tiptap"],
  blockId: string,
): { anchor: number; head: number } {
  const position = findBlockPosition(tiptap.state.doc, blockId);
  if (position === null) throw new Error(`${blockId} 위치를 찾지 못했다`);
  return {
    anchor: tiptap.state.selection.anchor - position,
    head: tiptap.state.selection.head - position,
  };
}

describe("목록 항목 공용 블록 명령", () => {
  it("목록 setText는 판별자와 startNumber 부재·명시 값과 children을 보존한다", () => {
    const child = paragraphBlock("child", "자식");
    const cases = [
      listItemBlock("bullet", "bulletListItem", "이전", {
        children: [child],
      }),
      listItemBlock("numbered-auto", "numberedListItem", "이전"),
      listItemBlock("numbered-explicit", "numberedListItem", "이전", {
        startNumber: 37,
      }),
    ];

    for (const source of cases) {
      const tail = paragraphBlock(`tail-${source.id}`, "꼬리");
      const { editor, tiptap } = mounted(documentOf(source, tail));
      const beforeId = source.id;

      expect(editor.commands.setText(source.id, "변경")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument().blocks[0]).toEqual({
        ...source,
        id: beforeId,
        content: [{ text: "변경" }],
      });
      expect(tiptap.state.doc.textContent).toContain("변경");
    }
  });

  it("자식 없는 목록을 삭제·복제·이동하고 같은 부모의 뒤에 문단을 삽입한다", () => {
    const cases = [
      listItemBlock("bullet", "bulletListItem", "글머리"),
      listItemBlock("numbered-auto", "numberedListItem", "자동 번호"),
      listItemBlock("numbered-explicit", "numberedListItem", "명시 번호", {
        startNumber: 9,
      }),
    ];

    for (const source of cases) {
      const first = paragraphBlock(`first-${source.id}`, "앞");
      const tail = paragraphBlock(`tail-${source.id}`, "꼬리");

      const deleted = mounted(documentOf(source, tail));
      const deleteBefore = editorState(deleted.editor, deleted.tiptap);
      expect(deleted.editor.commands.deleteBlock(source.id)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(deleted.editor.getDocument().blocks).toEqual([tail]);
      expect(deleted.editor.commands.undo()).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editorState(deleted.editor, deleted.tiptap)).toEqual(
        restored(deleteBefore, 2),
      );

      const duplicated = mounted(documentOf(source, tail));
      expect(duplicated.editor.commands.duplicateBlock(source.id)).toEqual({
        ok: true,
        value: { blockId: "id-1" },
      });
      expect(duplicated.editor.getDocument().blocks).toEqual([
        source,
        { ...source, id: "id-1" },
        tail,
      ]);

      const moved = mounted(documentOf(first, source, tail));
      expect(
        moved.editor.commands.moveBlockBefore(source.id, first.id),
      ).toEqual({ ok: true, value: undefined });
      expect(moved.editor.getDocument().blocks).toEqual([source, first, tail]);

      const inserted = mounted(documentOf(source, tail));
      expect(inserted.editor.commands.insertParagraphAfter(source.id)).toEqual({
        ok: true,
        value: { blockId: "id-1" },
      });
      expect(inserted.editor.getDocument().blocks).toEqual([
        source,
        paragraphBlock("id-1", ""),
        tail,
      ]);
      expect(inserted.tiptap.state.selection.toJSON()).toEqual(
        caretAt(inserted.tiptap, "id-1"),
      );
    }
  });

  it("목록을 임의 nestable 부모 아래로 들여쓰고 목록 자신도 뒤 형제의 부모가 되며 내어쓰기와 undo가 selection을 복원한다", () => {
    const parent = paragraphBlock("parent", "부모");
    const numbered = listItemBlock(
      "numbered",
      "numberedListItem",
      "선택 텍스트",
      { startNumber: 12 },
    );
    const tail = paragraphBlock("tail", "꼬리");
    const nested = mounted(documentOf(parent, numbered, tail));
    const position = findBlockPosition(nested.tiptap.state.doc, "numbered");
    if (position === null) throw new Error("numbered 위치를 찾지 못했다");
    nested.tiptap.view.dispatch(
      nested.tiptap.state.tr.setSelection(
        TextSelection.create(
          nested.tiptap.state.doc,
          position + 7,
          position + 3,
        ),
      ),
    );
    const before = editorState(nested.editor, nested.tiptap);
    const offsets = selectionOffsets(nested.tiptap, "numbered");

    expect(nested.editor.commands.indentBlock("numbered")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(nested.editor.getDocument().blocks).toEqual([
      paragraphBlock("parent", "부모", [numbered]),
      tail,
    ]);
    expect(selectionOffsets(nested.tiptap, "numbered")).toEqual(offsets);
    expect(nested.editor.commands.undo()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editorState(nested.editor, nested.tiptap)).toEqual(
      restored(before, 2),
    );

    const listParent = listItemBlock("bullet", "bulletListItem", "목록 부모");
    const child = paragraphBlock("child", "자식 후보");
    const parentFixture = mounted(documentOf(listParent, child, tail));
    expect(parentFixture.editor.commands.indentBlock("child")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(parentFixture.editor.getDocument().blocks).toEqual([
      listItemBlock("bullet", "bulletListItem", "목록 부모", {
        children: [child],
      }),
      tail,
    ]);
    expect(parentFixture.editor.commands.outdentBlock("child")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(parentFixture.editor.getDocument().blocks).toEqual([
      listParent,
      child,
      tail,
    ]);

    const nestedList = listItemBlock(
      "nested-numbered",
      "numberedListItem",
      "내어쓸 목록",
      { startNumber: 23 },
    );
    const outdentFixture = mounted(
      documentOf(paragraphBlock("outdent-parent", "부모", [nestedList]), tail),
    );
    const nestedPosition = findBlockPosition(
      outdentFixture.tiptap.state.doc,
      nestedList.id,
    );
    if (nestedPosition === null) {
      throw new Error("중첩 목록 위치를 찾지 못했다");
    }
    outdentFixture.tiptap.view.dispatch(
      outdentFixture.tiptap.state.tr.setSelection(
        TextSelection.create(
          outdentFixture.tiptap.state.doc,
          nestedPosition + 7,
          nestedPosition + 3,
        ),
      ),
    );
    const outdentBefore = editorState(
      outdentFixture.editor,
      outdentFixture.tiptap,
    );
    const outdentOffsets = selectionOffsets(
      outdentFixture.tiptap,
      nestedList.id,
    );

    expect(outdentFixture.editor.commands.outdentBlock(nestedList.id)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(outdentFixture.editor.getDocument()).toEqual({
      ...documentOf(paragraphBlock("outdent-parent", "부모"), nestedList, tail),
      revision: 1,
    });
    expect(selectionOffsets(outdentFixture.tiptap, nestedList.id)).toEqual(
      outdentOffsets,
    );
    expect(outdentFixture.changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["nested-numbered", "tail"],
        reason: "local",
      },
    ]);

    expect(outdentFixture.editor.commands.undo()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editorState(outdentFixture.editor, outdentFixture.tiptap)).toEqual(
      restored(outdentBefore, 2),
    );
    expect(outdentFixture.changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["nested-numbered", "tail"],
        reason: "local",
      },
      {
        revision: 2,
        changedBlockIds: ["nested-numbered", "tail"],
        reason: "undo",
      },
    ]);
  });

  it("목록 명령 성공은 단일 dispatch·변경 이벤트·undo 단위다", () => {
    const numbered = listItemBlock("numbered", "numberedListItem", "복제", {
      startNumber: 21,
    });
    const tail = paragraphBlock("tail", "꼬리");
    const { editor, changes, tiptap } = mounted(documentOf(numbered, tail));
    tiptap.commands.setTextSelection(caretAt(tiptap, "numbered").anchor + 1);
    setBoldStoredMark(tiptap);
    const before = editorState(editor, tiptap);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(editor.commands.duplicateBlock("numbered")).toEqual({
      ok: true,
      value: { blockId: "id-1" },
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.getDocument()).toEqual({
      ...documentOf(numbered, { ...numbered, id: "id-1" }, tail),
      revision: 1,
    });
    expect(tiptap.state.storedMarks).toBeNull();
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual({
      ...restored(before, 2),
      storedMarks: null,
    });
  });

  it("목록 명령 거절과 무연산은 전체 상태와 기존 실행 취소 이력을 보존한다", () => {
    const bullet = listItemBlock("bullet", "bulletListItem", "같음");
    const tail = paragraphBlock("tail", "꼬리");
    const { editor, changes, tiptap } = mounted(documentOf(bullet, tail));
    expect(editor.commands.setText("tail", "변경된 꼬리")).toEqual({
      ok: true,
      value: undefined,
    });
    tiptap.commands.setTextSelection(
      caretAt(tiptap, "tail").anchor + "변경된 꼬리".length,
    );
    setBoldStoredMark(tiptap);
    const before = editorState(editor, tiptap);
    const changesBefore = [...changes];
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(editor.commands.setText("bullet", "같음")).toEqual(
      notApplicable("setText"),
    );
    expect(editor.commands.indentBlock("bullet")).toEqual(
      notApplicable("indentBlock"),
    );
    expect(editor.commands.moveBlockBefore("bullet", "tail")).toEqual(
      notApplicable("moveBlockBefore"),
    );
    expect(editor.commands.deleteBlock("missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual(changesBefore);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toEqual({
      ...documentOf(bullet, tail),
      revision: 2,
    });
  });

  it("목록 setText는 무효 inline text를 mutation 전에 원자적으로 거절한다", () => {
    const bullet = listItemBlock("bullet", "bulletListItem", "원문");
    const tail = paragraphBlock("tail", "꼬리");
    const { editor, changes, tiptap } = mounted(documentOf(bullet, tail));
    tiptap.commands.setTextSelection(caretAt(tiptap, "bullet").anchor + 1);
    setBoldStoredMark(tiptap);
    const before = editorState(editor, tiptap);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(editor.commands.setText("bullet", "\u0000")).toEqual(
      notApplicable("setText"),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
  });

  // Issue #125(D6·D1)부터 자식 딸린 목록의 duplicateBlock과 목록 항목의
  // cross-parent moveBlockBefore는 더 이상 거절되지 않는다 — 이 두 테스트가
  // 옛 "COMMAND_NOT_APPLICABLE로 subtree 전체를 보존한다" 테스트를 새 GREEN
  // 계약(하위 트리 재귀 복제·cross-parent 이동 성공)으로 교체한다. 목록
  // 판별자와 startNumber가 이 파일의 관심사이므로, 두 명령이 그 값을
  // 정확히 보존하는지가 여기서 새로 검증할 핵심이다.
  it("자식 딸린 목록을 duplicateBlock하면 하위 트리를 재귀 복제하고 판별자를 보존하며 undo 1회로 복원된다(Issue #125 D6)", () => {
    const child = paragraphBlock("child", "자식");
    const bullet = listItemBlock("bullet", "bulletListItem", "부모", {
      children: [child],
    });
    const tail = paragraphBlock("tail", "꼬리");
    const { editor } = mounted(documentOf(bullet, tail));
    const before = editor.getDocument();

    expect(editor.commands.duplicateBlock("bullet")).toEqual({
      ok: true,
      value: { blockId: "id-1" },
    });
    expect(editor.getDocument().blocks).toMatchObject([
      { id: "bullet", type: "bulletListItem", children: [{ id: "child" }] },
      {
        id: "id-1",
        type: "bulletListItem",
        content: [{ text: "부모" }],
        children: [{ content: [{ text: "자식" }] }],
      },
      { id: "tail" },
    ]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });

  it("번호 목록의 cross-parent moveBlockBefore가 성공하고 startNumber를 보존하며 undo 1회로 복원된다(Issue #125 D1)", () => {
    const numbered = listItemBlock(
      "numbered",
      "numberedListItem",
      "이동 대상",
      { startNumber: 4 },
    );
    const firstParent = paragraphBlock("parent-1", "첫 부모", [numbered]);
    const otherChild = paragraphBlock("other-child", "다른 자식");
    const secondParent = paragraphBlock("parent-2", "둘째 부모", [otherChild]);
    const tail = paragraphBlock("tail", "꼬리");
    const { editor } = mounted(
      documentOf(firstParent, secondParent, tail),
    );
    const before = editor.getDocument();

    expect(editor.commands.moveBlockBefore("numbered", "other-child")).toEqual(
      { ok: true, value: undefined },
    );
    expect(editor.getDocument().blocks).toMatchObject([
      { id: "parent-1" },
      {
        id: "parent-2",
        children: [
          {
            id: "numbered",
            type: "numberedListItem",
            startNumber: 4,
            content: [{ text: "이동 대상" }],
          },
          { id: "other-child" },
        ],
      },
      { id: "tail" },
    ]);
    expect(editor.getDocument().blocks[0]).not.toHaveProperty("children");

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });
});
