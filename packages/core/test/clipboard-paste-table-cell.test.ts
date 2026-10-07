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
 *
 * 두 번째 축은 빈 slice text/html과 함께 온 평문이다(Issue #301). 셀 안에서
 * html이 비어 보이거나 PM 파싱 결과가 빈 slice여도 PM 기본은 html만 파싱하고
 * 평문을 버려 붙여넣기가 소실됐다. 이제 html이 실제 내용(slice.size > 0)을
 * 가질 때만 PM 기본에 맡기고, 빈 slice이면 평문 정리본을 넣는다. 다루는 축은
 * 빈 slice html 대표 입력 x 평문 행렬 x 선택 종류, 평문이 비거나 무효 문자뿐인
 * 입력, 서식 있는 html 불변, 보이지 않는 문자 한계, html 안 무효 문자(Issue #302가 정정), 개입하지
 * 않는 경로(CellSelection), atom NodeSelection, pasteHandler 미호출 계약,
 * 표 경계 범위 뒤 캐럿 위치, transaction 계약이다.
 *
 * 세 번째 축은 무효 문자가 든 text/html과 Ctrl+Shift+V 평문이다(Issue #302).
 * html이 실제 내용(slice.size > 0)을 가지면 PM 기본이 slice를 넣는다. slice의
 * 무효 문자를 되돌림 guard가 통째로 지워 붙여넣기가 소실됐다. 이제 플러그인
 * transformPasted가 셀 안 캐럿·같은 셀 안 범위(CellSelection 제외)의 slice
 * text를 정리한다. 다루는 축은 무효 문자 종류(U+0001·U+D800·U+007F·문자
 * 참조) x 선택 종류, Shift 평문, 서식 유지, 정리 뒤 빈 slice, 다문단,
 * transaction 계약, 변경 없는 slice 불변, transformPasted 적용 범위(CellSelection·
 * 표 밖), pasteHandler 미호출 계약, 병합·헤더 셀 캐럿이다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import type { CreateEditorOptions } from "../src/index.js";
import { expectSchemaValid } from "./block-join/block-join-test-support.js";
import {
  dispatchPasteData,
  dropEventOf,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  editorState,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";
import {
  gridTable,
  inBlock,
  inCell,
  mergedTable,
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
const DEL = String.fromCharCode(0x7f);

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

// 셀 안 인라인 atom NodeSelection 공용 fixture다(Issue #297·#301).
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

// 문서를 마운트하고 선택을 둔 뒤 paste 이벤트를 dispatch한다. pasteText와
// dispatch 호출을 붙여넣기 직전에 감시한다.
const pasteIn = (
  blocks: Block[],
  place: Place,
  entries: Record<string, string>,
  options: PasteOptions = {},
  beforePaste: (tiptap: TiptapEditor) => void = () => undefined,
) => {
  const m = mounted(documentOf(...blocks), options);
  place(m.tiptap);
  beforePaste(m.tiptap);
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

    // Issue #306 결함 1. 지우기 전 state는 head가 표 밖이라 셀 정리를
    // 건너뛰었다. 지운 뒤 캐럿은 셀 안이라 정리 안 된 slice가 들어가 되돌림
    // guard가 붙여넣기를 지웠다(지움만 남음).
    it("시작이 셀 안이고 끝이 뒤 문단 안이면 무효 문자 html도 정리본이 셀에 들어간다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 2), tail(2)),
        { "text/html": `<p>a${SOH}b</p>`, "text/plain": "ab" },
      );

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

describe("표 셀 안 빈 slice html과 함께 온 평문(Issue #301)", () => {
  // PM이 셀 안 컨텍스트에서 slice.size 0으로 파싱하는 대표 입력이다. 빈
  // 문단은 인라인 컨텍스트라 Slice.maxOpen이 흡수한다. 표 밖과 다르다.
  const emptySliceHtmls = [
    { name: "공백 두 칸", html: "  " },
    { name: "meta만", html: "<meta charset='utf-8'>" },
    {
      name: "StartFragment 주석만",
      html: "<!--StartFragment--><!--EndFragment-->",
    },
    { name: "빈 문단", html: "<p></p>" },
  ];

  type PlainCase = {
    name: string;
    input: string;
    // selections 순서(S1·S2·S3)의 기대 outline이다.
    expected: [string[], string[], string[]];
  };

  // 여러 줄은 유효 여러 줄과 같은 구조다. 마지막 셀은 첫 줄만 셀에 들어가고
  // 나머지는 표 뒤 문단이 된다. S3은 표를 쪼갠 뒤 되돌림이 복원해 불변이다.
  const plainCases: PlainCase[] = [
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
      name: "무효 문자가 섞인 한 줄",
      input: `a${SOH}b`,
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
  ];

  describe.each(selections.map((selection, index) => ({ selection, index })))(
    "$selection.name",
    ({ selection, index }) => {
      describe.each(emptySliceHtmls)("html: $name", ({ html }) => {
        it.each(plainCases)(
          "$name 평문은 정리본을 pasteText 1회로 셀에 넣는다(C1~C3)",
          ({ input, expected }) => {
            const result = pasteIn(selection.blocks(), selection.place, {
              "text/html": html,
              "text/plain": input,
            });

            expect(result.pasteText).toHaveBeenCalledTimes(1);
            expect(result.blocks()).toEqual(expected[index]);
            expectSchemaValid(result.tiptap);
            expect(result.event.defaultPrevented).toBe(true);
          },
        );

        it("제어문자만 있는 평문은 이벤트만 소비하고 문서와 선택을 바꾸지 않는다(C4)", () => {
          withUnhandledErrorTracking((errors) => {
            const result = pasteIn(selection.blocks(), selection.place, {
              "text/html": html,
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

        it("빈 평문은 현행대로 pasteText 없이 PM 기본에 맡기고 범위만 삭제한다(C5)", () => {
          const result = pasteIn(selection.blocks(), selection.place, {
            "text/html": html,
            "text/plain": "",
          });

          expect(result.pasteText).not.toHaveBeenCalled();
          expect(result.blocks()).toEqual(
            index === 1
              ? docOutline("table[cl]")
              : selection === S3
                ? docOutline("table[c1|c2]")
                : docOutline("table[cell]"),
          );
        });
      });

      it("정리본 붙여넣기는 pasteText 1회, dispatch 1회, undo 1회로 원복되고 문서가 유효하다(C6)", () => {
        const result = pasteIn(selection.blocks(), selection.place, {
          "text/html": "<meta charset='utf-8'>",
          "text/plain": "ab",
        });

        expect(result.pasteText).toHaveBeenCalledTimes(1);
        expect(result.dispatch).toHaveBeenCalledTimes(1);
        expect(result.editor.getDocument().revision).toBe(
          result.before.document.revision + 1,
        );
        expectSchemaValid(result.tiptap);

        result.tiptap.commands.undo();
        expect(result.tiptap.state.doc.toJSON()).toEqual(
          result.before.tiptapDocument,
        );
      });

      it("html이 실제 내용을 가지면 PM이 html만 쓰고 view.pasteText는 부르지 않는다(C7)", () => {
        const result = pasteIn(selection.blocks(), selection.place, {
          "text/html": "<b>x</b>",
          "text/plain": "ab",
        });

        expect(result.pasteText).not.toHaveBeenCalled();
        expect(result.blocks()).toEqual(
          [
            docOutline("table[cellx]"),
            docOutline("table[cxl]"),
            docOutline("table[c1x|c2]"),
          ][index],
        );
      });

      it("보이지 않는 문자만 있는 html은 slice가 비지 않아 html이 이기고 평문은 사라진다(C8 한계)", () => {
        const NBSP = String.fromCharCode(0xa0);
        const result = pasteIn(selection.blocks(), selection.place, {
          "text/html": "&nbsp;",
          "text/plain": "ab",
        });

        expect(result.pasteText).not.toHaveBeenCalled();
        expect(result.blocks()).toEqual(
          [
            docOutline(`table[cell${NBSP}]`),
            docOutline(`table[c${NBSP}l]`),
            docOutline(`table[c1${NBSP}|c2]`),
          ][index],
        );
      });

      it("html 안 텍스트에 제어문자가 있으면 PM 기본이 정리된 slice를 넣는다(C8 한계 정정, Issue #302)", () => {
        const result = pasteIn(selection.blocks(), selection.place, {
          "text/html": `<p>a${SOH}b</p>`,
          "text/plain": "ab",
        });

        expect(result.pasteText).not.toHaveBeenCalled();
        expect(result.blocks()).toEqual(
          [
            docOutline("table[cellab]"),
            docOutline("table[cabl]"),
            docOutline("table[c1ab|c2]"),
          ][index],
        );
      });
    },
  );

  // 빈 slice가 되는 입력은 대표 4종 밖에도 있다. 웹에서 이미지를 복사한
  // 클립보드(meta와 src 있는 img)가 실제로 이 모양이다. 셀 안 컨텍스트는
  // 이미지·구분선·빈 목록·빈 표를 slice에 담지 못해 size가 0이다.
  describe("대표 4종 밖의 빈 slice html(C1)", () => {
    it.each([
      { name: "src 있는 img", html: "<img src='http://x/y.png'>" },
      {
        name: "웹 이미지 복사 모양(meta와 src 있는 img)",
        html: "<meta charset='utf-8'><img src='http://x/y.png'>",
      },
      { name: "구분선", html: "<hr>" },
      { name: "빈 목록 항목", html: "<ul><li></li></ul>" },
      { name: "빈 표", html: "<table></table>" },
    ])(
      "$name html과 평문 ab는 마지막 셀 끝 캐럿에서 pasteText 1회로 cellab이 된다",
      ({ html }) => {
        const result = pasteIn(S1.blocks(), S1.place, {
          "text/html": html,
          "text/plain": "ab",
        });

        expect(result.pasteText).toHaveBeenCalledTimes(1);
        expect(result.blocks()).toEqual(docOutline("table[cellab]"));
        expectSchemaValid(result.tiptap);
      },
    );
  });

  describe("CellSelection에서는 개입하지 않는다(C10)", () => {
    const cellSelected: Place = (tiptap) =>
      selectCellRange(tiptap, "g-r0c0", "g-r0c1");

    it.each(emptySliceHtmls)(
      "html: $name. 현행대로 문서가 불변이고 view.pasteText를 부르지 않는다",
      ({ html }) => {
        const result = pasteIn(firstCellBlocks(), cellSelected, {
          "text/html": html,
          "text/plain": "ab",
        });

        expect(result.pasteText).not.toHaveBeenCalled();
        expect(result.blocks()).toEqual(docOutline("table[c1|c2]"));
      },
    );
  });

  describe("셀 안 인라인 atom NodeSelection(C11)", () => {
    it("빈 slice html과 평문은 atom을 대체하고 html 없는 유효 평문의 PM 기본 결과와 같다", () => {
      const withHtml = pasteIn(
        atomBlocks(),
        atomSelected,
        { "text/html": "<meta charset='utf-8'>", "text/plain": "XY" },
        withTag,
      );
      const withoutHtml = pasteIn(
        atomBlocks(),
        atomSelected,
        { "text/plain": "XY" },
        withTag,
      );

      expect(withHtml.pasteText).toHaveBeenCalledTimes(1);
      expect(withoutHtml.pasteText).not.toHaveBeenCalled();
      expect(withHtml.blocks()).toEqual(withoutHtml.blocks());
      expect(withHtml.blocks()).toEqual(docOutline("table[abXYcd]"));
    });
  });

  describe("pasteHandler 계약(C12)", () => {
    it.each(emptySliceHtmls)(
      "html: $name. 표 셀 안에서는 pasteHandler를 호출하지 않는다",
      ({ html }) => {
        const pasteHandler = vi.fn(() => true);

        const result = pasteIn(
          S1.blocks(),
          S1.place,
          { "text/html": html, "text/plain": "ab" },
          { pasteHandler },
        );

        expect(pasteHandler).not.toHaveBeenCalled();
        expect(result.blocks()).toEqual(docOutline("table[cellab]"));
      },
    );
  });

  describe("표 경계 범위 뒤 캐럿 위치(C13)", () => {
    it("시작이 셀 안이고 끝이 뒤 문단 안이면 지운 뒤 캐럿이 셀 안이라 평문이 셀에 들어간다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 2), inBlock("tail", 2)),
        { "text/html": "<meta charset='utf-8'>", "text/plain": "ab" },
      );

      expect(result.pasteText).toHaveBeenCalledTimes(1);
      expect(result.blocks()).toEqual([
        "paragraph:para",
        "table[ceab]",
        "paragraph:il",
      ]);
      expectSchemaValid(result.tiptap);
    });
  });
});

describe("표 셀 안 무효 문자 html과 Shift 평문(Issue #302)", () => {
  const HIGH = String.fromCharCode(0xd800);
  // 셀 안에서 Ctrl+Shift+V다. PM은 view.input.shiftKey로 평문 slice를 만든다.
  const shiftPressed = (tiptap: TiptapEditor): void => {
    (
      tiptap.view as unknown as { input: { shiftKey: boolean } }
    ).input.shiftKey = true;
  };
  const cellContent = (result: ReturnType<typeof pasteIn>) => {
    const table = result.editor.getDocument().blocks[1];
    if (table?.type !== "table") throw new Error("표 블록이 사라졌다");
    return (table as Extract<Block, { type: "table" }>).rows[0]?.cells[0]
      ?.content;
  };

  // selections 순서(S1·S2·S3)의 기대 outline이다. 정리본 "ab"가 들어간 결과다.
  const abInserted = [
    docOutline("table[cellab]"),
    docOutline("table[cabl]"),
    docOutline("table[c1ab|c2]"),
  ];

  const invalidHtmls = [
    { name: "제어문자 U+0001", html: `<p>a${SOH}b</p>` },
    { name: "짝 없는 surrogate U+D800", html: `<p>a${HIGH}b</p>` },
    { name: "DEL U+007F", html: `<p>a${DEL}b</p>` },
    { name: "숫자 문자 참조", html: "<p>a&#1;b</p>" },
  ];

  describe.each(selections.map((selection, index) => ({ selection, index })))(
    "$selection.name",
    ({ selection, index }) => {
      it.each(invalidHtmls)(
        "html $name 입력은 무효 문자만 지워 셀에 넣고 PM 기본 경로를 쓴다(C1·C3)",
        ({ html }) => {
          const result = pasteIn(selection.blocks(), selection.place, {
            "text/html": html,
            "text/plain": "ab",
          });

          expect(result.pasteText).not.toHaveBeenCalled();
          expect(result.blocks()).toEqual(abInserted[index]);
          expectSchemaValid(result.tiptap);
          expect(result.event.defaultPrevented).toBe(true);
        },
      );

      it("Shift 평문에 무효 문자가 섞이면 html이 함께 와도 정리본이 셀에 들어간다(C2)", () => {
        const result = pasteIn(
          selection.blocks(),
          selection.place,
          { "text/html": "<b>x</b>", "text/plain": `a${SOH}b` },
          {},
          shiftPressed,
        );

        expect(result.blocks()).toEqual(abInserted[index]);
        expectSchemaValid(result.tiptap);
      });

      it("정리본 붙여넣기는 dispatch 1회, undo 1회로 원복되고 문서가 유효하다(C8)", () => {
        const result = pasteIn(selection.blocks(), selection.place, {
          "text/html": `<p>a${SOH}b</p>`,
          "text/plain": "ab",
        });

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

      it("정리 뒤 빈 slice이면 평문 정리본이 pasteText 1회로 들어간다(C5)", () => {
        const result = pasteIn(selection.blocks(), selection.place, {
          "text/html": `<p>${SOH}</p>`,
          "text/plain": "ab",
        });

        expect(result.pasteText).toHaveBeenCalledTimes(1);
        expect(result.blocks()).toEqual(abInserted[index]);
        expectSchemaValid(result.tiptap);
      });

      it("유효한 서식 html은 transformPasted를 거쳐도 현행과 같다(C9)", () => {
        const result = pasteIn(selection.blocks(), selection.place, {
          "text/html": "<b>x</b>",
          "text/plain": "ab",
        });

        expect(result.pasteText).not.toHaveBeenCalled();
        expect(result.blocks()).toEqual(
          [
            docOutline("table[cellx]"),
            docOutline("table[cxl]"),
            docOutline("table[c1x|c2]"),
          ][index],
        );
      });
    },
  );

  it("Shift 평문은 html의 서식을 쓰지 않는다. 무효 문자가 있든 없든 평문 그대로다(C2)", () => {
    const invalid = pasteIn(
      S1.blocks(),
      S1.place,
      { "text/html": "<b>x</b>", "text/plain": `a${SOH}b` },
      {},
      shiftPressed,
    );
    const valid = pasteIn(
      S1.blocks(),
      S1.place,
      { "text/html": "<b>x</b>", "text/plain": "ab" },
      {},
      shiftPressed,
    );

    expect(invalid.blocks()).toEqual(docOutline("table[cellab]"));
    expect(cellContent(invalid)).toEqual([{ text: "cellab" }]);
    expect(valid.blocks()).toEqual(docOutline("table[cellab]"));
    expect(cellContent(valid)).toEqual([{ text: "cellab" }]);
  });

  it("서식이 든 html에서 무효 문자만 지우고 마크는 유지한다(C4)", () => {
    const result = pasteIn(S1.blocks(), S1.place, {
      "text/html": `<p><b>a${SOH}</b>b</p>`,
      "text/plain": "ab",
    });

    expect(result.blocks()).toEqual(docOutline("table[cellab]"));
    expect(cellContent(result)).toEqual([
      { text: "cell" },
      { text: "a", marks: [{ type: "bold" }] },
      { text: "b" },
    ]);
  });

  describe("정리 결과가 비는 입력(C6)", () => {
    it.each([S1, S3])(
      "$name - 무효 문자뿐인 html만 오면 문서·선택이 불변이고 오류·onChange가 없다",
      (selection) => {
        withUnhandledErrorTracking((errors) => {
          const result = pasteIn(selection.blocks(), selection.place, {
            "text/html": `<p>${SOH}</p>`,
          });

          expect(editorState(result.editor, result.tiptap)).toEqual(
            result.before,
          );
          expect(result.changes).toEqual([]);
          expect(errors).toEqual([]);
        });
      },
    );

    it("S2 같은 셀 안 범위에서 무효 문자뿐인 html만 오면 빈 slice라 범위만 지워진다(#301 빈 평문과 같다)", () => {
      const result = pasteIn(S2.blocks(), S2.place, {
        "text/html": `<p>${SOH}</p>`,
      });

      expect(result.blocks()).toEqual(docOutline("table[cl]"));
      expectSchemaValid(result.tiptap);
    });

    it.each([S1, S2, S3])(
      "$name - Shift와 무효 문자뿐인 평문은 이벤트만 소비하고 문서·선택이 불변이다",
      (selection) => {
        withUnhandledErrorTracking((errors) => {
          const result = pasteIn(
            selection.blocks(),
            selection.place,
            { "text/plain": SOH },
            {},
            shiftPressed,
          );

          expect(result.event.defaultPrevented).toBe(true);
          expect(editorState(result.editor, result.tiptap)).toEqual(
            result.before,
          );
          expect(result.changes).toEqual([]);
          expect(errors).toEqual([]);
        });
      },
    );
  });

  it("다문단 html에서 가운데 문단만 무효 문자이면 가운데 빈 문단이 남는다. 유효 다문단과 같은 구조다(C7)", () => {
    const invalid = pasteIn(S1.blocks(), S1.place, {
      "text/html": `<p>x</p><p>${SOH}</p><p>y</p>`,
    });
    const valid = pasteIn(S1.blocks(), S1.place, {
      "text/html": "<p>x</p><p>z</p><p>y</p>",
    });

    expect(valid.blocks()).toEqual(
      docOutline("table[cellx]", "paragraph:z", "paragraph:y"),
    );
    expect(invalid.blocks()).toEqual(
      docOutline("table[cellx]", "paragraph:", "paragraph:y"),
    );
    expectSchemaValid(invalid.tiptap);
  });

  it("무효 문자뿐인 문단이 둘이면 정리 뒤에도 빈 문단이 남아 평문으로 폴백하지 않는다", () => {
    const result = pasteIn(S1.blocks(), S1.place, {
      "text/html": `<p>${SOH}</p><p>${SOH}</p>`,
      "text/plain": "q",
    });

    expect(result.pasteText).not.toHaveBeenCalled();
    expect(result.blocks()).toEqual([
      "paragraph:para",
      "table[cell]",
      "paragraph:",
      "paragraph:tail",
    ]);
  });

  describe("transformPasted 적용 범위(C11)", () => {
    // PM이 붙여넣기 때 하는 대로 모든 플러그인 transformPasted를 차례로 적용한다.
    const transform = (tiptap: TiptapEditor, slice: Slice): Slice => {
      let result = slice;
      tiptap.view.someProp("transformPasted", (f) => {
        result = f(result, tiptap.view, false);
      });
      return result;
    };
    const dirtySlice = (tiptap: TiptapEditor): Slice =>
      new Slice(Fragment.from(tiptap.schema.text(`a${SOH}b`)), 0, 0);

    // 셀 안 정리는 붙여넣기 계획이 handlePaste 시점의 state로 한다(Issue
    // #306). transformPasted는 표 경계 범위를 지우기 전에 불려 지우기 전
    // state를 본다. 정리 결과는 paste-plan.test.ts와 아래 이벤트 테스트가 본다.
    it("셀 안 캐럿에서도 transformPasted는 slice를 바꾸지 않는다", () => {
      const m = mounted(documentOf(...S1.blocks()));
      S1.place(m.tiptap);
      const slice = dirtySlice(m.tiptap);

      expect(transform(m.tiptap, slice)).toBe(slice);
    });

    it("셀 안 캐럿의 무효 문자 html은 정리본이 셀에 들어간다", () => {
      const result = pasteIn(S1.blocks(), S1.place, {
        "text/html": `<p>a${SOH}b</p>`,
        "text/plain": "ab",
      });

      expect(result.blocks()).toEqual(docOutline("table[cellab]"));
    });

    it("CellSelection에서는 slice를 바꾸지 않는다", () => {
      const m = mounted(documentOf(...firstCellBlocks()));
      selectCellRange(m.tiptap, "g-r0c0", "g-r0c1");
      const slice = dirtySlice(m.tiptap);

      expect(transform(m.tiptap, slice)).toBe(slice);
    });

    it("표 밖 캐럿에서는 slice를 바꾸지 않는다", () => {
      const m = mounted(documentOf(...S1.blocks()));
      textSelection(inBlock("p1", 4))(m.tiptap);
      const slice = dirtySlice(m.tiptap);

      expect(transform(m.tiptap, slice)).toBe(slice);
    });

    it("표 밖 캐럿의 무효 문자 html은 현행대로 표 밖 경로가 정리한다", () => {
      const result = pasteIn(S1.blocks(), textSelection(inBlock("p1", 4)), {
        "text/html": `<p>a${SOH}b</p>`,
        "text/plain": "ab",
      });

      expect(result.blocks()).toEqual([
        "paragraph:para",
        "paragraph:ab",
        "table[cell]",
        "paragraph:tail",
      ]);
    });
  });

  describe("drop은 정리 대상이 아니다(C16)", () => {
    // 문서: p1 "para", 1x1 표(셀 "cell"), codeBlock cb "xyz", tail. 캐럿은 셀 끝이다.
    const dropBlocks = (): Block[] => [
      paragraphBlock("p1", "para"),
      singleCellTable("t", "cell"),
      codeBlockBlock("cb", "xyz"),
      TAIL,
    ];
    // PM drop은 view.posAtCoords로 위치를 얻는다. jsdom은 좌표를 해석하지 못해 stub한다.
    const dropAt = (
      tiptap: TiptapEditor,
      pos: number,
      entries: Record<string, string>,
    ): void => {
      tiptap.view.posAtCoords = () => ({ pos, inside: pos });
      tiptap.view.dom.dispatchEvent(dropEventOf(entries));
    };

    it("캐럿이 셀 안이어도 codeBlock에 drop한 Tab은 지우지 않는다", () => {
      const m = mounted(documentOf(...dropBlocks()));
      S1.place(m.tiptap);

      dropAt(m.tiptap, inBlock("cb", 1)(m.tiptap), {
        "text/plain": `q${TAB}r`,
      });

      expect(outline(m.editor.getDocument().blocks)).toContain(
        `codeBlock:xq${TAB}ryz`,
      );
    });

    // Issue #306 전에는 이 drop이 정리되지 않아 되돌림 guard가 지웠다(문서
    // 불변을 단언했다). 이제 drop 위치 기준으로 정리본이 들어간다. 캐럿이 셀
    // 안인 것은 drop 정리에 영향이 없다.
    it("캐럿이 셀 안일 때 표 밖에 drop한 무효 문자 html도 drop 위치 기준으로 정리본이 들어간다", () => {
      const m = mounted(documentOf(...dropBlocks()));
      S1.place(m.tiptap);

      dropAt(m.tiptap, inBlock("p1", 2)(m.tiptap), {
        "text/html": `<p>a${SOH}b</p>`,
        "text/plain": "ab",
      });

      expect(outline(m.editor.getDocument().blocks)).toEqual([
        "paragraph:paabra",
        "table[cell]",
        "codeBlock:xyz",
        "paragraph:tail",
      ]);
    });
  });

  describe("pasteHandler 계약(C12)", () => {
    it.each([
      { name: "무효 문자 html", entries: { "text/html": `<p>a${SOH}b</p>` } },
      {
        name: "무효 문자 html과 평문",
        entries: { "text/html": `<p>a${SOH}b</p>`, "text/plain": "ab" },
      },
    ])(
      "$name 입력도 표 셀 안에서 pasteHandler를 호출하지 않는다",
      ({ entries }) => {
        const pasteHandler = vi.fn(() => true);

        const result = pasteIn(S1.blocks(), S1.place, entries, {
          pasteHandler,
        });

        expect(pasteHandler).not.toHaveBeenCalled();
        expect(result.blocks()).toEqual(docOutline("table[cellab]"));
      },
    );

    it("Shift 무효 문자 평문도 pasteHandler를 호출하지 않는다", () => {
      const pasteHandler = vi.fn(() => true);

      const result = pasteIn(
        S1.blocks(),
        S1.place,
        { "text/plain": `a${SOH}b` },
        { pasteHandler },
        shiftPressed,
      );

      expect(pasteHandler).not.toHaveBeenCalled();
      expect(result.blocks()).toEqual(docOutline("table[cellab]"));
    });
  });

  describe("불변 특성화(C13)", () => {
    it("표 판정되는 TSV 한 줄은 Shift에서도 표 붙여넣기가 처리한다", () => {
      const result = pasteIn(
        S1.blocks(),
        S1.place,
        { "text/plain": `a${TAB}b` },
        {},
        shiftPressed,
      );

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(result.blocks()).toEqual(docOutline("table[a|b]"));
    });
  });

  describe("병합·헤더 셀 캐럿", () => {
    const headerTable = (): Block => ({
      ...(gridTable("h", 2, 2, ["h1", "h2", "d1", "d2"]) as Extract<
        Block,
        { type: "table" }
      >),
      headerRows: 1,
      headerColumns: 1,
    });

    it.each([
      {
        name: "병합 셀 m-4(columnSpan 2) 끝",
        blocks: () => [paragraphBlock("p1", "para"), mergedTable(), TAIL],
        place: textSelection(inCell("m-4", 3)),
        expected: "table[m-1|m-2|m-3/m-4ab/m-5|m-6|m-7]",
      },
      {
        name: "병합 셀 m-1(rowSpan 2) 중간",
        blocks: () => [paragraphBlock("p1", "para"), mergedTable(), TAIL],
        place: textSelection(inCell("m-1", 1)),
        expected: "table[mab-1|m-2|m-3/m-4/m-5|m-6|m-7]",
      },
      {
        name: "헤더 행·열 교차 셀 끝",
        blocks: () => [paragraphBlock("p1", "para"), headerTable(), TAIL],
        place: textSelection(inCell("h-r0c0", 2)),
        expected: "table[h1ab|h2/d1|d2]",
      },
      {
        name: "헤더 행 셀 끝",
        blocks: () => [paragraphBlock("p1", "para"), headerTable(), TAIL],
        place: textSelection(inCell("h-r0c1", 2)),
        expected: "table[h1|h2ab/d1|d2]",
      },
    ])("$name 캐럿에서도 정리본이 들어간다", ({ blocks, place, expected }) => {
      const result = pasteIn(blocks(), place, {
        "text/html": `<p>a${SOH}b</p>`,
        "text/plain": "ab",
      });

      expect(result.blocks()).toEqual(docOutline(expected));
      expectSchemaValid(result.tiptap);
    });
  });
});
