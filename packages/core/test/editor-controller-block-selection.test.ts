import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  documentOf,
  mountTiptapEditor,
  notApplicable,
  okResult,
  paragraphBlock,
  tailParagraphBlock,
} from "./editor-controller-support.js";

/** 같은 부모 형제 3개 — 정규화·범위 성립 케이스가 공유하는 fixture. */
const threeSiblingsDocument = () =>
  documentOf(
    paragraphBlock("block-1", "one"),
    paragraphBlock("block-2", "two"),
    paragraphBlock("block-3", "three"),
  );

/**
 * child-1은 parent-1의 자식, block-2는 최상위 형제다 — 서로 다른 부모
 * (siblings 배열이 다름) 거절 케이스 전용 fixture.
 */
const crossParentDocument = () =>
  documentOf(
    paragraphBlock("parent-1", "parent", [paragraphBlock("child-1", "child")]),
    paragraphBlock("block-2", "two"),
  );

/**
 * 같은 부모 형제 4개 — deleteSelectedBlocks/moveSelectedBlocksBefore의
 * 범위·no-op·끝 이동 케이스가 공유하는 children 없는 fixture(DELTA-02).
 */
const fourSiblingsDocument = () =>
  documentOf(
    paragraphBlock("block-1", "one"),
    paragraphBlock("block-2", "two"),
    paragraphBlock("block-3", "three"),
    paragraphBlock("block-4", "four"),
  );

/**
 * block-1이 child-1a를 가진 4형제 — 범위 안 블록에 children이 딸린
 * 경우(완료 조건 2·8·11)가 공유하는 fixture. hasChildren 가드를 잘못
 * 복사하면(DELTA-02 트랙-4 확인사항 1) block-1을 포함한 이동이 전부
 * 거절돼 조건 11이 실패한다.
 */
const fourSiblingsWithChildDocument = () =>
  documentOf(
    paragraphBlock("block-1", "one", [paragraphBlock("child-1a", "child")]),
    paragraphBlock("block-2", "two"),
    paragraphBlock("block-3", "three"),
    paragraphBlock("block-4", "four"),
  );

/**
 * block-2가 child-2a를 가진 4형제 — deleteSelectedBlocks가 범위 중간
 * 블록의 children까지 통째로 지우는지(완료 조건 2) 검증하는 전용 fixture.
 */
const rangeWithChildrenDocument = () =>
  documentOf(
    paragraphBlock("block-1", "one"),
    paragraphBlock("block-2", "two", [paragraphBlock("child-2a", "child")]),
    paragraphBlock("block-3", "three"),
    paragraphBlock("block-4", "four"),
  );

/**
 * parent-1의 children 두 개가 blockGroup 전체를 이룬다 — 범위가 그
 * blockGroup의 전체 자식과 일치할 때 blockGroup 자체가 제거되는지(완료
 * 조건 3) 검증하는 전용 fixture. tailParagraphBlock으로 닫아 UI-010
 * trailing 정규화가 개입하지 않게 한다.
 */
const wholeGroupDocument = () =>
  documentOf(
    paragraphBlock("parent-1", "parent", [
      paragraphBlock("child-1", "one"),
      paragraphBlock("child-2", "two"),
    ]),
    tailParagraphBlock,
  );

/**
 * parent-1의 children 세 개 중 두 개만 선택 범위에 포함되는 fixture —
 * removesWholeGroup이 "전체 자식과 일치"가 아니라 범위 블록 수만으로
 * 부당하게 true가 되지 않는지(blockGroup이 부당하게 삭제되지 않는지)
 * 검증하는 완료 조건 3의 경계 케이스 전용(DELTA-02 즉시 리뷰 잔여 위험).
 */
const partialGroupDocument = () =>
  documentOf(
    paragraphBlock("parent-1", "parent", [
      paragraphBlock("child-1", "one"),
      paragraphBlock("child-2", "two"),
      paragraphBlock("child-3", "three"),
    ]),
    tailParagraphBlock,
  );

