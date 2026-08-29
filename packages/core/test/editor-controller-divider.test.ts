/**
 * insertDivider(삽입 전용) 명령의 원자성 계약(spec §5.1, G-EDT-001)을
 * 고정한다 — 대상 블록 뒤 단일 트랜잭션 삽입·명시 id·selection 명시 이동
 * (다음 형제가 텍스트 블록이면 그 선두, 아니면 빈 paragraph 동반)·
 * clearAfterBlockText의 한 undo 단위·BLOCK_NOT_FOUND 무변경. 함께 divider
 * 대상 setBlockType 거절(기존 가드)과 divider NodeSelection의
 * Backspace/Delete 삭제(PM 기본)를 characterization으로 고정한다. divider
 * 스키마·변환기 왕복은 각자 파일 소유다.
 */
import { describe, expect, it } from "vitest";
import { dispatchKeydown } from "./block-test-support.js";
import {
  caretAt,
  childParagraphBlock,
  dividerBetweenParagraphsDocument,
  dividerBlock,
  dividerD1,
  documentOf,
  editorState,
  editorWithTable,
  firstParagraphBlock,
  mounted,
  mountTiptapEditor,
  nestedParagraphDocument,
  notApplicable,
  okResult,
  paragraphBlock,
  restored,
  secondParagraphBlock,
  selectBlockNode,
} from "./editor-controller-support.js";
import { placeCaretInCell } from "./table-test-support.js";

const twoBlocks = documentOf(firstParagraphBlock, secondParagraphBlock);

/** 삽입 성공 Result 리터럴 — 값 있는 성공은 이 파일 전용이라 로컬에 둔다. */
const inserted = (blockId: string) => ({ ok: true, value: { blockId } });

/**
 * divider d-1에 NodeSelection을 두고 key로 지운 뒤 문서·undo를 단언한다.
 * Backspace/Delete가 공유한다.
 */
const expectKeyDeletesDivider = (key: "Backspace" | "Delete") => {
  const { editor, tiptap } = mounted(dividerBetweenParagraphsDocument());
  selectBlockNode(tiptap, "d-1");
  // 소비 여부는 실측 기록용(Backspace·Delete 모두 true) — 단언은 문서
  // 결과로 한다.
  dispatchKeydown(tiptap, key);
  expect(editor.getDocument().blocks).toEqual([
    firstParagraphBlock,
    secondParagraphBlock,
  ]);
  expect(editor.commands.undo()).toEqual(okResult);
  expect(editor.getDocument().blocks).toEqual([
    firstParagraphBlock,
    dividerD1,
    secondParagraphBlock,
  ]);
};

