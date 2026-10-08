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
 * - P5 html 분기: html이 없거나 빈 slice이면 평문 정책, 실제 내용이면 서식 있는
 *   html 경로(Issue #308이 정정)
 * - P6 셀 조각 slice: 계획이 pass(paste-plan.test.ts가 소유, 여기서는 기존 셀
 *   붙여넣기 테스트 통과로 확인)
 * - P7 붙여넣기 뒤 selection과 undo, 첫 셀 서식 대체, pasteHandler 미호출 계약
 *
 * 서식 있는 html(Issue #308)도 이 파일이 고정한다. 수정 전에는 html이 실제 내용을
 * 가지면 prosemirror-tables에 맡겨 되돌림 guard가 붙여넣기를 지웠다. 이제
 * importHtml 블록을 셀 인라인으로 바꿔 평문과 같은 방식으로 선택을 대체한다.
 * - H1 한 블록 html(`<b>x</b>`·문단 안 마크·제목)과 문서 반영
 * - H2 링크 attrs가 셀 캐럿 경로와 같음
 * - H3 여러 블록(문단·목록)과 `<pre>`의 hardBreak 평탄화
 * - H4 2x2·병합 셀 선택, 첫 셀 기존 마크 비상속과 셀 attrs 유지
 * - H5 selection·undo·dispatch 1회·pasteHandler 미호출
 * - H6 줄 0개 html은 평문 정책, 평문도 비면 이벤트만 소비
 * - H7 표 html은 TablePasteExtension이 처리(이전과 같음)
 *
 * 표 셀 캐럿·같은 셀 범위는 clipboard-paste-table-cell.test.ts가 맡는다.
 */
import type { Block, InlineContent, TableBlock } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { CellSelection } from "@tiptap/pm/tables";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

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
  inCell,
  mergedTable,
  outline,
  TAIL,
} from "./table-boundary-test-support.js";
import { selectCellRange, selectSingleCell } from "./table-test-support.js";
import {
  docOutline,
  expectTableIntact,
  findCell,
  kindsInDoc,
  kindsOf,
  lastCellBlocks,
  pasteIn,
  selectFirstTwoCells,
  textSelection,
} from "./table-cell-paste-test-support.js";

const SOH = String.fromCharCode(1);
const HIGH_SURROGATE = String.fromCharCode(0xd800);

/** 기준 문서: 문단 p1, 1x3 표(A|B|C, 셀 id g-r0c0..2), 뒤 문단. */
const rowDocument = (): Block[] => [
  paragraphBlock("p1", "para"),
  gridTable("g", 1, 3, ["A", "B", "C"]),
  TAIL,
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

/** 실제 내용이 있는 인라인 텍스트 slice를 만든다. PM 파싱 결과 대역이다. */
const textSlice = (tiptap: TiptapEditor, text: string): Slice =>
  new Slice(Fragment.from(tiptap.schema.text(text)), 0, 0);

describe("CellSelection 평문 붙여넣기(Issue #300)", () => {
  describe("선택 대체(P1)", () => {
    it("2셀을 고르고 한 줄을 붙이면 첫 셀만 채우고 나머지 선택 셀은 비운다(C1)", () => {
      const result = pasteIn(rowDocument(), selectFirstTwoCells, {
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
      const result = pasteIn(
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
      const result = pasteIn(
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
      const result = pasteIn(
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
        const result = pasteIn(rowDocument(), selectFirstTwoCells, {
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
      selectFirstTwoCells(m.tiptap);

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
      const result = pasteIn(rowDocument(), selectFirstTwoCells, {
        "text/plain": input,
      });

      expect(contentById(result)["g-r0c0"]).toEqual([{ text: "ab" }]);
      expect(contentById(result)["g-r0c1"]).toEqual([]);
      expectSchemaValid(result.tiptap);
    });

    it("정리본이 비면 이벤트만 소비하고 문서와 선택을 바꾸지 않는다(C6)", () => {
      withUnhandledErrorTracking((errors) => {
        const result = pasteIn(rowDocument(), selectFirstTwoCells, {
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
      const result = pasteIn(rowDocument(), selectFirstTwoCells, {
        ...entries,
        "text/plain": "X",
      });

      expect(contentById(result)["g-r0c0"]).toEqual([{ text: "X" }]);
      expect(contentById(result)["g-r0c1"]).toEqual([]);
      expectSchemaValid(result.tiptap);
    });

    // Issue #308이 정정: 수정 전에는 prosemirror-tables에 맡겨 되돌림 guard가
    // 붙여넣기를 지웠다(문서 불변). 자세한 축은 아래 #308 describe가 소유한다.
    it("서식 있는 html은 html 인라인 내용이 첫 셀을 채운다(C8, Issue #308이 정정)", () => {
      const result = pasteIn(rowDocument(), selectFirstTwoCells, {
        "text/html": "<b>x</b>",
        "text/plain": "ab",
      });

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(outline(result.editor.getDocument().blocks)).toEqual(
        docOutline("table[x||C]"),
      );
      expect(kindsOf(result.tiptap, "g-r0c0")).toEqual(["x*bold"]);
    });

    // 서식 없이 붙여넣기(Ctrl+Shift+V)면 PM이 평문으로 slice를 만든다. 그 slice를
    // prosemirror-tables에 맡기면 같은 NOID 되돌림이 일어난다. html이 함께 와도
    // 평문 정책이 선택을 대체한다.
    it("서식 없이 붙여넣기 신호가 있으면 서식 있는 html이 와도 평문 정책이 적용된다", () => {
      const m = mounted(documentOf(...rowDocument()));
      selectFirstTwoCells(m.tiptap);

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "<b>x</b>", text: "ab", plain: true },
        textSlice(m.tiptap, "ab"),
      );

      expect(plan?.kind).toBe("dispatch");
    });

    it("Ctrl+Shift+V에 서식 있는 html이 함께 와도 평문이 선택을 대체한다", () => {
      const m = mounted(documentOf(...rowDocument()));
      selectFirstTwoCells(m.tiptap);
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

    // Issue #308이 정정: 수정 전 계획은 pass였다.
    it("서식 없이 붙여넣기 신호가 없으면 서식 있는 html을 셀 인라인으로 넣는다(Issue #308이 정정)", () => {
      const m = mounted(documentOf(...rowDocument()));
      selectFirstTwoCells(m.tiptap);

      const plan = planTableCellPaste(
        m.tiptap.state,
        { html: "<b>x</b>", text: "ab", plain: false },
        textSlice(m.tiptap, "x"),
      );

      expect(plan?.kind).toBe("dispatch");
      if (plan?.kind !== "dispatch") return;
      expect(kindsInDoc(plan.transaction.doc, "g-r0c0")).toEqual(["x*bold"]);
      expect(kindsInDoc(plan.transaction.doc, "g-r0c1")).toEqual([]);
    });

    it("평문이 비면 html 유무와 관계없이 개입하지 않는다", () => {
      const result = pasteIn(rowDocument(), selectFirstTwoCells, {
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
      const result = pasteIn(rowDocument(), selectFirstTwoCells, {
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

      const result = pasteIn(
        [paragraphBlock("p1", "para"), styled, TAIL],
        selectFirstTwoCells,
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

      const result = pasteIn(
        rowDocument(),
        selectFirstTwoCells,
        { "text/plain": "X" },
        { pasteHandler },
      );

      expect(pasteHandler).not.toHaveBeenCalled();
      expect(result.pasteText).not.toHaveBeenCalled();
      expect(contentById(result)["g-r0c0"]).toEqual([{ text: "X" }]);
    });
  });
});

describe("CellSelection 서식 있는 html 붙여넣기(Issue #308)", () => {
  /** 2셀 CellSelection에 html과 평문을 붙인다. */
  const pasteHtml = (html: string, text = "ab") =>
    pasteIn(rowDocument(), selectFirstTwoCells, {
      "text/html": html,
      "text/plain": text,
    });

  describe("한 블록 html(H1)", () => {
    it("<b>x</b>는 첫 셀에 굵은 x를 넣고 나머지 선택 셀을 비우며 되돌려지지 않는다", () => {
      const result = pasteHtml("<b>x</b>");

      expect(contentById(result)).toEqual({
        "g-r0c0": [{ text: "x", marks: [{ type: "bold" }] }],
        "g-r0c1": [],
        "g-r0c2": [{ text: "C" }],
      });
      expect(result.editor.getDocument().revision).toBe(
        result.before.document.revision + 1,
      );
      expect(result.event.defaultPrevented).toBe(true);
      expect(result.pasteText).not.toHaveBeenCalled();
      expectTableIntact(result);
    });

    it.each([
      { html: "<p>a <b>b</b></p>", kinds: ["a ", "b*bold"] },
      { html: "<h1>t</h1>", kinds: ["t"] },
    ])("$html 입력의 첫 셀은 $kinds", ({ html, kinds }) => {
      const result = pasteHtml(html);

      expect(kindsOf(result.tiptap, "g-r0c0")).toEqual(kinds);
      expect(kindsOf(result.tiptap, "g-r0c1")).toEqual([]);
      expectTableIntact(result);
    });
  });

  describe("링크(H2)", () => {
    it("링크는 href·target·rel이 셀 캐럿 경로 결과와 같다", () => {
      const html = '<a href="https://x.com">l</a>';
      const result = pasteHtml(html, "l");
      const caret = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/html": html, "text/plain": "l" },
      );

      expect(kindsOf(result.tiptap, "g-r0c0")).toEqual(["l*link"]);
      expect(kindsOf(caret.tiptap, "t-r0c0")).toEqual(["cell", "l*link"]);
      const pasted = findCell(result.tiptap.state.doc, "g-r0c0").child(0);
      const caretPasted = findCell(caret.tiptap.state.doc, "t-r0c0").child(1);
      expect(pasted.marks.map((mark) => mark.toJSON())).toEqual(
        caretPasted.marks.map((mark) => mark.toJSON()),
      );
      expect(pasted.marks[0]?.attrs.href).toBe("https://x.com");
    });
  });

  describe("여러 블록과 pre(H3)", () => {
    it.each([
      { name: "문단 둘", html: "<p>a</p><p>b</p>" },
      { name: "목록 두 항목", html: "<ul><li>a</li><li>b</li></ul>" },
    ])(
      "$name 입력은 첫 셀이 a·hardBreak·b다(#304 평탄화와 같다)",
      ({ html }) => {
        const result = pasteHtml(html, "a\nb");

        expect(kindsOf(result.tiptap, "g-r0c0")).toEqual(["a", "br", "b"]);
        expect(kindsOf(result.tiptap, "g-r0c1")).toEqual([]);
        expectTableIntact(result);
      },
    );

    // 셀 캐럿 경로는 PM 기본이라 개행이 공백이 되고 code 마크가 붙는다
    // (`cella b`). CellSelection은 importHtml 경로라 다르다(비대칭).
    it("<pre> 단독은 첫 셀이 a·hardBreak·b이고 code 마크가 없다", () => {
      const result = pasteHtml("<pre>a\nb</pre>", "a\nb");

      expect(kindsOf(result.tiptap, "g-r0c0")).toEqual(["a", "br", "b"]);
      expectTableIntact(result);
    });
  });

  describe("선택 범위와 셀 보존(H4)", () => {
    it("2x2 전체를 고르면 첫 셀만 채우고 나머지는 빈 셀이다", () => {
      const result = pasteIn(
        [
          paragraphBlock("p1", "para"),
          gridTable("g", 2, 2, ["a", "b", "", "d"]),
          TAIL,
        ],
        (tiptap) => selectCellRange(tiptap, "g-r0c0", "g-r1c1"),
        { "text/html": "<b>x</b>", "text/plain": "x" },
      );

      expect(contentById(result)).toEqual({
        "g-r0c0": [{ text: "x", marks: [{ type: "bold" }] }],
        "g-r0c1": [],
        "g-r1c0": [],
        "g-r1c1": [],
      });
      expectSchemaValid(result.tiptap);
    });

    it("병합 셀이 걸친 선택은 셀 노드와 병합 값·cellId를 유지하고 첫 셀에만 넣는다", () => {
      const originalCells = (mergedTable() as TableBlock).rows.flatMap(
        (row) => row.cells,
      );
      const selected: string[] = [];
      const result = pasteIn(
        [paragraphBlock("p1", "para"), mergedTable(), TAIL],
        (tiptap) => {
          selectCellRange(tiptap, "m-1", "m-4");
          (tiptap.state.selection as CellSelection).forEachCell((node) => {
            selected.push(String(node.attrs.cellId));
          });
        },
        { "text/html": "<b>x</b>", "text/plain": "x" },
      );

      expect(selected.length).toBeGreaterThan(2);
      expect(
        cellsOf(result).map((cell) => [cell.id, cell.rowSpan, cell.columnSpan]),
      ).toEqual(
        originalCells.map((cell) => [cell.id, cell.rowSpan, cell.columnSpan]),
      );
      const contents = contentById(result);
      for (const cell of originalCells) {
        if (cell.id === "m-1") {
          expect(contents[cell.id]).toEqual([
            { text: "x", marks: [{ type: "bold" }] },
          ]);
        } else if (selected.includes(cell.id)) {
          expect(contents[cell.id]).toEqual([]);
        } else {
          expect(contents[cell.id]).toEqual(cell.content);
        }
      }
      expectSchemaValid(result.tiptap);
    });

    it("첫 셀의 기존 텍스트·마크는 대체되고 html 마크만 남으며 셀 attrs는 유지된다", () => {
      const styled = gridTable("g", 1, 3, ["A", "B", "C"]) as TableBlock;
      const firstCell = styled.rows[0]?.cells[0];
      if (firstCell === undefined) throw new Error("fixture 준비 실패");
      firstCell.content = [
        { text: "a" },
        { text: "b", marks: [{ type: "bold" }] },
      ];
      firstCell.textColor = "#FF0000";
      firstCell.align = "center";
      firstCell.backgroundColor = "#00FF00";

      const result = pasteIn(
        [paragraphBlock("p1", "para"), styled, TAIL],
        selectFirstTwoCells,
        { "text/html": "<i>x</i>", "text/plain": "x" },
      );

      const [pasted] = cellsOf(result);
      expect(pasted?.id).toBe("g-r0c0");
      expect(pasted?.content).toEqual([
        { text: "x", marks: [{ type: "italic" }] },
      ]);
      expect(pasted?.textColor).toBe("#FF0000");
      expect(pasted?.align).toBe("center");
      expect(pasted?.backgroundColor).toBe("#00FF00");
    });
  });

  describe("selection과 undo(H5)", () => {
    it("selection은 첫 셀 삽입 끝이고 dispatch 1회, undo 1회로 복원되며 pasteHandler를 부르지 않는다", () => {
      const pasteHandler = vi.fn(() => true);
      const result = pasteIn(
        rowDocument(),
        selectFirstTwoCells,
        { "text/html": "<p>a</p><p><b>bc</b></p>", "text/plain": "a\nbc" },
        { pasteHandler },
      );

      expect(kindsOf(result.tiptap, "g-r0c0")).toEqual(["a", "br", "bc*bold"]);
      expect(result.dispatch).toHaveBeenCalledTimes(1);
      expect(pasteHandler).not.toHaveBeenCalled();
      expect(result.pasteText).not.toHaveBeenCalled();
      const { selection } = result.tiptap.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(selection.empty).toBe(true);
      expect(selection.$from.parent.attrs.cellId).toBe("g-r0c0");
      expect(selection.$from.parentOffset).toBe(4);

      result.tiptap.commands.undo();
      expect(result.tiptap.state.doc.toJSON()).toEqual(
        result.before.tiptapDocument,
      );
    });
  });

  describe("줄 0개 html(H6)", () => {
    // PM 파싱 slice는 실제 내용(빈 문단 둘, 무효 문자 문단 둘)을 가져 이전에는
    // prosemirror-tables에 맡겨졌다. importHtml 결과는 줄 0개라 평문 정책이다.
    it.each([
      { name: "빈 문단 둘", html: "<p></p><p></p>" },
      { name: "무효 문자뿐인 문단 둘", html: `<p>${SOH}</p><p>${SOH}</p>` },
    ])("$name 입력의 html은 평문 정책이 선택을 대체한다", ({ html }) => {
      const result = pasteHtml(html, "X");

      expect(contentById(result)["g-r0c0"]).toEqual([{ text: "X" }]);
      expect(contentById(result)["g-r0c1"]).toEqual([]);
      expectSchemaValid(result.tiptap);
    });

    it("줄 0개 html에 평문도 비면 이벤트만 소비하고 문서와 선택을 바꾸지 않는다", () => {
      withUnhandledErrorTracking((errors) => {
        const result = pasteHtml("<p></p><p></p>", "");

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

  describe("표 html(H7)", () => {
    // 표 html은 TablePasteExtension이 이 계획보다 먼저 처리한다. 좌상단 셀부터
    // 덮어쓴다. 이전과 같다.
    it("표 html은 TablePasteExtension이 좌상단부터 덮어쓴다", () => {
      const result = pasteHtml(
        "<table><tr><td>1</td><td>2</td></tr></table>",
        "1\t2",
      );

      expect(outline(result.editor.getDocument().blocks)).toEqual(
        docOutline("table[1|2|C]"),
      );
      expect(result.pasteText).not.toHaveBeenCalled();
    });
  });
});
