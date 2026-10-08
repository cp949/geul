/**
 * 여러 줄 plain text 붙여넣기의 블록 배치 계약을 고정한다(Issue #284).
 * 둘째 줄 이후는 Enter 분할과 같은 규칙으로 놓인다 — 자식 없는 블록은 다음
 * 형제, 자식 있는 블록은 원본의 첫 자식(D23), 접힌 toggle은 펼친 형제(#252).
 * 들여쓰기 없던 문단이 붙여넣기만으로 자식을 얻으면 안 된다.
 *
 * 다루는 축은 직접 삽입 경로(handlePaste, C1~C10)와 clipboardTextParser
 * 경로(view.pasteText가 타는 PM 기본, C11)다. 한 줄 평문은 clipboardTextParser가
 * 캐럿 마크를 입힌 paragraph를 돌려준다(Issue #310, 마크 상속은
 * clipboard-paste-plain-single-line-marks.test.ts). 빈 줄 Markdown·codeBlock
 * 안은 현행 유지를 특성화한다. 표 셀 안은 이 모듈이 아니라
 * 셀 계획이 맡는다(Issue #299, clipboard-paste-table-cell-multiline.test.ts).
 * 여기서는 셀 안 붙여넣기가 블록 배치를 바꾸지 않음만 본다. drop 직접 삽입은
 * clipboard-drop-plain-multiline.test.ts가, 실제 브라우저 drop은
 * e2e/clipboard-paste.spec.ts가 맡는다. clipboardTextParser는
 * view.pasteText로 PM doPaste를 그대로 태워 검증한다.
 *
 * 인라인 atom NodeSelection은 직접 삽입이 받는다(Issue #314). atom을 지운
 * 자리에 이어 줄을 놓아 대상 블록의 blockId가 남는다. 블록 NodeSelection·
 * AllSelection·CellSelection은 직접 삽입이 물러난다.
 *
 * 자식 있는 블록에서 clipboardTextParser 경로는 D23 배치를 만들 수 없다
 * (r2 스펙 7.3). 그 현행 동작은 여기서 고정하지 않는다.
 */
import type { Block, InlineContentItem } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import {
  AllSelection,
  NodeSelection,
  TextSelection,
  Transaction,
} from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { createEditor } from "../src/index.js";
import {
  buildPlainMultilinePasteTransaction,
  plainTextClipboardParser,
  splitPlainTextLines,
} from "../src/plain-text-paste.js";
import { contentTextStart } from "./block-test-support.js";
import {
  blocksOf,
  outline,
  pasteData,
  runsOf,
  textOf,
} from "./clipboard-test-support.js";
import {
  codeBlockBlock,
  dividerBlock,
  documentOf,
  editorWithTable,
  headingBlock,
  mounted,
  mountTiptapEditor,
  paragraphBlock,
  selectBlockNode,
  sequentialIds,
  setBoldStoredMark,
  toggleBlock,
} from "./editor-controller-support.js";
import {
  atomBlocks,
  atomSelected,
  firstCellBlocks,
  kindsOf,
  pasteIn,
  selectFirstTwoCells,
  withTag,
} from "./table-cell-paste-test-support.js";
import { placeCaretInCell } from "./table-test-support.js";

// 문서를 마운트하고 blockId 블록의 텍스트 offset에 캐럿을 둔다.
const setup = (blocks: Block[], caretBlockId: string, offset: number) => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
  });
  const { editable, tiptap } = mountTiptapEditor(editor);
  editable.focus();
  tiptap.commands.setTextSelection(
    contentTextStart(tiptap, caretBlockId) + offset,
  );
  return { editor, editable, tiptap };
};

const plainPaste = (editable: HTMLElement, text: string): void =>
  pasteData(editable, { "text/plain": text });

const abcdAndTail = (): Block[] => [
  paragraphBlock("p1", "abcd"),
  paragraphBlock("tail", "tail"),
];

