/**
 * 여러 셀을 고른 상태(CellSelection)의 평문 붙여넣기 계약을 고정한다(Issue #300).
 * 수정 전에는 CellSelection이면 입력과 무관하게 prosemirror-tables에 맡겼다.
 * 이 경로는 셀 노드를 새로 만들어 cellId와 셀 attrs를 잃고, 되돌림 guard가
 * 붙여넣기를 통째로 지워 유효한 평문도 사라졌다. 이제 평문 정리본이 선택을
 * 대체한다. 선택한 모든 셀의 내용을 비우고 문서 순서 첫 셀에 정리본을 넣는다.
 * 셀 노드·attrs·cellId는 유지한다.
 *
 * 다루는 축은 다음과 같다.
 * - P1 선택 대체: 2셀·1셀·2x2(비어 있던 셀 포함)·병합 셀이 걸친 선택
 * - P3 여러 줄: LF·CRLF 입력이 hardBreak로 이어져 첫 셀에 들어감. 이벤트
 *   결과는 개행 정규화가 보정하므로 계획 transaction도 직접 본다
 * - P4 무효 문자: 정리본 삽입, 정리본이 비면 이벤트만 소비
 * - P5 html 분기: html이 없거나 빈 slice이면 평문 정책, 실제 내용이면 현행 pass
 * - P6 셀 조각 slice: 계획이 pass(paste-plan.test.ts가 소유, 여기서는 기존 셀
 *   붙여넣기 테스트 통과로 확인)
 * - P7 붙여넣기 뒤 selection과 undo, 첫 셀 서식 대체, pasteHandler 미호출 계약
 *
 * 표 셀 캐럿·같은 셀 범위는 clipboard-paste-table-cell.test.ts가 맡는다.
 */
import type { Block, InlineContent, TableBlock } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { CellSelection } from "@tiptap/pm/tables";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import type { CreateEditorOptions } from "../src/index.js";
import { planTableCellPaste } from "../src/paste-plan.js";
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
  mergedTable,
  outline,
  TAIL,
} from "./table-boundary-test-support.js";
import { selectCellRange, selectSingleCell } from "./table-test-support.js";

const SOH = String.fromCharCode(1);
const HIGH_SURROGATE = String.fromCharCode(0xd800);

/** 기준 문서: 문단 p1, 1x3 표(A|B|C, 셀 id g-r0c0..2), 뒤 문단. */
const rowDocument = (): Block[] => [
  paragraphBlock("p1", "para"),
  gridTable("g", 1, 3, ["A", "B", "C"]),
  TAIL,
];

/** 표 밖 블록을 포함한 최상위 요약에서 표 요약만 끼워 만든다. */
const docOutline = (table: string): string[] => [
  "paragraph:para",
  table,
  "paragraph:tail",
];

/**
 * 표가 둘째 블록인 문서에서 표의 셀을 문서 순서로 모은다. 셀 id·병합 값·
 * 내용·attrs를 그대로 비교하려고 모델 셀을 돌려준다.
 */
const cellsOf = (result: { editor: { getDocument: () => unknown } }) => {
  const document = result.editor.getDocument() as { blocks: Block[] };
  const table = document.blocks[1];
  if (table?.type !== "table") throw new Error("표 블록이 사라졌다");
  return (table as TableBlock).rows.flatMap((row) => row.cells);
};

/** 셀 내용을 셀 id 순서로 줄인다. 값 비교를 읽기 쉽게 한다. */
const contentById = (result: Parameters<typeof cellsOf>[0]) =>
  Object.fromEntries(cellsOf(result).map((cell) => [cell.id, cell.content]));

type SelectCells = (tiptap: TiptapEditor) => void;

/** 실제 내용이 있는 인라인 텍스트 slice를 만든다. PM 파싱 결과 대역이다. */
const textSlice = (tiptap: TiptapEditor, text: string): Slice =>
  new Slice(Fragment.from(tiptap.schema.text(text)), 0, 0);

/** g-r0c0과 g-r0c1 두 셀을 고른다. */
const selectAB: SelectCells = (tiptap) =>
  selectCellRange(tiptap, "g-r0c0", "g-r0c1");

/**
 * 문서를 마운트하고 CellSelection을 둔 뒤 paste 이벤트를 dispatch한다.
 * view.dispatch와 view.pasteText는 붙여넣기 직전에 감시를 시작한다. 이벤트
 * 소비 여부와 호출 횟수를 함께 본다.
 */
