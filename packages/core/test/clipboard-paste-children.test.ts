/**
 * 자식 있는 블록의 끝에 HTML·Markdown 블록을 붙일 때의 배치 계약을 고정한다
 * (Issue #290, #294). 끝 캐럿에서 insertContent가 블록을 가르면 뒤 조각이 빈
 * 껍데기가 되고 기존 자식이 그 껍데기로 넘어갔다. 새 계약은 Enter 분할 규칙을
 * 따른다 — 열린 블록은 새 블록이 첫 자식(D23), 접힌 toggle은 새 블록이
 * 형제(#252)다.
 *
 * 다루는 축은 끝 캐럿(C1~C5), 같은 블록 범위(C6), 깊이 상한(C7), 변경 전
 * 결과와 같아야 하는 입력(C8), transaction 계약(C9), 삽입 뒤 캐럿(C10)이다.
 * #294는 다른 블록에서 시작해 자식 있는 블록의 끝에서 끝나는 범위를 다룬다.
 * 범위를 PM 기본 삭제로 지운 뒤 캐럿 삽입 규칙을 적용한다. 그 축은 "Issue #294"
 * describe에 모았다. 평문 경로(#284)·drop(#285)·표 셀 안은 다루지 않는다. 평문
 * 경로는 clipboard-paste-plain-multiline.test.ts가 맡는다.
 *
 * C8은 구현 전에 측정한 결과를 특성화한다. 시작 캐럿의 빈 head(`p:`)와 중간
 * 캐럿의 분할은 자식 없는 블록에도 나오는 현행 baseline이다.
 */
import {
  type Block,
  type DocumentBlock,
  MAX_NESTING_DEPTH,
} from "@cp949/geul-model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { createEditor } from "../src/index.js";
import { resolvePasteBlockPlacement } from "../src/paste-block-placement.js";
import { contentTextStart } from "./block-test-support.js";
import { blocksOf, outline, pasteData } from "./clipboard-test-support.js";
import {
  checkListItemBlock,
  codeBlockBlock,
  documentOf,
  headingBlock,
  listItemBlock,
  maxBlockDepth,
  mountTiptapEditor,
  paragraphBlock,
  quoteBlock,
  sequentialIds,
  toggleBlock,
} from "./editor-controller-support.js";

type Point = readonly [blockId: string, offset: number];

// 문서를 마운트하고 selection을 둔다. to가 있으면 범위다.
const setup = (blocks: Block[], from: Point, to?: Point) => {
  const onChange = vi.fn();
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
    onChange,
  });
  const { editable, tiptap } = mountTiptapEditor(editor);
  editable.focus();
  const fromPos = contentTextStart(tiptap, from[0]) + from[1];
  if (to === undefined) {
    tiptap.commands.setTextSelection(fromPos);
  } else {
    tiptap.commands.setTextSelection({
      from: fromPos,
      to: contentTextStart(tiptap, to[0]) + to[1],
    });
  }
  onChange.mockClear();
  return { editor, editable, tiptap, onChange };
};

// 붙여넣고 최상위 outline을 돌려준다.
const pasteAndOutline = (
  blocks: Block[],
  from: Point,
  to: Point | undefined,
  entries: Record<string, string>,
): string[] => {
  const { editor, editable } = setup(blocks, from, to);
  pasteData(editable, entries);
  return outline(blocksOf(editor));
};

const HTML_XY = { "text/html": "<p>X</p><p>Y</p>" };
const MD_XY = { "text/plain": "X\n\nY" };

// 같은 클립보드 내용을 HTML과 Markdown 세 가지로 준다.
// expected는 붙은 블록들의 outline이다.
const INPUTS: ReadonlyArray<{
  name: string;
  entries: Record<string, string>;
  expected: string[];
}> = [
  { name: "HTML 문단 둘", entries: HTML_XY, expected: ["p:X", "p:Y"] },
  { name: "빈 줄 Markdown", entries: MD_XY, expected: ["p:X", "p:Y"] },
  {
    name: "목록 Markdown",
    entries: { "text/plain": "- a\n- b" },
    expected: ["ul:a", "ul:b"],
  },
  {
    name: "제목 Markdown",
    entries: { "text/plain": "# T\n\nbody" },
    expected: ["h1:T", "p:body"],
  },
];

const withChild = (): Block[] => [
  paragraphBlock("p1", "abcd", [paragraphBlock("c1", "child")]),
  paragraphBlock("tail", "tail"),
];

const withoutChild = (): Block[] => [
  paragraphBlock("p1", "abcd"),
  paragraphBlock("tail", "tail"),
];

const childrenOf = (block: DocumentBlock | undefined): DocumentBlock[] =>
  block !== undefined && "children" in block && block.children !== undefined
    ? block.children
    : [];

