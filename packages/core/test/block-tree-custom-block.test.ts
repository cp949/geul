/**
 * block-tree.ts/block-tree-edit.ts가 top-level CustomBlock(RD-002-DELTA-01,
 * model의 Document.blocks 위젠)을 만나도 안전하게 동작하는지 확인한다.
 * createEditor()를 거치지 않는다 — model-to-tiptap.ts(PM 변환)는 아직
 * CustomBlock을 지원하지 않아(RD-002 후속 DELTA) 순수 함수 단위로만
 * 검증한다.
 */
import type { CustomBlock, DocumentBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { updateBlockInTree } from "../src/block-tree-edit.js";
import { findBlockInTree, walkBlockTree } from "../src/block-tree.js";

const widget: CustomBlock = {
  id: "widget-1",
  type: "myWidget",
  content: "none",
};

const paragraph: DocumentBlock = {
  id: "p1",
  type: "paragraph",
  content: [{ text: "hi" }],
};

describe("block-tree: top-level CustomBlock", () => {
  it("findBlockInTree가 top-level CustomBlock을 찾는다", () => {
    const blocks: DocumentBlock[] = [paragraph, widget];

    expect(findBlockInTree(blocks, "widget-1")).toEqual(widget);
  });

  it("walkBlockTree가 CustomBlock의 존재하지 않는 children으로 내려가지 않는다", () => {
    const blocks: DocumentBlock[] = [widget];
    const visited: string[] = [];

    walkBlockTree(
      blocks,
      null,
      (block) => {
        visited.push(block.id);
      },
      false,
    );

    expect(visited).toEqual(["widget-1"]);
  });
});

describe("block-tree-edit: updateBlockInTree과 CustomBlock", () => {
  it("target이 CustomBlock이면 병합 없이 not-found(null)로 처리한다", () => {
    const blocks: DocumentBlock[] = [paragraph, widget];

    const result = updateBlockInTree(blocks, "widget-1", (block) => block);

    expect(result).toBeNull();
  });

  it("target이 known block이면 기존과 동일하게 교체한다(회귀)", () => {
    const blocks: DocumentBlock[] = [paragraph, widget];
    const replaced = { ...paragraph, content: [{ text: "bye" }] };

    const result = updateBlockInTree(blocks, "p1", () => replaced);

    expect(result).toEqual([replaced, widget]);
  });
});
