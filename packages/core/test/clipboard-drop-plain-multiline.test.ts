/**
 * 여러 줄 text/plain drop의 블록 배치 계약을 고정한다(Issue #285). drop 위치에
 * Enter 분할과 같은 규칙으로 줄을 놓는다 — 자식 없는 블록은 다음 형제, 자식
 * 있는 블록은 원본의 첫 자식(D23), 접힌 toggle은 펼친 형제(#252). 이전에는
 * PM 기본 drop이 기존 자식을 마지막 줄 블록으로 넘겼다.
 *
 * 다루는 축은 배치(C1~C3), transaction 계약(C4·C6), 삽입 뒤 selection(C5),
 * PM 기본에 위임하는 입력(C7), sanitize·마크·selection 비접촉(C8),
 * 무효 문자 drop(C9, Issue #306)이다.
 * jsdom은 좌표를 해석하지 못해 view.posAtCoords를 stub한다. 위임 입력은
 * view.someProp("handleDrop")으로 호출해 플러그인의 반환값을 직접 읽는다.
 * 실제 브라우저 drop은 e2e/clipboard-paste.spec.ts가 맡는다.
 */
import type { Block } from "@cp949/geul-model";
import { Slice } from "@tiptap/pm/model";
import { TextSelection, Transaction } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  blocksOf,
  dropData,
  dropEventOf,
  outline,
  pasteData,
  runsOf,
} from "./clipboard-test-support.js";
import {
  codeBlockBlock,
  dividerBlock,
  documentOf,
  editorWithTable,
  mountTiptapEditor,
  paragraphBlock,
  sequentialIds,
  toggleBlock,
} from "./editor-controller-support.js";
import { singleCellTable } from "./table-boundary-test-support.js";
import { findCellBoundaryPosition } from "./table-test-support.js";

type Tiptap = ReturnType<typeof mountTiptapEditor>["tiptap"];

// 문서를 마운트하고 view.posAtCoords가 caretBlockId 블록 텍스트의 offset을
// 가리키게 stub한다. 선택은 건드리지 않는다.
const setup = (blocks: Block[], caretBlockId: string, offset: number) => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
  });
  const { editable, tiptap } = mountTiptapEditor(editor);
  editable.focus();
  const pos = contentTextStart(tiptap, caretBlockId) + offset;
  stubPosAtCoords(tiptap, pos);
  return { editor, editable, tiptap, pos };
};

const stubPosAtCoords = (tiptap: Tiptap, pos: number | null): void => {
  tiptap.view.posAtCoords = () => (pos === null ? null : { pos, inside: pos });
};

// D1: p1 "abcd" 자식 [c1 "child"], tail "tail".
const childDocument = (): Block[] => [
  paragraphBlock("p1", "abcd", [paragraphBlock("c1", "child")]),
  paragraphBlock("tail", "tail"),
];

const plainDrop = (editable: HTMLElement, text: string): DragEvent =>
  dropData(editable, { "text/plain": text });