describe("에디터 컨트롤러 다중 블록 선택", () => {
  it("역순 입력을 문서 순서로 정규화해 저장한다", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });

    expect(editor.commands.selectBlockRange("block-3", "block-1")).toEqual(
      okResult,
    );
    expect(editor.getBlockSelection()).toEqual({
      fromBlockId: "block-1",
      toBlockId: "block-3",
    });
  });

  it("서로 다른 부모의 blockId를 거절하고 이전 상태를 보존한다", () => {
    const editor = createEditor({ initialDocument: crossParentDocument() });
    editor.commands.selectBlockRange("parent-1", "parent-1");

    expect(editor.commands.selectBlockRange("child-1", "block-2")).toEqual(
      notApplicable("selectBlockRange"),
    );
    expect(editor.getBlockSelection()).toEqual({
      fromBlockId: "parent-1",
      toBlockId: "parent-1",
    });
  });

  it("존재하지 않는 blockId로 호출하면 누락된 쪽의 blockId로 BLOCK_NOT_FOUND를 반환한다", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });

    expect(editor.commands.selectBlockRange("block-1", "missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.commands.selectBlockRange("missing", "block-1")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
  });

  it("동일한 blockId를 from/to로 호출하면 단일 블록 범위로 성공한다", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });

    expect(editor.commands.selectBlockRange("block-2", "block-2")).toEqual(
      okResult,
    );
    expect(editor.getBlockSelection()).toEqual({
      fromBlockId: "block-2",
      toBlockId: "block-2",
    });
  });

  it("선택 상태가 있을 때 clearBlockSelection이 성공하고 상태를 지운다", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });
    editor.commands.selectBlockRange("block-1", "block-2");

    expect(editor.commands.clearBlockSelection()).toEqual(okResult);
    expect(editor.getBlockSelection()).toBeNull();
  });

  it("선택 상태가 없을 때 clearBlockSelection이 COMMAND_NOT_APPLICABLE을 반환한다", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });

    expect(editor.commands.clearBlockSelection()).toEqual(
      notApplicable("clearBlockSelection"),
    );
  });

  it("selectBlockRange·clearBlockSelection은 revision·onChange·undo 스택에 영향을 주지 않는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: threeSiblingsDocument(),
      onChange: (event) => changes.push(event),
    });

    // 성공 케이스
    expect(editor.commands.selectBlockRange("block-1", "block-2")).toEqual(
      okResult,
    );
    expect(editor.commands.clearBlockSelection()).toEqual(okResult);
    // 실패 케이스
    expect(editor.commands.selectBlockRange("block-1", "missing")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.commands.clearBlockSelection()).toEqual(
      notApplicable("clearBlockSelection"),
    );

    expect(editor.getDocument().revision).toBe(0);
    expect(changes).toEqual([]);
    // 문서 명령을 한 번도 실행하지 않았으므로 undo 스택이 비어 있어야 한다 —
    // 두 명령이 조금이라도 runDocumentCommand()를 거쳤다면 undo()가 성공해
    // 버린다.
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("getDocument()가 반환하는 JSON에 blockSelection 키가 없다", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });
    editor.commands.selectBlockRange("block-1", "block-2");

    expect(editor.getDocument()).not.toHaveProperty("blockSelection");
  });
});

