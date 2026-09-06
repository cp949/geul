import { describe, expect, it } from "vitest";
import { createEditor, type Block, type PartialBlock } from "../src/index.js";
import {
  documentOf,
  headingBlock,
  paragraphBlock,
  sequentialIds,
} from "./editor-controller-support.js";

const twoParagraphDocument = () =>
  documentOf(
    paragraphBlock("block-1", "one"),
    paragraphBlock("block-2", "two"),
  );

describe("에디터 컨트롤러 범용 블록 조작 API(DOC-005) — insertBlocks", () => {
  it("기본 placement(before)는 대상 블록 앞에 삽입한다", () => {
    const editor = createEditor({
      initialDocument: twoParagraphDocument(),
      createId: () => "new-1",
    });

    const result = editor.insertBlocks(
      [{ type: "paragraph", content: [{ text: "new" }] }],
      "block-2",
    );

    expect(result).toEqual({
      ok: true,
      value: [{ id: "new-1", type: "paragraph", content: [{ text: "new" }] }],
    });
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-1",
      "new-1",
      "block-2",
    ]);
  });

  it("placement: after는 대상 블록 뒤에 삽입한다", () => {
    const editor = createEditor({
      initialDocument: twoParagraphDocument(),
      createId: () => "new-1",
    });

    const result = editor.insertBlocks(
      [{ type: "paragraph", content: [{ text: "new" }] }],
      "block-1",
      "after",
    );

    expect(result.ok).toBe(true);
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-1",
      "new-1",
      "block-2",
    ]);
  });

  it("id를 생략하면 createId()로 배정하고, 지정하면 그대로 쓴다(완료 조건 2)", () => {
    const editor = createEditor({
      initialDocument: twoParagraphDocument(),
      createId: sequentialIds("gen"),
    });

    const result = editor.insertBlocks(
      [
        { type: "paragraph", content: [{ text: "auto" }] },
        { id: "explicit-id", type: "paragraph", content: [{ text: "manual" }] },
      ],
      "block-2",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.map((b) => b.id)).toEqual(["gen-1", "explicit-id"]);
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-1",
      "gen-1",
      "explicit-id",
      "block-2",
    ]);
  });

  it("타입별 필수 하위 구조가 빠지면 문서를 바꾸지 않고 DOCUMENT_INVALID를 반환한다(완료 조건 3)", () => {
    const before = twoParagraphDocument();
    const editor = createEditor({ initialDocument: before });

    // table 리터럴에 rows/columns/headerRows/headerColumns이 전부 없다 —
    // model 검증이 이를 거절해야 한다.
    const invalidTable = { id: "bad-table", type: "table" } as PartialBlock;
    const result = editor.insertBlocks([invalidTable], "block-2");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("DOCUMENT_INVALID");
    expect(editor.getDocument()).toEqual(before);
  });

  it("여러 블록을 한 번에 삽입해도 undo 1회로 전부 되돌린다(완료 조건 4)", () => {
    const editor = createEditor({
      initialDocument: twoParagraphDocument(),
      createId: sequentialIds("gen"),
    });

    editor.insertBlocks(
      [
        { type: "paragraph", content: [{ text: "a" }] },
        { type: "paragraph", content: [{ text: "b" }] },
      ],
      "block-2",
    );
    expect(editor.getDocument().blocks).toHaveLength(4);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-1",
      "block-2",
    ]);
  });

  it("알 수 없는 blockId에 대해 BLOCK_NOT_FOUND를 반환한다(완료 조건 5)", () => {
    const editor = createEditor({ initialDocument: twoParagraphDocument() });

    const result = editor.insertBlocks(
      [{ type: "paragraph", content: [{ text: "x" }] }],
      "missing",
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("depth 1 블록을 기준으로 삽입해도 같은 부모의 형제로 들어간다(완료 조건 6)", () => {
    const childOne: Block = paragraphBlock("child-1", "one");
    const parent = paragraphBlock("parent-1", "parent", [childOne]);
    // R-12: 자식 딸린 paragraph로 끝나는 문서는 로드 시점 trailing
    // paragraph(UI-010)가 createId()를 먼저 한 번 소비한다 — 상수 factory는
    // 그 trailing과 이 테스트의 삽입이 같은 id로 충돌한다. 순차 factory를
    // 쓴다("new-1"은 trailing이 가져간다, editor-controller-blocks.test.ts와
    // 동일 관례).
    const editor = createEditor({
      initialDocument: documentOf(parent),
      createId: sequentialIds("new"),
    });

    const result = editor.insertBlocks(
      [{ type: "paragraph", content: [{ text: "sibling" }] }],
      "child-1",
      "after",
    );

    expect(result.ok).toBe(true);
    const document = editor.getDocument();
    // blocks 2개 = parent-1(자식 2개로 늘어남) + 로드 시점 trailing "new-1".
    expect(document.blocks).toHaveLength(2);
    expect(document.blocks[0]).toMatchObject({
      id: "parent-1",
      children: [{ id: "child-1" }, { id: "new-2" }],
    });
  });
});

describe("에디터 컨트롤러 범용 블록 조작 API(DOC-005) — updateBlock", () => {
  it("update.type이 기존 블록과 다르면 문서를 바꾸지 않고 COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 1, RD-002.md 확정 결정)", () => {
    const before = twoParagraphDocument();
    const editor = createEditor({ initialDocument: before });

    const result = editor.updateBlock("block-1", {
      type: "heading",
      level: 1,
      content: [{ text: "changed" }],
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "updateBlock" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("같은 타입이면 지정한 필드만 병합하고 나머지는 유지한다(완료 조건 2)", () => {
    const block = {
      id: "block-1",
      type: "paragraph",
      content: [{ text: "one" }],
      textColor: "#FF0000",
    } as Block;
    const editor = createEditor({ initialDocument: documentOf(block) });

    const result = editor.updateBlock("block-1", {
      type: "paragraph",
      content: [{ text: "changed" }],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: "block-1",
        type: "paragraph",
        content: [{ text: "changed" }],
        textColor: "#FF0000",
      },
    });
    expect(editor.getDocument().blocks[0]).toEqual(
      result.ok ? result.value : undefined,
    );
  });

  it("children이 있는 블록을 수정해도 children은 그대로 유지된다(완료 조건 2의 재귀 경계 확인)", () => {
    const child = paragraphBlock("child-1", "child");
    const parent = paragraphBlock("parent-1", "parent", [child]);
    const editor = createEditor({
      initialDocument: documentOf(parent, paragraphBlock("tail", "tail")),
    });

    const result = editor.updateBlock("parent-1", {
      type: "paragraph",
      content: [{ text: "changed" }],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: "parent-1",
        type: "paragraph",
        content: [{ text: "changed" }],
        children: [child],
      },
    });
    expect(editor.getDocument().blocks[0]).toEqual(
      result.ok ? result.value : undefined,
    );
  });

  it("update.id는 무시하고 blockId 인자의 id를 유지한다(설계 결정)", () => {
    const editor = createEditor({ initialDocument: twoParagraphDocument() });

    const result = editor.updateBlock("block-1", {
      id: "renamed",
      type: "paragraph",
      content: [{ text: "changed" }],
    } as PartialBlock);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.id).toBe("block-1");
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-1",
      "block-2",
    ]);
  });

  it("알 수 없는 blockId에 대해 BLOCK_NOT_FOUND를 반환한다(완료 조건 3)", () => {
    const editor = createEditor({ initialDocument: twoParagraphDocument() });

    const result = editor.updateBlock("missing", {
      type: "paragraph",
      content: [{ text: "x" }],
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("병합 결과가 타입별 필수 구조를 위반하면 문서를 바꾸지 않고 DOCUMENT_INVALID를 반환한다(완료 조건 4)", () => {
    const before = documentOf(
      headingBlock("h-1", 1, "title"),
      paragraphBlock("tail", "tail"),
    );
    const editor = createEditor({ initialDocument: before });

    const invalidUpdate = {
      type: "heading",
      level: 99,
    } as unknown as PartialBlock;
    const result = editor.updateBlock("h-1", invalidUpdate);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("DOCUMENT_INVALID");
    expect(editor.getDocument()).toEqual(before);
  });

  it("단일 undo step이다(완료 조건 5)", () => {
    const editor = createEditor({ initialDocument: twoParagraphDocument() });

    editor.updateBlock("block-1", {
      type: "paragraph",
      content: [{ text: "changed" }],
    });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "changed" }],
    });

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "one" }],
    });
  });
});