describe("여러 줄 평문 drop 배치(Issue #285)", () => {
  describe("배치(C1~C3)", () => {
    it("자식 있는 문단 중간에 drop하면 새 블록이 원본의 첫 자식이 되고 기존 자식은 그대로다", () => {
      const { editor, editable } = setup(childDocument(), "p1", 2);

      plainDrop(editable, "X\nY");

      const blocks = blocksOf(editor);
      expect(outline(blocks)).toEqual(["p:abX[p:Ycd,p:child]", "p:tail"]);
      expect(blocks[0]?.id).toBe("p1");
      const children =
        "children" in blocks[0]! ? blocks[0].children : undefined;
      expect(children?.[1]?.id).toBe("c1");
    });

    it("세 줄이면 새 블록들이 기존 자식 앞에 순서대로 놓이고 빈 문단이 생기지 않는다", () => {
      const { editor, editable } = setup(childDocument(), "p1", 2);

      plainDrop(editable, "X\nY\nZ");

      expect(outline(blocksOf(editor))).toEqual([
        "p:abX[p:Y,p:Zcd,p:child]",
        "p:tail",
      ]);
    });

    it("접힌 toggle 라벨 중간에 drop하면 펼친 형제 toggle이 생기고 숨은 자식은 원본에 남는다(#252)", () => {
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

      plainDrop(editable, "X\nY");

      expect(outline(blocksOf(editor))).toEqual([
        "toggle~:abX[p:hidden]",
        "toggle:Ycd",
        "p:tail",
      ]);
    });

    it("자식 없는 블록에 drop하면 다음 형제로 놓이고 원본은 자식을 얻지 않는다", () => {
      const { editor, editable } = setup(
        [paragraphBlock("p1", "abcd"), paragraphBlock("tail", "tail")],
        "p1",
        2,
      );

      plainDrop(editable, "X\nY");

      const blocks = blocksOf(editor);
      expect(outline(blocks)).toEqual(["p:abX", "p:Ycd", "p:tail"]);
      expect(blocks[0] !== undefined && "children" in blocks[0]).toBe(false);
    });

    it("CRLF 줄바꿈도 같은 배치다", () => {
      const { editor, editable } = setup(childDocument(), "p1", 2);

      plainDrop(editable, "X\r\nY");

      expect(outline(blocksOf(editor))).toEqual([
        "p:abX[p:Ycd,p:child]",
        "p:tail",
      ]);
    });
  });

  describe("transaction 계약(C4·C6)", () => {
    it("dispatch 1회, revision +1, undo 1회로 원복된다", () => {
      const { editor, editable, tiptap } = setup(childDocument(), "p1", 2);
      const initialJson = tiptap.state.doc.toJSON();
      const revision = editor.getDocument().revision;
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      plainDrop(editable, "X\nY\nZ");

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(editor.getDocument().revision).toBe(revision + 1);

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("tr은 uiEvent drop만 달고 paste meta를 달지 않으며 dispatch 뒤 view.focus()를 부른다", () => {
      const { editable, tiptap } = setup(childDocument(), "p1", 2);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");
      const focus = vi.spyOn(tiptap.view, "focus");

      const event = plainDrop(editable, "X\nY");

      const transaction = dispatch.mock.calls[0]?.[0];
      expect(transaction?.getMeta("uiEvent")).toBe("drop");
      expect(transaction?.getMeta("paste")).toBeUndefined();
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus.mock.invocationCallOrder[0]).toBeGreaterThan(
        dispatch.mock.invocationCallOrder[0]!,
      );
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe("삽입 뒤 selection(C5)", () => {
    it("drop 위치부터 마지막 줄 끝까지의 TextSelection이다", () => {
      const { editable, tiptap, pos } = setup(childDocument(), "p1", 2);

      plainDrop(editable, "X\nY");

      const { selection } = tiptap.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(selection.from).toBe(pos);
      expect(
        tiptap.state.doc.textBetween(selection.from, selection.to, "|"),
      ).toBe("X|Y");
      expect(selection.$to.parent.textContent).toBe("Ycd");
      expect(selection.$to.parentOffset).toBe(1);
    });
  });

  describe("PM 기본에 위임하는 입력(C7)", () => {
    // 플러그인의 handleDrop 반환값을 직접 읽는다. 위임이면 문서가 그대로다.
    const handled = (tiptap: Tiptap, event: DragEvent): unknown =>
      tiptap.view.someProp("handleDrop", (handler) =>
        handler(tiptap.view, event, Slice.empty, false),
      );

    it("내부 드래그(view.dragging)는 위임한다", () => {
      const { tiptap } = setup(childDocument(), "p1", 2);
      tiptap.view.dragging = { slice: Slice.empty, move: false };
      const before = tiptap.state.doc;

      expect(
        handled(tiptap, dropEventOf({ "text/plain": "X\nY" })),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("파일이 포함된 drop은 직접 삽입하지 않는다", () => {
      const { editor, editable } = setup(childDocument(), "p1", 2);
      // 직접 삽입은 줄마다 tr.insertText를 쓴다. 파일 drop은 미디어 확장이
      // 가져가므로 이 확장의 줄 삽입이 일어나지 않아야 한다.
      const insertText = vi.spyOn(Transaction.prototype, "insertText");
      const file = new File(["x"], "a.txt", { type: "text/plain" });

      try {
        dropData(editable, { "text/plain": "X\nY" }, [file]);

        expect(insertText).not.toHaveBeenCalled();
        expect(outline(blocksOf(editor)).join("|")).not.toContain("Ycd");
      } finally {
        insertText.mockRestore();
      }
    });

    it("text/html이 동반되면 위임한다", () => {
      const { tiptap } = setup(childDocument(), "p1", 2);
      const before = tiptap.state.doc;

      expect(
        handled(
          tiptap,
          dropEventOf({ "text/html": "<p>H</p>", "text/plain": "X\nY" }),
        ),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("한 줄 평문은 위임한다", () => {
      const { tiptap } = setup(childDocument(), "p1", 2);
      const before = tiptap.state.doc;

      expect(handled(tiptap, dropEventOf({ "text/plain": "X" }))).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("sanitize 뒤 한 줄이 되는 평문은 위임한다", () => {
      const { tiptap } = setup(childDocument(), "p1", 2);
      const before = tiptap.state.doc;

      expect(
        handled(tiptap, dropEventOf({ "text/plain": "X\u0001" })),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("평문이 비어 있으면 위임한다", () => {
      const { tiptap } = setup(childDocument(), "p1", 2);
      const before = tiptap.state.doc;

      expect(handled(tiptap, dropEventOf({}))).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("posAtCoords가 null이면 위임한다", () => {
      const { tiptap } = setup(childDocument(), "p1", 2);
      stubPosAtCoords(tiptap, null);
      const before = tiptap.state.doc;

      expect(
        handled(tiptap, dropEventOf({ "text/plain": "X\nY" })),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("표 셀 안 위치는 위임한다", () => {
      const { editor, cellIds } = editorWithTable();
      const { tiptap } = mountTiptapEditor(editor);
      const cellId = cellIds[0];
      if (cellId === undefined) throw new Error("셀 fixture 준비 실패");
      const boundary = findCellBoundaryPosition(tiptap, cellId);
      if (boundary === null) throw new Error("셀 위치 조회 실패");
      stubPosAtCoords(tiptap, boundary + 1);
      const before = tiptap.state.doc;

      expect(
        handled(tiptap, dropEventOf({ "text/plain": "X\nY" })),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("atom 블록(divider) 위치는 위임한다", () => {
      const { tiptap } = setup(
        [
          paragraphBlock("p1", "abcd"),
          dividerBlock("d1"),
          paragraphBlock("tail", "tail"),
        ],
        "p1",
        2,
      );
      const dividerPos = findBlockPosition(tiptap.state.doc, "d1");
      if (dividerPos === null) throw new Error("divider 위치 조회 실패");
      // divider 앞이다. 부모가 텍스트 블록이 아니다.
      stubPosAtCoords(tiptap, dividerPos);
      const before = tiptap.state.doc;

      expect(
        handled(tiptap, dropEventOf({ "text/plain": "X\nY" })),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("블록 사이 경계 위치는 위임한다", () => {
      const { tiptap } = setup(childDocument(), "p1", 2);
      // tail container 바로 앞이다. 부모가 blockGroup이다.
      stubPosAtCoords(tiptap, contentTextStart(tiptap, "tail") - 2);
      const before = tiptap.state.doc;

      expect(
        handled(tiptap, dropEventOf({ "text/plain": "X\nY" })),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("위임한 drop의 PM 기본 결과는 선택 위치가 아니라 좌표 위치에 평문 한 줄을 넣는 현행이다", () => {
      const { editor, editable } = setup(childDocument(), "p1", 2);

      dropData(editable, { "text/plain": "X" });

      expect(outline(blocksOf(editor))).toEqual(["p:abXcd[p:child]", "p:tail"]);
    });
  });

  describe("입력 정제와 마크·selection 비접촉(C8)", () => {
    const BOLD = { type: "bold" };

    it("무효 제어문자가 낀 평문은 문자를 지운 뒤 같은 배치로 놓인다", () => {
      const { editor, editable } = setup(childDocument(), "p1", 2);

      plainDrop(editable, `X${String.fromCharCode(1)}\nY`);

      expect(outline(blocksOf(editor))).toEqual([
        "p:abX[p:Ycd,p:child]",
        "p:tail",
      ]);
    });

    it("마크는 drop 위치의 캐럿 마크를 따르고 뒤쪽 원래 텍스트는 마크를 유지한다", () => {
      const { editor, editable, tiptap } = setup(
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
      // 현재 selection은 마크 없는 "cd" 안에 둔다. drop 위치("ab" 뒤)의 마크와
      // 달라야 마크 출처가 selection이 아니라 drop 위치임을 구분한다.
      const cdPos = contentTextStart(tiptap, "p1") + 3;
      tiptap.commands.setTextSelection(cdPos);

      plainDrop(editable, "X\nY");

      const blocks = blocksOf(editor);
      expect(runsOf(blocks[0])).toEqual([{ text: "abX", marks: [BOLD] }]);
      expect(runsOf(blocks[1])).toEqual([
        { text: "Y", marks: [BOLD] },
        { text: "cd" },
      ]);
    });

    it("drop과 무관한 곳의 범위 선택을 지우지 않는다", () => {
      const { editor, editable, tiptap } = setup(childDocument(), "p1", 2);
      const tailStart = contentTextStart(tiptap, "tail");
      tiptap.commands.setTextSelection({
        from: tailStart,
        to: tailStart + 2,
      });

      plainDrop(editable, "X\nY");

      expect(outline(blocksOf(editor))).toEqual([
        "p:abX[p:Ycd,p:child]",
        "p:tail",
      ]);
    });
  });

  // Issue #306 결함 2. 무효 문자가 든 drop은 PM 기본 drop이 원문 그대로 넣어
  // 되돌림 guard가 지웠다. 같은 위치 붙여넣기는 정리본을 넣는다. drop 결과가
  // 같은 캐럿 붙여넣기 결과와 같아야 한다.
  describe("무효 문자 drop(C9)", () => {
    const SOH = String.fromCharCode(1);
    const NUL = String.fromCharCode(0);
    const DEL = String.fromCharCode(0x7f);
    const LONE = String.fromCharCode(0xd800);

    // D9: p1 "abcd", codeBlock cb "code", 1x1 표(셀 "cell"), tail. drop 위치는
    // 각 대상 텍스트의 offset 2다.
    type Target = "문단" | "codeBlock" | "셀";
    const blocksFor = (): Block[] => [
      paragraphBlock("p1", "abcd"),
      codeBlockBlock("cb", "code"),
      singleCellTable("t", "cell"),
      paragraphBlock("tail", "tail"),
    ];
    const positionOf = (tiptap: Tiptap, target: Target): number => {
      if (target === "문단") return contentTextStart(tiptap, "p1") + 2;
      if (target === "codeBlock") return contentTextStart(tiptap, "cb") + 2;
      const boundary = findCellBoundaryPosition(tiptap, "t-r0c0");
      if (boundary === null) throw new Error("셀 조회 실패");
      return boundary + 1 + 2;
    };
    const mount = () => {
      const editor = createEditor({
        initialDocument: documentOf(...blocksFor()),
        createId: sequentialIds("id"),
      });
      const { editable, tiptap } = mountTiptapEditor(editor);
      editable.focus();
      return { editor, editable, tiptap };
    };
    const dropResult = (target: Target, entries: Record<string, string>) => {
      const { editor, editable, tiptap } = mount();
      // 선택은 tail 끝 캐럿이다. drop 위치와 다르다.
      tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);
      stubPosAtCoords(tiptap, positionOf(tiptap, target));
      dropData(editable, entries);
      return outline(blocksOf(editor));
    };
    const pasteResult = (target: Target, entries: Record<string, string>) => {
      const { editor, editable, tiptap } = mount();
      tiptap.commands.setTextSelection(positionOf(tiptap, target));
      pasteData(editable, entries);
      return outline(blocksOf(editor));
    };
    const original = () => {
      const { editor } = mount();
      return outline(blocksOf(editor));
    };

    it.each([
      ["문단", `a${SOH}b`],
      ["codeBlock", `a${SOH}b`],
      ["셀", `a${SOH}b`],
      ["문단", `a${NUL}b`],
      ["codeBlock", `a${DEL}b`],
      ["셀", `a${LONE}b`],
      ["codeBlock", `a${SOH}b\nc`],
      ["셀", `a${SOH}b\nc`],
    ] as const)(
      "%s에 무효 문자 평문 %j를 drop하면 같은 캐럿 붙여넣기와 같은 정리본이 들어간다",
      (target, text) => {
        const entries = { "text/plain": text };
        const dropped = dropResult(target, entries);

        expect(dropped).not.toEqual(original());
        expect(dropped).toEqual(pasteResult(target, entries));
      },
    );

    it.each(["문단", "셀"] as const)(
      "%s에 무효 문자 html을 drop하면 정리본이 들어간다",
      (target) => {
        const entries = { "text/html": `<p>a${SOH}b</p>`, "text/plain": "ab" };
        const dropped = dropResult(target, entries);

        expect(dropped).not.toEqual(original());
        expect(dropped.join("|")).toContain("ab");
      },
    );

    it("codeBlock에 Tab만 든 유효 평문 drop은 PM 기본에 맡겨 Tab이 남는다", () => {
      const tab = String.fromCharCode(9);
      const dropped = dropResult("codeBlock", { "text/plain": `a${tab}b` });

      expect(dropped.join("|")).toContain(`coa${tab}bde`);
    });
  });
});
