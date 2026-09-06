/**
 * 중첩 블록 안 표를 대상으로 한 명령의 탐색·삽입 위치 보존 계약을 확인한다.
 */
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import {
  getTableBlock,
  insertTable,
  insertTableRow,
} from "../src/table-commands.js";
import { sequentialIds } from "./editor-controller-support.js";
import { cellJson, createTableFixtureEditor } from "./table-test-support.js";

describe("중첩된 표(D19)", () => {
  const docWithNestedTable = {
    type: "doc",
    content: [
      {
        type: "blockContainer",
        attrs: { blockId: "parent-1" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "parent" }] },
          {
            type: "blockGroup",
            content: [
              {
                type: "table",
                attrs: {
                  blockId: "table-1",
                  columns: [
                    { id: "col-1", width: 160 },
                    { id: "col-2", width: 160 },
                  ],
                  headerRows: 0,
                  headerColumns: 0,
                },
                content: [
                  {
                    type: "tableRow",
                    attrs: { rowId: "row-1" },
                    content: [
                      cellJson("cell-1", "col-1"),
                      cellJson("cell-2", "col-2"),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it("중첩된 표에 grid 연산 1회 후 표의 중첩 위치·주변 구조가 보존된다(완료 조건 6)", () => {
    // 변이: findTable이 최상위 1단 조회로 남으면 이 호출이 TABLE_NOT_FOUND로
    // 실패해야 한다.
    const editor = createTableFixtureEditor(docWithNestedTable);
    const createId = sequentialIds("id");

    const result = insertTableRow(editor, "table-1", 1, createId);

    expect(result).toEqual({ ok: true, value: undefined });
    const doc = editor.getJSON() as TiptapJsonNode;
    // 부모 구조가 그대로다 — 문단이 첫 자식, blockGroup이 둘째 자식.
    expect(doc.content?.[0]?.type).toBe("blockContainer");
    expect(doc.content?.[0]?.attrs?.blockId).toBe("parent-1");
    expect(doc.content?.[0]?.content?.[0]?.type).toBe("paragraph");
    expect(doc.content?.[0]?.content?.[1]?.type).toBe("blockGroup");
    const nestedTable = doc.content?.[0]?.content?.[1]?.content?.[0];
    expect(nestedTable?.type).toBe("table");
    expect(nestedTable?.attrs?.blockId).toBe("table-1");
    const table = getTableBlock(editor, "table-1");
    if (!table.ok) throw new Error("표 조회 실패");
    expect(table.value.rows).toHaveLength(2);
    expect(table.value.rows[0]?.cells).toHaveLength(2);
  });

  it("자식 딸린 블록 뒤 insertTable이 하위 트리 전체 뒤에 삽입하고 기존 자식 귀속을 보존한다(완료 조건 9)", () => {
    // 변이: 삽입 위치를 afterPosition + afterNode.nodeSize 대신 컨테이너
    // 시작+콘텐츠 크기(자식 앞)로 잘못 계산하면 새 표가 child-1 앞에
    // 끼어들어 귀속이 바뀐다.
    const docWithChild = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "parent-1" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "parent" }] },
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
    const editor = createTableFixtureEditor(docWithChild);
    const createId = sequentialIds("id");

    const result = insertTable(
      editor,
      "parent-1",
      { rows: 1, columns: 1 },
      createId,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("표 삽입 실패");
    const doc = editor.getJSON() as TiptapJsonNode;
    // 새 표는 parent-1 하위 트리 전체 뒤의 최상위 형제다 — parent-1 안에
    // 끼어들지 않는다.
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0]?.attrs?.blockId).toBe("parent-1");
    expect(doc.content?.[0]?.content?.[1]?.type).toBe("blockGroup");
    // child-1 귀속이 그대로다 — parent-1의 유일한 자식으로 남는다.
    const children = doc.content?.[0]?.content?.[1]?.content;
    expect(children).toHaveLength(1);
    expect(children?.[0]?.attrs?.blockId).toBe("child-1");
    expect(doc.content?.[1]?.type).toBe("table");
    expect(doc.content?.[1]?.attrs?.blockId).toBe(result.value.blockId);
  });
});
