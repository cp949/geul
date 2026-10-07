/**
 * 표 셀 안 평문 붙여넣기의 무효 문자 처리 계약을 고정한다(Issue #297).
 * 수정 전에는 표 셀 안이면 입력과 무관하게 PM 기본에 맡겼다. PM 기본이 raw
 * 무효 문자(제어문자·짝 없는 surrogate)를 셀에 넣으면 되돌림 guard가
 * 붙여넣기를 통째로 지웠다. 이제 무효 문자가 섞인 평문은 무효 문자와 Tab을
 * 지운 정리본을 view.pasteText로 넣고, 유효한 평문은 PM 기본에 맡긴다.
 *
 * 다루는 축은 선택 종류(S1 마지막 셀 끝 캐럿, S2 같은 셀 안 범위, S3 마지막이
 * 아닌 셀 캐럿) x 입력 행렬, 정리본이 비는 입력, 유효 평문 위임, transaction
 * 계약, 셀 안 인라인 atom NodeSelection, 개입하지 않는 경로(html 동반·
 * CellSelection), pasteHandler 미호출 계약, 표 경계 범위(Issue #292) 뒤 캐럿 위치, 불변
 * 특성화(TSV·표 밖)다.
 *
 * 여러 줄은 유효 여러 줄과 구조가 같다. 마지막 셀은 첫 줄만 셀에 들어가고
 * 나머지는 표 뒤 문단이 된다. 마지막이 아닌 셀은 PM이 표를 쪼갠 뒤 되돌림이
 * 복원해 불변이다. 이 결함은 이슈 범위 밖이라 현행을 특성화한다.
 * 실제 브라우저 대표 시나리오는 e2e/clipboard-paste.spec.ts와
 * e2e/table-paste.spec.ts가 맡는다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import type { CreateEditorOptions } from "../src/index.js";
import { expectSchemaValid } from "./block-join/block-join-test-support.js";
import {
  dispatchPasteData,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  documentOf,
  editorState,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";
import {
  gridTable,
  inBlock,
  inCell,
  outline,
  type Pos,
  singleCellTable,
  TAIL,
} from "./table-boundary-test-support.js";
import { selectCellRange } from "./table-test-support.js";

const SOH = String.fromCharCode(1);
const HIGH_SURROGATE = String.fromCharCode(0xd800);
const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);

// 선택을 두는 함수. 마운트 뒤에야 문서 위치를 알 수 있다.
type Place = (tiptap: TiptapEditor) => void;

// anchor→head TextSelection을 둔다. head를 생략하면 캐럿이다.
const textSelection =
  (anchor: Pos, head: Pos = anchor): Place =>
  (tiptap) => {
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.create(tiptap.state.doc, anchor(tiptap), head(tiptap)),
      ),
    );
  };

// 기준 문서 T: p1 "para", 1x1 표(셀 "cell"), tail.
const lastCellBlocks = (): Block[] => [
  paragraphBlock("p1", "para"),
  singleCellTable("t", "cell"),
  TAIL,
];

// 마지막이 아닌 셀 문서: p1 "para", 1x2 표("c1"|"c2"), tail.
const firstCellBlocks = (): Block[] => [
  paragraphBlock("p1", "para"),
  gridTable("g", 1, 2, ["c1", "c2"]),
  TAIL,
];

type SelectionCase = {
  name: string;
  blocks: () => Block[];
  place: Place;
};

// S1 마지막 셀 끝 캐럿, S2 같은 셀 안 범위 "cell"[1,3], S3 마지막이 아닌 셀
// 끝 캐럿이다.
const S1: SelectionCase = {
  name: "S1 마지막 셀 끝 캐럿",
  blocks: lastCellBlocks,
  place: textSelection(inCell("t-r0c0", 4)),
};
const S2: SelectionCase = {
  name: "S2 같은 셀 안 범위 c[el]l",
  blocks: lastCellBlocks,
  place: textSelection(inCell("t-r0c0", 1), inCell("t-r0c0", 3)),
};
const S3: SelectionCase = {
  name: "S3 마지막이 아닌 셀 끝 캐럿",
  blocks: firstCellBlocks,
  place: textSelection(inCell("g-r0c0", 2)),
};
const selections: SelectionCase[] = [S1, S2, S3];

// 최상위 블록 요약. 표는 table[셀|셀]이다.
const docOutline = (...middle: string[]): string[] => [
  "paragraph:para",
  ...middle,
  "paragraph:tail",
];

type PasteOptions = Partial<CreateEditorOptions>;

// 문서를 마운트하고 선택을 둔 뒤 paste 이벤트를 dispatch한다. pasteText와
// dispatch 호출을 붙여넣기 직전에 감시한다.
const pasteIn = (
  blocks: Block[],
  place: Place,
  entries: Record<string, string>,
  options: PasteOptions = {},
) => {
  const m = mounted(documentOf(...blocks), options);
  place(m.tiptap);
  const before = editorState(m.editor, m.tiptap);
  const pasteText = vi.spyOn(m.tiptap.view, "pasteText");
  const dispatch = vi.spyOn(m.tiptap.view, "dispatch");
  const event = dispatchPasteData(m.tiptap.view.dom, entries);
  return {
    ...m,
    before,
    pasteText,
    dispatch,
    event,
    blocks: () => outline(m.editor.getDocument().blocks),
  };
};

describe("표 셀 안 평문 붙여넣기의 무효 문자(Issue #297)", () => {
  type PasteCase = {
    name: string;
    input: string;
    // selections 순서(S1·S2·S3)의 기대 outline이다.
    expected: [string[], string[], string[]];
  };

  // 여러 줄 입력은 유효 여러 줄과 같은 구조다. S3은 표를 쪼갠 뒤 되돌림이
  // 복원해 불변이다.
  const invalidCases: PasteCase[] = [
    {
      name: "제어문자가 섞인 한 줄",
      input: `a${SOH}b`,
      expected: [
        docOutline("table[cellab]"),
        docOutline("table[cabl]"),
        docOutline("table[c1ab|c2]"),
      ],
    },
    {
      name: "짝 없는 surrogate가 섞인 한 줄",
      input: `a${HIGH_SURROGATE}b`,
      expected: [
        docOutline("table[cellab]"),
        docOutline("table[cabl]"),
        docOutline("table[c1ab|c2]"),
      ],
    },
    {
      name: "제어문자가 섞인 여러 줄",
      input: `a${SOH}b\nc`,
      expected: [
        docOutline("table[cellab]", "paragraph:c"),
        docOutline("table[cab]", "paragraph:cl"),
        docOutline("table[c1|c2]"),
      ],
    },
    {
      name: "CRLF와 제어문자가 섞인 두 줄",
      input: `a${SOH}${CR}\nb`,
      expected: [
        docOutline("table[cella]", "paragraph:b"),
        docOutline("table[ca]", "paragraph:bl"),
        docOutline("table[c1|c2]"),
      ],
    },
    {
      // 줄마다 탭 개수가 달라 NOT_TABULAR다. 표로 가로채이지 않는다.
      name: "Tab이 든 여러 줄(표로 가로채이지 않는 모양)",
      input: `a${TAB}b\nc`,
      expected: [
        docOutline("table[cellab]", "paragraph:c"),
        docOutline("table[cab]", "paragraph:cl"),
        docOutline("table[c1|c2]"),
      ],
    },
  ];

  // 유효 입력은 PM 기본이라 수정 전과 결과가 같다(현행 특성화).
  const validCases: PasteCase[] = [
    {
      name: "유효한 한 줄",
      input: "ab",
      expected: [
        docOutline("table[cellab]"),
        docOutline("table[cabl]"),
        docOutline("table[c1ab|c2]"),
      ],
    },
    {
      name: "유효한 LF 여러 줄",
      input: "a\nb",
      expected: [
        docOutline("table[cella]", "paragraph:b"),
        docOutline("table[ca]", "paragraph:bl"),
        docOutline("table[c1|c2]"),
      ],
    },
    {
      name: "유효한 CRLF 여러 줄",
      input: `a${CR}\nb`,
      expected: [
        docOutline("table[cella]", "paragraph:b"),
        docOutline("table[ca]", "paragraph:bl"),
        docOutline("table[c1|c2]"),
      ],
    },
  ];

  describe.each(selections.map((selection, index) => ({ selection, index })))(
    "$selection.name",
    ({ selection, index }) => {
      it.each(invalidCases)(
        "$name 입력은 무효 문자만 지운 정리본을 pasteText 1회로 셀에 넣는다(C1~C4)",
        ({ input, expected }) => {
          const result = pasteIn(selection.blocks(), selection.place, {
            "text/plain": input,
          });

          // S3 여러 줄은 문서가 불변이다. 정리본이 PM에 닿았는지는 pasteText
          // 호출로 가른다. 가드가 없으면 호출이 0회다.
          expect(result.pasteText).toHaveBeenCalledTimes(1);
          expect(result.blocks()).toEqual(expected[index]);
          expectSchemaValid(result.tiptap);
          expect(result.event.defaultPrevented).toBe(true);
        },
      );

      it.each(validCases)(
        "$name 입력은 view.pasteText 없이 PM 기본에 맡기고 결과가 현행과 같다(C6)",
        ({ input, expected }) => {
          const result = pasteIn(selection.blocks(), selection.place, {
            "text/plain": input,
          });

          expect(result.pasteText).not.toHaveBeenCalled();
          expect(result.blocks()).toEqual(expected[index]);
        },
      );

      it("제어문자만 있는 입력은 이벤트만 소비하고 문서와 선택을 바꾸지 않는다(C5)", () => {
        withUnhandledErrorTracking((errors) => {
          const result = pasteIn(selection.blocks(), selection.place, {
            "text/plain": SOH,
          });

          expect(result.event.defaultPrevented).toBe(true);
          expect(result.dispatch).not.toHaveBeenCalled();
          expect(result.pasteText).not.toHaveBeenCalled();
          expect(editorState(result.editor, result.tiptap)).toEqual(
            result.before,
          );
          expect(errors).toEqual([]);
        });
      });

      it("정리본 붙여넣기는 pasteText 1회, dispatch 1회, undo 1회로 원복되고 문서가 유효하다(C7)", () => {
        const result = pasteIn(selection.blocks(), selection.place, {
          "text/plain": `a${SOH}b`,
        });

        expect(result.pasteText).toHaveBeenCalledTimes(1);
        expect(result.dispatch).toHaveBeenCalledTimes(1);
        expect(result.editor.getDocument().revision).toBe(
          result.before.document.revision + 1,
        );
        expectSchemaValid(result.tiptap);
        expect(result.blocks().join("")).not.toContain(SOH);

        result.tiptap.commands.undo();
        expect(result.tiptap.state.doc.toJSON()).toEqual(
          result.before.tiptapDocument,
        );
      });
    },
  );

  describe("html이 함께 오면 개입하지 않는다(C8)", () => {
    it.each([
      { name: "무효 문자 평문", text: `a${SOH}b` },
      { name: "유효 평문", text: "ab" },
    ])(
      "$name + html이 오면 PM이 html만 써서 셀에 bold x가 들어가고 view.pasteText는 부르지 않는다",
      ({ text }) => {
        const result = pasteIn(S1.blocks(), S1.place, {
          "text/html": "<b>x</b>",
          "text/plain": text,
        });

        expect(result.pasteText).not.toHaveBeenCalled();
        expect(result.blocks()).toEqual(docOutline("table[cellx]"));
        const table = result.editor.getDocument().blocks[1];
        if (table?.type !== "table") throw new Error("표 블록이 사라졌다");
        const cell = (table as Extract<Block, { type: "table" }>).rows[0]
          ?.cells[0];
        expect(cell?.content).toEqual([
          { text: "cell" },
          { text: "x", marks: [{ type: "bold" }] },
        ]);
      },
    );
  });

  describe("개입하지 않는 선택: CellSelection(현행 특성화, 별건)", () => {
    // 2셀 CellSelection이다. 유효 평문도 NOID cell 때문에 되돌려져 사라진다.
    // 무효 문자와 무관한 별개 결함이라 이 이슈에서 고치지 않는다(C9).
    const cellSelected: Place = (tiptap) =>
      selectCellRange(tiptap, "g-r0c0", "g-r0c1");

    it.each([
      { name: "무효 문자 평문", text: `a${SOH}b` },
      { name: "유효 평문", text: "ab" },
    ])(
      "CellSelection에서 $name 입력은 현행대로 문서가 불변이고 view.pasteText를 부르지 않는다(C9)",
      ({ text }) => {
        const result = pasteIn(firstCellBlocks(), cellSelected, {
          "text/plain": text,
        });

        expect(result.pasteText).not.toHaveBeenCalled();
        expect(result.blocks()).toEqual(docOutline("table[c1|c2]"));
      },
    );
  });

  describe("셀 안 인라인 atom NodeSelection", () => {
    // 셀 안 인라인 atom NodeSelection이다. CellSelection이 아니라 개입한다.
    // 무효 문자 평문은 정리본이 atom을 대체한다. 유효 평문은 PM 기본이다.
    const atomBlocks = (): Block[] => [
      paragraphBlock("p1", "para"),
      {
        ...(singleCellTable("t", "cell") as Extract<Block, { type: "table" }>),
        rows: [
          {
            id: "t-row0",
            cells: [
              {
                id: "t-r0c0",
                columnId: "t-col0",
                rowSpan: 1,
                columnSpan: 1,
                content: [
                  { text: "ab" },
                  { type: "custom", customType: "myTag" },
                  { text: "cd" },
                ],
              },
            ],
          },
        ],
      },
      TAIL,
    ];
    const atomSelected: Place = (tiptap) => {
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(
          NodeSelection.create(tiptap.state.doc, inCell("t-r0c0", 2)(tiptap)),
        ),
      );
    };
    const withTag: PasteOptions = {
      customInlineContent: {
        myTag: {
          render: () => {
            const element = document.createElement("span");
            element.textContent = "tag";
            return element;
          },
        },
      },
    };

    it("셀 안 인라인 atom NodeSelection에서 무효 문자 평문은 정리본이 atom을 대체하고 유효 평문은 PM 기본에 맡긴다", () => {
      const invalid = pasteIn(
        atomBlocks(),
        atomSelected,
        { "text/plain": `a${SOH}b` },
        withTag,
      );
      expect(invalid.pasteText).toHaveBeenCalledTimes(1);
      expect(invalid.blocks()).toEqual(docOutline("table[ababcd]"));

      const valid = pasteIn(
        atomBlocks(),
        atomSelected,
        { "text/plain": "XY" },
        withTag,
      );
      expect(valid.pasteText).not.toHaveBeenCalled();
      expect(valid.blocks()).toEqual(docOutline("table[abXYcd]"));
    });
  });

  describe("pasteHandler 계약(C10)", () => {
    it.each([
      {
        name: "무효 문자 평문",
        text: `a${SOH}b`,
        expected: "table[cellab]",
      },
      { name: "제어문자만 있는 평문", text: SOH, expected: "table[cell]" },
      { name: "유효 평문", text: "ab", expected: "table[cellab]" },
    ])(
      "표 셀 안에서는 $name 입력도 pasteHandler를 호출하지 않는다",
      ({ text, expected }) => {
        const pasteHandler = vi.fn(() => true);

        const result = pasteIn(
          S1.blocks(),
          S1.place,
          { "text/plain": text },
          { pasteHandler },
        );

        expect(pasteHandler).not.toHaveBeenCalled();
        expect(result.blocks()).toEqual(docOutline(expected));
      },
    );
  });

  // 표 경계 범위는 TableBoundaryInputExtension이 먼저 지운 뒤 붙여넣기 핸들러가
  // 호출 시점의 state를 읽는다(Issue #292). 지운 뒤 캐럿 위치가 갈림길이다.
  describe("표 경계 범위 뒤 캐럿 위치(C11)", () => {
    const tail = (offset: number): Pos => inBlock("tail", offset);

    it("시작이 셀 안이고 끝이 뒤 문단 안이면 지운 뒤 캐럿이 셀 안이라 정리본이 셀에 들어간다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 2), tail(2)),
        { "text/plain": `a${SOH}b` },
      );

      expect(result.pasteText).toHaveBeenCalledTimes(1);
      expect(result.blocks()).toEqual([
        "paragraph:para",
        "table[ceab]",
        "paragraph:il",
      ]);
      expectSchemaValid(result.tiptap);
    });

    it("시작이 표 밖이면 지운 뒤 캐럿이 표 밖이라 표 밖 경로가 정리본을 넣는다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inBlock("p1", 2), inCell("t-r0c0", 2)),
        { "text/plain": `a${SOH}b` },
      );

      expect(result.blocks()).toEqual([
        "paragraph:paab",
        "table[ll]",
        "paragraph:tail",
      ]);
      expectSchemaValid(result.tiptap);
    });
  });

  describe("불변 특성화(C12)", () => {
    it("표 판정되는 TSV 한 줄은 view.pasteText 없이 표 붙여넣기가 처리한다", () => {
      const result = pasteIn(S1.blocks(), S1.place, {
        "text/plain": `a${TAB}b`,
      });

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(result.event.defaultPrevented).toBe(true);
      expect(result.blocks()).toEqual(docOutline("table[a|b]"));
    });

    it("표 밖 캐럿의 무효 문자 평문은 정리본이 들어간다(표 밖 경로 불변)", () => {
      const result = pasteIn(S1.blocks(), textSelection(inBlock("p1", 4)), {
        "text/plain": `a${SOH}b`,
      });

      expect(result.blocks()).toEqual([
        "paragraph:paraab",
        "table[cell]",
        "paragraph:tail",
      ]);
    });

    it("표 밖 캐럿의 유효 평문은 view.pasteText 없이 PM 기본에 맡긴다", () => {
      const result = pasteIn(S1.blocks(), textSelection(inBlock("p1", 4)), {
        "text/plain": "ab",
      });

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(result.blocks()).toEqual([
        "paragraph:paraab",
        "table[cell]",
        "paragraph:tail",
      ]);
    });
  });
});