// DELTA-02 완료 조건 1-5·13(delete 절반) — blockSelection 범위(및 children)를
// 통째로 삭제하는 deleteSelectedBlocks.
describe("에디터 컨트롤러 선택 범위 삭제(deleteSelectedBlocks)", () => {
  it("blockSelection이 없으면 COMMAND_NOT_APPLICABLE을 반환하고 문서를 바꾸지 않는다(완료 조건 1)", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });

    expect(editor.commands.deleteSelectedBlocks()).toEqual(
      notApplicable("deleteSelectedBlocks"),
    );
    expect(editor.getDocument().revision).toBe(0);
  });

  it("선택 범위와 각 children을 한 번의 트랜잭션·undo 1회로 통째 삭제하고 남은 형제 순서를 유지한다(완료 조건 2)", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: rangeWithChildrenDocument(),
      onChange: (event) => changes.push(event),
    });
    editor.commands.selectBlockRange("block-2", "block-3");

    expect(editor.commands.deleteSelectedBlocks()).toEqual(okResult);
    // block-2·block-3과 block-2의 child-2a까지 통째로 사라지고, 범위 밖
    // block-1·block-4는 원래 순서(1, 4)를 그대로 유지해야 한다 — 범위 안
    // 한 블록만 지우거나 child-2a를 형제로 승격시키면 이 배열이 달라진다.
    expect(editor.getDocument().blocks).toMatchObject([
      { id: "block-1" },
      { id: "block-4" },
    ]);
    // 트랜잭션 1개 = onChange 이벤트 1개.
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ revision: 1, reason: "local" });

    // undo 1회로 삭제된 범위와 children이 그대로 복원돼야 한다.
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toMatchObject([
      { id: "block-1" },
      { id: "block-2", children: [{ id: "child-2a" }] },
      { id: "block-3" },
      { id: "block-4" },
    ]);
  });

  it("선택 범위가 blockGroup의 전체 자식과 일치하면 그 blockGroup도 함께 제거된다(완료 조건 3)", () => {
    const editor = createEditor({ initialDocument: wholeGroupDocument() });
    const { tiptap } = mountTiptapEditor(editor);
    editor.commands.selectBlockRange("child-1", "child-2");

    expect(editor.commands.deleteSelectedBlocks()).toEqual(okResult);
    const document = editor.getDocument();
    expect(document.blocks).toMatchObject([
      { id: "parent-1", content: [{ text: "parent" }] },
      { id: "tail" },
    ]);
    expect(document.blocks[0]).not.toHaveProperty("children");

    // 모델 표현뿐 아니라 실제 PM 문서에도 빈 blockGroup 노드가 남지 않아야
    // 한다.
    let groupCount = 0;
    tiptap.state.doc.descendants((node) => {
      if (node.type.name === "blockGroup") groupCount += 1;
    });
    expect(groupCount).toBe(0);
  });

  it("선택 범위가 blockGroup 자식 일부만 덮으면 그 blockGroup은 남고 범위 밖 형제는 보존된다(완료 조건 3 경계)", () => {
    const editor = createEditor({ initialDocument: partialGroupDocument() });
    const { tiptap } = mountTiptapEditor(editor);
    editor.commands.selectBlockRange("child-1", "child-2");

    expect(editor.commands.deleteSelectedBlocks()).toEqual(okResult);
    const document = editor.getDocument();
    // child-3은 범위 밖이라 살아남아야 한다 — removesWholeGroup이
    // childCount를 보지 않고 범위 블록 수만으로 부당하게 true가 되면
    // child-3까지 blockGroup째 함께 지워진다.
    expect(document.blocks).toMatchObject([
      { id: "parent-1", children: [{ id: "child-3" }] },
      { id: "tail" },
    ]);

    let groupCount = 0;
    tiptap.state.doc.descendants((node) => {
      if (node.type.name === "blockGroup") groupCount += 1;
    });
    expect(groupCount).toBe(1);
  });

  it("선택 범위가 최상위 문서 전체와 일치하면 COMMAND_NOT_APPLICABLE을 반환하고 문서를 바꾸지 않는다(완료 조건 4)", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });
    editor.commands.selectBlockRange("block-1", "block-3");

    expect(editor.commands.deleteSelectedBlocks()).toEqual(
      notApplicable("deleteSelectedBlocks"),
    );
    expect(editor.getDocument().revision).toBe(0);
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-1",
      "block-2",
      "block-3",
    ]);
  });

  it("deleteSelectedBlocks 성공 후 getBlockSelection()이 null을 반환한다(완료 조건 5)", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });
    editor.commands.selectBlockRange("block-1", "block-2");

    expect(editor.commands.deleteSelectedBlocks()).toEqual(okResult);
    expect(editor.getBlockSelection()).toBeNull();
  });

  it("blockSelection이 가리키는 blockId가 외부 명령으로 사라졌으면 BLOCK_NOT_FOUND로 거절한다(완료 조건 13)", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });
    editor.commands.selectBlockRange("block-1", "block-2");
    // 외부 명령이 선택 범위 안 block-2를 지워 blockSelection을 stale하게
    // 만든다 — deleteSelectedBlocks/moveSelectedBlocksBefore가 여전히
    // block-2를 참조하는 채로 호출된다.
    expect(editor.commands.deleteBlock("block-2")).toEqual(okResult);

    expect(editor.commands.deleteSelectedBlocks()).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "block-2" },
    });
    expect(editor.getDocument().revision).toBe(1);
  });

  it("blockSelection이 가리키는 blockId가 외부 명령으로 다른 부모 형제가 됐으면 COMMAND_NOT_APPLICABLE로 거절한다(완료 조건 13)", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });
    editor.commands.selectBlockRange("block-1", "block-2");
    // indentBlock이 block-2를 이전 형제 block-1의 자식으로 옮겨 더 이상
    // 최상위 형제가 아니게 만든다.
    expect(editor.commands.indentBlock("block-2")).toEqual(okResult);

    expect(editor.commands.deleteSelectedBlocks()).toEqual(
      notApplicable("deleteSelectedBlocks"),
    );
    expect(editor.getDocument().revision).toBe(1);
  });
});

