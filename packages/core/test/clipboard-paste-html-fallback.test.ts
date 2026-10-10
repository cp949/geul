/**
 * text/html이 블록을 만들지 못하면 같은 클립보드의 text/plain으로 폴백하는
 * 계약을 고정한다(Issue #287). 블록 0개(`<meta>`만 있는 html)와 import 실패
 * (위험 URL)가 대상이다. 둘 다 예전에는 붙여넣기가 조용히 사라졌다.
 *
 * 다루는 축은 경로별 폴백(캐럿·범위·codeBlock에 걸친 범위), 폴백 입력 종류
 * (한 줄·여러 줄·Markdown·무효 제어문자 평문), html 우선 대조군(의미 있는
 * 블록·빈 문단), 평문도 빈 경우의 소비, pasteHandler 위임 호스트, transaction
 * 계약(revision·undo)이다. 입력은 mock 없이 실입력으로 유발한다. 폴백 결과는
 * text/plain만 있는 클립보드와 같아야 한다.
 */
import type { Block } from "@cp949/geul-model";
import { Transaction } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  blocksOf,
  childCodeBlocks,
  outline,
  pasteData,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
  sequentialIds,
} from "./editor-controller-support.js";

// 블록을 만들지 못하는 html. importHtml은 ok이고 블록이 0개라 modelToTiptap이
// DOCUMENT_INVALID로 거절한다.
const EMPTY_RESULT_HTML = "<meta charset='utf-8'>";

// import 자체가 실패하는 html. 위험 URL은 import하지 않는 계약이다. pre 글자의
// 무효 문자와 무효 language 후보는 지우고 가져오므로 여기에 두지 않는다
// (Issue #352, #353).
const IMPORT_FAILURE_HTMLS = [
  ["위험 URL 이미지", "<img src='javascript:x'>"],
] as const;

type Position = { id: string; offset: number };

// 문서를 마운트하고 시작·끝 블록의 텍스트 offset으로 범위를 만든다. 끝이
// 시작과 같으면 캐럿이다. delegate가 true면 호스트 pasteHandler가
// defaultPasteHandler() 결과를 results에 기록하고 PM 기본 처리를 막는다(C10).
const setup = (
  blocks: Block[],
  from: Position,
  to: Position = from,
  delegate = false,
) => {
  const results: boolean[] = [];
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
    ...(delegate
      ? {
          pasteHandler: (context: {
            defaultPasteHandler: () => boolean;
          }): boolean => {
            results.push(context.defaultPasteHandler());
            return true;
          },
        }
      : {}),
  });
  const { editable, tiptap } = mountTiptapEditor(editor);
  editable.focus();
  tiptap.commands.setTextSelection({
    from: contentTextStart(tiptap, from.id) + from.offset,
    to: contentTextStart(tiptap, to.id) + to.offset,
  });
  return { editor, editable, tiptap, results };
};

// 기준 문서: p1 "abcd", tail "tail".
const abcdAndTail = (): Block[] => [
  paragraphBlock("p1", "abcd"),
  paragraphBlock("tail", "tail"),
];

// 기준 문서에 codeBlock을 끼운다: p1 "abcd", codeBlock cb "foobar", tail "tail".
const withCodeBlock = (): Block[] => [
  paragraphBlock("p1", "abcd"),
  codeBlockBlock("cb", "foobar"),
  paragraphBlock("tail", "tail"),
];

const CARET: Position = { id: "p1", offset: 2 };
const RANGE_END: Position = { id: "tail", offset: 2 };
const CODE_RANGE_END: Position = { id: "cb", offset: 3 };

// 같은 문서·선택에 클립보드를 붙여넣고 결과 outline을 돌려준다.
const pasteOutline = (
  blocks: Block[],
  from: Position,
  to: Position,
  clipboard: Record<string, string>,
): string[] => {
  const { editor, editable } = setup(blocks, from, to);
  pasteData(editable, clipboard);
  return outline(blocksOf(editor));
};