describe("에디터 컨트롤러 범용 블록 조작 API(DOC-005) — replaceBlocks", () => {
  const threeParagraphDocument = () =>
    documentOf(
      paragraphBlock("block-1", "one"),
      paragraphBlock("block-2", "two"),
      paragraphBlock("block-3", "three"),
    );

  it("blockIdsToRemove를 제거하고 blocksToInsert를 blockIdsToRemove[0] 자리에 삽입한다(완료 조건 6)", () => {
    const editor = createEditor({
      initialDocument: threeParagraphDocument(),
      createId: () => "new-1",
    });

    const result = editor.replaceBlocks(
      ["block-2"],
      [{ type: "paragraph", content: [{ text: "new" }] }],
    );

    expect(result).toEqual({
      ok: true,
      value: {
        insertedBlocks: [
          { id: "new-1", type: "paragraph", content: [{ text: "new" }] },
        ],
        removedBlocks: [
          { id: "block-2", type: "paragraph", content: [{ text: "two" }] },
        ],
      },
    });
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-1",
      "new-1",
      "block-3",
    ]);
  });

  it("여러 blockId를 인자 순서와 무관하게 제거하고, 앵커(첫 번째 id) 자리에 삽입한다(완료 조건 6)", () => {
    const editor = createEditor({
      initialDocument: threeParagraphDocument(),
      createId: sequentialIds("new"),
    });

    const result = editor.replaceBlocks(
      ["block-3", "block-1"],
      [
        { type: "paragraph", content: [{ text: "a" }] },
        { id: "explicit-id", type: "paragraph", content: [{ text: "b" }] },
      ],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.removedBlocks.map((b) => b.id)).toEqual([
      "block-3",
      "block-1",
    ]);
    expect(result.value.insertedBlocks.map((b) => b.id)).toEqual([
      "new-1",
      "explicit-id",
    ]);
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-2",
      "new-1",
      "explicit-id",
    ]);
  });

  it("blockIdsToRemove 중 하나라도 없으면 문서를 바꾸지 않고 BLOCK_NOT_FOUND를 반환한다(완료 조건 7)", () => {
    const before = threeParagraphDocument();
    const editor = createEditor({ initialDocument: before });

    const result = editor.replaceBlocks(
      ["block-2", "missing"],
      [{ type: "paragraph", content: [{ text: "new" }] }],
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("blockIdsToRemove가 빈 배열이면 COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 8)", () => {
    const editor = createEditor({ initialDocument: threeParagraphDocument() });

    const result = editor.replaceBlocks(
      [],
      [{ type: "paragraph", content: [{ text: "new" }] }],
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "replaceBlocks" },
    });
  });

  it("문서의 모든 블록을 제거하고 아무것도 삽입하지 않으면 문서를 바꾸지 않고 DOCUMENT_INVALID를 반환한다(완료 조건 9, R0)", () => {
    const before = documentOf(paragraphBlock("block-1", "one"));
    const editor = createEditor({ initialDocument: before });

    const result = editor.replaceBlocks(["block-1"], []);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("DOCUMENT_INVALID");
    expect(editor.getDocument()).toEqual(before);
  });

  it("삽입 블록이 타입별 필수 구조를 위반하면 문서를 바꾸지 않고 DOCUMENT_INVALID를 반환한다(insertBlocks와 공유하는 검증 재확인)", () => {
    const before = threeParagraphDocument();
    const editor = createEditor({ initialDocument: before });

    const invalidTable = { id: "bad-table", type: "table" } as PartialBlock;
    const result = editor.replaceBlocks(["block-2"], [invalidTable]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("DOCUMENT_INVALID");
    expect(editor.getDocument()).toEqual(before);
  });

  it("단일 undo step이다(완료 조건 10)", () => {
    const editor = createEditor({
      initialDocument: threeParagraphDocument(),
      createId: () => "new-1",
    });

    editor.replaceBlocks(
      ["block-2"],
      [{ type: "paragraph", content: [{ text: "new" }] }],
    );
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-1",
      "new-1",
      "block-3",
    ]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-1",
      "block-2",
      "block-3",
    ]);
  });
});

