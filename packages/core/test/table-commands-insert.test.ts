/**
 * 표 삽입과 slash trigger 텍스트 정리의 트랜잭션·undo 계약을 확인한다.
 */
import { MAX_TABLE_COLUMNS } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { getTableBlock, insertTable } from "../src/table-commands.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  createTableFixtureEditor,
  docWithParagraph,
} from "./table-test-support.js";

describe("표를 삽입한다", () => {
  it("지정한 블록 뒤에 표를 단일 트랜잭션으로 삽입한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");

    const result = insertTable(
      editor,
      "para-1",
      { rows: 2, columns: 2 },
      createId,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("표 삽입 실패");
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[1]?.type).toBe("table");
    const table = getTableBlock(editor, result.value.blockId);
    if (!table.ok) throw new Error("표 조회 실패");
    expect(table.value.rows).toHaveLength(2);
    expect(table.value.rows[0]?.cells).toHaveLength(2);
  });

  it("삽입 직후 undo 1회로 표 삽입 이전 상태로 복원된다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    insertTable(editor, "para-1", { rows: 2, columns: 2 }, createId);
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("삽입 트랜잭션이 캐럿을 화면 안으로 스크롤하도록 표시한다", () => {
    // 네이티브 명령들처럼 결과 selection이 화면 안에 오도록 표시한다 —
    // 뷰포트 밖으로 커진 표에서 캐럿만 옮기면 no-op처럼 보인다(그릴링 C7).
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");
    const dispatched: (typeof editor.state.tr)[] = [];
    const originalDispatch = editor.view.dispatch.bind(editor.view);
    editor.view.dispatch = (transaction) => {
      dispatched.push(transaction);
      originalDispatch(transaction);
    };

    const result = insertTable(
      editor,
      "para-1",
      { rows: 2, columns: 2 },
      createId,
    );

    expect(result.ok).toBe(true);
    expect(dispatched.at(-1)?.scrolledIntoView).toBe(true);
  });

  it("존재하지 않는 blockId 뒤에는 삽입할 수 없고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = insertTable(
      editor,
      "missing",
      { rows: 2, columns: 2 },
      createId,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("행 또는 열이 1보다 작으면 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = insertTable(
      editor,
      "para-1",
      { rows: 0, columns: 2 },
      createId,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_TABLE_SIZE" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("열 수가 상한을 넘으면 CELL_LIMIT_EXCEEDED로 거절하고 문서를 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    const result = insertTable(
      editor,
      "para-1",
      { rows: 1, columns: MAX_TABLE_COLUMNS + 1 },
      createId,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "CELL_LIMIT_EXCEEDED" },
    });
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});

describe("표 삽입 시 트리거 블록 텍스트를 함께 지운다", () => {
  const docWithSlashText = {
    type: "doc",
    content: [
      {
        type: "blockContainer",
        attrs: { blockId: "para-1" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "/table" }] },
        ],
      },
    ],
  };

  it("clearAfterBlockText가 true면 트리거 블록을 비우고 그 뒤에 표를 단일 트랜잭션으로 삽입한다", () => {
    const editor = createTableFixtureEditor(docWithSlashText);
    const createId = sequentialIds("id");

    const result = insertTable(
      editor,
      "para-1",
      { rows: 1, columns: 1 },
      createId,
      { clearAfterBlockText: true },
    );

    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content?.[0]?.type).toBe("blockContainer");
    expect(doc.content?.[0]?.content?.[0]?.type).toBe("paragraph");
    expect(doc.content?.[0]?.content?.[0]?.content ?? []).toHaveLength(0);
    expect(doc.content?.[1]?.type).toBe("table");
  });

  it("삽입 직후 undo 1회로 트리거 텍스트와 표 삽입 이전 상태로 함께 복원된다", () => {
    const editor = createTableFixtureEditor(docWithSlashText);
    const createId = sequentialIds("id");
    const before = editor.getJSON() as TiptapJsonNode;

    insertTable(editor, "para-1", { rows: 1, columns: 1 }, createId, {
      clearAfterBlockText: true,
    });
    editor.commands.undo();

    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });
});
