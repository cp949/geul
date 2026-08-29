/**
 * divider를 대상으로 한 기존 블록 명령(duplicateBlock·deleteBlock·
 * moveBlockBefore·insertParagraphAfter·indentBlock/outdentBlock)이 문서
 * 유효성과 selection 계약을 지키는지 고정한다. duplicateBlock은
 * bug-catching(atom 복제본을 NodeSelection으로 선택 — DELTA-04c 완료
 * 조건 1), 나머지는 기존 코드가 이미 성립하는 동작의
 * characterization(완료 조건 2·3)이다. insertDivider(삽입 전용)와 divider
 * NodeSelection의 키보드 삭제는 editor-controller-divider.test.ts 소관이다.
 */
import { describe, expect, it } from "vitest";
import {
  caretAt,
  dividerBetweenParagraphsDocument,
  dividerBlock,
  dividerD1,
  documentOf,
  editorState,
  expectDividerNodeSelection,
  firstParagraphBlock,
  mounted,
  notApplicable,
  okResult,
  oneCellTableBlock,
  paragraphBlock,
  restored,
  secondParagraphBlock,
  selectBlockNode,
} from "./editor-controller-support.js";

describe("duplicateBlock(divider)", () => {
  it("divider 복제가 새 id 복제본을 원본 뒤에 만들고 selection을 복제본 NodeSelection으로 옮기며 undo 1회로 복원한다", () => {
    const { editor, tiptap, changes } = mounted(
      dividerBetweenParagraphsDocument(),
    );
    const before = editorState(editor, tiptap);

    // bug-catching RED(구현 전): 이 selection은 { type: "text", anchor: 9,
    // head: 9 }였다 — 옛 "-2" 산술(blockContainer 전제)이 atom divider에서
    // 블록 사이 위치를 가리켜 stderr에 "TextSelection endpoint not
    // pointing into a node with inline content"를 남겼다.
    expect(editor.commands.duplicateBlock("d-1")).toEqual({
      ok: true,
      value: { blockId: "id-1" },
    });
    expect(editor.getDocument().blocks).toEqual([
      firstParagraphBlock,
      dividerD1,
      dividerBlock("id-1"),
      secondParagraphBlock,
    ]);
    expectDividerNodeSelection(tiptap, "id-1");
    // 실측: 대상 자신(d-1)이 아니라 뒤로 밀린 형제(block-2)와 복제본만
    // 바뀐 것으로 기록된다.
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-2", "id-1"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-2", "id-1"], reason: "local" },
      { revision: 2, changedBlockIds: ["id-1", "block-2"], reason: "undo" },
    ]);
  });

  it("문서 끝 divider 복제는 trailing paragraph 앞에 끼워지고 selection은 여전히 복제본 NodeSelection이다", () => {
    const { editor, tiptap } = mounted(
      documentOf(firstParagraphBlock, dividerD1),
    );
    // d-1로 끝나는 문서라 로드 시 trailing paragraph(UI-010)가 붙는다 —
    // 그 id(id-1)를 소비한 뒤 복제가 id-2를 받는다.
    const loaded = editor.getDocument().blocks;
    expect(loaded).toEqual([
      firstParagraphBlock,
      dividerD1,
      paragraphBlock("id-1", ""),
    ]);

    expect(editor.commands.duplicateBlock("d-1")).toEqual({
      ok: true,
      value: { blockId: "id-2" },
    });
    // 복제본은 원본(d-1) 바로 뒤 = trailing 문단 바로 앞에 들어간다 —
    // trailing 자신은 같은 dispatch에서 새로 늘지 않는다.
    expect(editor.getDocument().blocks).toEqual([
      firstParagraphBlock,
      dividerD1,
      dividerBlock("id-2"),
      paragraphBlock("id-1", ""),
    ]);
    expectDividerNodeSelection(tiptap, "id-2");
  });
});

