import type { Result } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import {
  createEditor,
  type Block,
  type EditorError,
  type PartialBlock,
} from "../src/index.js";
import {
  calloutBlock,
  documentOf,
  editorState,
  headingBlock,
  mounted,
  notApplicable,
  paragraphBlock,
  restored,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const twoParagraphDocument = () =>
  documentOf(
    paragraphBlock("block-1", "one"),
    paragraphBlock("block-2", "two"),
  );

/** helper가 받는 명령 결과 — setter(void)·updateBlock(Block)·replaceBlocks. */
type CrudResult =
  | Result<void, EditorError>
  | Result<Block, EditorError>
  | Result<{ insertedBlocks: Block[]; removedBlocks: Block[] }, EditorError>;

/**
 * 재적용이 빈 history 단위를 남기지 않는지 단언한다(Issue #377, G-EDT-001).
 * 순서는 apply ok → reapply notApplicable(command) → 재적용 전후
 * editorState·changes 동일 → undo 1회가 apply 이전으로 복원이다.
 * 빈 단위가 남았다면 마지막 undo가 그 단위를 소비해 복원되지 않는다.
 * expectSameValueReapplyIsNoop(editor-controller-support.ts)은 Result<void>를
 * 가정해 Result<Block>인 updateBlock에 쓰지 못한다.
 */
const expectReapplyIsNoop = (
  fixture: ReturnType<typeof mounted>,
  apply: () => CrudResult,
  reapply: () => CrudResult,
  command: string,
): void => {
  const { editor, tiptap, changes } = fixture;
  const before = editorState(editor, tiptap);

  expect(apply().ok).toBe(true);
  const applied = editorState(editor, tiptap);
  const appliedChanges = [...changes];

  expect(reapply()).toEqual(notApplicable(command));
  expect(editorState(editor, tiptap)).toEqual(applied);
  expect(changes).toEqual(appliedChanges);

  expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
  expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
};

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

describe("에디터 컨트롤러 범용 블록 조작 API(DOC-005) — updateBlock 같은 내용 재적용(Issue #377, G-EDT-001)", () => {
  it("callout에 같은 icon·배경색을 다시 적용하면 COMMAND_NOT_APPLICABLE이고 undo 1회가 직전 변경을 되돌린다", () => {
    const fixture = mounted(
      documentOf(calloutBlock("c-1", "안내"), paragraphBlock("tail", "tail")),
    );
    const applyPreset = () =>
      fixture.editor.updateBlock("c-1", {
        type: "callout",
        icon: "💡",
        backgroundColor: "#AABBCC",
      });

    expectReapplyIsNoop(fixture, applyPreset, applyPreset, "updateBlock");
  });

  it("다른 명령이 만든 속성과 같은 내용의 updateBlock은 거절되고 undo가 그 명령을 되돌린다", () => {
    const fixture = mounted(
      documentOf(paragraphBlock("p-1", "one"), paragraphBlock("tail", "tail")),
    );

    expectReapplyIsNoop(
      fixture,
      () => fixture.editor.commands.setBlockTextColor("p-1", "#AABBCC"),
      () => fixture.editor.updateBlock("p-1", { type: "paragraph" }),
      "updateBlock",
    );
    expect(fixture.editor.getDocument().blocks[0]).not.toHaveProperty(
      "textColor",
    );
  });

  it("자식 딸린 블록도 같은 내용이면 거절되고 undo가 직전 변경을 되돌린다", () => {
    const fixture = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [paragraphBlock("c-1", "child")]),
        paragraphBlock("tail", "tail"),
      ),
    );

    expectReapplyIsNoop(
      fixture,
      () => fixture.editor.commands.setBlockTextColor("p-1", "#AABBCC"),
      () =>
        fixture.editor.updateBlock("p-1", {
          type: "paragraph",
          textColor: "#AABBCC",
        }),
      "updateBlock",
    );
  });

  it("children를 빈 배열로 비우는 호출은 같은 내용이 아니므로 적용되고 undo 1회로 복원된다", () => {
    const fixture = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [paragraphBlock("c-1", "child")]),
        paragraphBlock("tail", "tail"),
      ),
    );
    const { editor, tiptap } = fixture;
    const before = editorState(editor, tiptap);

    const result = editor.updateBlock("p-1", {
      type: "paragraph",
      children: [],
    });

    expect(result.ok).toBe(true);
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("p-1", "one"),
    );
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
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

  it("자기 자신과 같은 id·내용으로 교체하면 COMMAND_NOT_APPLICABLE이고 undo 1회가 직전 변경을 되돌린다(Issue #377)", () => {
    const fixture = mounted(threeParagraphDocument());

    expectReapplyIsNoop(
      fixture,
      () => fixture.editor.commands.setBlockTextColor("block-2", "#AABBCC"),
      () =>
        fixture.editor.replaceBlocks(
          ["block-2"],
          [
            {
              id: "block-2",
              type: "paragraph",
              content: [{ text: "two" }],
              textColor: "#AABBCC",
            },
          ],
        ),
      "replaceBlocks",
    );
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

  describe("제거 대상과 같은 id의 블록 삽입(Issue #386)", () => {
    /** 기대 문서를 새 편집기로 로드해 PM 문서 JSON을 얻는다. */
    const tiptapDocumentOf = (document: ReturnType<typeof documentOf>) => {
      const expected = mounted(document);
      return editorState(expected.editor, expected.tiptap).tiptapDocument;
    };

    it("최상위 블록을 같은 id로 교체하면 성공하고 새 블록이 원래 자리에 하나만 남는다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("p-1", "a"),
          paragraphBlock("p-2", "two"),
          tailParagraphBlock,
        ),
      );
      const { editor, tiptap } = fixture;

      const result = editor.replaceBlocks(
        ["p-1"],
        [paragraphBlock("p-1", "b")],
      );

      expect(result).toEqual({
        ok: true,
        value: {
          insertedBlocks: [paragraphBlock("p-1", "b")],
          removedBlocks: [paragraphBlock("p-1", "a")],
        },
      });
      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "b"),
        paragraphBlock("p-2", "two"),
        tailParagraphBlock,
      ]);
      expect(editorState(editor, tiptap).tiptapDocument).toEqual(
        tiptapDocumentOf(
          documentOf(
            paragraphBlock("p-1", "b"),
            paragraphBlock("p-2", "two"),
            tailParagraphBlock,
          ),
        ),
      );
    });

    it("부모의 유일한 자식을 같은 id로 교체하면 부모 구조가 유지된다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("p-1", "parent", [paragraphBlock("c-1", "a")]),
          tailParagraphBlock,
        ),
      );
      const { editor, tiptap } = fixture;

      const result = editor.replaceBlocks(
        ["c-1"],
        [paragraphBlock("c-1", "b")],
      );

      expect(result.ok).toBe(true);
      const expected = documentOf(
        paragraphBlock("p-1", "parent", [paragraphBlock("c-1", "b")]),
        tailParagraphBlock,
      );
      expect(editor.getDocument().blocks).toEqual(expected.blocks);
      expect(editorState(editor, tiptap).tiptapDocument).toEqual(
        tiptapDocumentOf(expected),
      );
    });

    it("형제 여럿 중 하나를 같은 id로 교체하면 형제 순서가 유지된다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("p-1", "parent", [
            paragraphBlock("c-1", "one"),
            paragraphBlock("c-2", "a"),
            paragraphBlock("c-3", "three"),
          ]),
          tailParagraphBlock,
        ),
      );
      const { editor, tiptap } = fixture;

      const result = editor.replaceBlocks(
        ["c-2"],
        [paragraphBlock("c-2", "b")],
      );

      expect(result.ok).toBe(true);
      const expected = documentOf(
        paragraphBlock("p-1", "parent", [
          paragraphBlock("c-1", "one"),
          paragraphBlock("c-2", "b"),
          paragraphBlock("c-3", "three"),
        ]),
        tailParagraphBlock,
      );
      expect(editor.getDocument().blocks).toEqual(expected.blocks);
      expect(editorState(editor, tiptap).tiptapDocument).toEqual(
        tiptapDocumentOf(expected),
      );
    });

    it("앵커가 아닌 제거 대상과 같은 id로 삽입하면 앵커 자리에 새 블록만 남는다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("p-1", "one"),
          paragraphBlock("p-2", "two"),
          tailParagraphBlock,
        ),
      );
      const { editor, tiptap } = fixture;

      const result = editor.replaceBlocks(
        ["p-1", "p-2"],
        [paragraphBlock("p-2", "new")],
      );

      expect(result.ok).toBe(true);
      const expected = documentOf(
        paragraphBlock("p-2", "new"),
        tailParagraphBlock,
      );
      expect(editor.getDocument().blocks).toEqual(expected.blocks);
      expect(editorState(editor, tiptap).tiptapDocument).toEqual(
        tiptapDocumentOf(expected),
      );
    });

    it("삽입 블록의 자식이 제거 대상 id를 재사용해도 그 자식이 남는다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("p-1", "one"),
          paragraphBlock("p-2", "two"),
          tailParagraphBlock,
        ),
      );
      const { editor, tiptap } = fixture;

      const result = editor.replaceBlocks(
        ["p-1"],
        [paragraphBlock("x", "x", [paragraphBlock("p-1", "c")])],
      );

      expect(result.ok).toBe(true);
      const expected = documentOf(
        paragraphBlock("x", "x", [paragraphBlock("p-1", "c")]),
        paragraphBlock("p-2", "two"),
        tailParagraphBlock,
      );
      expect(editor.getDocument().blocks).toEqual(expected.blocks);
      expect(editorState(editor, tiptap).tiptapDocument).toEqual(
        tiptapDocumentOf(expected),
      );
    });

    it("제거 대상의 옛 자식 id를 삽입 블록의 자식이 재사용하면 새 자식만 남는다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("p-1", "old", [paragraphBlock("c-1", "옛 자식")]),
          tailParagraphBlock,
        ),
      );
      const { editor, tiptap } = fixture;

      const result = editor.replaceBlocks(
        ["p-1"],
        [paragraphBlock("x", "x", [paragraphBlock("c-1", "새 자식")])],
      );

      expect(result.ok).toBe(true);
      const expected = documentOf(
        paragraphBlock("x", "x", [paragraphBlock("c-1", "새 자식")]),
        tailParagraphBlock,
      );
      expect(editor.getDocument().blocks).toEqual(expected.blocks);
      expect(editorState(editor, tiptap).tiptapDocument).toEqual(
        tiptapDocumentOf(expected),
      );
    });

    it("같은 id 교체는 undo 1회로 원복되고 redo로 다시 적용된다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("p-1", "a"),
          paragraphBlock("p-2", "two"),
          tailParagraphBlock,
        ),
      );
      const { editor, tiptap, changes } = fixture;
      const before = editorState(editor, tiptap);

      expect(
        editor.replaceBlocks(["p-1"], [paragraphBlock("p-1", "b")]).ok,
      ).toBe(true);
      const applied = editorState(editor, tiptap);
      expect(changes).toHaveLength(1);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));

      expect(editor.commands.redo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual({
        ...applied,
        document: { ...applied.document, revision: 3 },
      });
    });

    it("같은 id·내용으로 최상위 블록을 교체하면 거절되고 undo 1회가 직전 변경을 되돌린다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("p-1", "one"),
          paragraphBlock("p-2", "two"),
          tailParagraphBlock,
        ),
      );

      expectReapplyIsNoop(
        fixture,
        () => fixture.editor.commands.setBlockTextColor("tail", "#AABBCC"),
        () =>
          fixture.editor.replaceBlocks(["p-1"], [paragraphBlock("p-1", "one")]),
        "replaceBlocks",
      );
    });

    it("같은 id·내용으로 중첩 블록을 교체하면 거절되고 undo 1회가 직전 변경을 되돌린다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("p-1", "parent", [
            paragraphBlock("c-1", "one"),
            paragraphBlock("c-2", "two"),
          ]),
          tailParagraphBlock,
        ),
      );

      expectReapplyIsNoop(
        fixture,
        () => fixture.editor.commands.setBlockTextColor("tail", "#AABBCC"),
        () =>
          fixture.editor.replaceBlocks(["c-2"], [paragraphBlock("c-2", "two")]),
        "replaceBlocks",
      );
    });

    it("여러 블록을 같은 id·내용·순서로 교체하면 거절되고 undo 1회가 직전 변경을 되돌린다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("p-1", "one"),
          paragraphBlock("p-2", "two"),
          tailParagraphBlock,
        ),
      );

      expectReapplyIsNoop(
        fixture,
        () => fixture.editor.commands.setBlockTextColor("tail", "#AABBCC"),
        () =>
          fixture.editor.replaceBlocks(
            ["p-1", "p-2"],
            [paragraphBlock("p-1", "one"), paragraphBlock("p-2", "two")],
          ),
        "replaceBlocks",
      );
    });

    it("인접한 같은 서식 run으로 쪼갠 같은 내용의 재교체는 거절되고 selection·undo 단위가 그대로다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("p-1", "one"),
          paragraphBlock("p-2", "two"),
          tailParagraphBlock,
        ),
      );

      // 모델은 run을 합치지 않고 PM은 합친다 — 모델 기준 가드를 지나도 PM
      // 문서가 같으면 dispatch하지 않아야 한다.
      expectReapplyIsNoop(
        fixture,
        () => fixture.editor.commands.setBlockTextColor("tail", "#AABBCC"),
        () =>
          fixture.editor.replaceBlocks(
            ["p-1"],
            [
              {
                id: "p-1",
                type: "paragraph",
                content: [{ text: "o" }, { text: "ne" }],
              },
            ],
          ),
        "replaceBlocks",
      );
    });

    it("앵커가 문서 순서상 첫 제거 대상이 아니면 앵커 자리에 삽입한다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("a", "A"),
          paragraphBlock("b", "B"),
          paragraphBlock("c", "C"),
          tailParagraphBlock,
        ),
      );
      const { editor, tiptap } = fixture;

      const result = editor.replaceBlocks(
        ["c", "a"],
        [paragraphBlock("n", "N")],
      );

      expect(result.ok).toBe(true);
      const expected = documentOf(
        paragraphBlock("b", "B"),
        paragraphBlock("n", "N"),
        tailParagraphBlock,
      );
      expect(editor.getDocument().blocks).toEqual(expected.blocks);
      expect(editorState(editor, tiptap).tiptapDocument).toEqual(
        tiptapDocumentOf(expected),
      );
    });

    it("앵커가 첫 제거 대상이 아니어도 제거 대상 id를 모두 같은 id로 다시 넣을 수 있다", () => {
      const fixture = mounted(
        documentOf(
          paragraphBlock("a", "A"),
          paragraphBlock("b", "B"),
          paragraphBlock("c", "C"),
          tailParagraphBlock,
        ),
      );
      const { editor, tiptap } = fixture;

      const result = editor.replaceBlocks(
        ["c", "a"],
        [paragraphBlock("a", "A2"), paragraphBlock("c", "C2")],
      );

      expect(result.ok).toBe(true);
      const expected = documentOf(
        paragraphBlock("b", "B"),
        paragraphBlock("a", "A2"),
        paragraphBlock("c", "C2"),
        tailParagraphBlock,
      );
      expect(editor.getDocument().blocks).toEqual(expected.blocks);
      expect(editorState(editor, tiptap).tiptapDocument).toEqual(
        tiptapDocumentOf(expected),
      );
    });

    it.each([
      {
        title: "조상과 자손을 함께 제거하면",
        removeIds: ["p-1", "c-1"],
        inserted: [paragraphBlock("n", "new")],
        error: { code: "COMMAND_NOT_APPLICABLE", command: "replaceBlocks" },
      },
      {
        title: "자손을 먼저 적은 조상과 자손 제거도",
        removeIds: ["c-1", "p-1"],
        inserted: [paragraphBlock("n", "new")],
        error: { code: "COMMAND_NOT_APPLICABLE", command: "replaceBlocks" },
      },
      {
        title: "같은 id를 두 번 제거하면",
        removeIds: ["p-1", "p-1"],
        inserted: [paragraphBlock("n", "new")],
        error: { code: "COMMAND_NOT_APPLICABLE", command: "replaceBlocks" },
      },
      {
        title: "제거하지 않는 id와 겹치는 블록을 삽입하면",
        removeIds: ["p-1"],
        inserted: [paragraphBlock("tail", "dup")],
        error: { code: "DOCUMENT_INVALID", message: "Duplicate id: tail" },
      },
    ])(
      "$title 거절되고 문서·selection·change·undo 단위가 그대로다",
      ({ removeIds, inserted, error }) => {
        const fixture = mounted(
          documentOf(
            paragraphBlock("p-1", "parent", [paragraphBlock("c-1", "child")]),
            tailParagraphBlock,
          ),
        );
        const { editor, tiptap, changes } = fixture;
        const beforePrior = editorState(editor, tiptap);
        expect(editor.commands.setBlockTextColor("tail", "#AABBCC").ok).toBe(
          true,
        );
        const before = editorState(editor, tiptap);
        const beforeChanges = [...changes];

        expect(editor.replaceBlocks(removeIds, inserted)).toEqual({
          ok: false,
          error,
        });

        expect(editorState(editor, tiptap)).toEqual(before);
        expect(changes).toEqual(beforeChanges);
        expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
        expect(editorState(editor, tiptap)).toEqual(restored(beforePrior, 2));
      },
    );
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

  describe("겹치는 제거 대상 거절(Issue #405)", () => {
    // p1 > [c1, c2 > [m1]], p2, tail — 조상 p1, 자식 c2, 손자 m1을 모두 쓴다.
    const nestedDocument = () =>
      documentOf(
        paragraphBlock("p1", "parent", [
          paragraphBlock("c1", "child1"),
          paragraphBlock("c2", "child2", [paragraphBlock("m1", "grand")]),
        ]),
        paragraphBlock("p2", "second"),
        tailParagraphBlock,
      );

    it.each([
      { title: "조상과 자손(p1, c1)", ids: ["p1", "c1"] },
      { title: "자손을 먼저 적은 조상과 자손(c1, p1)", ids: ["c1", "p1"] },
      { title: "조상과 손자(p1, m1)", ids: ["p1", "m1"] },
      { title: "손자을 먼저 적은 조상과 손자(m1, p1)", ids: ["m1", "p1"] },
      { title: "부모와 자식(c2, m1)", ids: ["c2", "m1"] },
      { title: "자식을 먼저 적은 부모와 자식(m1, c2)", ids: ["m1", "c2"] },
      {
        title: "겹치는 쌍이 섞인 세 대상(p2, c1, p1)",
        ids: ["p2", "c1", "p1"],
      },
      { title: "같은 id를 두 번 적으면(p2, p2)", ids: ["p2", "p2"] },
      { title: "자손 id를 두 번 적으면(c1, c1)", ids: ["c1", "c1"] },
    ])(
      "$title 거절되고 문서·selection·change·undo 단위가 그대로다",
      ({ ids }) => {
        const fixture = mounted(nestedDocument());
        const { editor, tiptap, changes } = fixture;
        const beforePrior = editorState(editor, tiptap);
        expect(editor.commands.setBlockTextColor("tail", "#AABBCC").ok).toBe(
          true,
        );
        const before = editorState(editor, tiptap);
        const beforeChanges = [...changes];

        expect(editor.removeBlocks(ids)).toEqual(notApplicable("removeBlocks"));

        expect(editorState(editor, tiptap)).toEqual(before);
        expect(changes).toEqual(beforeChanges);
        expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
        expect(editorState(editor, tiptap)).toEqual(restored(beforePrior, 2));
      },
    );

    it("조상과 자손의 두 인자 순서가 같은 Result를 돌려준다", () => {
      const results = [
        ["p1", "c1"],
        ["c1", "p1"],
        ["p1", "m1"],
        ["m1", "p1"],
      ].map((ids) => mounted(nestedDocument()).editor.removeBlocks(ids));

      for (const result of results) {
        expect(result).toEqual(notApplicable("removeBlocks"));
      }
    });

    it.each([
      { title: "조상 앞", ids: ["p1", "missing", "c1"] },
      { title: "자손 앞", ids: ["c1", "missing", "p1"] },
      { title: "중복 id 사이", ids: ["p2", "missing", "p2"] },
    ])(
      "존재하지 않는 id가 섞이면 겹침 검사보다 먼저 BLOCK_NOT_FOUND다($title)",
      ({ ids }) => {
        const fixture = mounted(nestedDocument());
        const { editor, tiptap, changes } = fixture;
        const before = editorState(editor, tiptap);

        expect(editor.removeBlocks(ids)).toEqual({
          ok: false,
          error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
        });

        expect(editorState(editor, tiptap)).toEqual(before);
        expect(changes).toEqual([]);
      },
    );

    it.each([
      {
        title: "자손과 겹치지 않는 바깥 블록(c1, p2)",
        ids: ["c1", "p2"],
        expected: () =>
          documentOf(
            paragraphBlock("p1", "parent", [
              paragraphBlock("c2", "child2", [paragraphBlock("m1", "grand")]),
            ]),
            tailParagraphBlock,
          ),
      },
      {
        title: "바깥 블록을 먼저 적은 대상(p2, c1)",
        ids: ["p2", "c1"],
        expected: () =>
          documentOf(
            paragraphBlock("p1", "parent", [
              paragraphBlock("c2", "child2", [paragraphBlock("m1", "grand")]),
            ]),
            tailParagraphBlock,
          ),
      },
      {
        title: "깊이가 다른 자손끼리(c1, m1)",
        ids: ["c1", "m1"],
        expected: () =>
          documentOf(
            paragraphBlock("p1", "parent", [paragraphBlock("c2", "child2")]),
            paragraphBlock("p2", "second"),
            tailParagraphBlock,
          ),
      },
      {
        title: "깊이가 다른 자손을 먼저 적은 순서(m1, c1)",
        ids: ["m1", "c1"],
        expected: () =>
          documentOf(
            paragraphBlock("p1", "parent", [paragraphBlock("c2", "child2")]),
            paragraphBlock("p2", "second"),
            tailParagraphBlock,
          ),
      },
      {
        title: "바깥 블록과 손자(p2, m1)",
        ids: ["p2", "m1"],
        expected: () =>
          documentOf(
            paragraphBlock("p1", "parent", [
              paragraphBlock("c1", "child1"),
              paragraphBlock("c2", "child2"),
            ]),
            tailParagraphBlock,
          ),
      },
      {
        title: "형제(c1, c2)",
        ids: ["c1", "c2"],
        expected: () =>
          documentOf(
            paragraphBlock("p1", "parent"),
            paragraphBlock("p2", "second"),
            tailParagraphBlock,
          ),
      },
      {
        title: "형제를 뒤집은 순서(c2, c1)",
        ids: ["c2", "c1"],
        expected: () =>
          documentOf(
            paragraphBlock("p1", "parent"),
            paragraphBlock("p2", "second"),
            tailParagraphBlock,
          ),
      },
    ])(
      "겹치지 않는 대상 — $title 순서와 무관하게 성공하고 undo 1회로 복원된다",
      ({ ids, expected }) => {
        const fixture = mounted(nestedDocument());
        const { editor, tiptap } = fixture;
        const before = editorState(editor, tiptap);

        const result = editor.removeBlocks(ids);

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value.map((block) => block.id)).toEqual(ids);
        expect(editor.getDocument().blocks).toEqual(expected().blocks);

        expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
        expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
      },
    );
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