describe("에디터 컨트롤러 범용 블록 조작 API(DOC-005) — removeBlocks", () => {
  const threeParagraphDocument = () =>
    documentOf(
      paragraphBlock("block-1", "one"),
      paragraphBlock("block-2", "two"),
      paragraphBlock("block-3", "three"),
    );

  it("blockIds 전부를 제거하고 인자 순서로 반환한다(완료 조건 1)", () => {
    const editor = createEditor({ initialDocument: threeParagraphDocument() });

    const result = editor.removeBlocks(["block-3", "block-1"]);

    expect(result).toEqual({
      ok: true,
      value: [
        { id: "block-3", type: "paragraph", content: [{ text: "three" }] },
        { id: "block-1", type: "paragraph", content: [{ text: "one" }] },
      ],
    });
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual(["block-2"]);
  });

  it("blockIds 중 하나라도 없으면 문서를 바꾸지 않고 BLOCK_NOT_FOUND를 반환한다(완료 조건 2)", () => {
    const before = threeParagraphDocument();
    const editor = createEditor({ initialDocument: before });

    const result = editor.removeBlocks(["block-2", "missing"]);

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("blockIds가 빈 배열이면 COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 3)", () => {
    const editor = createEditor({ initialDocument: threeParagraphDocument() });

    const result = editor.removeBlocks([]);

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "removeBlocks" },
    });
  });

  it("문서의 모든 블록을 제거하면 문서를 바꾸지 않고 DOCUMENT_INVALID를 반환한다(완료 조건 4, R0)", () => {
    const before = threeParagraphDocument();
    const editor = createEditor({ initialDocument: before });

    const result = editor.removeBlocks(["block-1", "block-2", "block-3"]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("DOCUMENT_INVALID");
    expect(editor.getDocument()).toEqual(before);
  });

  it("여러 블록을 한 번에 제거해도 undo 1회로 전부 복원한다(완료 조건 5)", () => {
    const editor = createEditor({ initialDocument: threeParagraphDocument() });

    editor.removeBlocks(["block-1", "block-3"]);
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual(["block-2"]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-1",
      "block-2",
      "block-3",
    ]);
  });

  it("자식을 가진 블록을 제거하면 children 서브트리도 함께 사라진다(설계 결정 상속)", () => {
    const child = paragraphBlock("child-1", "child");
    const parent = paragraphBlock("parent-1", "parent", [child]);
    const editor = createEditor({
      initialDocument: documentOf(parent, paragraphBlock("tail", "tail")),
    });

    const result = editor.removeBlocks(["parent-1"]);

    expect(result.ok).toBe(true);
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual(["tail"]);
  });
});

