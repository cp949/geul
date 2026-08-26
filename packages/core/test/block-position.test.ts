/**
 * findTopLevelBlockPosition이 문서 직속 자식 중 blockId가 일치하는 노드의
 * 위치만 찾고, 일치하는 블록이 없으면 null을 반환하는지 확인한다.
 */
import { describe, expect, it } from "vitest";

import { findTopLevelBlockPosition } from "../src/block-position.js";
import { createTableFixtureEditor } from "./table-test-support.js";

describe("findTopLevelBlockPosition", () => {
  it("여러 최상위 블록 중 blockId가 일치하는 블록의 위치를 찾는다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "para-1" },
          content: [{ type: "text", text: "first" }],
        },
        {
          type: "paragraph",
          attrs: { blockId: "para-2" },
          content: [{ type: "text", text: "second" }],
        },
      ],
    });

    const firstNode = editor.state.doc.firstChild;
    if (firstNode === null) throw new Error("문단 fixture 준비 실패");

    expect(findTopLevelBlockPosition(editor.state.doc, "para-1")).toBe(0);
    expect(findTopLevelBlockPosition(editor.state.doc, "para-2")).toBe(
      firstNode.nodeSize,
    );
  });

  it("일치하는 blockId가 없으면 null을 반환한다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "para-1" },
          content: [{ type: "text", text: "only" }],
        },
      ],
    });

    expect(
      findTopLevelBlockPosition(editor.state.doc, "no-such-id"),
    ).toBeNull();
  });
});
