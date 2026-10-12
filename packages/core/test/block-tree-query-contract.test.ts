/**
 * 블록 트리 질의 규칙(block-tree-query.ts)을 두 어댑터에 같은 입력으로 돌려
 * 같은 답이 나오는지 고정한다.
 * - 모델 트리 어댑터: modelBlockTreeAdapter(block-tree-adapters.ts).
 * - PM doc 어댑터: pmBlockTreeAdapter(block-tree-adapters.ts).
 * 규칙은 한 벌이라 어댑터가 규칙을 벗어나면 여기서 드러난다. 기존 래퍼
 * (resolveBlockSelectionRange, resolveBlockRangeInDoc)도 같은 범위를 내는지
 * 함께 본다. 표 셀 안 블록은 모델 트리 밖이라 대상이 아니다.
 */
import { MAX_NESTING_DEPTH, type DocumentBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  modelBlockTreeAdapter,
  pmBlockTreeAdapter,
} from "../src/block-tree-adapters.js";
import {
  fitsNestingLimit,
  locateBlock,
  resolveSiblingRange,
  subtreeHeight,
} from "../src/block-tree-query.js";
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
    { id: "d", type: "divider" },
    { id: "cb", type: "codeBlock", content: [{ text: "x" }] },
    {
      id: "tbl",
      type: "table",
      columns: [{ id: "tbl-col", width: 160 }],
      rows: [
        {
          id: "tbl-row",
          cells: [
            {
              id: "tbl-cell",
              columnId: "tbl-col",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "c" }],
            },
          ],
        },
      ],
      headerRows: 0,
      headerColumns: 0,
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
  "d",
  "cb",
  "tbl",
  "z",
];

describe("블록 트리 질의 계약(모델 어댑터 ↔ PM 어댑터)", () => {
  it("모든 id의 위치(부모·인덱스·깊이·형제)가 두 어댑터에서 같다", () => {
    const { editor, tiptap } = mounted(mixedNestingDocument());
    const model = modelBlockTreeAdapter(editor.getDocument().blocks);
    const pm = pmBlockTreeAdapter(tiptap.state.doc);
    const describeLocation = <N>(
      adapter: Parameters<typeof locateBlock<N>>[0],
      id: string,
    ) => {
      const found = locateBlock(adapter, id);
      return found === null
        ? null
        : {
            parentId:
              found.parent === null ? null : adapter.idOf(found.parent as N),
            index: found.index,
            depth: found.depth,
            siblingIds: found.siblings.map((node) => adapter.idOf(node as N)),
          };
    };

    const mismatches: string[] = [];
    for (const id of [...knownIds, "missing"]) {
      const a = JSON.stringify(describeLocation(model, id));
      const b = JSON.stringify(describeLocation(pm, id));
      if (a !== b) mismatches.push(`${id} model=${a} pm=${b}`);
    }

    expect(mismatches).toEqual([]);
    expect(locateBlock(model, "a2x")?.depth).toBe(3);
    expect(locateBlock(model, "missing")).toBeNull();
  });

  it("id 쌍 전수에서 형제 범위 규칙의 결과가 두 어댑터에서 같다", () => {
    const { editor, tiptap } = mounted(mixedNestingDocument());
    const model = modelBlockTreeAdapter(editor.getDocument().blocks);
    const pm = pmBlockTreeAdapter(tiptap.state.doc);
    const ids = [...knownIds, "missing"];

    const mismatches: string[] = [];
    for (const from of ids) {
      for (const to of ids) {
        const m = resolveSiblingRange(model, from, to);
        const p = resolveSiblingRange(pm, from, to);
        const a = JSON.stringify(
          m.ok
            ? {
                ids: m.value.nodes.map((n) => model.idOf(n)),
                depth: m.value.depth,
              }
            : m,
        );
        const b = JSON.stringify(
          p.ok
            ? {
                ids: p.value.nodes.map((n) => pm.idOf(n)),
                depth: p.value.depth,
              }
            : p,
        );
        if (a !== b) mismatches.push(`${from}->${to} model=${a} pm=${b}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("모든 블록의 하위 트리 높이가 두 어댑터에서 같다", () => {
    const { editor, tiptap } = mounted(mixedNestingDocument());
    const model = modelBlockTreeAdapter(editor.getDocument().blocks);
    const pm = pmBlockTreeAdapter(tiptap.state.doc);

    const heights = (id: string) => {
      const m = locateBlock(model, id);
      const p = locateBlock(pm, id);
      return {
        model: m === null ? null : subtreeHeight(model, m.node),
        pm: p === null ? null : subtreeHeight(pm, p.node),
      };
    };

    const mismatches = knownIds.filter((id) => {
      const { model: m, pm: p } = heights(id);
      return m !== p;
    });

    expect(mismatches).toEqual([]);
    expect(heights("a")).toEqual({ model: 2, pm: 2 });
    expect(heights("a2")).toEqual({ model: 1, pm: 1 });
    expect(heights("z")).toEqual({ model: 0, pm: 0 });
    // 표·divider·codeBlock은 자식 블록을 가질 수 없다.
    expect(heights("tbl")).toEqual({ model: 0, pm: 0 });
  });

  it("깊이 한도 비교는 결과 깊이와 높이의 합이 상한과 같으면 통과한다", () => {
    expect(fitsNestingLimit(MAX_NESTING_DEPTH, 0)).toBe(true);
    expect(fitsNestingLimit(MAX_NESTING_DEPTH - 1, 1)).toBe(true);
    expect(fitsNestingLimit(MAX_NESTING_DEPTH, 1)).toBe(false);
    expect(fitsNestingLimit(1, MAX_NESTING_DEPTH)).toBe(false);
  });

  it("블록 범위 래퍼 둘이 없는 id를 섞은 id 쌍 전수에서 같은 범위를 낸다", () => {
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

  it("top-level CustomBlock은 모델 어댑터에서 찾지 못한 것으로 본다", () => {
    // PM 대조는 하지 않는다 — PM에 올리려면 customBlocks 등록이 필요하다.
    const blocks: DocumentBlock[] = [
      paragraphBlock("p1", "p1"),
      { id: "widget-1", type: "myWidget", content: "none" },
      paragraphBlock("p2", "p2"),
    ];
    const model = modelBlockTreeAdapter(blocks);

    expect(locateBlock(model, "widget-1")).toBeNull();
    expect(resolveSiblingRange(model, "p1", "widget-1")).toEqual({
      ok: false,
      reason: "not-found",
      blockId: "widget-1",
    });
    // 양끝이 알려진 블록이면 사이의 CustomBlock도 범위에 든다.
    const range = resolveSiblingRange(model, "p1", "p2");
    expect(range.ok && range.value.nodes.map((n) => n.id)).toEqual([
      "p1",
      "widget-1",
      "p2",
    ]);
  });
});