const pasteInto = (
  blocks: Block[],
  select: SelectCells,
  entries: Record<string, string>,
  options: Partial<CreateEditorOptions> = {},
) => {
  const m = mounted(documentOf(...blocks), options);
  select(m.tiptap);
  const before = editorState(m.editor, m.tiptap);
  const pasteText = vi.spyOn(m.tiptap.view, "pasteText");
  const dispatch = vi.spyOn(m.tiptap.view, "dispatch");
  const event = dispatchPasteData(m.tiptap.view.dom, entries);
  return { ...m, before, pasteText, dispatch, event };
};

describe("CellSelection 평문 붙여넣기(Issue #300)", () => {
  describe("선택 대체(P1)", () => {
    it("2셀을 고르고 한 줄을 붙이면 첫 셀만 채우고 나머지 선택 셀은 비운다(C1)", () => {
      const result = pasteInto(rowDocument(), selectAB, {
        "text/plain": "X",
      });

      expect(contentById(result)).toEqual({
        "g-r0c0": [{ text: "X" }],
        "g-r0c1": [],
        "g-r0c2": [{ text: "C" }],
      });
      expect(outline(result.editor.getDocument().blocks)).toEqual(
        docOutline("table[X||C]"),
      );
      expect(result.event.defaultPrevented).toBe(true);
      expectSchemaValid(result.tiptap);
    });

    it("셀 하나만 고른 CellSelection도 같다(C3)", () => {
      const result = pasteInto(
        rowDocument(),
        (tiptap) => selectSingleCell(tiptap, "g-r0c1"),
        { "text/plain": "X" },
      );

      expect(contentById(result)).toEqual({
        "g-r0c0": [{ text: "A" }],
        "g-r0c1": [{ text: "X" }],
        "g-r0c2": [{ text: "C" }],
      });
      expectSchemaValid(result.tiptap);
    });

    it("2x2 전체를 고르면 첫 셀만 채우고 나머지는 비우며 이미 빈 셀은 그대로 둔다(C4)", () => {
      const result = pasteInto(
        [
          paragraphBlock("p1", "para"),
          gridTable("g", 2, 2, ["a", "b", "", "d"]),
          TAIL,
        ],
        (tiptap) => selectCellRange(tiptap, "g-r0c0", "g-r1c1"),
        { "text/plain": "X" },
      );

      expect(contentById(result)).toEqual({
        "g-r0c0": [{ text: "X" }],
        "g-r0c1": [],
        "g-r1c0": [],
        "g-r1c1": [],
      });
      expectSchemaValid(result.tiptap);
    });

    it("병합 셀이 걸친 선택은 셀 노드와 병합 값·cellId를 유지하고 첫 셀에만 넣는다(C5)", () => {
      const original = mergedTable() as TableBlock;
      const originalCells = original.rows.flatMap((row) => row.cells);
      // 선택에 든 셀 id를 문서 순서로 기록한다. forEachCell은 병합 셀을 한 번만 방문한다.
      const selected: string[] = [];
      const result = pasteInto(
        [paragraphBlock("p1", "para"), mergedTable(), TAIL],
        (tiptap) => {
          selectCellRange(tiptap, "m-1", "m-4");
          (tiptap.state.selection as CellSelection).forEachCell((node) => {
            selected.push(String(node.attrs.cellId));
          });
        },
        { "text/plain": "X" },
      );

      expect(selected.length).toBeGreaterThan(2);
      expect(selected[0]).toBe("m-1");
      expect(
        cellsOf(result).map((cell) => [cell.id, cell.rowSpan, cell.columnSpan]),
      ).toEqual(
        originalCells.map((cell) => [cell.id, cell.rowSpan, cell.columnSpan]),
      );
      const contents = contentById(result);
      for (const cell of originalCells) {
        if (cell.id === "m-1") {
          expect(contents[cell.id]).toEqual([{ text: "X" }]);
        } else if (selected.includes(cell.id)) {
          expect(contents[cell.id]).toEqual([]);
        } else {
          expect(contents[cell.id]).toEqual(cell.content);
        }
      }
      expectSchemaValid(result.tiptap);
    });
  });

  describe("여러 줄(P3)", () => {
    it.each([
      { name: "LF", input: "X\nY\nZ" },
      { name: "CRLF", input: "X\r\nY\r\nZ" },
    ])(
      "$name 여러 줄은 hardBreak로 이어 첫 셀에 넣고 표 밖에 블록을 만들지 않는다(C2)",
      ({ input }) => {
        const result = pasteInto(rowDocument(), selectAB, {
          "text/plain": input,
        });

        const table = result.tiptap.state.doc.child(1);
        const firstCell = table.child(0).child(0);
        expect(firstCell.attrs.cellId).toBe("g-r0c0");
        const kinds: string[] = [];
        firstCell.forEach((child) => {
          kinds.push(child.isText ? `text:${child.text}` : child.type.name);
        });
        expect(kinds).toEqual([
          "text:X",
          "hardBreak",
          "text:Y",
          "hardBreak",
          "text:Z",
        ]);
        expect(contentById(result)["g-r0c1"]).toEqual([]);
        expect(result.editor.getDocument().blocks).toHaveLength(3);
        expect(result.tiptap.state.doc.childCount).toBe(3);
        expectSchemaValid(result.tiptap);
      },
    );
  });

  describe("계획 transaction(P3)", () => {
    // 이벤트 결과는 리터럴 개행 정규화(Issue #281)가 보정해 같아진다. 보정 전
    // 계획 자체가 hardBreak 노드를 담는지 직접 본다.
    it("여러 줄 계획은 문자열 개행이 아니라 hardBreak 노드를 담는다", () => {
      const m = mounted(documentOf(...rowDocument()));
      selectAB(m.tiptap);

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "", text: "X\nY", plain: false },
        Slice.empty,
      );

      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      const firstCell = plan.transaction.doc.child(1).child(0).child(0);
      const kinds: string[] = [];
      firstCell.forEach((child) => {
        kinds.push(child.isText ? `text:${child.text}` : child.type.name);
      });
      expect(kinds).toEqual(["text:X", "hardBreak", "text:Y"]);
      expect(plan.transaction.getMeta("paste")).toBe(true);
      expect(plan.transaction.getMeta("uiEvent")).toBe("paste");
      expect(plan.transaction.scrolledIntoView).toBe(true);
    });
  });

  describe("무효 문자(P4)", () => {
    it.each([
      { name: "제어문자", input: `a${SOH}b` },
      { name: "짝 없는 surrogate", input: `a${HIGH_SURROGATE}b` },
    ])("무효 문자($name)가 섞인 평문은 정리본이 들어간다(C6)", ({ input }) => {
      const result = pasteInto(rowDocument(), selectAB, {
        "text/plain": input,
      });

      expect(contentById(result)["g-r0c0"]).toEqual([{ text: "ab" }]);
      expect(contentById(result)["g-r0c1"]).toEqual([]);
      expectSchemaValid(result.tiptap);
    });

    it("정리본이 비면 이벤트만 소비하고 문서와 선택을 바꾸지 않는다(C6)", () => {
      withUnhandledErrorTracking((errors) => {
        const result = pasteInto(rowDocument(), selectAB, {
          "text/plain": SOH,
        });

        expect(result.event.defaultPrevented).toBe(true);
        expect(result.dispatch).not.toHaveBeenCalled();
        expect(editorState(result.editor, result.tiptap)).toEqual(
          result.before,
        );
        expect(result.tiptap.state.selection).toBeInstanceOf(CellSelection);
        expect(errors).toEqual([]);
      });
    });
  });

  describe("html 분기(P5)", () => {
    it.each([
      { name: "html 없음", entries: {} },
      {
        name: "meta만 있는 html",
        entries: { "text/html": "<meta charset='utf-8'>" },
      },
      { name: "빈 문단 html", entries: { "text/html": "<p></p>" } },
      { name: "무효 문자뿐인 html", entries: { "text/html": `<p>${SOH}</p>` } },
    ])("$name + 평문은 평문 정책이 적용된다(C7)", ({ entries }) => {
      const result = pasteInto(rowDocument(), selectAB, {
        ...entries,
        "text/plain": "X",
      });

      expect(contentById(result)["g-r0c0"]).toEqual([{ text: "X" }]);
      expect(contentById(result)["g-r0c1"]).toEqual([]);
      expectSchemaValid(result.tiptap);
    });

    it("서식 있는 html은 현행대로 prosemirror-tables에 맡겨 문서가 불변이다(C8, 현행 특성화)", () => {
      const result = pasteInto(rowDocument(), selectAB, {
        "text/html": "<b>x</b>",
        "text/plain": "ab",
      });

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(outline(result.editor.getDocument().blocks)).toEqual(
        docOutline("table[A|B|C]"),
      );
    });

    // 서식 없이 붙여넣기(Ctrl+Shift+V)면 PM이 평문으로 slice를 만든다. 그 slice를
    // prosemirror-tables에 맡기면 같은 NOID 되돌림이 일어난다. html이 함께 와도
    // 평문 정책이 선택을 대체한다.
    it("서식 없이 붙여넣기 신호가 있으면 서식 있는 html이 와도 평문 정책이 적용된다", () => {
      const m = mounted(documentOf(...rowDocument()));
      selectAB(m.tiptap);

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "<b>x</b>", text: "ab", plain: true },
        textSlice(m.tiptap, "ab"),
      );

      expect(plan?.kind).toBe("dispatch");
    });

    it("Ctrl+Shift+V에 서식 있는 html이 함께 와도 평문이 선택을 대체한다", () => {
      const m = mounted(documentOf(...rowDocument()));
      selectAB(m.tiptap);
      m.tiptap.view.dom.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Shift",
          keyCode: 16,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        } as KeyboardEventInit),
      );

      dispatchPasteData(m.tiptap.view.dom, {
        "text/html": "<b>x</b>",
        "text/plain": "ab",
      });

      const result = { editor: m.editor };
      expect(contentById(result)["g-r0c0"]).toEqual([{ text: "ab" }]);
      expect(contentById(result)["g-r0c1"]).toEqual([]);
      expectSchemaValid(m.tiptap);
    });

    it("서식 없이 붙여넣기 신호가 없으면 서식 있는 html은 그대로 맡긴다", () => {
      const m = mounted(documentOf(...rowDocument()));
      selectAB(m.tiptap);

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "<b>x</b>", text: "ab", plain: false },
        textSlice(m.tiptap, "x"),
      );

      expect(plan?.kind).toBe("pass");
    });

    it("평문이 비면 html 유무와 관계없이 개입하지 않는다", () => {
      const result = pasteInto(rowDocument(), selectAB, {
        "text/html": "<meta charset='utf-8'>",
        "text/plain": "",
      });

      expect(outline(result.editor.getDocument().blocks)).toEqual(
        docOutline("table[A|B|C]"),
      );
    });
  });

  describe("selection과 undo(P7)", () => {
    it("붙여넣기 뒤 selection은 첫 셀 삽입 텍스트 끝이고 dispatch 1회, undo 1회로 복원된다(C10)", () => {
      const result = pasteInto(rowDocument(), selectAB, {
        "text/plain": "XY",
      });

      expect(result.dispatch).toHaveBeenCalledTimes(1);
      expect(result.editor.getDocument().revision).toBe(
        result.before.document.revision + 1,
      );
      const { selection } = result.tiptap.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(selection.empty).toBe(true);
      expect(selection.$from.parent.attrs.cellId).toBe("g-r0c0");
      expect(selection.$from.parentOffset).toBe(2);

      result.tiptap.commands.undo();
      expect(result.tiptap.state.doc.toJSON()).toEqual(
        result.before.tiptapDocument,
      );
    });

    it("첫 셀의 기존 서식과 텍스트는 대체되고 셀 attrs는 유지된다(C11)", () => {
      const styled = gridTable("g", 1, 3, ["A", "B", "C"]) as TableBlock;
      const firstCell = styled.rows[0]?.cells[0];
      if (firstCell === undefined) throw new Error("fixture 준비 실패");
      const content: InlineContent = [
        { text: "a" },
        { text: "b", marks: [{ type: "bold" }] },
      ];
      firstCell.content = content;
      firstCell.textColor = "#FF0000";
      firstCell.align = "center";
      firstCell.backgroundColor = "#00FF00";

      const result = pasteInto(
        [paragraphBlock("p1", "para"), styled, TAIL],
        selectAB,
        { "text/plain": "X" },
      );

      const [pasted] = cellsOf(result);
      expect(pasted?.content).toEqual([{ text: "X" }]);
      expect(pasted?.textColor).toBe("#FF0000");
      expect(pasted?.align).toBe("center");
      expect(pasted?.backgroundColor).toBe("#00FF00");
    });
  });

  describe("pasteHandler 계약(C12)", () => {
    it("pasteHandler를 호출하지 않고 view.pasteText도 부르지 않는다", () => {
      const pasteHandler = vi.fn(() => true);

      const result = pasteInto(
        rowDocument(),
        selectAB,
        { "text/plain": "X" },
        { pasteHandler },
      );

      expect(pasteHandler).not.toHaveBeenCalled();
      expect(result.pasteText).not.toHaveBeenCalled();
      expect(contentById(result)["g-r0c0"]).toEqual([{ text: "X" }]);
    });
  });
});
