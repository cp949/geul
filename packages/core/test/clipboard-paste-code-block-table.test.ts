/**
 * 캐럿이나 범위 시작이 codeBlock 안일 때 표 붙여넣기가 물러나는 계약을
 * 고정한다(Issue #298). 수정 전에는 Tab이 든 평문(TSV 모양)과 html 표가
 * TablePasteExtension에 먼저 가로채여 코드 텍스트가 아니라 표 블록이 생겼다.
 * 이 확장이 ClipboardPasteExtension보다 먼저라 #296의 codeBlock 위임이
 * 닿지 않았다.
 *
 * 다루는 축은 선택(S1~S5) × 입력 행렬, 물러남이 거절이 아니라는 계약
 * (onPasteRejected 미호출), 시작이 codeBlock 밖인 선택의 불변 특성화,
 * 물러난 뒤 #296 정리본 계약 유지, transaction 계약, predicate 단위다.
 * 기준 문서는 p1 "abcd", cb "foobar", tail "tail"이다. 선택은 S1 캐럿
 * cb:3, S2 cb:2 ~ tail:2, S3 cb:1 ~ cb:4(시작이 codeBlock 안), S4 p1:2 ~
 * cb:3(시작이 밖), S5 p1:2 캐럿(표 밖 비-codeBlock)이다. S6 cb:6 ~
 * tail:2는 시작이 코드 내용 끝이고 S7은 빈 codeBlock 시작이다. 둘은 `$from`이
 * codeBlock 안이지만 문자 구간이 겹치지 않아, 표 붙여넣기 가드와
 * ClipboardPasteExtension의 codeBlock 분기가 같은 판정을 써야 한다.
 * 실제 브라우저 대표 시나리오는 e2e/clipboard-paste.spec.ts가 맡는다.
 */
import type { Block } from "@cp949/geul-model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { selectionStartsInCodeBlock } from "../src/code-block-mark-guard-extension.js";
import { contentTextStart } from "./block-test-support.js";
import {
  baseBlocks,
  blocksOf,
  outline,
  pasteData,
  setupPasteSelection,
} from "./clipboard-test-support.js";
import {
  codeBlockBlock,
  paragraphBlock,
  selectBlockNode,
  toggleBlock,
} from "./editor-controller-support.js";

const TAB = String.fromCharCode(9);
const SOH = String.fromCharCode(1);

type Point = { id: string; offset: number };
type SelectionCase = { name: string; from: Point; to: Point };

// 시작이 codeBlock 안인 선택. 입력 행렬의 기대값 배열 순서와 같다.
const insideSelections: SelectionCase[] = [
  {
    name: "S1 캐럿 cb:3",
    from: { id: "cb", offset: 3 },
    to: { id: "cb", offset: 3 },
  },
  {
    name: "S2 cb:2 ~ tail:2",
    from: { id: "cb", offset: 2 },
    to: { id: "tail", offset: 2 },
  },
  {
    name: "S3 cb:1 ~ cb:4",
    from: { id: "cb", offset: 1 },
    to: { id: "cb", offset: 4 },
  },
  {
    name: "S6 cb:6 ~ tail:2(시작이 코드 내용 끝)",
    from: { id: "cb", offset: 6 },
    to: { id: "tail", offset: 2 },
  },
];

// 시작이 codeBlock 밖인 선택. 표 붙여넣기가 현행대로 가로챈다.
const S4: SelectionCase = {
  name: "S4 p1:2 ~ cb:3",
  from: { id: "p1", offset: 2 },
  to: { id: "cb", offset: 3 },
};
const S5: SelectionCase = {
  name: "S5 p1:2 캐럿",
  from: { id: "p1", offset: 2 },
  to: { id: "p1", offset: 2 },
};

/**
 * 스프레드시트(Excel)가 복사할 때 실리는 모양이다. text/html에는 2x2 표가,
 * text/plain에는 같은 내용의 TSV가 함께 온다.
 */