// DELTA-02 완료 조건 6-13(move 절반) — blockSelection 범위(및 children)를
// 같은 부모 형제 목록 안에서 통째로 이동하는 moveSelectedBlocksBefore.
describe("에디터 컨트롤러 선택 범위 이동(moveSelectedBlocksBefore)", () => {
  it("blockSelection이 없으면 COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 6)", () => {
    const editor = createEditor({ initialDocument: fourSiblingsDocument() });

    expect(editor.commands.moveSelectedBlocksBefore("block-3")).toEqual(
      notApplicable("moveSelectedBlocksBefore"),
    );
  });

  it("beforeBlockId가 선택 범위와 다른 부모의 형제를 가리키면 COMMAND_NOT_APPLICABLE을 반환하고 문서를 바꾸지 않는다(완료 조건 7)", () => {
    const editor = createEditor({ initialDocument: crossParentDocument() });
    editor.commands.selectBlockRange("block-2", "block-2");

    expect(editor.commands.moveSelectedBlocksBefore("child-1")).toEqual(
      notApplicable("moveSelectedBlocksBefore"),
    );
    expect(editor.getDocument().revision).toBe(0);
  });

  it("beforeBlockId가 선택 범위 내부의 blockId 또는 그 children을 가리키면 COMMAND_NOT_APPLICABLE을 반환한다(완료 조건 8)", () => {
    const editor = createEditor({
      initialDocument: fourSiblingsWithChildDocument(),
    });
    editor.commands.selectBlockRange("block-1", "block-2");

    // 범위 내부 최상위 blockId(block-2)를 가리키는 경우.
    expect(editor.commands.moveSelectedBlocksBefore("block-2")).toEqual(
      notApplicable("moveSelectedBlocksBefore"),
    );
    // 범위 안 block-1의 children(child-1a, 재귀 포함)을 가리키는 경우.
    expect(editor.commands.moveSelectedBlocksBefore("child-1a")).toEqual(
      notApplicable("moveSelectedBlocksBefore"),
    );
    expect(editor.getDocument().revision).toBe(0);
  });

  it("beforeBlockId가 null이면 선택 범위가 같은 부모 형제 목록 끝으로 이동한다(완료 조건 9)", () => {
    const editor = createEditor({ initialDocument: fourSiblingsDocument() });
    editor.commands.selectBlockRange("block-1", "block-2");

    expect(editor.commands.moveSelectedBlocksBefore(null)).toEqual(okResult);
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-3",
      "block-4",
      "block-1",
      "block-2",
    ]);
  });

  it("목표 위치가 현재 위치와 같은 no-op이면 COMMAND_NOT_APPLICABLE을 반환하고 문서를 바꾸지 않는다(완료 조건 10)", () => {
    const editor = createEditor({ initialDocument: fourSiblingsDocument() });
    editor.commands.selectBlockRange("block-1", "block-2");

    // block-3은 범위(block-1..block-2) 바로 다음 blockId다 — 이미 그 앞에
    // 있으므로 이동해도 순서가 바뀌지 않는다.
    expect(editor.commands.moveSelectedBlocksBefore("block-3")).toEqual(
      notApplicable("moveSelectedBlocksBefore"),
    );
    expect(editor.getDocument().revision).toBe(0);
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "block-1",
      "block-2",
      "block-3",
      "block-4",
    ]);
  });

  it("유효한 이동은 선택 범위와 children을 원래 상대 순서 그대로 한 번의 트랜잭션·undo 1회로 옮긴다(완료 조건 11)", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: fourSiblingsWithChildDocument(),
      onChange: (event) => changes.push(event),
    });
    editor.commands.selectBlockRange("block-1", "block-2");

    // block-1이 child-1a를 가진 채로 범위에 포함된다 — hasChildren 가드를
    // 잘못 복사하면 이 호출부터 COMMAND_NOT_APPLICABLE로 거절된다.
    expect(editor.commands.moveSelectedBlocksBefore("block-4")).toEqual(
      okResult,
    );
    expect(editor.getDocument().blocks).toMatchObject([
      { id: "block-3" },
      { id: "block-1", children: [{ id: "child-1a" }] },
      { id: "block-2" },
      { id: "block-4" },
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ revision: 1, reason: "local" });

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toMatchObject([
      { id: "block-1", children: [{ id: "child-1a" }] },
      { id: "block-2" },
      { id: "block-3" },
      { id: "block-4" },
    ]);
  });

  it("moveSelectedBlocksBefore 성공 후 getBlockSelection()이 이동 전과 같은 범위를 유지한다(완료 조건 12)", () => {
    const editor = createEditor({
      initialDocument: fourSiblingsWithChildDocument(),
    });
    editor.commands.selectBlockRange("block-1", "block-2");

    expect(editor.commands.moveSelectedBlocksBefore("block-4")).toEqual(
      okResult,
    );
    // blockId는 이동으로 바뀌지 않는다 — 상하 이동 버튼 연타를 지원하려면
    // 성공 후에도 같은 범위를 유지해야 한다.
    expect(editor.getBlockSelection()).toEqual({
      fromBlockId: "block-1",
      toBlockId: "block-2",
    });
  });

  it("blockSelection이 가리키는 blockId가 외부 명령으로 사라졌으면 BLOCK_NOT_FOUND로 거절한다(완료 조건 13)", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });
    editor.commands.selectBlockRange("block-1", "block-2");
    expect(editor.commands.deleteBlock("block-2")).toEqual(okResult);

    expect(editor.commands.moveSelectedBlocksBefore(null)).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "block-2" },
    });
    expect(editor.getDocument().revision).toBe(1);
  });

  it("blockSelection이 가리키는 blockId가 외부 명령으로 다른 부모 형제가 됐으면 COMMAND_NOT_APPLICABLE로 거절한다(완료 조건 13)", () => {
    const editor = createEditor({ initialDocument: threeSiblingsDocument() });
    editor.commands.selectBlockRange("block-1", "block-2");
    expect(editor.commands.indentBlock("block-2")).toEqual(okResult);

    expect(editor.commands.moveSelectedBlocksBefore(null)).toEqual(
      notApplicable("moveSelectedBlocksBefore"),
    );
    expect(editor.getDocument().revision).toBe(1);
  });
});
