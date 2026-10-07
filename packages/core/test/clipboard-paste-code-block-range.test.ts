/**
 * codeBlock에 걸친 범위에 text/html을 붙일 때의 블록 배치 계약을 고정한다
 * (Issue #286). 시작이 codeBlock 밖인 범위는 비코드 범위와 같은 HTML 분기
 * (importHtml → insertContent)로 합류한다. 범위를 대체한 자리에 HTML 블록이
 * 형제로 놓이고, 둘째 블록이 앞 블록의 자식이 되지 않는다. 서식(목록·
 * heading·pre)도 보존된다.
 *
 * 다루는 축은 기준 배치(A·B·C), 서식 보존(H·I·O), 자식 블록에서 시작하는
 * 범위(V), 숨은 codeBlock, transaction 계약이다. 시작이 codeBlock 안인
 * 범위(E·J)와 캐럿이 codeBlock 안인 붙여넣기는 PM 기본 처리를 유지하므로
 * 특성화만 한다. 시작이 codeBlock 밖인 범위의 여러 줄 평문은 직접 삽입으로
 * 배치한다(Issue #285). 범위 끝 뒤에 자식이 남는 모양에서도 그 자식이 마지막
 * 줄 블록으로 넘어가지 않는다. Markdown 평문은 이 범위에서 감지하지 않는다.
 * 무효 문자(제어문자·짝 없는 surrogate)가 섞인 한 줄 평문은 정리본을
 * view.pasteText로 넣고, 제어문자만 있으면 이벤트만 소비한다(Issue #295).
 * 직접 삽입이 안 되는 선택(NodeSelection·AllSelection)의 여러 줄도 같다.
 * 실제 브라우저 대표 시나리오는 e2e/clipboard-paste.spec.ts가 맡는다.
 */
import type { Block, TableBlock } from "@cp949/geul-model";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  blocksOf,
  childCodeBlocks,
  dispatchPasteData,
  outline,
  pasteData,
  pasteHtml,
  textOf,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
  selectBlockNode,
  sequentialIds,
  toggleBlock,
} from "./editor-controller-support.js";
import { findCellBoundaryPosition } from "./table-test-support.js";

// 문서를 마운트하고 시작 블록·끝 블록의 텍스트 offset으로 범위를 만든다.
// 끝이 시작과 같으면 캐럿이다.
const setup = (
  blocks: Block[],
  from: { id: string; offset: number },
  to: { id: string; offset: number } = from,
) => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
  });
  const { editable, tiptap } = mountTiptapEditor(editor);
  editable.focus();
  tiptap.commands.setTextSelection({
    from: contentTextStart(tiptap, from.id) + from.offset,
    to: contentTextStart(tiptap, to.id) + to.offset,
  });
  return { editor, editable, tiptap };
};

// 기준 문서: p1 "abcd", codeBlock cb "foobar", tail "tail".
const baseBlocks = (): Block[] => [
  paragraphBlock("p1", "abcd"),
  codeBlockBlock("cb", "foobar"),
  paragraphBlock("tail", "tail"),
];

// 기준 범위: p1 "ab" 뒤 → cb "foo" 뒤.
const baseRange = () =>
  [
    { id: "p1", offset: 2 },
    { id: "cb", offset: 3 },
  ] as const;

