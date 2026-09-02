import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  documentOf,
  notApplicable,
  okResult,
  paragraphBlock,
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