describe("여러 줄 평문 붙여넣기 배치(Issue #284)", () => {
  describe("자식 없는 문단(C1·C2)", () => {
    it("문단 중간에 두 줄을 붙이면 둘째 줄이 다음 형제 문단이 되고 원본은 자식을 얻지 않는다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 2);

      plainPaste(editable, "X\nY");

      const blocks = blocksOf(editor);
      expect(outline(blocks)).toEqual(["p:abX", "p:Ycd", "p:tail"]);
      expect(blocks[0]?.id).toBe("p1");
      expect(blocks[0] !== undefined && "children" in blocks[0]).toBe(false);
    });

    it("세 줄을 붙이면 abX, Y, Zcd 순서의 형제 셋이 되고 p1 id가 보존된다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 2);

      plainPaste(editable, "X\nY\nZ");

      const blocks = blocksOf(editor);
      expect(outline(blocks)).toEqual(["p:abX", "p:Y", "p:Zcd", "p:tail"]);
      expect(blocks[0]?.id).toBe("p1");
      expect(blocks.every((block) => !("children" in block))).toBe(true);
    });

    it("CRLF 줄바꿈도 같은 배치다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 2);

      plainPaste(editable, "X\r\nY");

      expect(outline(blocksOf(editor))).toEqual(["p:abX", "p:Ycd", "p:tail"]);
    });
  });

  describe("자식 있는 블록(C3·D23)", () => {
    it("자식 있는 문단 중간에 붙이면 새 블록이 원본의 첫 자식이 되고 기존 자식은 그대로다", () => {
      const { editor, editable } = setup(
        [
          paragraphBlock("p1", "abcd", [paragraphBlock("c1", "child")]),
          paragraphBlock("tail", "tail"),
        ],
        "p1",
        2,
      );

      plainPaste(editable, "X\nY");

      const blocks = blocksOf(editor);
      expect(outline(blocks)).toEqual(["p:abX[p:Ycd,p:child]", "p:tail"]);
      expect(blocks[0]?.id).toBe("p1");
      const children =
        "children" in blocks[0]! ? blocks[0].children : undefined;
      expect(children?.[1]?.id).toBe("c1");
    });

    it("세 줄이면 새 블록들이 기존 자식 앞에 순서대로 놓이고 빈 문단이 생기지 않는다", () => {
      const { editor, editable } = setup(
        [
          paragraphBlock("p1", "abcd", [paragraphBlock("c1", "child")]),
          paragraphBlock("tail", "tail"),
        ],
        "p1",
        2,
      );

      plainPaste(editable, "X\nY\nZ");

      expect(outline(blocksOf(editor))).toEqual([
        "p:abX[p:Y,p:Zcd,p:child]",
        "p:tail",
      ]);
    });
  });

  describe("타입 규칙(C4)", () => {
    it("heading 중간에 붙이면 같은 level heading 둘이 된다", () => {
      const { editor, editable } = setup(
        [headingBlock("h1", 2, "abcd"), paragraphBlock("tail", "tail")],
        "h1",
        2,
      );

      plainPaste(editable, "X\nY");

      expect(outline(blocksOf(editor))).toEqual(["h2:abX", "h2:Ycd", "p:tail"]);
    });

    it("heading 끝에 붙이면 새 블록은 paragraph다", () => {
      const { editor, editable } = setup(
        [headingBlock("h1", 2, "abcd"), paragraphBlock("tail", "tail")],
        "h1",
        4,
      );

      plainPaste(editable, "X\nY");

      expect(outline(blocksOf(editor))).toEqual(["h2:abcdX", "p:Y", "p:tail"]);
    });

    it("목록 항목 중간에 붙이면 같은 목록 타입 항목이 이어진다", () => {
      const { editor, editable } = setup(
        [
          {
            id: "b1",
            type: "bulletListItem",
            content: [{ text: "abcd" }],
          },
          paragraphBlock("tail", "tail"),
        ],
        "b1",
        2,
      );

      plainPaste(editable, "X\nY");

      expect(outline(blocksOf(editor))).toEqual(["ul:abX", "ul:Ycd", "p:tail"]);
    });

    it("빈 목록 항목에 앞 개행을 붙여도 exit하지 않고 새 항목을 만든다", () => {
      const { editor, editable } = setup(
        [
          { id: "b1", type: "bulletListItem", content: [] },
          paragraphBlock("tail", "tail"),
        ],
        "b1",
        0,
      );

      plainPaste(editable, "\nX");

      expect(outline(blocksOf(editor))).toEqual(["ul:", "ul:X", "p:tail"]);
    });

    it("접힌 toggle 라벨 중간에 붙이면 펼친 toggle 형제가 생기고 숨은 자식은 원본에 남는다(#252)", () => {
      const { editor, editable } = setup(
        [
          toggleBlock("t1", "abcd", {
            collapsed: true,
            children: [paragraphBlock("c1", "hidden")],
          }),
          paragraphBlock("tail", "tail"),
        ],
        "t1",
        2,
      );

      plainPaste(editable, "X\nY");

      expect(outline(blocksOf(editor))).toEqual([
        "toggle~:abX[p:hidden]",
        "toggle:Ycd",
        "p:tail",
      ]);
    });
  });

  describe("범위 선택(C5)", () => {
    it("같은 블록 안 범위를 지운 뒤 같은 규칙으로 붙는다", () => {
      const { editor, editable, tiptap } = setup(abcdAndTail(), "p1", 0);
      const start = contentTextStart(tiptap, "p1");
      tiptap.commands.setTextSelection({ from: start + 1, to: start + 3 });

      plainPaste(editable, "X\nY");

      expect(outline(blocksOf(editor))).toEqual(["p:aX", "p:Yd", "p:tail"]);
    });

    it("여러 블록에 걸친 범위는 Enter와 같은 기준으로 지운 뒤 붙는다", () => {
      const { editor, editable, tiptap } = setup(
        [
          paragraphBlock("p1", "abcd"),
          paragraphBlock("p2", "efgh"),
          paragraphBlock("tail", "tail"),
        ],
        "p1",
        0,
      );
      tiptap.commands.setTextSelection({
        from: contentTextStart(tiptap, "p1") + 2,
        to: contentTextStart(tiptap, "p2") + 2,
      });

      plainPaste(editable, "X\nY");

      const blocks = blocksOf(editor);
      expect(outline(blocks)).toEqual(["p:abX", "p:Ygh", "p:tail"]);
      expect(blocks[0]?.id).toBe("p1");
    });
  });

  describe("앞·뒤 개행(C6)", () => {
    it("뒤 개행은 Enter 분할 한 번과 같다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 2);

      plainPaste(editable, "X\n");

      expect(outline(blocksOf(editor))).toEqual(["p:abX", "p:cd", "p:tail"]);
    });

    it("앞 개행은 Enter 분할 한 번 뒤에 입력한 것과 같다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 2);

      plainPaste(editable, "\nX");

      expect(outline(blocksOf(editor))).toEqual(["p:ab", "p:Xcd", "p:tail"]);
    });

    it("블록 끝의 뒤 개행은 빈 문단을 남긴다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 4);

      plainPaste(editable, "X\n");

      expect(outline(blocksOf(editor))).toEqual(["p:abcdX", "p:", "p:tail"]);
    });
  });

  describe("현행 유지(C7)", () => {
    it("한 줄 평문은 직접 삽입하지 않고 PM 기본 처리가 선택 위치에 이어 붙인다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 2);
      // 직접 삽입은 줄마다 tr.insertText를 쓰고 PM 기본 처리는 쓰지 않는다.
      const insertText = vi.spyOn(Transaction.prototype, "insertText");

      try {
        plainPaste(editable, "X");

        expect(outline(blocksOf(editor))).toEqual(["p:abXcd", "p:tail"]);
        expect(insertText).not.toHaveBeenCalled();

        // 대조: 같은 편집기에서 두 줄이면 직접 삽입이 insertText를 쓴다.
        plainPaste(editable, "Y\nZ");
        expect(insertText).toHaveBeenCalled();
      } finally {
        insertText.mockRestore();
      }
    });

    it("빈 줄이 낀 Markdown 감지 경로는 현행대로 문단을 나눠 넣는다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 2);

      plainPaste(editable, "X\n\nY");

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        "p:X",
        "p:Y",
        "p:cd",
        "p:tail",
      ]);
    });

    it("무효 제어문자가 낀 여러 줄은 문자를 지운 뒤 같은 배치로 붙는다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 2);
      const controlChar = String.fromCharCode(1);

      plainPaste(editable, `X${controlChar}\nY`);

      expect(outline(blocksOf(editor))).toEqual(["p:abX", "p:Ycd", "p:tail"]);
    });
  });

  describe("transaction 계약(C8)", () => {
    it("dispatch 1회, paste meta와 uiEvent를 달고 undo 1회로 복원된다", () => {
      const { editor, editable, tiptap } = setup(abcdAndTail(), "p1", 2);
      const initialJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      plainPaste(editable, "X\nY\nZ");

      expect(dispatch).toHaveBeenCalledTimes(1);
      const transaction = dispatch.mock.calls[0]?.[0];
      expect(transaction?.getMeta("paste")).toBe(true);
      expect(transaction?.getMeta("uiEvent")).toBe("paste");
      expect(outline(blocksOf(editor))).toEqual([
        "p:abX",
        "p:Y",
        "p:Zcd",
        "p:tail",
      ]);

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("범위 삭제와 분할이 한 번의 dispatch·undo다", () => {
      const { editable, tiptap } = setup(abcdAndTail(), "p1", 0);
      const start = contentTextStart(tiptap, "p1");
      tiptap.commands.setTextSelection({ from: start + 1, to: start + 3 });
      const initialJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      plainPaste(editable, "X\nY");

      expect(dispatch).toHaveBeenCalledTimes(1);
      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("새 블록 id는 서로 다르고 원본 id와 겹치지 않는다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 2);

      plainPaste(editable, "X\nY\nZ");

      const ids = blocksOf(editor).map((block) => block.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("Shift 붙여넣기와 HTML 동봉(C9)", () => {
    it("Shift를 누른 평문 붙여넣기도 같은 배치다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 2);
      editable.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Shift",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );

      plainPaste(editable, "X\nY");

      expect(outline(blocksOf(editor))).toEqual(["p:abX", "p:Ycd", "p:tail"]);
    });

    it("text/html이 함께 있으면 현행대로 HTML을 가져온다", () => {
      const { editor, editable } = setup(abcdAndTail(), "p1", 2);

      pasteData(editable, {
        "text/html": "<p>H</p>",
        "text/plain": "X\nY",
      });

      const texts = outline(blocksOf(editor)).join("|");
      expect(texts).toContain("p:H");
      expect(texts).not.toContain("X");
    });
  });

  describe("직접 삽입 대상 밖(C10)", () => {
    it("표 셀 안 붙여넣기는 블록을 만들지 않고 셀 계획이 hardBreak로 셀에 넣는다(Issue #299)", () => {
      const { editor, cellIds } = editorWithTable();
      const { editable, tiptap } = mountTiptapEditor(editor);
      editable.focus();
      const cellId = cellIds[0];
      if (cellId === undefined) throw new Error("셀 fixture 준비 실패");
      placeCaretInCell(tiptap, cellId);

      const before = editor.getDocument().blocks.map((block) => block.type);
      plainPaste(editable, "X\nY");

      // 셀은 inline*라 줄 분리 slice가 들어갈 자리가 없다. 이 모듈의 직접
      // 삽입은 셀에 관여하지 않는다. 셀 안은 planTableCellPaste가 줄 사이를
      // hardBreak로 이어 셀에 넣는다. 블록 배치는 바뀌지 않는다.
      const blocks = editor.getDocument().blocks;
      expect(blocks.map((block) => block.type)).toEqual(before);
      expect(blocks.filter((block) => block.type === "table")).toHaveLength(1);
      expect(
        blocks.some(
          (block) => "children" in block && block.children !== undefined,
        ),
      ).toBe(false);
      expect(
        tiptap.state.doc.textBetween(
          0,
          tiptap.state.doc.content.size,
          "",
          "\n",
        ),
      ).toContain("X\nY");
    });

    it("캐럿이 codeBlock 안이면 개행째로 코드에 들어간다", () => {
      const { editor, editable } = setup(
        [
          paragraphBlock("p1", "abcd"),
          codeBlockBlock("c1", "code"),
          paragraphBlock("tail", "tail"),
        ],
        "c1",
        2,
      );

      plainPaste(editable, "X\nY");

      expect(outline(blocksOf(editor))).toEqual([
        "p:abcd",
        "code:coX\nYde",
        "p:tail",
      ]);
    });

    it("NodeSelection이면 직접 삽입을 하지 않고 transaction을 만들지 않는다", () => {
      const { tiptap } = setup(
        [
          paragraphBlock("p1", "abcd"),
          dividerBlock("d1"),
          paragraphBlock("tail", "tail"),
        ],
        "p1",
        2,
      );
      selectBlockNode(tiptap, "d1");
      const before = tiptap.state.doc;

      const transaction = buildPlainMultilinePasteTransaction(tiptap.state, [
        "X",
        "Y",
      ]);

      expect(transaction).toBeNull();
      expect(tiptap.state.doc).toBe(before);
      expect(tiptap.state.selection).not.toBeInstanceOf(TextSelection);
    });
  });

  describe("clipboardTextParser 경로(C11)", () => {
    it("자식 없는 문단 중간에 PM 기본 paste 경로로 붙여도 형제 배치다", () => {
      const { editor, tiptap } = setup(abcdAndTail(), "p1", 2);

      tiptap.view.pasteText("X\nY");

      const blocks = blocksOf(editor);
      expect(outline(blocks)).toEqual(["p:abX", "p:Ycd", "p:tail"]);
      expect(blocks[0] !== undefined && "children" in blocks[0]).toBe(false);
    });

    it("시작이 밖인 codeBlock에 걸친 범위도 직접 삽입으로 형제 배치한다(Issue #285)", () => {
      const { editor, editable, tiptap } = setup(
        [
          paragraphBlock("p1", "abcd"),
          codeBlockBlock("c1", "code"),
          paragraphBlock("tail", "tail"),
        ],
        "p1",
        0,
      );
      tiptap.commands.setTextSelection({
        from: contentTextStart(tiptap, "p1") + 2,
        to: contentTextStart(tiptap, "c1") + 2,
      });

      plainPaste(editable, "X\nY");

      const blocks = blocksOf(editor);
      expect(blocks[0]?.id).toBe("p1");
      expect(textOf(blocks[0]!)).toBe("abX");
      expect(blocks[0] !== undefined && "children" in blocks[0]).toBe(false);
      expect(blocks.map(textOf)).toEqual(["abX", "Yde", "tail"]);
    });

    // 한 줄은 캐럿 마크를 입힌 paragraph 하나를 직접 돌려준다(Issue #310).
    // 마크 상속 결과는 clipboard-paste-plain-single-line-marks.test.ts가 본다.
    it("한 줄 평문은 paragraph 하나를 담은 open(1,1) slice를 돌려준다", () => {
      const { tiptap } = setup(abcdAndTail(), "p1", 2);
      const { $from } = tiptap.state.selection;

      const slice = plainTextClipboardParser("X", $from);

      expect(slice?.openStart).toBe(1);
      expect(slice?.openEnd).toBe(1);
      expect(slice?.content.childCount).toBe(1);
      expect(slice?.content.firstChild?.type.name).toBe("paragraph");
      expect(slice?.content.firstChild?.textContent).toBe("X");
    });

    it("빈 문자열은 null을 돌려줘 PM 기본을 유지한다", () => {
      const { tiptap } = setup(abcdAndTail(), "p1", 2);
      const { $from } = tiptap.state.selection;

      expect(plainTextClipboardParser("", $from)).toBeNull();
    });

    it("한 줄 평문은 표 셀 안에서도 paragraph 하나를 돌려준다", () => {
      const { editor, cellIds } = editorWithTable();
      const { tiptap } = mountTiptapEditor(editor);
      const cellId = cellIds[0];
      if (cellId === undefined) throw new Error("셀 fixture 준비 실패");
      placeCaretInCell(tiptap, cellId);

      const slice = plainTextClipboardParser("X", tiptap.state.selection.$from);

      expect(slice?.openStart).toBe(1);
      expect(slice?.openEnd).toBe(1);
      expect(slice?.content.firstChild?.type.name).toBe("paragraph");
    });

    it("한 줄 평문은 codeBlock 안이면 null을 돌려준다", () => {
      const { tiptap } = setup([codeBlockBlock("c1", "code")], "c1", 2);

      expect(
        plainTextClipboardParser("X", tiptap.state.selection.$from),
      ).toBeNull();
    });

    it("blockContainer 밖(표 셀 안)이면 null을 돌려준다", () => {
      const { editor, cellIds } = editorWithTable();
      const { tiptap } = mountTiptapEditor(editor);
      const cellId = cellIds[0];
      if (cellId === undefined) throw new Error("셀 fixture 준비 실패");
      placeCaretInCell(tiptap, cellId);

      expect(
        plainTextClipboardParser("X\nY", tiptap.state.selection.$from),
      ).toBeNull();
    });

    it("codeBlock 안이면 null을 돌려준다", () => {
      const { tiptap } = setup([codeBlockBlock("c1", "code")], "c1", 2);

      expect(
        plainTextClipboardParser("X\nY", tiptap.state.selection.$from),
      ).toBeNull();
    });

    it("두 줄 이상이면 줄마다 blockContainer 문단을 만든 open(2,2) slice를 돌려준다", () => {
      const { tiptap } = setup(abcdAndTail(), "p1", 2);

      const slice = plainTextClipboardParser(
        "X\nY",
        tiptap.state.selection.$from,
      );

      expect(slice?.openStart).toBe(2);
      expect(slice?.openEnd).toBe(2);
      expect(slice?.content.childCount).toBe(2);
      expect(slice?.content.textBetween(0, slice.content.size, "|")).toBe(
        "X|Y",
      );
    });
  });

  describe("마크(F1·F2)", () => {
    const BOLD = { type: "bold" };

    it("bold 문단의 끝 캐럿에 붙이면 분할 뒤 새 블록 줄도 bold다", () => {
      const { editor, editable } = setup(
        [
          {
            id: "p1",
            type: "paragraph",
            content: [{ text: "abcd", marks: [BOLD] }],
          },
          paragraphBlock("tail", "tail"),
        ],
        "p1",
        4,
      );

      plainPaste(editable, "X\nY");

      const blocks = blocksOf(editor);
      expect(runsOf(blocks[0])).toEqual([{ text: "abcdX", marks: [BOLD] }]);
      expect(runsOf(blocks[1])).toEqual([{ text: "Y", marks: [BOLD] }]);
    });

    it("bold 뒤 캐럿 중간 분할은 모든 줄이 bold이고 뒤쪽 원래 텍스트는 마크를 유지한다", () => {
      const { editor, editable } = setup(
        [
          {
            id: "p1",
            type: "paragraph",
            content: [{ text: "ab", marks: [BOLD] }, { text: "cd" }],
          },
          paragraphBlock("tail", "tail"),
        ],
        "p1",
        2,
      );

      plainPaste(editable, "X\nY");

      const blocks = blocksOf(editor);
      expect(runsOf(blocks[0])).toEqual([{ text: "abX", marks: [BOLD] }]);
      expect(runsOf(blocks[1])).toEqual([
        { text: "Y", marks: [BOLD] },
        { text: "cd" },
      ]);
    });

    it("storedMarks가 있어도 한 줄·여러 줄 모두 무시하고 캐럿 위치 마크를 쓴다", () => {
      const single = setup(abcdAndTail(), "p1", 2);
      setBoldStoredMark(single.tiptap);
      plainPaste(single.editable, "X");

      const multi = setup(abcdAndTail(), "p1", 2);
      setBoldStoredMark(multi.tiptap);
      plainPaste(multi.editable, "X\nY");

      // 한 줄(PM 기본)은 storedMarks를 쓰지 않는다. 여러 줄 첫 줄도 같다.
      expect(runsOf(blocksOf(single.editor)[0])).toEqual([{ text: "abXcd" }]);
      expect(runsOf(blocksOf(multi.editor)[0])).toEqual([{ text: "abX" }]);
      expect(runsOf(blocksOf(multi.editor)[1])).toEqual([{ text: "Ycd" }]);
      expect(multi.tiptap.state.selection.empty).toBe(true);
      expect(multi.tiptap.state.selection.$from.parent.textContent).toBe("Ycd");
      expect(multi.tiptap.state.selection.$from.parentOffset).toBe(1);
    });
  });

  describe("붙여넣기 뒤 selection은 마지막 줄 끝이다", () => {
    // 접힌 캐럿이고 캐럿 블록 텍스트와 그 안 offset을 돌려준다.
    const caretOf = (tiptap: ReturnType<typeof setup>["tiptap"]) => {
      const { selection } = tiptap.state;
      return {
        empty: selection.empty,
        text: selection.$from.parent.textContent,
        offset: selection.$from.parentOffset,
      };
    };

    it("문단 중간: 마지막 줄 뒤, 이어 붙은 꼬리 앞", () => {
      const { editable, tiptap } = setup(abcdAndTail(), "p1", 2);

      plainPaste(editable, "X\nY\nZ");

      expect(caretOf(tiptap)).toEqual({ empty: true, text: "Zcd", offset: 1 });
    });

    it("문서 끝 문단 끝: 새 블록 끝", () => {
      const { editable, tiptap } = setup(
        [paragraphBlock("p1", "abcd")],
        "p1",
        4,
      );

      plainPaste(editable, "X\nY");

      expect(caretOf(tiptap)).toEqual({ empty: true, text: "Y", offset: 1 });
    });

    it("빈 문단: 마지막 줄 끝", () => {
      const { editor, editable, tiptap } = setup(
        [paragraphBlock("p1", ""), paragraphBlock("tail", "tail")],
        "p1",
        0,
      );

      plainPaste(editable, "X\nY");

      expect(outline(blocksOf(editor))).toEqual(["p:X", "p:Y", "p:tail"]);
      expect(caretOf(tiptap)).toEqual({ empty: true, text: "Y", offset: 1 });
    });

    it("접힌 toggle 라벨 끝: 새 형제 toggle의 마지막 줄 끝", () => {
      const { editable, tiptap } = setup(
        [
          toggleBlock("t1", "abcd", {
            collapsed: true,
            children: [paragraphBlock("c1", "hidden")],
          }),
          paragraphBlock("tail", "tail"),
        ],
        "t1",
        4,
      );

      plainPaste(editable, "X\nY");

      expect(caretOf(tiptap)).toEqual({ empty: true, text: "Y", offset: 1 });
    });

    it("앞·뒤 개행이면 빈 줄 자리(새 블록 시작)에 선다", () => {
      const { editable, tiptap } = setup(abcdAndTail(), "p1", 2);

      plainPaste(editable, "X\n");

      expect(caretOf(tiptap)).toEqual({ empty: true, text: "cd", offset: 0 });
    });
  });

  describe("줄 분해", () => {
    it("연속 개행은 한 경계로 묶고 앞·뒤 개행은 빈 줄로 남긴다", () => {
      expect(splitPlainTextLines("X\nY")).toEqual(["X", "Y"]);
      expect(splitPlainTextLines("X\r\nY\rZ")).toEqual(["X", "Y", "Z"]);
      expect(splitPlainTextLines("X\n\nY")).toEqual(["X", "Y"]);
      expect(splitPlainTextLines("\nX\n")).toEqual(["", "X", ""]);
      expect(splitPlainTextLines("X")).toEqual(["X"]);
    });
  });
});

// 인라인 atom만 든 문단의 NodeSelection(Issue #314). 수정 전에는 직접 삽입이
// 물러나 clipboardTextParser가 open(2,2) slice를 넣었고, atom 대체로 대상
// 블록이 비면 PM replaceRange가 container째 바꿔 blockId가 새로 매겨졌다.
describe("인라인 atom NodeSelection 여러 줄 평문 붙여넣기(Issue #314)", () => {
  const BOLD = { type: "bold" };
  const TAG: InlineContentItem = { type: "custom", customType: "myTag" };

  // 인라인 콘텐츠로 블록을 만든다. 타입별 필드(level 등)는 extra로 받는다.
  const inlineBlock = (
    id: string,
    type: string,
    content: InlineContentItem[],
    extra: Record<string, unknown> = {},
  ): Block => ({ id, type, content, ...extra }) as Block;

  // mounted()로 마운트하면 붙여넣기로 생기는 새 블록 id가 id-2부터 매겨진다.

  // 문서 첫 인라인 atom을 NodeSelection으로 고른다.
  const selectInlineAtom = (tiptap: TiptapEditor): void => {
    let position = -1;
    tiptap.state.doc.descendants((node, pos) => {
      if (position < 0 && node.isInline && node.isAtom && !node.isText) {
        position = pos;
      }
      return position < 0;
    });
    if (position < 0) throw new Error("인라인 atom 조회 실패");
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        NodeSelection.create(tiptap.state.doc, position),
      ),
    );
  };

  // atom 등록 편집기를 마운트하고 첫 인라인 atom을 NodeSelection으로 고른다.
  const setupAtom = (blocks: Block[]) => {
    const m = mounted(documentOf(...blocks), withTag);
    m.editable.focus();
    selectInlineAtom(m.tiptap);
    return m;
  };

  const tailBlock = (): Block => paragraphBlock("tail", "tail");

  describe("blockId 유지(1·2·3)", () => {
    it("atom만 든 문단의 atom을 골라 두 줄을 붙이면 p1이 유지되고 새 블록이 하나 생긴다", () => {
      const { editor, editable } = setupAtom([
        inlineBlock("p1", "paragraph", [TAG]),
        tailBlock(),
      ]);

      plainPaste(editable, "x\ny");

      const blocks = blocksOf(editor);
      expect(blocks.map((block) => block.id)).toEqual(["p1", "id-2", "tail"]);
      expect(outline(blocks)).toEqual(["p:x", "p:y", "p:tail"]);
    });

    it("세 줄이면 p1이 유지되고 새 블록이 둘 생긴다", () => {
      const { editor, editable } = setupAtom([
        inlineBlock("p1", "paragraph", [TAG]),
        tailBlock(),
      ]);

      plainPaste(editable, "x\ny\nz");

      const blocks = blocksOf(editor);
      expect(blocks.map((block) => block.id)).toEqual([
        "p1",
        "id-2",
        "id-3",
        "tail",
      ]);
      expect(outline(blocks)).toEqual(["p:x", "p:y", "p:z", "p:tail"]);
    });

    it("heading이면 p1과 level이 유지되고 새 블록은 Enter 분할 규칙을 따른다", () => {
      const { editor, editable } = setupAtom([
        inlineBlock("p1", "heading", [TAG], { level: 2 }),
        tailBlock(),
      ]);

      plainPaste(editable, "x\ny");

      const blocks = blocksOf(editor);
      expect(blocks.map((block) => block.id)).toEqual(["p1", "id-2", "tail"]);
      expect(outline(blocks)).toEqual(["h2:x", "p:y", "p:tail"]);
    });

    it("bulletListItem이면 p1과 타입이 유지되고 새 블록도 같은 목록 타입이다", () => {
      const { editor, editable } = setupAtom([
        inlineBlock("p1", "bulletListItem", [TAG]),
        tailBlock(),
      ]);

      plainPaste(editable, "x\ny");

      const blocks = blocksOf(editor);
      expect(blocks.map((block) => block.id)).toEqual(["p1", "id-2", "tail"]);
      expect(outline(blocks)).toEqual(["ul:x", "ul:y", "p:tail"]);
    });
  });

  describe("atom이 문단 중간에 있는 경우(4)", () => {
    it("ab, atom, cd에서 가운데 atom을 고르면 p1은 abx이고 새 블록은 ycd다", () => {
      const { editor, editable } = setupAtom([
        inlineBlock("p1", "paragraph", [{ text: "ab" }, TAG, { text: "cd" }]),
        tailBlock(),
      ]);

      plainPaste(editable, "x\ny");

      const blocks = blocksOf(editor);
      expect(blocks[0]?.id).toBe("p1");
      expect(outline(blocks)).toEqual(["p:abx", "p:ycd", "p:tail"]);
    });
  });

  describe("자식 있는 블록(5)", () => {
    it("atom만 든 문단에 자식이 있으면 새 블록이 원본의 첫 자식이 되고 기존 자식은 그대로다", () => {
      const { editor, editable } = setupAtom([
        inlineBlock("p1", "paragraph", [TAG], {
          children: [paragraphBlock("c1", "child")],
        }),
        tailBlock(),
      ]);

      plainPaste(editable, "x\ny");

      const blocks = blocksOf(editor);
      expect(outline(blocks)).toEqual(["p:x[p:y,p:child]", "p:tail"]);
      expect(blocks[0]?.id).toBe("p1");
      const children =
        "children" in blocks[0]! ? blocks[0].children : undefined;
      expect(children?.[1]?.id).toBe("c1");
    });
  });

  // 문단 안 경계: atom만 든 블록 타입마다 blockId 유지와 배치를 고정한다.
  // quote·callout은 블록 끝 Enter처럼 새 블록이 paragraph다.
  describe("블록 타입별 배치(5b)", () => {
    const withAtom = (
      type: string,
      extra: Record<string, unknown> = {},
    ): Block[] => [inlineBlock("p1", type, [TAG], extra), tailBlock()];
    const child = (): Block[] => [paragraphBlock("c1", "child")];

    it.each([
      ["callout", withAtom("callout"), ["callout:x", "p:y", "p:tail"]],
      ["quote", withAtom("quote"), ["quote:x", "p:y", "p:tail"]],
      [
        "checkListItem",
        withAtom("checkListItem", { checked: false }),
        ["checkListItem:x", "checkListItem:y", "p:tail"],
      ],
      [
        "열린 toggle(자식 있음, D23 첫 자식)",
        withAtom("toggleListItem", { children: child() }),
        ["toggle:x[toggle:y,p:child]", "p:tail"],
      ],
      [
        "접힌 toggle(형제로 새 블록)",
        withAtom("toggleListItem", { collapsed: true, children: child() }),
        ["toggle~:x[p:child]", "toggle:y", "p:tail"],
      ],
      [
        "numberedListItem(자식 있음, D23 첫 자식)",
        withAtom("numberedListItem", { children: child() }),
        ["ol:x[ol:y,p:child]", "p:tail"],
      ],
    ])("%s이면 p1이 유지되고 두 줄이 배치된다", (_title, blocks, expected) => {
      const { editor, editable } = setupAtom(blocks);

      plainPaste(editable, "x\ny");

      const result = blocksOf(editor);
      expect(result[0]?.id).toBe("p1");
      expect(outline(result)).toEqual(expected);
    });
  });

  describe("마크는 atom을 지운 뒤 캐럿 기준이다(6)", () => {
    it("bold ab 뒤 atom을 고르면 x와 y에 bold가 이어진다", () => {
      const { editor, editable } = setupAtom([
        inlineBlock("p1", "paragraph", [{ text: "ab", marks: [BOLD] }, TAG]),
        tailBlock(),
      ]);

      plainPaste(editable, "x\ny");

      const blocks = blocksOf(editor);
      expect(runsOf(blocks[0])).toEqual([{ text: "abx", marks: [BOLD] }]);
      expect(runsOf(blocks[1])).toEqual([{ text: "y", marks: [BOLD] }]);
    });

    // 삭제 전 $from.marks()는 문단 시작에서 nodeAfter의 마크를 물려받는다.
    // custom atom은 마크를 가질 수 없어 마크가 있는 인라인 atom인 hardBreak
    // (모델의 "\n" text)로 검증한다.
    it("bold hardBreak만 든 문단의 hardBreak를 고르면 x와 y에 마크가 없다", () => {
      const { editor, editable } = setupAtom([
        inlineBlock("p1", "paragraph", [{ text: "\n", marks: [BOLD] }]),
        tailBlock(),
      ]);

      plainPaste(editable, "x\ny");

      const blocks = blocksOf(editor);
      expect(runsOf(blocks[0])).toEqual([{ text: "x" }]);
      expect(runsOf(blocks[1])).toEqual([{ text: "y" }]);
    });

    // 특성화: 현행을 고정한다. 한 줄 경로(buildSingleLineSlice)는 삭제 전
    // $context.marks()를 쓴다. 문단 시작에서는 nodeAfter(atom)가 기준이라
    // 마크가 없다. 여러 줄 경로는 삭제 뒤 $from.marks()를 쓴다. nodeAfter가
    // bold cd가 되어 x와 ycd에 bold가 붙는다.
    it("문단 시작 atom 뒤에 bold 텍스트가 오면 여러 줄은 bold를 잇고 한 줄은 잇지 않아 한 줄과 다르다", () => {
      const blocks = (): Block[] => [
        inlineBlock("p1", "paragraph", [TAG, { text: "cd", marks: [BOLD] }]),
        tailBlock(),
      ];
      const multi = setupAtom(blocks());
      plainPaste(multi.editable, "x\ny");
      const single = setupAtom(blocks());
      plainPaste(single.editable, "x");

      const multiBlocks = blocksOf(multi.editor);
      expect(runsOf(multiBlocks[0])).toEqual([{ text: "x", marks: [BOLD] }]);
      expect(runsOf(multiBlocks[1])).toEqual([{ text: "ycd", marks: [BOLD] }]);
      expect(runsOf(blocksOf(single.editor)[0])).toEqual([
        { text: "x" },
        { text: "cd", marks: [BOLD] },
      ]);
    });

    it("atom만 든 문단이면 x와 y에 마크가 없다", () => {
      const { editor, editable } = setupAtom([
        inlineBlock("p1", "paragraph", [TAG]),
        tailBlock(),
      ]);

      plainPaste(editable, "x\ny");

      const blocks = blocksOf(editor);
      expect(runsOf(blocks[0])).toEqual([{ text: "x" }]);
      expect(runsOf(blocks[1])).toEqual([{ text: "y" }]);
    });
  });

  describe("직접 삽입 대상 밖(7)", () => {
    it("블록 NodeSelection(divider)은 transaction을 만들지 않는다", () => {
      const { tiptap } = setupAtom([
        inlineBlock("p1", "paragraph", [TAG]),
        dividerBlock("d1"),
        tailBlock(),
      ]);
      selectBlockNode(tiptap, "d1");

      expect(
        buildPlainMultilinePasteTransaction(tiptap.state, ["x", "y"]),
      ).toBeNull();
    });

    it("AllSelection은 transaction을 만들지 않는다", () => {
      const { tiptap } = setupAtom([
        inlineBlock("p1", "paragraph", [TAG]),
        tailBlock(),
      ]);
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)),
      );

      expect(
        buildPlainMultilinePasteTransaction(tiptap.state, ["x", "y"]),
      ).toBeNull();
    });

    it("CellSelection은 transaction을 만들지 않는다", () => {
      const m = mounted(documentOf(...firstCellBlocks()));
      selectFirstTwoCells(m.tiptap);

      expect(
        buildPlainMultilinePasteTransaction(m.tiptap.state, ["x", "y"]),
      ).toBeNull();
    });
  });

  describe("표 셀 안은 셀 계획이 맡는다(8)", () => {
    it("셀 안 인라인 atom NodeSelection은 atom을 hardBreak 줄로 대체하고 블록을 만들지 않는다", () => {
      const result = pasteIn(
        atomBlocks(),
        atomSelected,
        { "text/plain": "a\nb" },
        withTag,
      );

      expect(result.pasteText).not.toHaveBeenCalled();
      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["aba", "br", "bcd"]);
      expect(result.tiptap.state.doc.childCount).toBe(3);
    });
  });

  describe("한 줄 평문과 drop은 selection을 바꾸지 않는다(9)", () => {
    it("한 줄 평문은 직접 삽입하지 않고 atom을 대체한다", () => {
      const { editor, editable } = setupAtom([
        inlineBlock("p1", "paragraph", [{ text: "ab" }, TAG, { text: "cd" }]),
        tailBlock(),
      ]);
      const insertText = vi.spyOn(Transaction.prototype, "insertText");

      try {
        plainPaste(editable, "x");

        expect(outline(blocksOf(editor))).toEqual(["p:abxcd", "p:tail"]);
        expect(blocksOf(editor)[0]?.id).toBe("p1");
        expect(insertText).not.toHaveBeenCalled();
      } finally {
        insertText.mockRestore();
      }
    });

    it("position 옵션(drop)은 atom NodeSelection을 지우지 않고 그 위치에 줄을 놓는다", () => {
      const { tiptap } = setupAtom([
        inlineBlock("p1", "paragraph", [{ text: "ab" }, TAG, { text: "cd" }]),
        tailBlock(),
      ]);
      const position = contentTextStart(tiptap, "p1") + 1;

      const transaction = buildPlainMultilinePasteTransaction(
        tiptap.state,
        ["x", "y"],
        { position },
      );

      expect(transaction).not.toBeNull();
      const texts: string[] = [];
      let atomCount = 0;
      transaction?.doc.descendants((node) => {
        if (node.isTextblock) texts.push(node.textContent);
        if (node.isInline && node.isAtom && !node.isText) atomCount += 1;
      });
      expect(atomCount).toBe(1);
      expect(texts).toEqual(["ax", "ybcd", "tail"]);
    });
  });

  describe("transaction 계약(10)", () => {
    it("dispatch 1회, paste meta와 uiEvent를 달고 undo 1회로 원래 문서가 복원된다", () => {
      const { editor, editable, tiptap } = setupAtom([
        inlineBlock("p1", "paragraph", [TAG]),
        tailBlock(),
      ]);
      const initialJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      plainPaste(editable, "x\ny");

      expect(dispatch).toHaveBeenCalledTimes(1);
      const transaction = dispatch.mock.calls[0]?.[0];
      expect(transaction?.getMeta("paste")).toBe(true);
      expect(transaction?.getMeta("uiEvent")).toBe("paste");
      expect(outline(blocksOf(editor))).toEqual(["p:x", "p:y", "p:tail"]);

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("붙여넣기 뒤 selection은 마지막 줄 끝의 접힌 캐럿이다", () => {
      const { editable, tiptap } = setupAtom([
        inlineBlock("p1", "paragraph", [TAG]),
        tailBlock(),
      ]);

      plainPaste(editable, "x\ny");

      const { selection } = tiptap.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(selection.empty).toBe(true);
      expect(selection.$from.parent.textContent).toBe("y");
      expect(selection.$from.parentOffset).toBe(1);
    });
  });
});