describe("insertDivider(삽입 전용, G-EDT-001)", () => {
  it("대상 블록 뒤에 divider를 단일 트랜잭션으로 삽입하고 id를 명시 배정하며 undo 1회로 복원한다", () => {
    const { editor, tiptap, changes } = mounted(twoBlocks);
    const before = editorState(editor, tiptap);
    expect(editor.commands.insertDivider("block-1")).toEqual(inserted("id-1"));
    // selection은 다음 케이스가 고정한다 — 여기서는 문서·storedMarks·
    // PM doc·onChange를 본다.
    const after = editorState(editor, tiptap);
    const blocks = [
      firstParagraphBlock,
      dividerBlock("id-1"),
      secondParagraphBlock,
    ];
    expect(after.document).toEqual({ ...before.document, revision: 1, blocks });
    expect(after.storedMarks).toBeNull();
    expect(after.tiptapDocument.content).toContainEqual(
      expect.objectContaining({ type: "divider", attrs: { blockId: "id-1" } }),
    );
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-2", "id-1"], reason: "local" },
      { revision: 2, changedBlockIds: ["id-1", "block-2"], reason: "undo" },
    ]);
  });

  it("다음 형제 블록이 있으면 캐럿이 그 블록 선두로 이동한다", () => {
    const { editor, tiptap } = mounted(twoBlocks);
    expect(editor.commands.insertDivider("block-1")).toEqual(inserted("id-1"));
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "block-2"));
  });

  it("문서 끝이면 divider 뒤 빈 paragraph를 같은 트랜잭션에 삽입하고 캐럿을 그 안에 두며 trailing 확장이 paragraph를 더 만들지 않는다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(firstParagraphBlock),
    );
    expect(editor.commands.insertDivider("block-1")).toEqual(inserted("id-1"));
    // 빈 paragraph의 id는 BlockIdExtension이 같은 dispatch에서 createId로
    // 배정한다.
    const after = editor.getDocument().blocks;
    expect(after).toEqual([
      firstParagraphBlock,
      dividerBlock("id-1"),
      paragraphBlock("id-2", ""),
    ]);
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-2"));
    expect(changes).toHaveLength(1);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([firstParagraphBlock]);
  });

  it("다음 형제가 divider면 이웃 divider를 선택하지 않고 빈 paragraph를 동반해 캐럿을 둔다", () => {
    const { editor, tiptap } = mounted(dividerBetweenParagraphsDocument());
    const before = editorState(editor, tiptap);
    expect(editor.commands.insertDivider("block-1")).toEqual(inserted("id-1"));
    // 이웃 divider d-1에 NodeSelection이 놓이면 다음 타이핑이 d-1을 문단으로
    // 치환한다 — 빈 paragraph 동반이 그 파괴를 막는다.
    expect(editor.getDocument().blocks).toEqual([
      firstParagraphBlock,
      dividerBlock("id-1"),
      paragraphBlock("id-2", ""),
      dividerD1,
      secondParagraphBlock,
    ]);
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-2"));
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("다음 형제가 표면 셀에 들어가지 않고 빈 paragraph를 동반해 캐럿을 둔다", () => {
    const { editor } = editorWithTable(1, 1);
    const { tiptap } = mountTiptapEditor(editor);
    // editorWithTable(1,1)은 id-1..id-4(열·행·셀·표)와 trailing 문단 id-5를
    // 소비한다 — divider가 id-6, 동반 paragraph가 id-7을 받는다.
    const [content, table, trailing] = editor.getDocument().blocks;
    expect(editor.commands.insertDivider("block-1")).toEqual(inserted("id-6"));
    expect(editor.getDocument().blocks).toEqual([
      content,
      dividerBlock("id-6"),
      paragraphBlock("id-7", ""),
      table,
      trailing,
    ]);
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-7"));
  });

  it("중첩 위치(자식 블록) 뒤 삽입은 같은 blockGroup의 형제로 들어간다", () => {
    const { editor, tiptap, changes } = mounted(nestedParagraphDocument());
    // parent-1이 자식을 가져 로드 시 trailing paragraph(id-1)가 붙는다 —
    // 로드 직후를 기준으로 본다.
    const loaded = editor.getDocument().blocks;
    expect(editor.commands.insertDivider("child-1")).toEqual(inserted("id-2"));
    // blockGroup 끝이라 "다음 형제 없음" 규칙이 같이 적용돼 빈
    // paragraph(id-3)가 동반된다.
    const children = [
      childParagraphBlock,
      dividerBlock("id-2"),
      paragraphBlock("id-3", ""),
    ];
    const after = editor.getDocument().blocks;
    expect(after).toEqual([{ ...loaded[0], children }, ...loaded.slice(1)]);
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-3"));
    expect(changes).toHaveLength(1);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual(loaded);
  });

  it("알 수 없는 afterBlockId는 BLOCK_NOT_FOUND이고 문서·selection이 무변경이다", () => {
    const { editor, tiptap, changes } = mounted(twoBlocks);
    const before = editorState(editor, tiptap);
    expect(editor.commands.insertDivider("missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("clearAfterBlockText가 트리거 텍스트 삭제와 divider 삽입을 한 undo 단위로 묶는다", () => {
    const slash = paragraphBlock("block-1", "/divider");
    const { editor, tiptap, changes } = mounted(
      documentOf(slash, secondParagraphBlock),
    );
    const before = editorState(editor, tiptap);
    expect(
      editor.commands.insertDivider("block-1", { clearAfterBlockText: true }),
    ).toEqual(inserted("id-1"));
    const after = editor.getDocument().blocks;
    expect(after).toEqual([
      paragraphBlock("block-1", ""),
      dividerBlock("id-1"),
      secondParagraphBlock,
    ]);
    expect(changes).toHaveLength(1);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1", "block-2", "id-1"],
        reason: "local",
      },
      {
        revision: 2,
        changedBlockIds: ["block-1", "id-1", "block-2"],
        reason: "undo",
      },
    ]);
  });

  it("문서 끝 트리거 문단에서 clearAfterBlockText로 삽입하면 빈 문단·divider·빈 paragraph가 한 undo 단위다", () => {
    const slash = paragraphBlock("block-1", "/divider");
    const { editor, tiptap, changes } = mounted(documentOf(slash));
    expect(
      editor.commands.insertDivider("block-1", { clearAfterBlockText: true }),
    ).toEqual(inserted("id-1"));
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("block-1", ""),
      dividerBlock("id-1"),
      paragraphBlock("id-2", ""),
    ]);
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-2"));
    expect(changes).toEqual([
      {
        revision: 1,
        changedBlockIds: ["block-1", "id-1", "id-2"],
        reason: "local",
      },
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([slash]);
    expect(changes).toHaveLength(2);
  });
});