describe("에디터 컨트롤러 범용 블록 조작 API(DOC-006) — moveBlocksUp/moveBlocksDown", () => {
  const fourParagraphDocument = () =>
    documentOf(
      paragraphBlock("block-1", "one"),
      paragraphBlock("block-2", "two"),
      paragraphBlock("block-3", "three"),
      paragraphBlock("block-4", "four"),
    );

  it("연속한 범위를 바로 앞 형제와 통째로 바꾼다(완료 조건 1)", () => {
    const editor = createEditor({ initialDocument: fourParagraphDocument() });

    const result = editor.moveBlocksUp(["block-2", "block-3"]);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-2",
      "block-3",
      "block-1",
      "block-4",
    ]);
  });

  it("범위가 이미 맨 앞이면 문서를 바꾸지 않고 COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 2)", () => {
    const before = fourParagraphDocument();
    const editor = createEditor({ initialDocument: before });

    const result = editor.moveBlocksUp(["block-1", "block-2"]);

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlocksUp" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("연속한 범위를 바로 뒤 형제와 통째로 바꾼다(완료 조건 3)", () => {
    const editor = createEditor({ initialDocument: fourParagraphDocument() });

    const result = editor.moveBlocksDown(["block-2", "block-3"]);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-1",
      "block-4",
      "block-2",
      "block-3",
    ]);
  });

  it("범위가 이미 맨 끝이면 문서를 바꾸지 않고 COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 4)", () => {
    const before = fourParagraphDocument();
    const editor = createEditor({ initialDocument: before });

    const result = editor.moveBlocksDown(["block-3", "block-4"]);

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlocksDown" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("서로 다른 부모의 blockId가 섞이면 문서를 바꾸지 않고 COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 5)", () => {
    // child-2(부모 children 배열의 인덱스 1)와 sib-b(최상위 배열의 인덱스
    // 2)를 섞는다 — 두 인덱스 모두 각자의 경계(맨 앞/맨 뒤)가 아니라서
    // "같은 형제 배열" 검사를 생략해도 startIndex===0 같은 경계 가드에
    // 우연히 걸리지 않는다(mutation 검증으로 실측 확인, 이전 fixture는
    // 우연히 경계에 걸려 이 검사 자체를 격리하지 못했다).
    const parent = paragraphBlock("parent-1", "parent", [
      paragraphBlock("child-1", "c1"),
      paragraphBlock("child-2", "c2"),
      paragraphBlock("child-3", "c3"),
    ]);
    const before = documentOf(
      parent,
      paragraphBlock("sib-a", "a"),
      paragraphBlock("sib-b", "b"),
      paragraphBlock("sib-c", "c"),
      paragraphBlock("tail", "tail"),
    );
    const editor = createEditor({ initialDocument: before });

    const result = editor.moveBlocksUp(["child-2", "sib-b"]);

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlocksUp" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("같은 부모 안에서 연속하지 않으면 문서를 바꾸지 않고 COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 6)", () => {
    const before = fourParagraphDocument();
    const editor = createEditor({ initialDocument: before });

    // block-2·block-4(인덱스 1·3)는 경계(맨 앞/맨 뒤) 가드에 걸리지 않아
    // 연속성 검사 자체를 격리해서 검증한다 — block-1·block-3(인덱스 0·2)를
    // 쓰면 startIndex===0 가드가 먼저 걸려 연속성 검사를 우회해도 우연히
    // 통과한다(mutation 검증으로 실측 확인).
    const result = editor.moveBlocksUp(["block-2", "block-4"]);

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlocksUp" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("알 수 없는 blockId에 대해 BLOCK_NOT_FOUND를 반환한다(완료 조건 7)", () => {
    const editor = createEditor({ initialDocument: fourParagraphDocument() });

    const result = editor.moveBlocksUp(["block-2", "missing"]);

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("blockIds가 빈 배열이면 COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 8)", () => {
    const editor = createEditor({ initialDocument: fourParagraphDocument() });

    expect(editor.moveBlocksUp([])).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlocksUp" },
    });
    expect(editor.moveBlocksDown([])).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlocksDown" },
    });
  });

  it("단일 undo step이다(완료 조건 9)", () => {
    const editor = createEditor({ initialDocument: fourParagraphDocument() });

    editor.moveBlocksUp(["block-2", "block-3"]);
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-2",
      "block-3",
      "block-1",
      "block-4",
    ]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks.map((b) => b.id)).toEqual([
      "block-1",
      "block-2",
      "block-3",
      "block-4",
    ]);
  });

  it("depth 1(중첩) 형제 범위에도 동일하게 동작한다(완료 조건 10)", () => {
    const childA = paragraphBlock("child-a", "a");
    const childB = paragraphBlock("child-b", "b");
    const childC = paragraphBlock("child-c", "c");
    const parent = paragraphBlock("parent-1", "parent", [
      childA,
      childB,
      childC,
    ]);
    const editor = createEditor({
      initialDocument: documentOf(parent, paragraphBlock("tail", "tail")),
    });

    const result = editor.moveBlocksDown(["child-a"]);

    expect(result).toEqual({ ok: true, value: undefined });
    const document = editor.getDocument();
    expect(document.blocks[0]).toMatchObject({
      id: "parent-1",
      children: [{ id: "child-b" }, { id: "child-a" }, { id: "child-c" }],
    });
  });
});