describe("html이 블록을 만들지 못할 때의 평문 폴백(Issue #287)", () => {
  describe("캐럿(C1)", () => {
    it("빈 결과 html과 한 줄 평문은 text/plain만 있는 클립보드와 같은 결과다", () => {
      const withHtml = pasteOutline(abcdAndTail(), CARET, CARET, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "Q",
      });
      const plainOnly = pasteOutline(abcdAndTail(), CARET, CARET, {
        "text/plain": "Q",
      });

      expect(withHtml).toEqual(["p:abQcd", "p:tail"]);
      expect(withHtml).toEqual(plainOnly);
    });

    it("무효 제어문자가 낀 평문은 문자를 지운 뒤 붙는다", () => {
      const outlineOf = pasteOutline(abcdAndTail(), CARET, CARET, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "Q\u0001",
      });

      expect(outlineOf).toEqual(["p:abQcd", "p:tail"]);
    });
  });

  describe("범위(C2)", () => {
    it("범위가 지워지고 평문이 들어가며 text/plain만 있는 클립보드와 결과가 같다", () => {
      const withHtml = pasteOutline(abcdAndTail(), CARET, RANGE_END, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "Q",
      });
      const plainOnly = pasteOutline(abcdAndTail(), CARET, RANGE_END, {
        "text/plain": "Q",
      });

      expect(withHtml).toEqual(["p:abQil"]);
      expect(withHtml).toEqual(plainOnly);
    });
  });

  describe("codeBlock에 걸친 범위, 시작이 codeBlock 밖(C3)", () => {
    it("범위가 지워지고 평문이 들어가며 text/plain만 있는 클립보드와 결과가 같다", () => {
      const withHtml = pasteOutline(withCodeBlock(), CARET, CODE_RANGE_END, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "Q",
      });
      const plainOnly = pasteOutline(withCodeBlock(), CARET, CODE_RANGE_END, {
        "text/plain": "Q",
      });

      expect(withHtml).toEqual(["p:abQbar", "p:tail"]);
      expect(withHtml).toEqual(plainOnly);
    });

    it("import 실패 html도 같은 결과다", () => {
      const outlineOf = pasteOutline(withCodeBlock(), CARET, CODE_RANGE_END, {
        "text/html": "<img src='javascript:x'>",
        "text/plain": "Q",
      });

      expect(outlineOf).toEqual(["p:abQbar", "p:tail"]);
    });

    it("무효 제어문자가 낀 평문은 문자를 지운 뒤 붙는다", () => {
      const outlineOf = pasteOutline(withCodeBlock(), CARET, CODE_RANGE_END, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "Q\u0001",
      });

      expect(outlineOf).toEqual(["p:abQbar", "p:tail"]);
    });

    it("제거 후 빈 평문이면 문서가 그대로이고 이벤트는 소비된다", () => {
      const { editor, editable, results } = setup(
        withCodeBlock(),
        CARET,
        CODE_RANGE_END,
        true,
      );
      const before = editor.getDocument();

      pasteData(editable, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "\u0001",
      });

      expect(results).toEqual([true]);
      expect(editor.getDocument()).toEqual(before);
    });
  });

  // 범위 끝 뒤에 자식이 남는 모양에서 여러 줄 폴백은 직접 삽입이다(Issue
  // #285). PM 기본 처리는 그 자식을 마지막 줄 블록으로 넘긴다. 한 줄 폴백은
  // 직접 삽입하지 않고 PM 평문 경로(pasteText) 그대로다.
  describe("codeBlock에 걸친 범위의 폴백, 자식이 남는 모양(Issue #285 C13)", () => {
    // D2는 childCodeBlocks()다. 범위는 p1 "ab" 뒤 → code "xy" 뒤.
    const CHILD_CODE_END: Position = { id: "cb", offset: 2 };

    it("빈 결과 html과 여러 줄 평문은 c2가 마지막 줄 블록 소속으로 넘어가지 않는다", () => {
      const withHtml = pasteOutline(childCodeBlocks(), CARET, CHILD_CODE_END, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "X\nY",
      });
      const plainOnly = pasteOutline(childCodeBlocks(), CARET, CHILD_CODE_END, {
        "text/plain": "X\nY",
      });

      expect(withHtml).toEqual(["p:abX[p:Yz,p:c2]", "p:"]);
      expect(withHtml).toEqual(plainOnly);
    });

    it("import 실패 html도 같은 결과다", () => {
      const outlineOf = pasteOutline(childCodeBlocks(), CARET, CHILD_CODE_END, {
        "text/html": "<img src='javascript:x'>",
        "text/plain": "X\nY",
      });

      expect(outlineOf).toEqual(["p:abX[p:Yz,p:c2]", "p:"]);
    });

    it("한 줄 폴백은 직접 삽입하지 않고 PM 평문 경로 그대로다", () => {
      const insertText = vi.spyOn(Transaction.prototype, "insertText");

      try {
        const withHtml = pasteOutline(
          childCodeBlocks(),
          CARET,
          CHILD_CODE_END,
          {
            "text/html": EMPTY_RESULT_HTML,
            "text/plain": "Q",
          },
        );
        const plainOnly = pasteOutline(
          childCodeBlocks(),
          CARET,
          CHILD_CODE_END,
          { "text/plain": "Q" },
        );

        expect(insertText).not.toHaveBeenCalled();
        expect(withHtml).toEqual(plainOnly);
        expect(withHtml).toEqual(["p:abQz[p:c2]", "p:"]);
      } finally {
        insertText.mockRestore();
      }
    });
  });

  describe("import 실패(C4)", () => {
    it.each(IMPORT_FAILURE_HTMLS)(
      "%s html은 문서에 들어오지 않고 평문만 붙는다",
      (_label, html) => {
        const { editor, editable } = setup(abcdAndTail(), CARET);

        pasteData(editable, { "text/html": html, "text/plain": "Q" });

        expect(outline(blocksOf(editor))).toEqual(["p:abQcd", "p:tail"]);
        const serialized = JSON.stringify(editor.getDocument());
        expect(serialized).not.toContain("javascript:");
        expect(serialized).not.toContain("\\u0001");
      },
    );

    it.each(IMPORT_FAILURE_HTMLS)(
      "%s html과 빈 평문이면 문서가 그대로이고 이벤트는 소비된다",
      (_label, html) => {
        const { editor, editable, results } = setup(
          abcdAndTail(),
          CARET,
          CARET,
          true,
        );
        const before = editor.getDocument();

        pasteData(editable, { "text/html": html });

        expect(results).toEqual([true]);
        expect(editor.getDocument()).toEqual(before);
      },
    );
  });

  describe("pre 글자의 무효 문자(Issue #352)", () => {
    it("pre 안 제어문자는 지우고 codeBlock으로 붙고 평문은 쓰지 않는다", () => {
      const { editor, editable } = setup(abcdAndTail(), CARET);

      pasteData(editable, {
        "text/html": "<pre>a\u0001b</pre>",
        "text/plain": "Q",
      });

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        "code:ab",
        "p:cd",
        "p:tail",
      ]);
      expect(JSON.stringify(editor.getDocument())).not.toContain("\\u0001");
    });
  });

  describe("무효 language 후보(Issue #353)", () => {
    it("무효 data-language만 든 pre는 language 없는 codeBlock으로 붙고 평문은 쓰지 않는다", () => {
      const { editor, editable } = setup(abcdAndTail(), CARET);

      pasteData(editable, {
        "text/html": '<pre data-language="bad&#x7f;">x</pre>',
        "text/plain": "Q",
      });

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        "code:x",
        "p:cd",
        "p:tail",
      ]);
      expect(JSON.stringify(editor.getDocument())).not.toContain('"language"');
    });
  });

  describe("html 우선 대조군(C5)", () => {
    it("의미 있는 블록을 만드는 html은 평문을 쓰지 않는다", () => {
      const { editor, editable } = setup(abcdAndTail(), CARET);

      pasteData(editable, { "text/html": "<p>hi</p>", "text/plain": "Q" });

      const serialized = JSON.stringify(editor.getDocument());
      expect(serialized).toContain("hi");
      expect(serialized).not.toContain('"Q"');
    });

    // 빈 문단 하나도 의미 있는 html이라 평문으로 폴백하지 않는다. 빈 줄 복사가
    // 빈 문단을 넣는 동작을 지킨다. 문단 내용은 import 결과 그대로다. 공백뿐인
    // 문단은 importHtml이 소스 공백을 접어(Issue #320) 빈 문단이 된다.
    it.each([
      ["<p></p>", "p:"],
      ["<p><br></p>", "p:\n"],
      ["<p> </p>", "p:"],
    ])("빈 문단 %s는 html 우선이라 평문을 쓰지 않는다", (html, pasted) => {
      const { editor, editable, results } = setup(
        abcdAndTail(),
        CARET,
        CARET,
        true,
      );

      pasteData(editable, { "text/html": html, "text/plain": "Q" });

      expect(results).toEqual([true]);
      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        pasted,
        "p:cd",
        "p:tail",
      ]);
      expect(JSON.stringify(editor.getDocument())).not.toContain('"Q"');
    });
  });

  describe("text 분기 규칙 보존(C6)", () => {
    it("비코드 캐럿의 Markdown 평문은 감지해 블록으로 넣는다", () => {
      const withHtml = pasteOutline(abcdAndTail(), CARET, CARET, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "# H\n\n- a",
      });
      const plainOnly = pasteOutline(abcdAndTail(), CARET, CARET, {
        "text/plain": "# H\n\n- a",
      });

      expect(withHtml).toEqual(plainOnly);
      expect(withHtml.some((line) => line.startsWith("h1:H"))).toBe(true);
      expect(withHtml.some((line) => line.startsWith("ul:a"))).toBe(true);
    });

    it("비코드 범위의 Markdown 평문도 감지한다", () => {
      const withHtml = pasteOutline(abcdAndTail(), CARET, RANGE_END, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "# H\n\n- a",
      });
      const plainOnly = pasteOutline(abcdAndTail(), CARET, RANGE_END, {
        "text/plain": "# H\n\n- a",
      });

      expect(withHtml).toEqual(plainOnly);
      expect(withHtml.some((line) => line.startsWith("h1:H"))).toBe(true);
    });

    it("여러 줄 평문은 Enter 분할과 같은 규칙으로 직접 배치한다", () => {
      const withHtml = pasteOutline(abcdAndTail(), CARET, CARET, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "X\nY",
      });

      expect(withHtml).toEqual(["p:abX", "p:Ycd", "p:tail"]);
    });

    it("codeBlock에 걸친 범위의 Markdown 평문은 감지하지 않고 리터럴 문단으로 넣는다", () => {
      const withHtml = pasteOutline(withCodeBlock(), CARET, CODE_RANGE_END, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "# H\n\n- a\n- b",
      });
      const plainOnly = pasteOutline(withCodeBlock(), CARET, CODE_RANGE_END, {
        "text/plain": "# H\n\n- a\n- b",
      });

      expect(withHtml).toEqual(["p:ab# H", "p:- a", "p:- bbar", "p:tail"]);
      expect(withHtml).toEqual(plainOnly);
    });

    it("codeBlock에 걸친 범위의 여러 줄 평문은 형제로 배치한다", () => {
      const withHtml = pasteOutline(withCodeBlock(), CARET, CODE_RANGE_END, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "X\nY",
      });
      const plainOnly = pasteOutline(withCodeBlock(), CARET, CODE_RANGE_END, {
        "text/plain": "X\nY",
      });

      expect(withHtml).toEqual(["p:abX", "p:Ybar", "p:tail"]);
      expect(withHtml).toEqual(plainOnly);
    });
  });

  describe("평문도 빈 경우(C7)", () => {
    it("빈 결과 html과 빈 평문이면 문서가 그대로이고 이벤트는 소비된다", () => {
      const { editor, editable, results } = setup(
        abcdAndTail(),
        CARET,
        CARET,
        true,
      );
      const before = editor.getDocument();

      pasteData(editable, { "text/html": EMPTY_RESULT_HTML });

      expect(results).toEqual([true]);
      expect(editor.getDocument()).toEqual(before);
    });

    it("html이 없고 평문도 비어 있으면 현행대로 PM에 위임한다(false)", () => {
      const { editor, editable, results } = setup(
        abcdAndTail(),
        CARET,
        CARET,
        true,
      );
      const before = editor.getDocument();

      pasteData(editable, { "text/plain": "" });

      expect(results).toEqual([false]);
      expect(editor.getDocument()).toEqual(before);
    });
  });

  describe("transaction 계약(C8)", () => {
    it.each([
      ["캐럿", CARET],
      ["범위", RANGE_END],
    ])("%s 폴백은 revision이 1 늘고 undo 1회로 복원된다", (_label, to) => {
      const { editor, editable, tiptap } = setup(abcdAndTail(), CARET, to);
      const before = blocksOf(editor);
      const beforeJson = tiptap.state.doc.toJSON();
      const revision = editor.getDocument().revision;

      pasteData(editable, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "Q",
      });

      expect(editor.getDocument().revision).toBe(revision + 1);
      expect(outline(blocksOf(editor))).not.toEqual(outline(before));

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
      expect(blocksOf(editor)).toEqual(before);
    });

    it("codeBlock에 걸친 범위 폴백도 revision이 1 늘고 undo 1회로 복원된다", () => {
      const { editor, editable, tiptap } = setup(
        withCodeBlock(),
        CARET,
        CODE_RANGE_END,
      );
      const before = blocksOf(editor);
      const beforeJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");
      const revision = editor.getDocument().revision;

      pasteData(editable, {
        "text/html": EMPTY_RESULT_HTML,
        "text/plain": "Q",
      });

      expect(editor.getDocument().revision).toBe(revision + 1);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(outline(blocksOf(editor))).not.toEqual(outline(before));

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
      expect(blocksOf(editor)).toEqual(before);
    });
  });

  describe("pasteHandler 위임 호스트(C10)", () => {
    it("defaultPasteHandler()로 위임해도 같은 폴백을 받고 true를 돌려받는다", () => {
      const { editor, editable, results } = setup(
        abcdAndTail(),
        CARET,
        CARET,
        true,
      );

      withUnhandledErrorTracking((errors) => {
        pasteData(editable, {
          "text/html": EMPTY_RESULT_HTML,
          "text/plain": "Q",
        });

        expect(results).toEqual([true]);
        expect(outline(blocksOf(editor))).toEqual(["p:abQcd", "p:tail"]);
        expect(errors).toEqual([]);
      });
    });
  });
});