describe("divider와 기존 가드", () => {
  it("divider 대상 setBlockType(paragraph)은 COMMAND_NOT_APPLICABLE이고 문서 무변경이다", () => {
    const { editor, tiptap, changes } = mounted(
      dividerBetweenParagraphsDocument(),
    );
    const before = editorState(editor, tiptap);
    const turned = editor.commands.setBlockType("d-1", { type: "paragraph" });
    expect(turned).toEqual(notApplicable("setBlockType"));
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    // 거절된 명령은 히스토리 항목을 만들지 않는다 — undo할 것이 없다.
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("표 셀 안 캐럿은 getCaretBlockContext가 null이라 슬래시 경로가 id를 못 얻고, 표 id로 insertDivider하면 표 뒤(trailing 문단 앞)에 삽입되며 표 구조는 그대로다", () => {
    const { editor, tableBlockId, cellIds } = editorWithTable(1, 1);
    const { tiptap } = mountTiptapEditor(editor);
    // editorWithTable(1,1)은 id-1..id-4(열·행·셀·표)와 trailing 문단 id-5를
    // 소비한다.
    const [content, table, trailing] = editor.getDocument().blocks;
    const cellId = cellIds[0] ?? "";
    placeCaretInCell(tiptap, cellId);
    expect(editor.getCaretBlockContext()).toBeNull();
    // 셀 id는 블록 id가 아니다 — findBlockPosition이 attrs.blockId만 보므로
    // divider·표 삽입 모두 BLOCK_NOT_FOUND로 거절한다.
    expect(editor.commands.insertDivider(cellId)).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: cellId },
    });
    expect(
      editor.commands.insertTable(cellId, { rows: 1, columns: 1 }),
    ).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: cellId },
    });
    const result = editor.commands.insertDivider(tableBlockId);
    expect(result).toEqual(inserted("id-6"));
    const after = editor.getDocument().blocks;
    expect(after).toEqual([content, table, dividerBlock("id-6"), trailing]);
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "id-5"));
  });
});

describe("divider NodeSelection 삭제(PM 기본 — characterization)", () => {
  it("divider NodeSelection에서 Backspace가 divider를 삭제하고 문서가 유효하며 undo 1회로 복원된다", () => {
    expectKeyDeletesDivider("Backspace");
  });

  it("divider NodeSelection에서 Delete도 같은 결과다", () => {
    expectKeyDeletesDivider("Delete");
  });
});
