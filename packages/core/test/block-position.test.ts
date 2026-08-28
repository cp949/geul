/**
 * findBlockPosition이 문서 내 임의 깊이(최상위·blockGroup 중첩 모두)에서
 * blockId가 일치하는 노드의 위치를 찾고, 일치하는 블록이 없으면 null을
 * 반환하는지 확인한다(D19 컨테이너 도입에 따른 재귀 의미론 — 종전
 * findTopLevelBlockPosition의 최상위 1단 한정 계약을 대체한다).
 */
import { describe, expect, it } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { createTableFixtureEditor } from "./table-test-support.js";

describe("findBlockPosition", () => {
  it("여러 최상위 블록 중 blockId가 일치하는 블록의 위치를 찾는다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "para-1" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "first" }] },
          ],
        },
        {
          type: "blockContainer",
          attrs: { blockId: "para-2" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "second" }] },
          ],
        },
      ],
    });

    const firstNode = editor.state.doc.firstChild;
    if (firstNode === null) throw new Error("컨테이너 fixture 준비 실패");

    expect(findBlockPosition(editor.state.doc, "para-1")).toBe(0);
    expect(findBlockPosition(editor.state.doc, "para-2")).toBe(
      firstNode.nodeSize,
    );
  });

  it("blockGroup에 임의 깊이로 중첩된 블록의 위치를 재귀로 찾는다", () => {
    // container(parent) -> [paragraph, blockGroup([container(child)])] —
    // depth 1 자식이 최상위와 동일하게 조회돼야 한다(완료 조건 2).
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "parent-1" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "parent" }],
            },
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
    });

    const parentPosition = findBlockPosition(editor.state.doc, "parent-1");
    expect(parentPosition).toBe(0);

    const childPosition = findBlockPosition(editor.state.doc, "child-1");
    expect(childPosition).not.toBeNull();
    const childNode = editor.state.doc.nodeAt(childPosition ?? -1);
    expect(childNode?.type.name).toBe("blockContainer");
    expect(childNode?.attrs.blockId).toBe("child-1");
  });

  it("table은 컨테이너로 감싸이지 않아도 같은 프리미티브로 찾는다", () => {
    // table은 blockContainer로 감싸이지 않는다(D19) — findBlockPosition은
    // 노드 종류와 무관하게 attrs.blockId만 본다.
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: {
            blockId: "table-1",
            columns: [{ id: "col-1", width: 160 }],
            headerRows: 0,
            headerColumns: 0,
          },
          content: [
            {
              type: "tableRow",
              attrs: { rowId: "row-1" },
              content: [
                {
                  type: "tableCell",
                  attrs: {
                    cellId: "cell-1",
                    columnId: "col-1",
                    colspan: 1,
                    rowspan: 1,
                    colwidth: null,
                    textColor: null,
                    backgroundColor: null,
                  },
                  content: [],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(findBlockPosition(editor.state.doc, "table-1")).toBe(0);
  });

  it("일치하는 blockId가 없으면 최상위·중첩 어디서도 null을 반환한다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "parent-1" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "only" }] },
            {
              type: "blockGroup",
              content: [
                {
                  type: "blockContainer",
                  attrs: { blockId: "child-1" },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "nested" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(findBlockPosition(editor.state.doc, "no-such-id")).toBeNull();
  });
});
