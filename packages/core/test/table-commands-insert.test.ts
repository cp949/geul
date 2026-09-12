/**
 * 표 삽입과 slash trigger 텍스트 정리의 트랜잭션·undo 계약을 확인한다.
 */
import { MAX_TABLE_COLUMNS } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { getTableBlock, insertTable } from "../src/table-commands.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  activeCellId,
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

describe("표 삽입 시 트리거 블록을 처리한다(clearAfterBlockText, 2026-09-12 버그 리포트)", () => {
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

  it("트리거 컨테이너에 중첩 자식이 없으면 컨테이너 자체를 표로 치환하고, PM 기본 매핑이 캐럿을 첫 셀로 옮긴다", () => {
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
    if (!result.ok) throw new Error("표 삽입 실패");
    // "/table"을 입력한 para-1 트리거 문단은 완전히 사라진다 — 표가 그
    // 줄 자체를 대신해, 사용자가 매번 빈 줄을 지워야 했던 문제(버그
    // 리포트 원문)가 없어진다.
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0]?.type).toBe("table");
    // 컨테이너 치환이 옛 캐럿 자리를 지워 별도 선택 이동 없이도 PM 기본
    // 매핑(Selection.near)이 표 첫 셀 안으로 캐럿을 옮긴다 — 명시로 다른
    // 위치(형제 문단·표 자신)로 옮기면 표 grip/행렬 메뉴의 스크롤 추적과
    // 부딪힌다는 걸 실측했다(2026-09-12, table-format.spec.ts "메뉴를 연
    // 채 스크롤" 케이스 — 원인은 그 메뉴 쪽에 있어 후속 이슈로 분리한다).
    const table = getTableBlock(editor, result.value.blockId);
    if (!table.ok) throw new Error("표 조회 실패");
    expect(activeCellId(editor)).toBe(table.value.rows[0]?.cells[0]?.id);
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

  it("트리거 컨테이너에 중첩 자식이 있으면 컨테이너를 보존하고 텍스트만 지운다(하위 트리 보존 우선)", () => {
    const docWithNestedChild = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "para-1" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "/table" }] },
            {
              type: "blockGroup",
              content: [
                {
                  type: "blockContainer",
                  attrs: { blockId: "child-1" },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "child" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const editor = createTableFixtureEditor(docWithNestedChild);
    const createId = sequentialIds("id");

    const result = insertTable(
      editor,
      "para-1",
      { rows: 1, columns: 1 },
      createId,
      { clearAfterBlockText: true },
    );

    expect(result.ok).toBe(true);
    // para-1 컨테이너와 그 안의 child-1 하위 트리는 보존된다 — 컨테이너를
    // 통째로 지우면 중첩 자식까지 함께 사라지므로, 이 경우는 텍스트만
    // 지우고 표를 하위 트리 전체 뒤에 삽입하는 예전 경로로 물러선다.
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content?.[0]?.type).toBe("blockContainer");
    expect(doc.content?.[0]?.content?.[0]?.content ?? []).toHaveLength(0);
    expect(doc.content?.[0]?.content?.[1]?.type).toBe("blockGroup");
    expect(doc.content?.[1]?.type).toBe("table");
  });
});
