/**
 * 표 셀 안 여러 줄 평문 붙여넣기 계약을 고정한다(Issue #299).
 * 수정 전에는 셀 안 여러 줄을 PM 기본에 맡겼다. 마지막 셀은 첫 줄만 셀에
 * 들어가고 나머지 줄이 표 뒤 문단이 됐다. 마지막이 아닌 셀은 PM이 표를
 * 쪼갠 뒤 되돌림 guard가 복원해 붙여넣기가 사라졌다. 이제 줄 사이를
 * hardBreak로 이어 셀 안에 한 transaction으로 직접 넣는다.
 *
 * 다루는 축은 다음과 같다.
 * - C1~C3 선택 종류(마지막 셀 끝·셀 중간 캐럿·같은 셀 범위·마지막이 아닌
 *   셀) x LF·CRLF 입력
 * - C4 연속·앞·뒤 개행의 줄 경계 규칙(표 밖 여러 줄과 같다)
 * - C5 CellSelection의 연속 개행
 * - C6 무효 문자가 섞인 여러 줄은 pasteText 없이 정리본을 직접 넣음
 * - C7 한 줄 평문의 호출 경로 불변
 * - C8 빈 slice html + 여러 줄 평문
 * - C9 Ctrl+Shift+V + 서식 있는 html + 여러 줄 평문
 * - C10 캐럿의 마크 상속(CellSelection은 마크 없음)
 * - C11 인라인 atom NodeSelection 대체
 * - C12 직접 삽입 대상 밖(부모가 다른 범위)은 현행 계획
 * - C13 dispatch 1회·undo 1회·삽입 끝 캐럿·pasteHandler 미호출
 *
 * 셀 결과는 모델 요약(outline)과 PM 셀 노드의 자식 종류(text·hardBreak)를
 * 함께 본다. outline은 hardBreak를 개행 문자로 보여 준다.
 */
import type { Block } from "@cp949/geul-model";
import { Fragment, Slice } from "@tiptap/pm/model";
import { CellSelection } from "@tiptap/pm/tables";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { planTableCellPaste } from "../src/paste-plan.js";
import { withUnhandledErrorTracking } from "./clipboard-test-support.js";
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
  type Pos,
  setLiveSelection,
  singleCellTable,
  TAIL,
} from "./table-boundary-test-support.js";
import { selectCellRange } from "./table-test-support.js";
import {
  atomBlocks,
  atomSelected,
  boldCellBlocks,
  docOutline,
  expectTableIntact,
  firstCellBlocks,
  kindsInDoc,
  kindsOf,
  lastCellBlocks,
  pasteIn,
  selectFirstTwoCells,
  textSelection,
  withTag,
} from "./table-cell-paste-test-support.js";

const SOH = String.fromCharCode(1);
const HIGH_SURROGATE = String.fromCharCode(0xd800);
const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);

/** 2x2 표 문서. 첫 셀이 마지막 셀도 마지막 행도 아니다. */
const gridBlocks = (): Block[] => [
  paragraphBlock("p1", "para"),
  gridTable("g", 2, 2, ["c1", "c2", "c3", "c4"]),
  TAIL,
];

/** 빈 셀 하나짜리 표 문서. 개행 규칙의 결과를 정확히 비교한다. */
const emptyCellBlocks = (): Block[] => [
  paragraphBlock("p1", "para"),
  singleCellTable("t", ""),
  TAIL,
];