describe("divider에 대한 기존 명령(characterization)", () => {
  it("deleteBlock(divider)이 문서 유효·id 보존으로 삭제하고 undo 1회로 복원한다", () => {
    const { editor, tiptap, changes } = mounted(
      dividerBetweenParagraphsDocument(),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.deleteBlock("d-1")).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      firstParagraphBlock,
      secondParagraphBlock,
    ]);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["d-1", "block-2"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("moveBlockBefore로 같은 blockGroup 형제 사이에서 divider를 옮기고 undo 1회로 복원한다", () => {
    const childBlock = paragraphBlock("child-1", "child");
    const parent = paragraphBlock("parent-1", "parent", [
      childBlock,
      dividerD1,
    ]);
    const tail = paragraphBlock("tail", "t");
    const { editor, tiptap, changes } = mounted(documentOf(parent, tail));
    const before = editorState(editor, tiptap);

    expect(editor.commands.moveBlockBefore("d-1", "child-1")).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      { ...parent, children: [dividerD1, childBlock] },
      tail,
    ]);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["child-1", "d-1"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["child-1", "d-1"], reason: "local" },
      { revision: 2, changedBlockIds: ["d-1", "child-1"], reason: "undo" },
    ]);
  });

  it("insertParagraphAfter(divider)가 divider 뒤에 문단을 만든다(side-menu Add block 경로)", () => {
    const { editor, tiptap, changes } = mounted(
      dividerBetweenParagraphsDocument(),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.insertParagraphAfter("d-1")).toEqual({
      ok: true,
      value: { blockId: "id-1" },
    });
    expect(editor.getDocument().blocks).toEqual([
      firstParagraphBlock,
      dividerD1,
      paragraphBlock("id-1", ""),
      secondParagraphBlock,
    ]);
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-1"));
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-2", "id-1"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-2", "id-1"], reason: "local" },
      { revision: 2, changedBlockIds: ["id-1", "block-2"], reason: "undo" },
    ]);
  });

  it("divider NodeSelection에서 getCaretBlockContext·getSelectionBlockType이 null이다", () => {
    const { editor, tiptap } = mounted(dividerBetweenParagraphsDocument());

    selectBlockNode(tiptap, "d-1");

    expect(editor.getCaretBlockContext()).toBeNull();
    expect(editor.getSelectionBlockType()).toBeNull();
  });
});

describe("indent/outdent(divider)", () => {
  it("앞 형제가 blockContainer면 indentBlock(divider)이 그 자식이 되고 outdentBlock으로 되돌아온다", () => {
    const { editor } = mounted(dividerBetweenParagraphsDocument());

    expect(editor.commands.indentBlock("d-1")).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      { ...firstParagraphBlock, children: [dividerD1] },
      secondParagraphBlock,
    ]);

    expect(editor.commands.outdentBlock("d-1")).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      firstParagraphBlock,
      dividerD1,
      secondParagraphBlock,
    ]);
  });

  it("앞 형제가 없거나 표면 indentBlock(divider)이 COMMAND_NOT_APPLICABLE이다", () => {
    // (a) 문서 첫 블록 — 앞 형제 자체가 없다.
    const { editor: firstEditor, tiptap: firstTiptap } = mounted(
      documentOf(dividerD1, secondParagraphBlock),
    );
    const beforeFirst = editorState(firstEditor, firstTiptap);
    expect(firstEditor.commands.indentBlock("d-1")).toEqual(
      notApplicable("indentBlock"),
    );
    expect(editorState(firstEditor, firstTiptap)).toEqual(beforeFirst);

    // (b) 앞 형제가 표 — blockContainer가 아니다.
    const { editor, tiptap } = mounted(
      documentOf(oneCellTableBlock("t-1"), dividerD1, secondParagraphBlock),
    );
    const beforeTable = editorState(editor, tiptap);

    expect(editor.commands.indentBlock("d-1")).toEqual(
      notApplicable("indentBlock"),
    );
    expect(editorState(editor, tiptap)).toEqual(beforeTable);
  });
});