const excelData = (): Record<string, string> => ({
  "text/html":
    "<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>",
  "text/plain": `a${TAB}b\nc${TAB}d`,
});

/**
 * 표 셀 수가 상한(10,000)을 넘는 101x101 html 표를 만든다. 표로 인식된 뒤
 * 파서가 거절하므로 수정 전에는 onPasteRejected가 호출됐다.
 */
const oversizedTableHtml = (): string => {
  const cells = Array.from({ length: 101 }, () => "<td>x</td>").join("");
  const rows = Array.from({ length: 101 }, () => `<tr>${cells}</tr>`).join("");
  return `<table><tbody>${rows}</tbody></table>`;
};

/**
 * 기준 문서의 codeBlock·tail 자리에 기대 텍스트를 넣은 outline을 만든다.
 */
const outlineOf = (code: string, tail: string): string[] => [
  "p:abcd",
  `code:${code}`,
  `p:${tail}`,
];

/** 블록 목록에 표 블록이 있는지 본다. */
const hasTable = (blocks: readonly { type: string }[]): boolean =>
  blocks.some((block) => block.type === "table");

type PasteCase = {
  name: string;
  data: Record<string, string>;
  expected: [string[], string[], string[], string[]];
};

// S2·S6은 범위 끝 블록(tail)이 codeBlock에 합쳐져 빈 문단이 남는다.
const tabularCases: PasteCase[] = [
  {
    name: "Tab 한 줄 평문 a⇥b",
    data: { "text/plain": `a${TAB}b` },
    expected: [
      outlineOf(`fooa${TAB}bbar`, "tail"),
      outlineOf(`foa${TAB}bil`, ""),
      outlineOf(`fa${TAB}bar`, "tail"),
      outlineOf(`foobara${TAB}bil`, ""),
    ],
  },
  {
    name: "탭 들여쓰기 코드 평문(모든 줄 탭 수가 같음)",
    data: { "text/plain": `${TAB}foo\n${TAB}bar` },
    expected: [
      outlineOf(`foo${TAB}foo\n${TAB}barbar`, "tail"),
      outlineOf(`fo${TAB}foo\n${TAB}baril`, ""),
      outlineOf(`f${TAB}foo\n${TAB}barar`, "tail"),
      outlineOf(`foobar${TAB}foo\n${TAB}baril`, ""),
    ],
  },
  {
    name: "html 표와 TSV 평문이 함께 오는 스프레드시트 복사",
    data: excelData(),
    expected: [
      outlineOf(`fooa${TAB}b\nc${TAB}dbar`, "tail"),
      outlineOf(`foa${TAB}b\nc${TAB}dil`, ""),
      outlineOf(`fa${TAB}b\nc${TAB}dar`, "tail"),
      outlineOf(`foobara${TAB}b\nc${TAB}dil`, ""),
    ],
  },
];