describe("표 셀 안 여러 줄 평문 붙여넣기(Issue #299)", () => {
  describe("선택 종류 x 줄바꿈 종류(C1~C3)", () => {
    it.each([
      { name: "LF", input: "a\nb\nc" },
      { name: "CRLF", input: `a${CR}\nb${CR}\nc` },
      { name: "CR", input: `a${CR}b${CR}c` },
    ])(
      "마지막 셀 끝 캐럿에 $name 세 줄을 붙이면 hardBreak로 이어 셀에 넣고 표 뒤에 문단을 만들지 않는다(C1)",
      ({ input }) => {
        const result = pasteIn(
          lastCellBlocks(),
          textSelection(inCell("t-r0c0", 4)),
          { "text/plain": input },
        );

        expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
          "cella",
          "br",
          "b",
          "br",
          "c",
        ]);
        expect(result.blocks()).toEqual(docOutline("table[cella\nb\nc]"));
        expectTableIntact(result);
        expect(result.event.defaultPrevented).toBe(true);
      },
    );

    it("셀 중간 캐럿은 캐럿 앞뒤 텍스트를 첫 줄·끝 줄과 잇는다(C2)", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 2)),
        { "text/plain": "a\nb\nc" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "cea",
        "br",
        "b",
        "br",
        "cll",
      ]);
      expectTableIntact(result);
    });

    it("같은 셀 안 범위는 범위를 대체한다(C2)", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 1), inCell("t-r0c0", 3)),
        { "text/plain": "a\nb" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["ca", "br", "bl"]);
      expect(result.blocks()).toEqual(docOutline("table[ca\nbl]"));
      expectTableIntact(result);
    });

    it("역방향 범위도 범위를 대체한다(C2)", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 3), inCell("t-r0c0", 1)),
        { "text/plain": "a\nb" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["ca", "br", "bl"]);
      expectTableIntact(result);
    });

    it("마지막이 아닌 셀(1x2 첫 셀)에서도 붙여넣기가 사라지지 않고 표가 쪼개지지 않는다(C3)", () => {
      const result = pasteIn(
        firstCellBlocks(),
        textSelection(inCell("g-r0c0", 2)),
        { "text/plain": "a\nb" },
      );

      expect(kindsOf(result.tiptap, "g-r0c0")).toEqual(["c1a", "br", "b"]);
      expect(result.blocks()).toEqual(docOutline("table[c1a\nb|c2]"));
      expectTableIntact(result);
    });

    it("2x2 표 첫 셀에서도 같다(C3)", () => {
      const result = pasteIn(gridBlocks(), textSelection(inCell("g-r0c0", 2)), {
        "text/plain": "a\nb",
      });

      expect(result.blocks()).toEqual(docOutline("table[c1a\nb|c2/c3|c4]"));
      expectTableIntact(result);
    });

    it("2x2 표 둘째 행 셀 중간 캐럿에서도 같다(C3)", () => {
      const result = pasteIn(gridBlocks(), textSelection(inCell("g-r1c0", 1)), {
        "text/plain": "a\nb",
      });

      expect(result.blocks()).toEqual(docOutline("table[c1|c2/ca\nb3|c4]"));
      expectTableIntact(result);
    });
  });

  describe("연속·앞·뒤 개행(C4)", () => {
    it.each([
      { name: "연속 개행 a\\n\\nb", input: "a\n\nb", kinds: ["a", "br", "b"] },
      {
        name: "연속 개행 세 번 a\\n\\n\\nb",
        input: "a\n\n\nb",
        kinds: ["a", "br", "b"],
      },
      { name: "앞 개행 \\na", input: "\na", kinds: ["br", "a"] },
      { name: "뒤 개행 a\\n", input: "a\n", kinds: ["a", "br"] },
      {
        name: "CRLF 연속 a\\r\\n\\r\\nb",
        input: `a${CR}\n${CR}\nb`,
        kinds: ["a", "br", "b"],
      },
    ])("$name 입력은 줄 경계 하나로 묶인다", ({ input, kinds }) => {
      const result = pasteIn(
        emptyCellBlocks(),
        textSelection(inCell("t-r0c0", 0)),
        { "text/plain": input },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(kinds);
      expectTableIntact(result);
    });
  });

  describe("CellSelection의 연속 개행(C5)", () => {
    it.each([
      { name: "연속 개행", input: "a\n\nb", kinds: ["a", "br", "b"] },
      { name: "앞 개행", input: "\na", kinds: ["br", "a"] },
      { name: "뒤 개행", input: "a\n", kinds: ["a", "br"] },
    ])("$name 입력은 hardBreak 하나가 된다", ({ input, kinds }) => {
      const result = pasteIn(firstCellBlocks(), selectFirstTwoCells, {
        "text/plain": input,
      });

      expect(kindsOf(result.tiptap, "g-r0c0")).toEqual(kinds);
      expect(kindsOf(result.tiptap, "g-r0c1")).toEqual([]);
      expectTableIntact(result);
    });
  });

  describe("무효 문자가 섞인 여러 줄(C6)", () => {
    it.each([
      { name: "제어문자가 섞인", input: `a${SOH}b\nc` },
      { name: "짝 없는 surrogate가 섞인", input: `a${HIGH_SURROGATE}b\nc` },
      { name: "CRLF와 제어문자가 섞인", input: `a${SOH}b${CR}\nc` },
      { name: "Tab이 든", input: `a${TAB}b\nc` },
    ])("$name 입력도 정리본을 pasteText 없이 직접 넣는다", ({ input }) => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/plain": input },
      );

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cellab", "br", "c"]);
      expectTableIntact(result);
      expect(result.event.defaultPrevented).toBe(true);
    });

    it("마지막이 아닌 셀에서도 정리본이 들어간다", () => {
      const result = pasteIn(
        firstCellBlocks(),
        textSelection(inCell("g-r0c0", 2)),
        { "text/plain": `a${SOH}b\nc` },
      );

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(result.blocks()).toEqual(docOutline("table[c1ab\nc|c2]"));
      expectTableIntact(result);
    });

    it("정리본이 비면 문서와 선택을 바꾸지 않고 이벤트만 소비한다", () => {
      withUnhandledErrorTracking((errors) => {
        const result = pasteIn(
          lastCellBlocks(),
          textSelection(inCell("t-r0c0", 4)),
          { "text/plain": `${SOH}${HIGH_SURROGATE}` },
        );

        expect(result.event.defaultPrevented).toBe(true);
        expect(result.dispatch).not.toHaveBeenCalled();
        expect(result.pasteText).not.toHaveBeenCalled();
        expect(editorState(result.editor, result.tiptap)).toEqual(
          result.before,
        );
        expect(errors).toEqual([]);
      });
    });
  });

  describe("한 줄 평문의 호출 경로(C7)", () => {
    it("유효한 한 줄은 view.pasteText 없이 PM 기본에 맡긴다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/plain": "ab" },
      );

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(result.blocks()).toEqual(docOutline("table[cellab]"));
    });

    it("무효 문자가 섞인 한 줄은 pasteText 1회로 정리본을 넣는다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/plain": `a${SOH}b` },
      );

      expect(result.pasteText).toHaveBeenCalledTimes(1);
      expect(result.blocks()).toEqual(docOutline("table[cellab]"));
    });
  });

  describe("빈 slice html + 여러 줄 평문(C8)", () => {
    it.each([
      { name: "meta만", html: "<meta charset='utf-8'>" },
      { name: "빈 문단", html: "<p></p>" },
      { name: "공백", html: "  " },
    ])("html $name 이어도 평문을 직접 넣는다", ({ html }) => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/html": html, "text/plain": "a\nb" },
      );

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
      expectTableIntact(result);
    });

    it("마지막이 아닌 셀에서도 같다", () => {
      const result = pasteIn(
        firstCellBlocks(),
        textSelection(inCell("g-r0c0", 2)),
        { "text/html": "<meta charset='utf-8'>", "text/plain": "a\nb" },
      );

      expect(result.blocks()).toEqual(docOutline("table[c1a\nb|c2]"));
      expectTableIntact(result);
    });
  });

  describe("서식 있는 html과 Ctrl+Shift+V(C9)", () => {
    it("서식 없이 붙여넣기면 서식 있는 html이 와도 평문 여러 줄을 직접 넣는다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/html": "<b>x</b>", "text/plain": "a\nb" },
        { shift: true },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
      expectTableIntact(result);
    });

    it("마지막이 아닌 셀에서도 같다", () => {
      const result = pasteIn(
        firstCellBlocks(),
        textSelection(inCell("g-r0c0", 2)),
        { "text/html": "<b>x</b>", "text/plain": "a\nb" },
        { shift: true },
      );

      expect(result.blocks()).toEqual(docOutline("table[c1a\nb|c2]"));
      expectTableIntact(result);
    });

    it("html 없는 Ctrl+Shift+V 여러 줄도 직접 넣는다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/plain": "a\nb" },
        { shift: true },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
      expectTableIntact(result);
    });

    it("서식 없이 붙여넣기가 아니면 서식 있는 html이 이긴다(현행)", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/html": "<b>x</b>", "text/plain": "a\nb" },
      );

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(result.blocks()).toEqual(docOutline("table[cellx]"));
    });

    it("Ctrl+Shift+V 한 줄 평문은 현행 경로다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/html": "<b>x</b>", "text/plain": "ab" },
        { shift: true },
      );

      expect(result.blocks()).toEqual(docOutline("table[cellab]"));
    });
  });

  describe("마크 상속(C10)", () => {
    it("캐럿의 마크가 삽입 텍스트와 hardBreak에 이어진다", () => {
      const result = pasteIn(
        boldCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/plain": "a\nb" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "ce",
        "lla*bold",
        "br*bold",
        "b*bold",
      ]);
      expectTableIntact(result);
    });

    it("마크가 없는 캐럿은 마크 없이 넣는다", () => {
      const result = pasteIn(
        boldCellBlocks(),
        textSelection(inCell("t-r0c0", 2)),
        { "text/plain": "a\nb" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "cea",
        "br",
        "b",
        "ll*bold",
      ]);
    });

    it("CellSelection은 마크 없이 넣는다", () => {
      const result = pasteIn(
        boldCellBlocks(),
        (tiptap) => selectCellRange(tiptap, "t-r0c0", "t-r0c0"),
        { "text/plain": "a\nb" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["a", "br", "b"]);
    });
  });

  describe("인라인 atom NodeSelection(C11)", () => {
    it("atom을 대체하고 모델 검증을 통과한다", () => {
      const result = pasteIn(
        atomBlocks(),
        atomSelected,
        { "text/plain": "a\nb" },
        withTag,
      );

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["aba", "br", "bcd"]);
      expect(result.blocks()).toEqual(docOutline("table[aba\nbcd]"));
      expectTableIntact(result);
    });
  });

  describe("직접 삽입 대상 밖(C12)", () => {
    // 부모가 다른 범위는 계획 판정만 본다. 표 경계 범위는 실행기가 먼저
    // 지운 뒤 호출 시점 state로 다시 판정한다(Issue #292).
    const planFor = (blocks: Block[], anchor: Pos, head: Pos, text: string) => {
      const m = mounted(documentOf(...blocks));
      setLiveSelection(m.tiptap, anchor(m.tiptap), head(m.tiptap));
      return planTableCellPaste(
        m.tiptap.state,
        { html: "", text, plain: false },
        Slice.empty,
      );
    };

    it("시작이 셀 안이고 끝이 표 밖인 범위는 직접 삽입하지 않는다", () => {
      const plan = planFor(
        lastCellBlocks(),
        inCell("t-r0c0", 2),
        inBlock("tail", 2),
        "a\nb",
      );

      expect(plan?.kind).toBe("insertSlice");
    });

    it("다른 셀에 걸친 TextSelection은 직접 삽입하지 않는다", () => {
      const plan = planFor(
        firstCellBlocks(),
        inCell("g-r0c0", 1),
        inCell("g-r0c1", 1),
        "a\nb",
      );

      expect(plan?.kind).toBe("insertSlice");
    });

    it("셀 조각 slice는 pass다", () => {
      const m = mounted(documentOf(...lastCellBlocks()));
      setLiveSelection(
        m.tiptap,
        inCell("t-r0c0", 2)(m.tiptap),
        inCell("t-r0c0", 2)(m.tiptap),
      );
      let tableSlice: Slice | null = null;
      m.tiptap.state.doc.descendants((node, pos) => {
        if (tableSlice !== null) return false;
        if (node.type.name !== "table") return true;
        tableSlice = m.tiptap.state.doc.slice(pos, pos + node.nodeSize);
        return false;
      });
      if (tableSlice === null) throw new Error("표 조회 실패");

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "<table></table>", text: "a\nb", plain: false },
        tableSlice,
      );

      expect(plan).toEqual({ kind: "pass" });
    });

    it("표 밖 캐럿은 null이다", () => {
      const plan = planFor(
        lastCellBlocks(),
        inBlock("p1", 2),
        inBlock("p1", 2),
        "a\nb",
      );

      expect(plan).toBeNull();
    });
  });

  describe("transaction 계약(C13)", () => {
    it("dispatch 1회, undo 1회로 원복하고 캐럿은 삽입 끝이다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 2)),
        { "text/plain": "a\nbc" },
      );

      expect(result.dispatch).toHaveBeenCalledTimes(1);
      expect(result.editor.getDocument().revision).toBe(
        result.before.document.revision + 1,
      );
      const { selection } = result.tiptap.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(selection.empty).toBe(true);
      // "ce" + "a" + br + "bc" 뒤다. "ll"은 캐럿 뒤에 남는다.
      expect(selection.$from.parentOffset).toBe(2 + 1 + 1 + 2);
      expect(selection.$from.parent.attrs.cellId).toBe("t-r0c0");

      result.tiptap.commands.undo();
      expect(result.tiptap.state.doc.toJSON()).toEqual(
        result.before.tiptapDocument,
      );
    });

    it("계획은 paste·uiEvent meta와 scrollIntoView를 단 dispatch이고 문서를 바꾸지 않는다", () => {
      const m = mounted(documentOf(...lastCellBlocks()));
      setLiveSelection(
        m.tiptap,
        inCell("t-r0c0", 4)(m.tiptap),
        inCell("t-r0c0", 4)(m.tiptap),
      );
      const before = m.tiptap.state.doc;

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "", text: "a\nb", plain: false },
        new Slice(Fragment.empty, 0, 0),
      );

      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(plan.transaction.getMeta("paste")).toBe(true);
      expect(plan.transaction.getMeta("uiEvent")).toBe("paste");
      expect(plan.transaction.scrolledIntoView).toBe(true);
      expect(m.tiptap.state.doc).toBe(before);
    });

    // 이벤트 결과는 리터럴 개행 정규화(Issue #281)가 보정해 같아질 수 있다.
    // 보정 전 계획 자체가 hardBreak 노드를 담는지 직접 본다.
    it("계획 transaction은 개행 문자가 아니라 hardBreak 노드를 담는다", () => {
      const m = mounted(documentOf(...lastCellBlocks()));
      setLiveSelection(
        m.tiptap,
        inCell("t-r0c0", 4)(m.tiptap),
        inCell("t-r0c0", 4)(m.tiptap),
      );

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "", text: "a\nb", plain: false },
        Slice.empty,
      );

      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(kindsInDoc(plan.transaction.doc, "t-r0c0")).toEqual([
        "cella",
        "br",
        "b",
      ]);
    });

    it("pasteHandler와 view.pasteText를 호출하지 않는다", () => {
      const pasteHandler = vi.fn(() => true);

      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/plain": "a\nb" },
        { pasteHandler },
      );

      expect(pasteHandler).not.toHaveBeenCalled();
      expect(result.pasteText).not.toHaveBeenCalled();
      expect(result.blocks()).toEqual(docOutline("table[cella\nb]"));
    });

    it("CellSelection 경로도 dispatch 1회다", () => {
      const result = pasteIn(
        firstCellBlocks(),
        (tiptap) => selectCellRange(tiptap, "g-r0c0", "g-r0c1"),
        { "text/plain": "a\nb" },
      );

      expect(result.dispatch).toHaveBeenCalledTimes(1);
      expect(result.tiptap.state.selection).not.toBeInstanceOf(CellSelection);
    });
  });
});
