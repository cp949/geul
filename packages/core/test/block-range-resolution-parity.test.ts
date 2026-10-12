/**
 * 블록 범위 판정의 두 구현이 같은 답을 내는지 고정한다.
 * - 모델 트리: resolveBlockSelectionRange(generic-block-tree-lookup.ts).
 * - PM doc: resolveBlockRangeInDoc(indent-commands.ts).
 * 둘은 session 유무 때문에 일부러 따로 있다(RD-004.md "결정" (b)).
 * 한쪽만 고치면 어긋나므로 같은 문서의 id 쌍 전수로 대조한다.
 * 표 셀 안 블록은 모델 트리 밖이라 대상이 아니다.
 */
import { describe, expect, it } from "vitest";

import { resolveBlockRangeInDoc } from "../src/indent-commands.js";
import { resolveBlockSelectionRange } from "../src/generic-block-tree-lookup.js";
import {
  documentOf,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";

/**
 * 중첩 문단, 목록, toggle, callout, quote를 섞은 문서.
 * 형제 구간이 깊이마다 다르게 생기도록 children을 둔다.
 */
const mixedNestingDocument = () =>
  documentOf(
    paragraphBlock("a", "a", [
      paragraphBlock("a1", "a1"),
      paragraphBlock("a2", "a2", [paragraphBlock("a2x", "x")]),
    ]),
    paragraphBlock("b", "b"),
    {
      id: "l",
      type: "bulletListItem",
      content: [{ text: "l" }],
      children: [paragraphBlock("l1", "l1")],
    },
    {
      id: "t",
      type: "toggleListItem",
      content: [{ text: "t" }],
      children: [paragraphBlock("t1", "t1"), paragraphBlock("t2", "t2")],
    },
    {
      id: "c",
      type: "callout",
      content: [{ text: "c" }],
      children: [paragraphBlock("c1", "c1")],
    },
    {
      id: "q",
      type: "quote",
      content: [{ text: "q" }],
      children: [paragraphBlock("q1", "q1")],
    },
    paragraphBlock("z", "z"),
  );

const knownIds = [
  "a",
  "a1",
  "a2",
  "a2x",
  "b",
  "l",
  "l1",
  "t",
  "t1",
  "t2",
  "c",
  "c1",
  "q",
  "q1",
  "z",
];

describe("블록 범위 판정 동치(모델 트리 ↔ PM doc)", () => {
  it("없는 id를 섞은 id 쌍 전수에서 두 구현의 범위가 같다", () => {
    const { editor, tiptap } = mounted(mixedNestingDocument());
    const ids = [...knownIds, "missing"];
    const blocks = editor.getDocument().blocks;

    const mismatches: string[] = [];
    for (const fromBlockId of ids) {
      for (const toBlockId of ids) {
        const model = resolveBlockSelectionRange(
          blocks,
          { fromBlockId, toBlockId },
          "parity",
        );
        const modelIds = model.ok
          ? model.value.rangeBlocks.map((block) => block.id)
          : null;
        const pmIds = resolveBlockRangeInDoc(
          tiptap.state.doc,
          fromBlockId,
          toBlockId,
        );
        if (JSON.stringify(modelIds) !== JSON.stringify(pmIds)) {
          mismatches.push(
            `${fromBlockId}->${toBlockId} model=${JSON.stringify(modelIds)} pm=${JSON.stringify(pmIds)}`,
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("다른 부모의 블록 쌍은 두 구현 모두 범위를 만들지 않는다", () => {
    const { editor, tiptap } = mounted(mixedNestingDocument());

    const model = resolveBlockSelectionRange(
      editor.getDocument().blocks,
      { fromBlockId: "a1", toBlockId: "b" },
      "parity",
    );

    expect(model.ok).toBe(false);
    expect(resolveBlockRangeInDoc(tiptap.state.doc, "a1", "b")).toBeNull();
  });

  it("역순 입력은 문서 순서의 같은 범위로 정규화한다", () => {
    const { editor, tiptap } = mounted(mixedNestingDocument());

    const model = resolveBlockSelectionRange(
      editor.getDocument().blocks,
      { fromBlockId: "t2", toBlockId: "t1" },
      "parity",
    );

    expect(
      model.ok && model.value.rangeBlocks.map((block) => block.id),
    ).toEqual(["t1", "t2"]);
    expect(resolveBlockRangeInDoc(tiptap.state.doc, "t2", "t1")).toEqual([
      "t1",
      "t2",
    ]);
  });
});