describe("codeBlock에 걸친 범위의 HTML 붙여넣기 배치(Issue #286)", () => {
  describe("기준 배치(C1·C2)", () => {
    it("두 블록 HTML은 둘째 블록이 앞 블록의 자식이 되지 않고 형제로 놓이며 p1 id가 보존된다", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteHtml(editable, "<p>X</p><p>Y</p>");

      const blocks = blocksOf(editor);
      expect(outline(blocks)).toEqual([
        "p:ab",
        "p:X",
        "p:Y",
        "code:bar",
        "p:tail",
      ]);
      expect(blocks[0]?.id).toBe("p1");
      expect(blocks.every((block) => !("children" in block))).toBe(true);
    });

    it("한 블록 HTML도 범위를 대체한 자리에 삽입되고 남은 꼬리와 나뉜다", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteHtml(editable, "<p>X</p>");

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        "p:X",
        "code:bar",
        "p:tail",
      ]);
    });

    it("세 블록 HTML은 셋 모두 형제다", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteHtml(editable, "<p>X</p><p>Y</p><p>Z</p>");

      const blocks = blocksOf(editor);
      expect(outline(blocks)).toEqual([
        "p:ab",
        "p:X",
        "p:Y",
        "p:Z",
        "code:bar",
        "p:tail",
      ]);
      expect(blocks.every((block) => !("children" in block))).toBe(true);
    });

    it("비코드 범위(p1 → tail)와 같은 규칙이다", () => {
      const { editor, editable } = setup(
        [
          paragraphBlock("p1", "abcd"),
          paragraphBlock("mid", "foobar"),
          paragraphBlock("tail", "tail"),
        ],
        { id: "p1", offset: 2 },
        { id: "mid", offset: 3 },
      );

      pasteHtml(editable, "<p>X</p><p>Y</p>");

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        "p:X",
        "p:Y",
        "p:bar",
        "p:tail",
      ]);
    });
  });

  describe("서식 보존(C3)", () => {
    it("목록 HTML이 목록 항목으로 들어간다", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteHtml(editable, "<ul><li>a</li><li>b</li></ul>");

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        "ul:a",
        "ul:b",
        "code:bar",
        "p:tail",
      ]);
    });

    it("heading HTML이 heading으로 들어간다", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteHtml(editable, "<h1>H</h1><p>Y</p>");

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        "h1:H",
        "p:Y",
        "code:bar",
        "p:tail",
      ]);
    });

    it("pre HTML이 codeBlock으로 들어가고 끝 잔여도 codeBlock이다", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteHtml(editable, "<pre><code>K</code></pre>");

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        "code:K",
        "code:bar",
        "p:tail",
      ]);
    });
  });

  describe("자식 블록에서 시작하는 범위(C4, V)", () => {
    it("시작이 자식 c1이고 끝이 최상위 codeBlock이면 새 블록은 c1과 같은 층위 형제다", () => {
      const { editor, editable } = setup(
        [
          paragraphBlock("p1", "abcd", [paragraphBlock("c1", "child")]),
          codeBlockBlock("cb", "foobar"),
          paragraphBlock("tail", "tail"),
        ],
        { id: "c1", offset: 2 },
        { id: "cb", offset: 3 },
      );

      pasteHtml(editable, "<p>X</p><p>Y</p>");

      expect(outline(blocksOf(editor))).toEqual([
        "p:abcd[p:ch,p:X,p:Y]",
        "code:bar",
        "p:tail",
      ]);
    });
  });

  describe("시작이 codeBlock 안인 범위(C5, E·J)는 PM 기본 처리를 유지한다", () => {
    it("E: 시작이 codeBlock 안이고 끝이 다음 블록이면 codeBlock에 이어 붙는다", () => {
      const { editor, editable } = setup(
        baseBlocks(),
        { id: "cb", offset: 3 },
        { id: "tail", offset: 2 },
      );

      pasteHtml(editable, "<p>X</p><p>Y</p>");

      expect(outline(blocksOf(editor))).toEqual([
        "p:abcd",
        "code:fooX",
        "p:Yil",
      ]);
    });

    it("J: 양끝이 같은 codeBlock 안이면 코드 텍스트만 바뀐다", () => {
      const { editor, editable } = setup(
        baseBlocks(),
        { id: "cb", offset: 1 },
        { id: "cb", offset: 4 },
      );

      pasteHtml(editable, "<p>X</p><p>Y</p>");

      expect(outline(blocksOf(editor))).toEqual([
        "p:abcd",
        "code:fX",
        "p:Yar",
        "p:tail",
      ]);
    });

    it("캐럿이 codeBlock 안이면 새 codeBlock이 생기지 않는다", () => {
      const { editor, editable } = setup(baseBlocks(), {
        id: "cb",
        offset: 3,
      });

      pasteHtml(editable, "<pre><code>K</code></pre>");

      expect(outline(blocksOf(editor))).toEqual([
        "p:abcd",
        "code:fooKbar",
        "p:tail",
      ]);
    });
  });

  // NodeSelection·AllSelection은 비어 있지 않고 $from이 codeBlock 밖이면 새
  // 분기를 탄다. 아래 둘은 현행 결과를 고정하는 특성화다 — 수정 전 PM 기본
  // 경로도 같은 결과를 내므로 가드 완화 변이를 탐지하지 않는다.
  describe("NodeSelection·AllSelection(특성화)", () => {
    it("codeBlock NodeSelection은 codeBlock 전체를 HTML 블록으로 대체한다", () => {
      const { editor, editable, tiptap } = setup(baseBlocks(), {
        id: "p1",
        offset: 0,
      });
      selectBlockNode(tiptap, "cb");

      pasteHtml(editable, "<p>X</p><p>Y</p>");

      expect(outline(blocksOf(editor))).toEqual([
        "p:abcd",
        "p:X",
        "p:Y",
        "p:tail",
      ]);
    });

    it("AllSelection은 문서 전체를 HTML 블록으로 대체한다", () => {
      const { editor, editable, tiptap } = setup(baseBlocks(), {
        id: "p1",
        offset: 0,
      });
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)),
      );

      pasteHtml(editable, "<p>X</p><p>Y</p>");

      expect(outline(blocksOf(editor))).toEqual(["p:X", "p:Y"]);
    });
  });

  describe("표 셀에서 시작해 codeBlock으로 끝나는 범위(특성화)", () => {
    // 표 경계 범위라 붙여넣기 전에 선택한 텍스트만 먼저 지운다(Issue #292).
    // 캐럿이 셀에 남아 ClipboardPaste는 물러나고 PM 기본 처리가 첫 블록을
    // 시작 셀에, 나머지를 표 뒤에 놓는다. 표 구조는 유지되고 셀 텍스트만
    // 잘린다.
    it("표 구조(행·열·셀 id)가 유지되고 첫 블록은 시작 셀에 나머지 블록은 표 뒤 형제로 놓인다", () => {
      const cell = (id: string, columnId: string, text: string) => ({
        id,
        columnId,
        rowSpan: 1,
        columnSpan: 1,
        content: [{ text }],
      });
      const { editor, editable, tiptap } = setup(
        [
          {
            id: "tb",
            type: "table",
            columns: [
              { id: "c1", width: 100 },
              { id: "c2", width: 100 },
            ],
            rows: [
              {
                id: "r1",
                cells: [cell("a", "c1", "AAAA"), cell("b", "c2", "BBBB")],
              },
              {
                id: "r2",
                cells: [cell("c", "c1", "CCCC"), cell("d", "c2", "DDDD")],
              },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
          codeBlockBlock("cb", "foobar"),
          paragraphBlock("tail", "tail"),
        ],
        { id: "cb", offset: 0 },
      );
      const boundary = findCellBoundaryPosition(tiptap, "d");
      if (boundary === null) throw new Error("셀 fixture 준비 실패");
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(
          TextSelection.create(
            tiptap.state.doc,
            boundary + 2,
            contentTextStart(tiptap, "cb") + 3,
          ),
        ),
      );

      pasteHtml(editable, "<p>X</p><p>Y</p>");

      const blocks = blocksOf(editor);
      const first = blocks[0];
      if (first?.type !== "table") throw new Error("표 블록이 사라졌다");
      // 판별 유니온이 CustomBlock과 갈리지 않아 TableBlock으로 좁힌다.
      const table = first as TableBlock;
      expect(table.columns.map((column) => column.id)).toEqual(["c1", "c2"]);
      expect(table.rows.map((row) => row.cells.map((c) => c.id))).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
      expect(
        table.rows.map((row) =>
          row.cells.map((c) =>
            c.content.map((item) => ("text" in item ? item.text : "")).join(""),
          ),
        ),
      ).toEqual([
        ["AAAA", "BBBB"],
        ["CCCC", "DX"],
      ]);
      expect(outline(blocks.slice(1))).toEqual(["p:Y", "code:bar", "p:tail"]);
    });
  });

  describe("숨은 codeBlock(C6)", () => {
    it("접힌 toggle 안 codeBlock이 범위 중간이고 시작이 밖이면 HTML 분기로 배치한다", () => {
      const { editor, editable } = setup(
        [
          paragraphBlock("p1", "abcd"),
          toggleBlock("t1", "tog", {
            collapsed: true,
            children: [codeBlockBlock("cb", "foobar")],
          }),
          paragraphBlock("tail", "tail"),
        ],
        { id: "p1", offset: 2 },
        { id: "tail", offset: 2 },
      );

      pasteHtml(editable, "<p>X</p><p>Y</p>");

      expect(outline(blocksOf(editor))).toEqual(["p:ab", "p:X", "p:Y", "p:il"]);
    });
  });

  describe("HTML 분기 대상 밖(C7)", () => {
    it("Markdown 평문은 감지하지 않고 리터럴 문단으로 넣는다(현행)", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteData(editable, { "text/plain": "# H\n\n- a\n- b" });

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab# H",
        "p:- a",
        "p:- bbar",
        "p:tail",
      ]);
    });

    it("여러 줄 평문은 직접 삽입으로 형제 배치한다(Issue #285, 자식 없는 모양은 결과가 현행과 같다)", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteData(editable, { "text/plain": "X\nY" });

      const blocks = blocksOf(editor);
      expect(blocks.map(textOf)).toEqual(["abX", "Ybar", "tail"]);
      expect(blocks[0] !== undefined && "children" in blocks[0]).toBe(false);
    });

    it("text/html과 text/plain이 함께 있으면 HTML을 쓴다", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteData(editable, {
        "text/html": "<p>X</p><p>Y</p>",
        "text/plain": "P\nQ",
      });

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        "p:X",
        "p:Y",
        "code:bar",
        "p:tail",
      ]);
    });
  });

  // 범위 끝 뒤에 자식이 남는 모양은 PM 기본 처리가 그 자식을 마지막 줄
  // 블록으로 넘긴다(Issue #285). 시작이 codeBlock 밖이고 평문이 여러 줄이면
  // 직접 삽입이 Enter 분할과 같은 자리에 줄을 놓는다.
  describe("여러 줄 평문 붙여넣기(Issue #285)", () => {
    // D2는 childCodeBlocks()다. 범위는 p1 "ab" 뒤 → code "xy" 뒤.
    const childCodeRange = () =>
      [
        { id: "p1", offset: 2 },
        { id: "cb", offset: 2 },
      ] as const;

    it("범위 끝 뒤 자식 c2가 마지막 줄 블록 소속으로 넘어가지 않고 첫 자식 뒤에 형제로 남는다(C9)", () => {
      const { editor, editable } = setup(
        childCodeBlocks(),
        ...childCodeRange(),
      );

      pasteData(editable, { "text/plain": "X\nY" });

      const blocks = blocksOf(editor);
      // 끝의 빈 문단은 편집기가 문서 끝에 붙이는 기준선이다(붙여넣기 전부터 있다).
      expect(outline(blocks)).toEqual(["p:abX[p:Yz,p:c2]", "p:"]);
      expect(blocks[0]?.id).toBe("p1");
    });

    it("codeBlock이 손자이고 c2가 그 뒤 자식이어도 같다(C9)", () => {
      const { editor, editable } = setup(
        [
          paragraphBlock("p1", "abcd", [
            paragraphBlock("m", "mid", [codeBlockBlock("cb", "xyz")]),
            paragraphBlock("c2", "c2"),
          ]),
        ],
        { id: "p1", offset: 2 },
        { id: "cb", offset: 2 },
      );

      pasteData(editable, { "text/plain": "X\nY" });

      expect(outline(blocksOf(editor))).toEqual(["p:abX[p:Yz,p:c2]", "p:"]);
    });

    it("범위 끝 뒤에 자식이 없는 일반 모양은 현행 결과 그대로다(C10)", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteData(editable, { "text/plain": "X\nY" });

      expect(outline(blocksOf(editor))).toEqual(["p:abX", "p:Ybar", "p:tail"]);
    });

    it("시작이 codeBlock 안인 범위는 PM 기본이다(C11)", () => {
      const { editor, editable } = setup(
        baseBlocks(),
        { id: "cb", offset: 3 },
        { id: "tail", offset: 2 },
      );

      pasteData(editable, { "text/plain": "X\nY" });

      expect(outline(blocksOf(editor))).toEqual([
        "p:abcd",
        "code:fooX\nYil",
        "p:",
      ]);
    });

    it("한 줄 평문은 PM 기본이다(C11)", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteData(editable, { "text/plain": "X" });

      expect(outline(blocksOf(editor))).toEqual(["p:abXbar", "p:tail"]);
    });

    it("유효한 한 줄 평문은 view.pasteText 없이 PM 기본에 위임한다(Issue #295 C4)", () => {
      const { editor, editable, tiptap } = setup(baseBlocks(), ...baseRange());
      const pasteText = vi.spyOn(tiptap.view, "pasteText");

      pasteData(editable, { "text/plain": "ab" });

      expect(outline(blocksOf(editor))).toEqual(["p:ababbar", "p:tail"]);
      expect(pasteText).not.toHaveBeenCalled();
    });

    it("제어문자가 섞인 한 줄 평문은 제어문자를 지우고 범위를 대체한다(Issue #295 C1·C7)", () => {
      const { editor, editable, tiptap } = setup(baseBlocks(), ...baseRange());
      const beforeJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");
      const pasteText = vi.spyOn(tiptap.view, "pasteText");

      pasteData(editable, {
        "text/plain": `a${String.fromCharCode(1)}b`,
      });

      expect(outline(blocksOf(editor))).toEqual(["p:ababbar", "p:tail"]);
      expect(pasteText).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(() => tiptap.state.doc.check()).not.toThrow();

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
    });

    it("짝 없는 surrogate가 섞인 한 줄 평문도 지우고 범위를 대체한다(Issue #295 C2)", () => {
      const { editor, editable } = setup(baseBlocks(), ...baseRange());

      pasteData(editable, {
        "text/plain": `a${String.fromCharCode(0xd800)}b`,
      });

      expect(outline(blocksOf(editor))).toEqual(["p:ababbar", "p:tail"]);
    });

    it("제어문자만 있는 입력은 이벤트를 소비하고 문서를 바꾸지 않으며 TypeError가 없다(Issue #295 C3)", () => {
      const { editor, editable, tiptap } = setup(baseBlocks(), ...baseRange());
      const before = outline(blocksOf(editor));
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      withUnhandledErrorTracking((errors) => {
        const event = dispatchPasteData(editable, {
          "text/plain": String.fromCharCode(1),
        });

        expect(event.defaultPrevented).toBe(true);
        // 수정 전에는 PM 기본이 raw 제어문자를 넣고 되돌림 guard가 지웠다.
        // transaction 자체가 없어야 위임하지 않은 것이다.
        expect(dispatch).not.toHaveBeenCalled();
        expect(outline(blocksOf(editor))).toEqual(before);
        expect(errors).toEqual([]);
      });
    });

    // 직접 삽입이 null인 모양(TextSelection이 아님)이다. 여러 줄 평문에
    // 무효 문자가 섞이면 정리본이 PM 평문 경로로 간다(Issue #295). 유효한
    // 여러 줄은 PM 기본 위임 그대로다.
    it("codeBlock NodeSelection에 무효 문자가 섞인 여러 줄 평문은 정리본으로 대체한다(Issue #295)", () => {
      const { editor, editable, tiptap } = setup(baseBlocks(), {
        id: "p1",
        offset: 0,
      });
      selectBlockNode(tiptap, "cb");

      pasteData(editable, {
        "text/plain": `X${String.fromCharCode(1)}\nY`,
      });

      expect(outline(blocksOf(editor))).toEqual([
        "p:abcd",
        "p:X",
        "p:Y",
        "p:tail",
      ]);
    });

    it("codeBlock NodeSelection에 유효한 여러 줄 평문은 view.pasteText 없이 PM 기본에 위임한다(Issue #295)", () => {
      const { editor, editable, tiptap } = setup(baseBlocks(), {
        id: "p1",
        offset: 0,
      });
      selectBlockNode(tiptap, "cb");
      const pasteText = vi.spyOn(tiptap.view, "pasteText");

      pasteData(editable, { "text/plain": "X\nY" });

      expect(pasteText).not.toHaveBeenCalled();
      expect(outline(blocksOf(editor))).toEqual([
        "p:abcd",
        "p:X",
        "p:Y",
        "p:tail",
      ]);
    });

    it("AllSelection에 무효 문자가 섞인 여러 줄 평문은 정리본으로 대체한다(Issue #295)", () => {
      const { editor, editable, tiptap } = setup(baseBlocks(), {
        id: "p1",
        offset: 0,
      });
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)),
      );

      pasteData(editable, {
        "text/plain": `X${String.fromCharCode(1)}\nY`,
      });

      expect(outline(blocksOf(editor))).toEqual(["p:X", "p:Y"]);
    });

    it("Markdown 평문은 감지하지 않는다(C12)", () => {
      const { editor, editable } = setup(
        childCodeBlocks(),
        ...childCodeRange(),
      );

      pasteData(editable, { "text/plain": "# H\n\n- a" });

      expect(outline(blocksOf(editor))).toEqual(["p:ab# H[p:- az,p:c2]", "p:"]);
    });

    it("접힌 toggle 안 숨은 codeBlock을 포함한 범위의 여러 줄 평문은 배치만 Enter 규칙이고 숨은 자식은 범위와 함께 지워진다(C14)", () => {
      const { editor, editable } = setup(
        [
          paragraphBlock("p1", "abcd"),
          toggleBlock("t1", "tog", {
            collapsed: true,
            children: [codeBlockBlock("cb", "foobar")],
          }),
          paragraphBlock("tail", "tail"),
        ],
        { id: "p1", offset: 2 },
        { id: "tail", offset: 2 },
      );

      pasteData(editable, { "text/plain": "X\nY" });

      expect(outline(blocksOf(editor))).toEqual(["p:abX", "p:Yil"]);
    });

    it("dispatch 1회, revision +1, undo 1회로 원복된다", () => {
      const { editor, editable, tiptap } = setup(
        childCodeBlocks(),
        ...childCodeRange(),
      );
      const beforeJson = tiptap.state.doc.toJSON();
      const revision = editor.getDocument().revision;
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      pasteData(editable, { "text/plain": "X\nY" });

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(editor.getDocument().revision).toBe(revision + 1);

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
    });
  });

  describe("transaction 계약(C8)", () => {
    // 새 분기가 단일 transaction으로 끝나는 계약을 확인한다. 수정 전 PM
    // 경로도 이 테스트를 통과하므로 가드 완화 변이를 탐지하지 않는다. 변이
    // 탐지는 A·V·서식 테스트가 맡는다.
    it("revision이 1 늘고 undo 1회로 원래 문서가 돌아온다", () => {
      const { editor, editable, tiptap } = setup(baseBlocks(), ...baseRange());
      const before = blocksOf(editor);
      const beforeJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");
      const revision = editor.getDocument().revision;

      pasteHtml(editable, "<p>X</p><p>Y</p>");

      expect(editor.getDocument().revision).toBe(revision + 1);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(outline(blocksOf(editor))).not.toEqual(outline(before));

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
      expect(blocksOf(editor)).toEqual(before);
    });
  });
});
