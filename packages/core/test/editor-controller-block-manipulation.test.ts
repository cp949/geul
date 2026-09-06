import { describe, expect, it } from "vitest";
import { createEditor, type Block, type PartialBlock } from "../src/index.js";
import { documentOf, paragraphBlock, sequentialIds } from "./editor-controller-support.js";

const twoParagraphDocument = () =>
  documentOf(paragraphBlock("block-1", "one"), paragraphBlock("block-2", "two"));

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