describe("자식 있는 블록 끝의 블록 붙여넣기(Issue #290)", () => {
  describe("끝 캐럿: 새 블록이 첫 자식이다(C1)", () => {
    it.each(INPUTS)(
      "$name 붙이면 새 블록이 기존 자식 앞에 놓이고 자식 id가 보존된다",
      ({ entries, expected }) => {
        const { editor, editable } = setup(withChild(), ["p1", 4]);

        pasteData(editable, entries);

        const blocks = blocksOf(editor);
        expect(outline(blocks)).toEqual([
          `p:abcd[${[...expected, "p:child"].join(",")}]`,
          "p:tail",
        ]);
        expect(blocks[0]?.id).toBe("p1");
        expect(childrenOf(blocks[0]).at(-1)?.id).toBe("c1");
      },
    );
  });

  describe("접힌 toggle 끝: 새 블록이 형제다(C2)", () => {
    it.each(INPUTS)(
      "$name 붙이면 숨은 자식은 toggle에 남고 새 블록은 뒤 형제가 된다",
      ({ entries, expected }) => {
        const blocks = [
          toggleBlock("t1", "abcd", {
            collapsed: true,
            children: [paragraphBlock("c1", "child")],
          }),
          paragraphBlock("tail", "tail"),
        ];

        const result = pasteAndOutline(blocks, ["t1", 4], undefined, entries);

        expect(result).toEqual([
          "toggle~:abcd[p:child]",
          ...expected,
          "p:tail",
        ]);
      },
    );

    it("접힌 toggle과 자식 id가 보존되고 빈 접힌 toggle 행이 생기지 않는다", () => {
      const blocks = [
        toggleBlock("t1", "abcd", {
          collapsed: true,
          children: [paragraphBlock("c1", "child")],
        }),
        paragraphBlock("tail", "tail"),
      ];
      const { editor, editable } = setup(blocks, ["t1", 4]);

      pasteData(editable, HTML_XY);

      const result = blocksOf(editor);
      expect(result[0]?.id).toBe("t1");
      expect(result[0]).toMatchObject({ collapsed: true });
      expect(childrenOf(result[0])[0]?.id).toBe("c1");
      expect(
        result.filter((block) => block.type === "toggleListItem"),
      ).toHaveLength(1);
    });
  });

  describe("부모 타입별 끝 캐럿(C3)", () => {
    const cases: ReadonlyArray<{
      name: string;
      parent: (children: Block[]) => Block;
      label: string;
      attrs: Record<string, unknown>;
    }> = [
      {
        name: "열린 toggle",
        parent: (children) =>
          toggleBlock("p1", "abcd", { collapsed: false, children }),
        label: "toggle",
        attrs: { collapsed: false },
      },
      {
        name: "heading",
        parent: (children) =>
          ({ ...headingBlock("p1", 2, "abcd"), children }) as Block,
        label: "h2",
        attrs: { level: 2 },
      },
      {
        name: "quote",
        parent: (children) => quoteBlock("p1", "abcd", children),
        label: "quote",
        attrs: {},
      },
      {
        name: "번호 목록 항목",
        parent: (children) =>
          listItemBlock("p1", "numberedListItem", "abcd", {
            startNumber: 3,
            children,
          }),
        label: "ol",
        attrs: { startNumber: 3 },
      },
      {
        name: "체크 목록 항목",
        parent: (children) =>
          ({ ...checkListItemBlock("p1", "abcd", true), children }) as Block,
        label: "checkListItem",
        attrs: { checked: true },
      },
    ];

    it.each(cases)(
      "$name 끝에 붙이면 자식이 부모에 남고 부모 타입과 attrs가 유지된다",
      ({ parent, label, attrs }) => {
        const blocks = [
          parent([paragraphBlock("c1", "child")]),
          paragraphBlock("tail", "tail"),
        ];
        const { editor, editable } = setup(blocks, ["p1", 4]);

        pasteData(editable, HTML_XY);

        const result = blocksOf(editor);
        expect(outline(result)).toEqual([
          `${label}:abcd[p:X,p:Y,p:child]`,
          "p:tail",
        ]);
        expect(result[0]?.id).toBe("p1");
        expect(result[0]).toMatchObject(attrs);
      },
    );
  });

  describe("빈 문단과 중첩(C4·C5)", () => {
    it("자식 있는 빈 문단에 붙이면 빈 문단을 유지하고 새 블록이 첫 자식이 된다", () => {
      const blocks = [
        paragraphBlock("p1", "", [paragraphBlock("c1", "child")]),
        paragraphBlock("tail", "tail"),
      ];

      const result = pasteAndOutline(blocks, ["p1", 0], undefined, HTML_XY);

      expect(result).toEqual(["p:[p:X,p:Y,p:child]", "p:tail"]);
    });

    it("손자가 있는 자식의 끝에 붙이면 그 자식의 첫 자식이 된다", () => {
      const blocks = [
        paragraphBlock("p1", "abcd", [
          paragraphBlock("c1", "child", [paragraphBlock("gc", "grand")]),
        ]),
        paragraphBlock("tail", "tail"),
      ];

      const result = pasteAndOutline(blocks, ["c1", 5], undefined, HTML_XY);

      expect(result).toEqual(["p:abcd[p:child[p:X,p:Y,p:grand]]", "p:tail"]);
    });
  });

  describe("같은 블록 범위가 블록 끝에서 끝난다(C6)", () => {
    it("끝 두 글자를 선택하면 지운 뒤 끝 캐럿 규칙으로 붙고 앞 글자는 남는다", () => {
      const result = pasteAndOutline(
        withChild(),
        ["p1", 2],
        ["p1", 4],
        HTML_XY,
      );

      expect(result).toEqual(["p:ab[p:X,p:Y,p:child]", "p:tail"]);
    });

    it("블록 전체를 선택하면 빈 문단을 남기고 새 블록이 첫 자식이 된다", () => {
      const result = pasteAndOutline(
        withChild(),
        ["p1", 0],
        ["p1", 4],
        HTML_XY,
      );

      expect(result).toEqual(["p:[p:X,p:Y,p:child]", "p:tail"]);
    });

    it("접힌 toggle 라벨의 끝 범위는 지운 뒤 형제로 붙는다", () => {
      const blocks = [
        toggleBlock("t1", "abcd", {
          collapsed: true,
          children: [paragraphBlock("c1", "child")],
        }),
        paragraphBlock("tail", "tail"),
      ];

      const result = pasteAndOutline(blocks, ["t1", 2], ["t1", 4], HTML_XY);

      expect(result).toEqual(["toggle~:ab[p:child]", "p:X", "p:Y", "p:tail"]);
    });
  });

  describe("깊이 상한(C7)", () => {
    // chain-1이 최상위, chain-depth가 가장 깊다. 가장 깊은 블록이 자식 leaf를 가진다.
    const chainWithLeaf = (depth: number): Block => {
      let innermost = paragraphBlock(`chain-${depth}`, "mid", [
        paragraphBlock("leaf", "child"),
      ]);
      for (let level = depth - 1; level >= 1; level -= 1) {
        innermost = paragraphBlock(`chain-${level}`, "mid", [innermost]);
      }
      return innermost;
    };

    it("깊이 MAX-1 부모의 첫 자식 자리에 중첩 목록을 붙이면 상한 안으로 평탄화된다", () => {
      const parentDepth = MAX_NESTING_DEPTH - 1;
      const { editor, editable, tiptap } = setup(
        [chainWithLeaf(parentDepth)],
        [`chain-${parentDepth}`, 3],
      );

      pasteData(editable, {
        "text/html":
          "<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>",
      });

      expect(() => tiptap.state.doc.check()).not.toThrow();
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBe(MAX_NESTING_DEPTH);
      let node: DocumentBlock | undefined = document.blocks[0];
      for (let level = 1; level < parentDepth; level += 1) {
        node = childrenOf(node)[0];
      }
      expect(outline(childrenOf(node))).toEqual([
        "ul:a",
        "ul:b",
        "ul:c",
        "p:child",
      ]);
    });
  });

  describe("변경 전 결과와 같다(C8)", () => {
    // 구현 전에 측정한 결과다. 같은 입력을 HTML·Markdown 둘로 확인한다.
    const characterized: ReadonlyArray<{
      name: string;
      blocks: () => Block[];
      from: Point;
      to?: Point;
      expected: string[];
    }> = [
      {
        name: "자식 없는 블록의 끝",
        blocks: withoutChild,
        from: ["p1", 4],
        expected: ["p:abcd", "p:X", "p:Y", "p:tail"],
      },
      {
        name: "자식 없는 블록의 시작",
        blocks: withoutChild,
        from: ["p1", 0],
        expected: ["p:", "p:X", "p:Y", "p:abcd", "p:tail"],
      },
      {
        name: "자식 없는 블록의 중간",
        blocks: withoutChild,
        from: ["p1", 2],
        expected: ["p:ab", "p:X", "p:Y", "p:cd", "p:tail"],
      },
      {
        name: "자식 없는 빈 문단",
        blocks: () => [
          paragraphBlock("p1", ""),
          paragraphBlock("tail", "tail"),
        ],
        from: ["p1", 0],
        expected: ["p:", "p:X", "p:Y", "p:tail"],
      },
      {
        name: "자식 있는 블록의 중간",
        blocks: withChild,
        from: ["p1", 2],
        expected: ["p:ab", "p:X", "p:Y", "p:cd[p:child]", "p:tail"],
      },
      {
        name: "자식 있는 블록의 시작",
        blocks: withChild,
        from: ["p1", 0],
        expected: ["p:", "p:X", "p:Y", "p:abcd[p:child]", "p:tail"],
      },
      {
        name: "끝에서 끝나지 않는 같은 블록 범위",
        blocks: withChild,
        from: ["p1", 1],
        to: ["p1", 3],
        expected: ["p:a", "p:X", "p:Y", "p:d[p:child]", "p:tail"],
      },
      {
        name: "자식 없는 블록의 끝 범위",
        blocks: withoutChild,
        from: ["p1", 2],
        to: ["p1", 4],
        expected: ["p:ab", "p:X", "p:Y", "p:tail"],
      },
      {
        name: "블록 끝에서 시작해 다른 블록에서 끝나는 범위",
        blocks: withChild,
        from: ["p1", 4],
        to: ["tail", 2],
        expected: ["p:abcd", "p:X", "p:Y", "p:il"],
      },
      {
        name: "블록 중간에서 시작해 다른 블록에서 끝나는 범위",
        blocks: withChild,
        from: ["p1", 2],
        to: ["tail", 2],
        expected: ["p:ab", "p:X", "p:Y", "p:il"],
      },
    ];

    for (const { name, blocks, from, to, expected } of characterized) {
      it(`${name}: HTML·Markdown 모두 현행 배치를 유지한다`, () => {
        expect(pasteAndOutline(blocks(), from, to, HTML_XY)).toEqual(expected);
        expect(pasteAndOutline(blocks(), from, to, MD_XY)).toEqual(expected);
      });
    }

    it("다른 블록에서 시작해 자식 있는 블록 끝에서 끝나는 범위는 지운 뒤 시작 블록의 첫 자식으로 붙는다(Issue #294)", () => {
      const blocks = [
        paragraphBlock("p0", "abcd"),
        paragraphBlock("p1", "efgh", [paragraphBlock("c1", "child")]),
        paragraphBlock("tail", "tail"),
      ];

      const result = pasteAndOutline(blocks, ["p0", 2], ["p1", 4], HTML_XY);

      expect(result).toEqual(["p:ab[p:X,p:Y,p:child]", "p:tail"]);
    });
  });

  describe("transaction 계약(C9)", () => {
    it("끝 캐럿 붙여넣기는 dispatch·onChange 1회이고 undo 1회로 원복한다", () => {
      const { editor, editable, tiptap, onChange } = setup(withChild(), [
        "p1",
        4,
      ]);
      const initialJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      pasteData(editable, HTML_XY);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(editor.getDocument().revision).toBe(1);
      expect(() => tiptap.state.doc.check()).not.toThrow();
      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("범위 삭제와 삽입이 한 번의 dispatch·undo다", () => {
      const { editable, tiptap, onChange } = setup(
        withChild(),
        ["p1", 2],
        ["p1", 4],
      );
      const initialJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      pasteData(editable, HTML_XY);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("접힌 toggle 끝 붙여넣기도 dispatch 1회이고 undo 1회로 원복한다", () => {
      const { editable, tiptap } = setup(
        [
          toggleBlock("t1", "abcd", {
            collapsed: true,
            children: [paragraphBlock("c1", "child")],
          }),
          paragraphBlock("tail", "tail"),
        ],
        ["t1", 4],
      );
      const initialJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      pasteData(editable, HTML_XY);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(() => tiptap.state.doc.check()).not.toThrow();
      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("새 블록 id는 서로 다르고 원본 id와 겹치지 않는다", () => {
      const { editor, editable } = setup(withChild(), ["p1", 4]);

      pasteData(editable, HTML_XY);

      const ids: string[] = [];
      const collect = (blocks: readonly DocumentBlock[]): void => {
        for (const block of blocks) {
          ids.push(block.id);
          collect(childrenOf(block));
        }
      };
      collect(blocksOf(editor));
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("붙여넣기 뒤 캐럿은 삽입 내용 끝이다(C10)", () => {
    const caretOf = (tiptap: ReturnType<typeof setup>["tiptap"]) => {
      const { selection } = tiptap.state;
      return {
        empty: selection.empty,
        text: selection.$from.parent.textContent,
        offset: selection.$from.parentOffset,
      };
    };

    it("열린 블록: 마지막 새 블록의 끝", () => {
      const { editable, tiptap } = setup(withChild(), ["p1", 4]);

      pasteData(editable, HTML_XY);

      expect(caretOf(tiptap)).toEqual({ empty: true, text: "Y", offset: 1 });
    });

    it("접힌 toggle: 마지막 새 형제의 끝", () => {
      const { editable, tiptap } = setup(
        [
          toggleBlock("t1", "abcd", {
            collapsed: true,
            children: [paragraphBlock("c1", "child")],
          }),
          paragraphBlock("tail", "tail"),
        ],
        ["t1", 4],
      );

      pasteData(editable, HTML_XY);

      expect(caretOf(tiptap)).toEqual({ empty: true, text: "Y", offset: 1 });
    });
  });

  describe("대상 판정 보강(리뷰 IMPL-REVIEW-01)", () => {
    it("마크가 있는 텍스트의 끝에서도 같은 규칙이다", () => {
      const blocks: Block[] = [
        {
          id: "p1",
          type: "paragraph",
          content: [{ text: "abcd", marks: [{ type: "bold" }] }],
          children: [paragraphBlock("c1", "child")],
        } as Block,
        paragraphBlock("tail", "tail"),
      ];

      const result = pasteAndOutline(blocks, ["p1", 4], undefined, HTML_XY);

      expect(result).toEqual(["p:abcd[p:X,p:Y,p:child]", "p:tail"]);
    });

    it("부모의 자식인 접힌 toggle 끝은 그 toggle의 뒤 형제로 붙는다", () => {
      const blocks: Block[] = [
        paragraphBlock("p0", "top", [
          toggleBlock("t1", "abcd", {
            collapsed: true,
            children: [paragraphBlock("c1", "child")],
          }),
          paragraphBlock("sib", "sib"),
        ]),
        paragraphBlock("tail", "tail"),
      ];

      const result = pasteAndOutline(blocks, ["t1", 4], undefined, HTML_XY);

      expect(result).toEqual([
        "p:top[toggle~:abcd[p:child],p:X,p:Y,p:sib]",
        "p:tail",
      ]);
    });

    it("표 포함 HTML은 표 붙여넣기 경로가 처리해 최상위 형제로 놓인다(현행)", () => {
      const result = pasteAndOutline(withChild(), ["p1", 4], undefined, {
        "text/html":
          "<p>X</p><table><tbody><tr><td>c</td></tr></tbody></table><p>Z</p>",
      });

      expect(result[0]).toBe("p:abcd[p:child]");
      expect(result.at(-1)).toBe("p:tail");
    });

    it("시작과 끝 텍스트블록이 다르면 같은 노드 인스턴스를 공유해도 대상이 아니다", () => {
      const { tiptap } = setup(withChild(), ["p1", 0]);
      const { schema } = tiptap;
      const nodeType = (name: string) => {
        const type = schema.nodes[name];
        if (type === undefined) throw new Error(`스키마에 ${name}이 없다`);
        return type;
      };
      const shared = nodeType("paragraph").create(null, schema.text("abc"));
      const container = (id: string, childId: string) =>
        nodeType("blockContainer").create({ blockId: id }, [
          shared,
          nodeType("blockGroup").create(null, [
            nodeType("blockContainer").create({ blockId: childId }, [
              nodeType("paragraph").create(null, schema.text("abc")),
            ]),
          ]),
        ]);
      const group = nodeType("blockGroup").create(null, [
        container("a", "ac"),
        container("b", "bc"),
      ]);
      const doc =
        tiptap.state.doc.firstChild?.type.name === "blockGroup"
          ? tiptap.state.doc.type.create(null, group)
          : tiptap.state.doc.type.create(null, group.content);
      let first = -1;
      let last = -1;
      doc.descendants((node, pos) => {
        if (node !== shared) return true;
        if (first < 0) first = pos + 2;
        last = pos + 1 + node.content.size;
        return true;
      });
      expect(first).toBeGreaterThan(0);
      const selection = TextSelection.create(doc, first, last);
      expect(selection.$from.parent).toBe(selection.$to.parent);
      expect(selection.$from.start()).not.toBe(selection.$to.start());

      expect(resolvePasteBlockPlacement(selection)).toBeNull();
    });
  });
  describe("다른 블록에서 시작해 자식 있는 블록 끝에서 끝나는 범위(Issue #294)", () => {
    // D1: 최상위 두 블록. D2: 시작 블록이 head다.
    const d1 = (): Block[] => [
      paragraphBlock("p0", "abcd"),
      paragraphBlock("p1", "efgh", [paragraphBlock("c1", "child")]),
      paragraphBlock("tail", "tail"),
    ];
    const d2 = (): Block[] => [
      paragraphBlock("head", "head"),
      paragraphBlock("p1", "abcd", [paragraphBlock("c1", "child")]),
      paragraphBlock("tail", "tail"),
    ];

    describe("기준 배치(C1·C2)", () => {
      it.each(INPUTS)(
        "D1: $name 붙이면 시작 블록 ab의 첫 자식들로 놓이고 child id가 보존되며 빈 블록이 없다",
        ({ entries, expected }) => {
          const { editor, editable } = setup(d1(), ["p0", 2], ["p1", 4]);

          pasteData(editable, entries);

          const blocks = blocksOf(editor);
          expect(outline(blocks)).toEqual([
            `p:ab[${[...expected, "p:child"].join(",")}]`,
            "p:tail",
          ]);
          expect(blocks.map((block) => block.id)).toEqual(["p0", "tail"]);
          expect(childrenOf(blocks[0]).at(-1)?.id).toBe("c1");
        },
      );

      it.each(INPUTS)(
        "D2: $name 붙이면 시작 블록 he의 첫 자식들로 놓인다",
        ({ entries, expected }) => {
          const result = pasteAndOutline(d2(), ["head", 2], ["p1", 4], entries);

          expect(result).toEqual([
            `p:he[${[...expected, "p:child"].join(",")}]`,
            "p:tail",
          ]);
        },
      );

      it("단일 블록 HTML도 시작 블록의 첫 자식이 된다", () => {
        const result = pasteAndOutline(d1(), ["p0", 2], ["p1", 4], {
          "text/html": "<p>X</p>",
        });

        expect(result).toEqual(["p:ab[p:X,p:child]", "p:tail"]);
      });
    });

    describe("시작 블록 타입·attrs 유지(C3)", () => {
      const cases: ReadonlyArray<{
        name: string;
        start: Block;
        label: string;
        attrs: Record<string, unknown>;
      }> = [
        {
          name: "heading level 2",
          start: headingBlock("p0", 2, "abcd"),
          label: "h2",
          attrs: { level: 2 },
        },
        {
          name: "번호 목록 항목",
          start: listItemBlock("p0", "numberedListItem", "abcd", {
            startNumber: 3,
          }),
          label: "ol",
          attrs: { startNumber: 3 },
        },
        {
          name: "체크 목록 항목",
          start: checkListItemBlock("p0", "abcd", true),
          label: "checkListItem",
          attrs: { checked: true },
        },
      ];

      it.each(cases)(
        "$name: 시작하면 타입·attrs를 유지하고 새 블록이 그 자식이 된다",
        ({ start, label, attrs }) => {
          const blocks = [
            start,
            paragraphBlock("p1", "efgh", [paragraphBlock("c1", "child")]),
            paragraphBlock("tail", "tail"),
          ];
          const { editor, editable } = setup(blocks, ["p0", 2], ["p1", 4]);

          pasteData(editable, HTML_XY);

          const result = blocksOf(editor);
          expect(outline(result)).toEqual([
            `${label}:ab[p:X,p:Y,p:child]`,
            "p:tail",
          ]);
          expect(result[0]?.id).toBe("p0");
          expect(result[0]).toMatchObject(attrs);
        },
      );
    });

    describe("끝 블록 모양(C4·C5)", () => {
      it("끝 블록이 접힌 toggle이면 Backspace와 같은 결과에 새 블록이 첫 자식으로 놓인다", () => {
        const blocks = (): Block[] => [
          paragraphBlock("p0", "abcd"),
          toggleBlock("t1", "efgh", {
            collapsed: true,
            children: [paragraphBlock("c1", "child")],
          }),
          paragraphBlock("tail", "tail"),
        ];
        const baseline = setup(blocks(), ["p0", 2], ["t1", 4]);
        baseline.tiptap.commands.deleteSelection();
        const deleted = outline(blocksOf(baseline.editor));

        const { editor, editable } = setup(blocks(), ["p0", 2], ["t1", 4]);
        pasteData(editable, HTML_XY);

        // 삭제는 접힌 toggle 껍데기를 남기지 않고 숨은 자식이 시작 블록 자식이 된다.
        expect(deleted).toEqual(["p:ab[p:child]", "p:tail"]);
        const result = blocksOf(editor);
        expect(outline(result)).toEqual(["p:ab[p:X,p:Y,p:child]", "p:tail"]);
        expect(
          result.filter((block) => block.type === "toggleListItem"),
        ).toHaveLength(0);
      });

      it("끝 블록이 부모의 자식이면 삭제 기준선의 모양에 새 블록이 시작 블록의 첫 자식으로 놓인다", () => {
        const blocks = (): Block[] => [
          paragraphBlock("p0", "abcd"),
          paragraphBlock("par", "top", [
            paragraphBlock("e", "efgh", [paragraphBlock("c1", "child")]),
            paragraphBlock("sib", "sib"),
          ]),
          paragraphBlock("tail", "tail"),
        ];
        const baseline = setup(blocks(), ["p0", 2], ["e", 4]);
        baseline.tiptap.commands.deleteSelection();
        const deleted = outline(blocksOf(baseline.editor));

        const { editor, editable, tiptap } = setup(
          blocks(),
          ["p0", 2],
          ["e", 4],
        );
        pasteData(editable, HTML_XY);

        // 삭제 기준선이 빈 e를 남긴다. 붙여넣기는 그 앞에 새 블록을 둔다.
        expect(deleted).toEqual(["p:ab[p:[p:child],p:sib]", "p:tail"]);
        expect(outline(blocksOf(editor))).toEqual([
          "p:ab[p:X,p:Y,p:[p:child],p:sib]",
          "p:tail",
        ]);
        expect(() => tiptap.state.doc.check()).not.toThrow();
      });
    });

    describe("시작 블록 모양별 폴백과 배치(실측 특성화)", () => {
      it("시작이 끝보다 깊으면 지운 뒤 캐럿 블록에 자식이 없어 평문 캐럿 삽입으로 폴백한다", () => {
        // 삭제 기준선이 자식을 가진 빈 블록 `p:[p:child]`를 남긴다. 붙여넣기는
        // 그 블록을 건드리지 않고 시작 블록의 형제로 붙는다.
        const blocks = [
          paragraphBlock("par", "par", [paragraphBlock("s", "abcd")]),
          paragraphBlock("e", "efgh", [paragraphBlock("c1", "child")]),
          paragraphBlock("tail", "tail"),
        ];
        const { editor, editable, tiptap } = setup(blocks, ["s", 2], ["e", 4]);

        pasteData(editable, HTML_XY);

        expect(outline(blocksOf(editor))).toEqual([
          "p:par[p:ab,p:X,p:Y]",
          "p:[p:child]",
          "p:tail",
        ]);
        expect(() => tiptap.state.doc.check()).not.toThrow();
      });

      it("폴백 삽입도 깊이 상한을 지킨다", () => {
        // 시작 s가 최대 깊이 블록이다. 끝 e는 최상위라 폴백이 s의 형제로 붙인다.
        let wrapper: Block = paragraphBlock(
          `w-${MAX_NESTING_DEPTH - 1}`,
          "wrap",
          [paragraphBlock("s", "abcd")],
        );
        for (let level = MAX_NESTING_DEPTH - 2; level >= 1; level -= 1) {
          wrapper = paragraphBlock(`w-${level}`, "wrap", [wrapper]);
        }
        const blocks = [
          wrapper,
          paragraphBlock("e", "efgh", [paragraphBlock("c1", "child")]),
        ];
        const { editor, editable, tiptap } = setup(blocks, ["s", 2], ["e", 4]);

        pasteData(editable, {
          "text/html":
            "<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>",
        });

        expect(() => tiptap.state.doc.check()).not.toThrow();
        const document = editor.getDocument();
        expect(maxBlockDepth(document.blocks)).toBe(MAX_NESTING_DEPTH);
        // 상한을 넘는 중첩 목록이 평탄화되어 s의 형제로 붙는다. 붙지 않으면 RED다.
        let node: DocumentBlock | undefined = document.blocks[0];
        for (let level = 1; level < MAX_NESTING_DEPTH - 1; level += 1) {
          node = childrenOf(node)[0];
        }
        expect(outline(childrenOf(node))).toEqual([
          "p:ab",
          "ul:a",
          "ul:b",
          "ul:c",
        ]);
      });

      it("시작이 접힌 toggle이면 삭제 뒤 새 블록이 그 toggle의 뒤 형제로 붙는다", () => {
        const blocks = [
          toggleBlock("t1", "abcd", {
            collapsed: true,
            children: [paragraphBlock("h1", "hidden")],
          }),
          paragraphBlock("p1", "efgh", [paragraphBlock("c1", "child")]),
          paragraphBlock("tail", "tail"),
        ];

        const result = pasteAndOutline(blocks, ["t1", 2], ["p1", 4], HTML_XY);

        expect(result).toEqual(["toggle~:ab[p:child]", "p:X", "p:Y", "p:tail"]);
      });

      it("시작이 끝 블록의 부모이면 삭제 기준선의 빈 블록 앞에 붙는다", () => {
        const blocks = [
          paragraphBlock("s", "abcd", [
            paragraphBlock("e", "efgh", [paragraphBlock("c1", "child")]),
          ]),
          paragraphBlock("tail", "tail"),
        ];

        const result = pasteAndOutline(blocks, ["s", 2], ["e", 4], HTML_XY);

        expect(result).toEqual(["p:ab[p:X,p:Y,p:[p:child]]", "p:tail"]);
      });
    });

    describe("시작 블록에 자식이 있다(C6)", () => {
      it("범위 안의 c0는 삭제되고 결과는 D1과 같다", () => {
        const blocks = [
          paragraphBlock("p0", "abcd", [paragraphBlock("c0", "zz")]),
          paragraphBlock("p1", "efgh", [paragraphBlock("c1", "child")]),
          paragraphBlock("tail", "tail"),
        ];

        const result = pasteAndOutline(blocks, ["p0", 2], ["p1", 4], HTML_XY);

        expect(result).toEqual(["p:ab[p:X,p:Y,p:child]", "p:tail"]);
      });
    });

    describe("깊이 상한(C7)", () => {
      it("시작 블록이 깊이 MAX-1이면 중첩 목록이 평탄화되고 문서가 유효하다", () => {
        // 깊이 MAX-2 래퍼 아래에 시작 s(깊이 MAX-1)와 끝 e(자식 leaf)가 형제다.
        const startDepth = MAX_NESTING_DEPTH - 1;
        let wrapper: Block = paragraphBlock(`w-${startDepth - 1}`, "wrap", [
          paragraphBlock("s", "start"),
          paragraphBlock("e", "end", [paragraphBlock("leaf", "child")]),
        ]);
        for (let level = startDepth - 2; level >= 1; level -= 1) {
          wrapper = paragraphBlock(`w-${level}`, "wrap", [wrapper]);
        }
        const { editor, editable, tiptap } = setup(
          [wrapper],
          ["s", 2],
          ["e", 3],
        );

        pasteData(editable, {
          "text/html":
            "<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>",
        });

        expect(() => tiptap.state.doc.check()).not.toThrow();
        const document = editor.getDocument();
        expect(maxBlockDepth(document.blocks)).toBe(MAX_NESTING_DEPTH);
        let node: DocumentBlock | undefined = document.blocks[0];
        for (let level = 1; level < startDepth - 1; level += 1) {
          node = childrenOf(node)[0];
        }
        const start = childrenOf(node)[0];
        expect(start?.id).toBe("s");
        expect(outline(childrenOf(start))).toEqual([
          "ul:a",
          "ul:b",
          "ul:c",
          "p:child",
        ]);
      });
    });

    describe("변경 전 결과와 같다(C8)", () => {
      const cb = (): Block[] => [
        paragraphBlock("p1", "abcd"),
        codeBlockBlock("cb", "foobar"),
        paragraphBlock("tail", "tail"),
      ];
      const characterized: ReadonlyArray<{
        name: string;
        blocks: () => Block[];
        from: Point;
        to: Point;
        expected: string[];
      }> = [
        {
          name: "끝 블록에 자식이 없다",
          blocks: () => [
            paragraphBlock("head", "head"),
            paragraphBlock("p1", "abcd"),
            paragraphBlock("tail", "tail"),
          ],
          from: ["head", 2],
          to: ["p1", 4],
          expected: ["p:he", "p:X", "p:Y", "p:tail"],
        },
        {
          name: "끝이 내용 끝이 아니다(자식은 잔여가 가져간다)",
          blocks: d1,
          from: ["p0", 2],
          to: ["p1", 2],
          expected: ["p:ab", "p:X", "p:Y", "p:gh[p:child]", "p:tail"],
        },
        {
          name: "끝이 다음 블록 중간이다",
          blocks: d1,
          from: ["p0", 2],
          to: ["tail", 2],
          expected: ["p:ab", "p:X", "p:Y", "p:il"],
        },
        {
          name: "끝 codeBlock 잔여(#286)",
          blocks: cb,
          from: ["p1", 2],
          to: ["cb", 3],
          expected: ["p:ab", "p:X", "p:Y", "code:bar", "p:tail"],
        },
        {
          name: "시작이 codeBlock 안(PM 기본)",
          blocks: cb,
          from: ["cb", 3],
          to: ["tail", 2],
          expected: ["p:abcd", "code:fooX", "p:Yil"],
        },
      ];

      for (const { name, blocks, from, to, expected } of characterized) {
        it(`${name}: HTML 배치를 유지한다`, () => {
          expect(pasteAndOutline(blocks(), from, to, HTML_XY)).toEqual(
            expected,
          );
        });
      }

      it("같은 블록 범위는 #290 결과 그대로다", () => {
        const result = pasteAndOutline(d1(), ["p1", 2], ["p1", 4], HTML_XY);

        expect(result).toEqual(["p:abcd", "p:ef[p:X,p:Y,p:child]", "p:tail"]);
      });
    });

    describe("transaction 계약과 캐럿(C9·C10)", () => {
      it("범위 삭제와 삽입이 dispatch·onChange·revision 1회이고 undo 1회로 원복한다", () => {
        const { editor, editable, tiptap, onChange } = setup(
          d1(),
          ["p0", 2],
          ["p1", 4],
        );
        const initialJson = tiptap.state.doc.toJSON();
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        pasteData(editable, HTML_XY);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(editor.getDocument().revision).toBe(1);
        expect(() => tiptap.state.doc.check()).not.toThrow();
        tiptap.commands.undo();
        expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
      });

      it("캐럿이 삽입 내용 끝에 놓인다", () => {
        const { editable, tiptap } = setup(d1(), ["p0", 2], ["p1", 4]);

        pasteData(editable, HTML_XY);

        const { selection } = tiptap.state;
        expect(selection.empty).toBe(true);
        expect(selection.$from.parent.textContent).toBe("Y");
        expect(selection.$from.parentOffset).toBe(1);
      });

      it("새 블록 id는 서로 다르고 원본 id와 겹치지 않는다", () => {
        const { editor, editable } = setup(d1(), ["p0", 2], ["p1", 4]);

        pasteData(editable, HTML_XY);

        const ids: string[] = [];
        const collect = (blocks: readonly DocumentBlock[]): void => {
          for (const block of blocks) {
            ids.push(block.id);
            collect(childrenOf(block));
          }
        };
        collect(blocksOf(editor));
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).not.toContain("p1");
      });
    });
  });
});
