/**
 * 표 밖 Ctrl+Shift+V(서식 없이 붙여넣기)가 text/plain만 넣는 계약을 고정한다
 * (Issue #303). 수정 전에는 Shift를 눌러도 defaultHandlePaste가
 * event.clipboardData의 text/html을 직접 읽어 서식을 넣었다. 이제 PM이
 * transformPasted 3번째 인자로 알려 주는 평문 요청을 읽어 text/html 분기를
 * 건너뛴다. view.input은 PM 비공개라 구현이 쓰지 않는다. 테스트는 Shift를
 * keydown 이벤트(keyCode 16·45)로 만든다.
 *
 * 다루는 축은 기준 입력(캐럿·범위·다블록 html), codeBlock에 걸친 범위,
 * 여러 줄·무효 문자·Markdown 평문, html만 있는 클립보드, Shift+Insert,
 * pasteHandler 호출 계약, 플래그 수명(Shift 뒤 일반 붙여넣기·표 html 소비 뒤·
 * pasteText 재진입 뒤), 의도한 한계(표 형태 html), transaction 계약이다.
 *
 * 표 셀 안 Ctrl+Shift+V는 clipboard-paste-table-cell.test.ts가, 실제 브라우저
 * 동작은 e2e/clipboard-paste.spec.ts가 맡는다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";

import type { CreateEditorOptions } from "../src/index.js";
import { expectSchemaValid } from "./block-join/block-join-test-support.js";
import {
  baseBlocks,
  blocksOf,
  outline,
  pasteData,
  runsOf,
  setupPasteSelection,
} from "./clipboard-test-support.js";
import { contentTextStart } from "./block-test-support.js";
import { paragraphBlock } from "./editor-controller-support.js";

const SOH = String.fromCharCode(1);
const KEY_SHIFT = 16;
const KEY_INSERT = 45;

// 문단 p1 "ab" 뒤에 tail이 있는 기준 문서다.
const abAndTail = (): Block[] => [
  paragraphBlock("p1", "ab"),
  paragraphBlock("tail", "tail"),
];

// 캐럿을 p1 끝에 둔다.
const caretAtEnd = (
  overrides: Pick<CreateEditorOptions, "pasteHandler"> = {},
) =>
  setupPasteSelection(
    abAndTail(),
    { id: "p1", offset: 2 },
    undefined,
    overrides,
  );

// Ctrl+Shift+V다. PM은 Shift keydown으로 view.input.shiftKey를 켠다.
const pressShift = (editable: HTMLElement): void => {
  editable.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Shift",
      keyCode: KEY_SHIFT,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    } as KeyboardEventInit),
  );
};

const releaseShift = (editable: HTMLElement): void => {
  editable.dispatchEvent(
    new KeyboardEvent("keyup", {
      key: "Shift",
      keyCode: KEY_SHIFT,
      bubbles: true,
      cancelable: true,
    } as KeyboardEventInit),
  );
};

// Shift+Insert다. PM은 lastKeyCode 45일 때 Shift여도 평문이 아니라고 본다.
const pressShiftInsert = (editable: HTMLElement): void => {
  editable.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Insert",
      keyCode: KEY_INSERT,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    } as KeyboardEventInit),
  );
};

// Shift를 누른 채 붙여넣는다.
const shiftPaste = (
  editable: HTMLElement,
  entries: Record<string, string>,
): void => {
  pressShift(editable);
  pasteData(editable, entries);
};

// PM의 doPaste를 거치지 않고 handlePaste 체인만 직접 부른다. PM은 평소 doPaste
// 마다 transformPasted를 먼저 불러 평문 요청을 덮어쓴다. 이 helper는 그 덮어쓰기
// 없이 이전 붙여넣기가 남긴 상태만 본다.
const callHandlePaste = (
  tiptap: TiptapEditor,
  entries: Record<string, string>,
): boolean => {
  const data = new DataTransfer();
  for (const [format, value] of Object.entries(entries))
    data.setData(format, value);
  const event = new ClipboardEvent("paste", {
    clipboardData: data,
    bubbles: true,
    cancelable: true,
  });
  return (
    tiptap.view.someProp("handlePaste", (handler) =>
      handler(tiptap.view, event, Slice.empty),
    ) === true
  );
};

const BOLD_X = { "text/html": "<b>x</b>", "text/plain": "a" };

describe("표 밖 서식 없이 붙여넣기(Issue #303)", () => {
  describe("기준 입력(C1~C3)", () => {
    it("Shift 없이 같은 입력은 html의 bold x를 다음 블록으로 가져온다(현행)", () => {
      const { editor, editable } = caretAtEnd();

      pasteData(editable, BOLD_X);

      expect(outline(blocksOf(editor))).toEqual(["p:ab", "p:x", "p:tail"]);
      expect(runsOf(blocksOf(editor)[1])).toEqual([
        { text: "x", marks: [{ type: "bold" }] },
      ]);
    });

    it("Shift + html + 평문은 캐럿에 평문만 넣고 서식이 없다(C1)", () => {
      const { editor, editable } = caretAtEnd();

      shiftPaste(editable, BOLD_X);

      expect(outline(blocksOf(editor))).toEqual(["p:aba", "p:tail"]);
      expect(runsOf(blocksOf(editor)[0])).toEqual([{ text: "aba" }]);
    });

    it("Shift + 다블록 html + 평문은 heading을 만들지 않고 평문만 넣는다(C2)", () => {
      const { editor, editable } = caretAtEnd();

      shiftPaste(editable, {
        "text/html": "<h1>H</h1><p>b</p>",
        "text/plain": "ab",
      });

      expect(outline(blocksOf(editor))).toEqual(["p:abab", "p:tail"]);
    });

    it("Shift + html + 비어 있지 않은 범위는 범위를 평문으로 대체한다(C3)", () => {
      const { editor, editable } = setupPasteSelection(
        abAndTail(),
        { id: "p1", offset: 1 },
        { id: "p1", offset: 2 },
      );

      shiftPaste(editable, {
        "text/html": "<h1>H</h1>",
        "text/plain": "Z",
      });

      expect(outline(blocksOf(editor))).toEqual(["p:aZ", "p:tail"]);
    });
  });

  describe("codeBlock에 걸친 범위(C4)", () => {
    const range = [
      { id: "p1", offset: 2 },
      { id: "cb", offset: 3 },
    ] as const;
    const htmlAndPlain = { "text/html": "<p>H</p>", "text/plain": "Z" };

    it("Shift 없이는 html 분기로 합류한다(현행)", () => {
      const { editor, editable } = setupPasteSelection(baseBlocks(), ...range);

      pasteData(editable, htmlAndPlain);

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        "p:H",
        "code:bar",
        "p:tail",
      ]);
    });

    it("Shift면 html 분기로 합류하지 않고 범위를 평문으로 대체한다", () => {
      const { editor, editable } = setupPasteSelection(baseBlocks(), ...range);

      shiftPaste(editable, htmlAndPlain);

      // 범위 끝 뒤 "bar"는 둘째 블록 잔여라 앞 블록에 이어 붙는다.
      expect(outline(blocksOf(editor))).toEqual(["p:abZbar", "p:tail"]);
    });
  });

  describe("평문 종류별 배치(C5~C7)", () => {
    it("Shift + html + 여러 줄 평문은 Enter 분할 규칙으로 직접 배치한다(C5)", () => {
      const { editor, editable } = setupPasteSelection(
        [paragraphBlock("p1", "abcd"), paragraphBlock("tail", "tail")],
        { id: "p1", offset: 2 },
      );

      shiftPaste(editable, {
        "text/html": "<h1>H</h1>",
        "text/plain": "X\nY",
      });

      expect(outline(blocksOf(editor))).toEqual(["p:abX", "p:Ycd", "p:tail"]);
    });

    it("Shift + html + 무효 문자가 섞인 평문은 정리본이 들어가고 되돌림이 없다(C6)", () => {
      const { editor, editable } = caretAtEnd();

      shiftPaste(editable, {
        "text/html": "<b>x</b>",
        "text/plain": `a${SOH}b`,
      });

      expect(outline(blocksOf(editor))).toEqual(["p:abab", "p:tail"]);
      expect(runsOf(blocksOf(editor)[0])).toEqual([{ text: "abab" }]);
    });

    it("Shift + html + Markdown 평문은 현행대로 heading으로 변환한다(C7)", () => {
      const { editor, editable } = caretAtEnd();

      shiftPaste(editable, {
        "text/html": "<b>x</b>",
        "text/plain": "# T",
      });

      expect(outline(blocksOf(editor))).toEqual(["p:ab", "h1:T", "p:tail"]);
    });

    it("Shift + Markdown 평문 단독도 같은 heading 변환이다(C7)", () => {
      const { editor, editable } = caretAtEnd();

      shiftPaste(editable, { "text/plain": "# T" });

      expect(outline(blocksOf(editor))).toEqual(["p:ab", "h1:T", "p:tail"]);
    });
  });

  describe("평문 요청이 아닌 입력(C8·C9)", () => {
    it("Shift + html만 있는 클립보드는 현행대로 html을 가져온다(C8)", () => {
      const { editor, editable } = caretAtEnd();

      shiftPaste(editable, { "text/html": "<b>x</b>" });

      expect(outline(blocksOf(editor))).toEqual(["p:ab", "p:x", "p:tail"]);
      expect(runsOf(blocksOf(editor)[1])).toEqual([
        { text: "x", marks: [{ type: "bold" }] },
      ]);
    });

    it("Shift+Insert는 Shift 없는 붙여넣기와 같아 html을 가져온다(C9)", () => {
      const { editor, editable } = caretAtEnd();

      pressShiftInsert(editable);
      pasteData(editable, BOLD_X);

      expect(outline(blocksOf(editor))).toEqual(["p:ab", "p:x", "p:tail"]);
      expect(runsOf(blocksOf(editor)[1])).toEqual([
        { text: "x", marks: [{ type: "bold" }] },
      ]);
    });
  });

  describe("pasteHandler 계약(C10)", () => {
    it("Shift여도 1회 호출되고 undefined를 돌려주면 평문이 들어간다", () => {
      const pasteHandler = vi.fn(() => undefined);
      const { editor, editable } = caretAtEnd({ pasteHandler });

      shiftPaste(editable, BOLD_X);

      expect(pasteHandler).toHaveBeenCalledTimes(1);
      expect(outline(blocksOf(editor))).toEqual(["p:aba", "p:tail"]);
    });

    it("defaultPasteHandler()는 html을 건너뛰고 PM 기본 위임(false)을 돌려준다", () => {
      // 위임 결과 false를 pasteHandler가 그대로 돌려주면 handlePaste가 취소로
      // 해석해 붙여넣기가 일어나지 않는다. 한 줄 평문만 있는 Ctrl+V와 같은 현행
      // 동작이다. 여기서는 기본 처리가 평문 경로를 탔는지만 본다. html을 가져오면
      // true를 돌려준다.
      const delegated: boolean[] = [];
      const { editable } = caretAtEnd({
        pasteHandler: ({ defaultPasteHandler }) => {
          delegated.push(defaultPasteHandler());
          return true;
        },
      });

      shiftPaste(editable, BOLD_X);

      expect(delegated).toEqual([false]);
    });

    it("핸들러는 event로 text/html을 직접 읽을 수 있다", () => {
      const seen: string[] = [];
      const { editable } = caretAtEnd({
        pasteHandler: ({ event }) => {
          seen.push(event.clipboardData?.getData("text/html") ?? "");
          return undefined;
        },
      });

      shiftPaste(editable, BOLD_X);

      expect(seen).toEqual(["<b>x</b>"]);
    });

    it("나중에 부른 defaultPasteHandler도 붙여넣기 시점의 평문 요청을 따른다", () => {
      let deferred: (() => boolean) | undefined;
      const { editor, editable } = caretAtEnd({
        pasteHandler: ({ defaultPasteHandler }) => {
          deferred ??= defaultPasteHandler;
          return true;
        },
      });

      shiftPaste(editable, BOLD_X);
      releaseShift(editable);
      // 이후 일반 붙여넣기가 평문 요청을 거짓으로 덮어쓴다.
      pasteData(editable, { "text/html": "<i>y</i>", "text/plain": "b" });
      const before = outline(blocksOf(editor));

      // 평문 요청이 확정돼 있으면 html을 건너뛰고 PM 기본에 위임(false)한다.
      // 현재 값을 다시 읽으면 html을 가져와 문서를 바꾸고 true를 돌려준다.
      expect(deferred?.()).toBe(false);
      expect(outline(blocksOf(editor))).toEqual(before);
    });
  });

  describe("평문 요청의 수명(C11)", () => {
    it("Shift 붙여넣기 뒤 Shift 없는 붙여넣기는 html을 가져온다", () => {
      const { editor, editable } = caretAtEnd();

      shiftPaste(editable, BOLD_X);
      releaseShift(editable);
      pasteData(editable, BOLD_X);

      expect(outline(blocksOf(editor))).toEqual(["p:aba", "p:x", "p:tail"]);
    });

    it("handlePaste가 읽은 평문 요청은 같은 틱의 다음 handlePaste로 새지 않는다", () => {
      const { tiptap, editable, editor } = caretAtEnd();

      shiftPaste(editable, BOLD_X);
      releaseShift(editable);
      callHandlePaste(tiptap, BOLD_X);

      expect(outline(blocksOf(editor))).toEqual(["p:aba", "p:x", "p:tail"]);
    });

    it("pasteText 재진입이 남긴 평문 요청은 다음 handlePaste로 새지 않는다", () => {
      const { tiptap, editable, editor } = caretAtEnd();

      shiftPaste(editable, {
        "text/html": "<b>x</b>",
        "text/plain": `a${SOH}b`,
      });
      releaseShift(editable);
      callHandlePaste(tiptap, BOLD_X);

      expect(outline(blocksOf(editor))).toEqual(["p:abab", "p:x", "p:tail"]);
    });

    it("TablePasteExtension이 소비한 Shift 붙여넣기의 평문 요청은 다음 틱에 사라진다", async () => {
      const { tiptap, editable, editor } = caretAtEnd();

      // 평문이 있어야 PM이 평문 요청을 켠다.
      shiftPaste(editable, {
        "text/html":
          "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>",
        "text/plain": "a\tb",
      });
      releaseShift(editable);
      await Promise.resolve();
      const beforeTexts = outline(blocksOf(editor));
      // 표 붙여넣기 뒤 캐럿은 표 안이라 p1 끝으로 되돌린다.
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "p1") + 2);
      callHandlePaste(tiptap, BOLD_X);

      expect(beforeTexts.some((line) => line.startsWith("table"))).toBe(true);
      expect(outline(blocksOf(editor)).join("|")).toContain("p:x");
    });
  });

  describe("의도한 한계(C12)", () => {
    it("Shift + 표 형태 html은 표 밖에서 표를 만든다(TablePasteExtension은 Shift를 구분하지 않는다)", () => {
      const { editor, editable } = caretAtEnd();

      shiftPaste(editable, {
        "text/html":
          "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>",
        "text/plain": "a\tb",
      });

      expect(blocksOf(editor).some((block) => block.type === "table")).toBe(
        true,
      );
    });
  });

  describe("transaction 계약(C14)", () => {
    it("한 번의 Shift 붙여넣기는 dispatch 1회, undo 1회이고 문서가 스키마를 통과한다", () => {
      const { editor, editable, tiptap } = caretAtEnd();
      const initialJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");
      pressShift(editable);
      dispatch.mockClear();

      pasteData(editable, BOLD_X);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0]?.[0].getMeta("paste")).toBe(true);
      expect(outline(editor.getDocument().blocks)).toEqual(["p:aba", "p:tail"]);
      expectSchemaValid(tiptap);

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("여러 줄 평문 직접 배치도 dispatch 1회, undo 1회다", () => {
      const { editor, editable, tiptap } = caretAtEnd();
      const initialJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");
      pressShift(editable);
      dispatch.mockClear();

      pasteData(editable, { "text/html": "<h1>H</h1>", "text/plain": "X\nY" });

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(outline(editor.getDocument().blocks)).toEqual([
        "p:abX",
        "p:Y",
        "p:tail",
      ]);
      expectSchemaValid(tiptap);
      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });
  });
});
