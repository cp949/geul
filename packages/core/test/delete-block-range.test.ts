/**
 * deleteBlockRange가 부모 blockGroup의 내용 전체를 지우는 범위일 때만 그룹
 * 노드째 지우고, 그 밖에는 범위만 지우는지 확인한다. 그룹을 남기면 PM이
 * "block+"를 기본 노드로 채워 새 blockId가 붙은 유령 블록이 생긴다.
 */
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { deleteBlockRange } from "../src/delete-block-range.js";
import { createTableFixtureEditor } from "./table-test-support.js";

const paragraph = (blockId: string, text: string): JSONContent => ({
  type: "blockContainer",
  attrs: { blockId },
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const parentWith = (
  blockId: string,
  text: string,
  children: JSONContent[],
): JSONContent => ({
  type: "blockContainer",
  attrs: { blockId },
  content: [
    { type: "paragraph", content: [{ type: "text", text }] },
    { type: "blockGroup", content: children },
  ],
});

const blockIdsOf = (doc: ProseMirrorNode): string[] => {
  const ids: string[] = [];
  doc.descendants((node) => {
    const id = node.attrs.blockId;
    if (typeof id === "string") ids.push(id);
  });
  return ids;
};

const rangeOf = (
  doc: ProseMirrorNode,
  firstId: string,
  lastId: string,
): { from: number; to: number } => {
  let from = -1;
  let to = -1;
  doc.descendants((node, position) => {
    if (node.attrs.blockId === firstId) from = position;
    if (node.attrs.blockId === lastId) to = position + node.nodeSize;
  });
  if (from < 0 || to < 0) throw new Error("범위 fixture 준비 실패");
  return { from, to };
};

describe("deleteBlockRange", () => {
  it("blockGroup의 유일한 자식이면 그룹째 지워 유령 블록을 남기지 않는다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        parentWith("parent", "p", [paragraph("only", "o")]),
        paragraph("tail", "t"),
      ],
    });
    const { from, to } = rangeOf(editor.state.doc, "only", "only");

    const tr = deleteBlockRange(editor.state.tr, from, to);

    expect(blockIdsOf(tr.doc)).toEqual(["parent", "tail"]);
    expect(tr.doc.firstChild?.childCount).toBe(1);
  });

  it("범위가 blockGroup의 모든 자식이면 그룹째 지운다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        parentWith("parent", "p", [paragraph("a", "a"), paragraph("b", "b")]),
        paragraph("tail", "t"),
      ],
    });
    const { from, to } = rangeOf(editor.state.doc, "a", "b");

    const tr = deleteBlockRange(editor.state.tr, from, to);

    expect(blockIdsOf(tr.doc)).toEqual(["parent", "tail"]);
    expect(tr.doc.firstChild?.childCount).toBe(1);
  });

  it("형제가 남는 범위는 범위만 지우고 그룹을 유지한다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        parentWith("parent", "p", [
          paragraph("a", "a"),
          paragraph("b", "b"),
          paragraph("c", "c"),
        ]),
      ],
    });
    const { from, to } = rangeOf(editor.state.doc, "a", "b");

    const tr = deleteBlockRange(editor.state.tr, from, to);

    expect(blockIdsOf(tr.doc)).toEqual(["parent", "c"]);
  });

  it("범위가 형제 끝까지여도 앞 형제가 남으면 범위만 지운다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        parentWith("parent", "p", [
          paragraph("a", "a"),
          paragraph("b", "b"),
          paragraph("c", "c"),
        ]),
      ],
    });
    const { from, to } = rangeOf(editor.state.doc, "b", "c");

    const tr = deleteBlockRange(editor.state.tr, from, to);

    expect(blockIdsOf(tr.doc)).toEqual(["parent", "a"]);
  });

  it("최상위 doc의 전체 자식을 지워도 doc 노드를 확대해 지우려 하지 않는다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [paragraph("a", "a"), paragraph("b", "b")],
    });
    const { from, to } = rangeOf(editor.state.doc, "a", "b");

    const tr = deleteBlockRange(editor.state.tr, from, to);

    expect(blockIdsOf(tr.doc)).not.toContain("a");
    expect(blockIdsOf(tr.doc)).not.toContain("b");
  });

  it("부모가 최상위 doc이면 확대하지 않고 범위만 지운다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [paragraph("a", "a"), paragraph("b", "b")],
    });
    const { from, to } = rangeOf(editor.state.doc, "a", "a");

    const tr = deleteBlockRange(editor.state.tr, from, to);

    expect(blockIdsOf(tr.doc)).toEqual(["b"]);
  });

  it("앞 step이 있어도 tr.doc 기준 위치로 판정한다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        parentWith("parent", "p", [paragraph("a", "a"), paragraph("b", "b")]),
      ],
    });
    const first = rangeOf(editor.state.doc, "a", "a");
    const afterFirst = deleteBlockRange(editor.state.tr, first.from, first.to);
    const second = rangeOf(afterFirst.doc, "b", "b");

    const tr = deleteBlockRange(afterFirst, second.from, second.to);

    expect(blockIdsOf(tr.doc)).toEqual(["parent"]);
    expect(tr.doc.firstChild?.childCount).toBe(1);
  });
});