describe("codeBlock 안 붙여넣기에서 표 붙여넣기가 물러난다(Issue #298)", () => {
  describe.each(
    insideSelections.map((selection, index) => ({ selection, index })),
  )("$selection.name", ({ selection, index }) => {
    /** 이 describe의 선택(S1~S3·S6)으로 기준 문서를 마운트한다. */
    const mount = (overrides: Parameters<typeof setupPasteSelection>[3] = {}) =>
      setupPasteSelection(
        baseBlocks(),
        selection.from,
        selection.to,
        overrides,
      );

    it.each(tabularCases)(
      "$name 입력은 표 없이 코드 텍스트로 들어간다(C1·C2·C3)",
      ({ data, expected }) => {
        const { editor, editable, tiptap } = mount();

        pasteData(editable, data);

        expect(hasTable(blocksOf(editor))).toBe(false);
        expect(outline(blocksOf(editor))).toEqual(expected[index]);
        expect(() => tiptap.state.doc.check()).not.toThrow();
      },
    );

    it.each(tabularCases)(
      "$name 입력은 onPasteRejected를 부르지 않는다(물러남은 거절이 아니다)",
      ({ data }) => {
        const rejections: unknown[] = [];
        const { editable } = mount({
          onPasteRejected: (reason) => rejections.push(reason),
        });

        pasteData(editable, data);

        expect(rejections).toEqual([]);
      },
    );

    it.each(tabularCases)(
      "$name 입력은 view.pasteText 없이 PM 기본에 위임한다(C7)",
      ({ data }) => {
        const { editable, tiptap } = mount();
        const pasteText = vi.spyOn(tiptap.view, "pasteText");

        pasteData(editable, data);

        expect(pasteText).not.toHaveBeenCalled();
      },
    );

    it.each(tabularCases)(
      "$name 입력은 dispatch·undo가 각각 1회이고 문서가 유효하다(C8)",
      ({ data }) => {
        const { editor, editable, tiptap } = mount();
        const beforeJson = tiptap.state.doc.toJSON();
        const revision = editor.getDocument().revision;
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        pasteData(editable, data);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(editor.getDocument().revision).toBe(revision + 1);
        expect(() => tiptap.state.doc.check()).not.toThrow();
        expect(() => editor.getDocument()).not.toThrow();

        tiptap.commands.undo();
        expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
      },
    );

    it("Tab이 든 평문에 무효 문자가 섞이면 #296 정리본이 들어가고 Tab이 남는다(C7)", () => {
      const { editor, editable, tiptap } = mount();
      const pasteText = vi.spyOn(tiptap.view, "pasteText");

      pasteData(editable, { "text/plain": `a${TAB}b${SOH}` });

      expect(outline(blocksOf(editor))).toEqual(
        tabularCases[0]?.expected[index],
      );
      expect(pasteText).toHaveBeenCalledTimes(1);
    });
  });

  describe("html 표만 있는 입력(평탄화 한계의 특성화)", () => {
    it("S1에서 표 없이 셀 텍스트가 탭 없이 이어 붙은 코드 텍스트가 된다(C4)", () => {
      const { editor, editable } = setupPasteSelection(baseBlocks(), {
        id: "cb",
        offset: 3,
      });

      pasteData(editable, { "text/html": excelData()["text/html"] ?? "" });

      expect(hasTable(blocksOf(editor))).toBe(false);
      expect(outline(blocksOf(editor))).toEqual(
        outlineOf("fooabcdbar", "tail"),
      );
    });
  });

  describe("표 셀 수 상한을 넘는 html(물러남은 거절이 아니다)", () => {
    it("S1에서 onPasteRejected를 부르지 않고 표가 생기지 않는다(C5)", () => {
      const rejections: unknown[] = [];
      const { editor, editable, tiptap } = setupPasteSelection(
        baseBlocks(),
        { id: "cb", offset: 3 },
        { id: "cb", offset: 3 },
        { onPasteRejected: (reason) => rejections.push(reason) },
      );

      pasteData(editable, { "text/html": oversizedTableHtml() });

      expect(rejections).toEqual([]);
      expect(hasTable(blocksOf(editor))).toBe(false);
      expect(() => tiptap.state.doc.check()).not.toThrow();
    });
  });

  describe("시작이 코드 내용 끝인 범위(S6)와 빈 codeBlock 시작 범위(S7)", () => {
    it("S6에서 셀 수 상한을 넘는 html도 onPasteRejected를 부르지 않고 표가 생기지 않는다", () => {
      const rejections: unknown[] = [];
      const { editor, editable, tiptap } = setupPasteSelection(
        baseBlocks(),
        { id: "cb", offset: 6 },
        { id: "tail", offset: 2 },
        { onPasteRejected: (reason) => rejections.push(reason) },
      );

      pasteData(editable, { "text/html": oversizedTableHtml() });

      expect(rejections).toEqual([]);
      expect(hasTable(blocksOf(editor))).toBe(false);
      expect(() => tiptap.state.doc.check()).not.toThrow();
    });

    it.each([
      { name: "Tab 한 줄 평문", data: { "text/plain": `a${TAB}b` } },
      { name: "스프레드시트 복사", data: excelData() },
    ])(
      "S7: $name 입력은 빈 codeBlock 시작 범위에서 표 없이 코드 텍스트가 된다",
      ({ data }) => {
        const { editor, editable, tiptap } = setupPasteSelection(
          [
            paragraphBlock("p1", "abcd"),
            codeBlockBlock("cb", ""),
            paragraphBlock("tail", "tail"),
          ],
          { id: "cb", offset: 0 },
          { id: "tail", offset: 2 },
        );

        pasteData(editable, data);

        expect(hasTable(blocksOf(editor))).toBe(false);
        expect(outline(blocksOf(editor))[1]).toMatch(/^code:a\tb/);
        expect(() => tiptap.state.doc.check()).not.toThrow();
      },
    );
  });

  describe("pasteHandler는 codeBlock 안 표 모양 입력에도 호출된다(F3)", () => {
    it("S1에서 Tab 한 줄 평문이 pasteHandler로 1회 전달되고 표가 생기지 않는다", () => {
      const calls: unknown[] = [];
      const { editor, editable } = setupPasteSelection(
        baseBlocks(),
        { id: "cb", offset: 3 },
        { id: "cb", offset: 3 },
        {
          pasteHandler: (context) => {
            calls.push(context);
            return true;
          },
        },
      );

      pasteData(editable, { "text/plain": `a${TAB}b` });

      expect(calls).toHaveLength(1);
      expect(hasTable(blocksOf(editor))).toBe(false);
      expect(outline(blocksOf(editor))).toEqual(outlineOf("foobar", "tail"));
    });
  });

  // 시작이 codeBlock 밖인 선택은 이 이슈 범위 밖이라 현행(표)을 유지한다.
  // 가드를 넓히는 변이(M3)를 S4에서 탐지한다.
  describe("시작이 codeBlock 밖인 선택은 현행과 같다(특성화, C6)", () => {
    it.each([S4, S5])("$name: Tab 한 줄 평문이 표를 만든다", (selection) => {
      const { editor, editable } = setupPasteSelection(
        baseBlocks(),
        selection.from,
        selection.to,
      );

      pasteData(editable, { "text/plain": `a${TAB}b` });

      expect(hasTable(blocksOf(editor))).toBe(true);
    });

    it("S4의 Tab 한 줄 평문은 범위를 지운 뒤 표를 넣는다", () => {
      const { editor, editable } = setupPasteSelection(
        baseBlocks(),
        S4.from,
        S4.to,
      );

      pasteData(editable, { "text/plain": `a${TAB}b` });

      expect(outline(blocksOf(editor))).toEqual([
        "p:abbar",
        "table:",
        "p:tail",
      ]);
    });

    it("S5의 Tab 한 줄 평문은 문단 뒤에 표를 넣고 codeBlock은 그대로다", () => {
      const { editor, editable } = setupPasteSelection(
        baseBlocks(),
        S5.from,
        S5.to,
      );

      pasteData(editable, { "text/plain": `a${TAB}b` });

      expect(outline(blocksOf(editor))).toEqual([
        "p:abcd",
        "table:",
        "code:foobar",
        "p:tail",
      ]);
    });

    it.each([S4, S5])(
      "$name: 스프레드시트 복사(html 표 + TSV)가 표를 만든다",
      (selection) => {
        const { editor, editable } = setupPasteSelection(
          baseBlocks(),
          selection.from,
          selection.to,
        );

        pasteData(editable, excelData());

        expect(hasTable(blocksOf(editor))).toBe(true);
      },
    );

    it.each([S4, S5])(
      "$name: 셀 수 상한을 넘는 html은 onPasteRejected로 거절된다",
      (selection) => {
        const rejections: unknown[] = [];
        const { editor, editable } = setupPasteSelection(
          baseBlocks(),
          selection.from,
          selection.to,
          { onPasteRejected: (reason) => rejections.push(reason) },
        );

        pasteData(editable, { "text/html": oversizedTableHtml() });

        expect(rejections).toHaveLength(1);
        expect(rejections[0]).toMatchObject({
          code: "CLIPBOARD_TABLE_INVALID",
        });
        expect(hasTable(blocksOf(editor))).toBe(false);
      },
    );
  });

  describe("NodeSelection은 $from이 문서 쪽이라 현행(표)을 유지한다(특성화)", () => {
    it("codeBlock NodeSelection에서 Tab 한 줄 평문이 표를 만든다", () => {
      const { editor, editable, tiptap } = setupPasteSelection(baseBlocks(), {
        id: "p1",
        offset: 0,
      });
      selectBlockNode(tiptap, "cb");

      pasteData(editable, { "text/plain": `a${TAB}b` });

      expect(hasTable(blocksOf(editor))).toBe(true);
    });
  });

  describe("selectionStartsInCodeBlock 단위(C9)", () => {
    /**
     * 문서를 마운트하고 캐럿을 둔 tiptap 인스턴스를 돌려준다.
     * predicate 단위 테스트가 selection만 필요할 때 쓴다.
     */
    const stateOf = (blocks: Block[], at: Point) =>
      setupPasteSelection(blocks, at).tiptap;

    it("캐럿이 codeBlock 안이면 참이다", () => {
      const tiptap = stateOf(baseBlocks(), { id: "cb", offset: 3 });

      expect(selectionStartsInCodeBlock(tiptap.state.selection)).toBe(true);
    });

    it("범위 시작이 codeBlock 안이면 끝이 밖이어도 참이다", () => {
      const { tiptap } = setupPasteSelection(
        baseBlocks(),
        { id: "cb", offset: 2 },
        { id: "tail", offset: 2 },
      );

      expect(selectionStartsInCodeBlock(tiptap.state.selection)).toBe(true);
    });

    it("범위 시작이 codeBlock 밖이면 끝이 안이어도 거짓이다", () => {
      const { tiptap } = setupPasteSelection(
        baseBlocks(),
        { id: "p1", offset: 2 },
        { id: "cb", offset: 3 },
      );

      expect(selectionStartsInCodeBlock(tiptap.state.selection)).toBe(false);
    });

    it("표 밖 비-codeBlock 캐럿은 거짓이다", () => {
      const tiptap = stateOf(baseBlocks(), { id: "p1", offset: 2 });

      expect(selectionStartsInCodeBlock(tiptap.state.selection)).toBe(false);
    });

    it("빈 문단 캐럿은 거짓이다", () => {
      const tiptap = stateOf([paragraphBlock("empty", "")], {
        id: "empty",
        offset: 0,
      });

      expect(selectionStartsInCodeBlock(tiptap.state.selection)).toBe(false);
    });

    it("codeBlock NodeSelection은 $from이 문서 쪽이라 거짓이다", () => {
      const tiptap = stateOf(baseBlocks(), { id: "p1", offset: 0 });
      selectBlockNode(tiptap, "cb");

      expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
      expect(selectionStartsInCodeBlock(tiptap.state.selection)).toBe(false);
    });

    it("접힌 toggle 안 숨은 codeBlock의 캐럿도 참이다", () => {
      const tiptap = stateOf(
        [
          toggleBlock("t1", "tog", {
            collapsed: true,
            children: [codeBlockBlock("cb", "foobar")],
          }),
        ],
        { id: "t1", offset: 0 },
      );
      // selection 가드(appendTransaction)를 거치지 않도록 dispatch 없이 직접 만든다.
      const hidden = TextSelection.create(
        tiptap.state.doc,
        contentTextStart(tiptap, "cb") + 3,
      );

      expect(selectionStartsInCodeBlock(hidden)).toBe(true);
    });
  });
});
