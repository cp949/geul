/**
 * 빈 slice html과 함께 온 평문 drop 계약을 고정한다(Issue #316). 수정 전에는
 * text/html이 있으면 planDrop이 평문 분기를 건너뛰었다. PM 파싱 결과가 빈
 * slice여도 PM 기본 drop이 빈 slice를 넣고 평문을 버려 문서가 그대로였다.
 * 같은 클립보드의 붙여넣기는 평문을 넣는다(#287 표 밖, #301 셀 안). 이제
 * 정리한 slice의 size가 0이면 html이 없는 drop처럼 평문을 넣는다.
 *
 * 다루는 축은 다음과 같다.
 * - E1 대표 재현: 문단 위 meta html + 평문 x가 위치에 x를 넣고 붙여넣기와 같음
 * - E2 위치 종류: 자식 있는 문단·접힌 toggle 라벨·표 셀·codeBlock
 * - E3 빈 slice가 되는 html 종류: `<p></p>`·`<hr>`·이미지·주석뿐
 * - E4 여러 줄 평문: 일반 블록 배치(#285)와 셀 hardBreak(#309)
 * - E5 한 줄 평문: drop 위치의 마크를 입힘, 무효 문자 정리
 * - E6 selection·transaction 계약
 * - E7 이전과 같은 입력: html에 내용이 있음, 평문이 비었음, 내부 드래그,
 *   파일 동반, 좌표 null, 평문을 놓을 수 없는 위치
 * - E8 좌표는 한 번만 푼다
 *
 * jsdom은 좌표를 해석하지 못해 view.posAtCoords를 stub한다. 위임 입력은
 * view.someProp("handleDrop")으로 호출해 플러그인의 반환값을 직접 읽는다.
 * 실제 브라우저 drop은 e2e/clipboard-paste.spec.ts가 맡는다.
 */
import type { Block } from "@cp949/geul-model";
import { Fragment, Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { contentTextStart } from "./block-test-support.js";
import {
  cellDropBlocks,
  childDocument,
  handledDrop,
  mountCellDrop,
  mountDropAt,
  stubPosAtCoords,
} from "./clipboard-drop-test-support.js";
import {
  blocksOf,
  dropData,
  dropEventOf,
  outline,
  pasteData,
  runsOf,
} from "./clipboard-test-support.js";
import {
  dividerBlock,
  paragraphBlock,
  toggleBlock,
} from "./editor-controller-support.js";
import { boldCellBlocks, kindsOf } from "./table-cell-paste-test-support.js";

const META = "<meta charset='utf-8'>";
const BOLD = { type: "bold" };
const SOH = String.fromCharCode(1);

// p1 "abcd", tail "tail".
const plainDocument = (): Block[] => [
  paragraphBlock("p1", "abcd"),
  paragraphBlock("tail", "tail"),
];

const htmlPlainDrop = (
  editable: HTMLElement,
  html: string,
  text: string,
): DragEvent => dropData(editable, { "text/html": html, "text/plain": text });

describe("빈 slice html과 함께 온 평문 drop(Issue #316)", () => {
  describe("대표 재현(E1)", () => {
    it("문단 위에 meta html과 평문 x를 drop하면 drop 위치에 x가 들어간다", () => {
      const { editor, editable } = mountDropAt(plainDocument(), "p1", 2);

      htmlPlainDrop(editable, META, "x");

      expect(outline(blocksOf(editor))).toEqual(["p:abxcd", "p:tail"]);
    });

    it("같은 위치 캐럿 붙여넣기와 문서가 같다", () => {
      const dropped = mountDropAt(plainDocument(), "p1", 2);
      htmlPlainDrop(dropped.editable, META, "x");

      const pasted = mountDropAt(plainDocument(), "p1", 2);
      pasted.tiptap.commands.setTextSelection(pasted.pos);
      pasteData(pasted.editable, { "text/html": META, "text/plain": "x" });

      expect(dropped.editor.getDocument().blocks).toEqual(
        pasted.editor.getDocument().blocks,
      );
    });
  });

  describe("빈 slice가 되는 html 종류(E3)", () => {
    it.each([
      ["빈 문단", "<p></p>"],
      ["구분선", "<hr>"],
      ["위험 src 이미지", '<img src="javascript:x">'],
      ["https 이미지", '<img src="https://example.com/a.png">'],
      ["meta와 이미지", `${META}<img src="https://example.com/a.png">`],
      ["Fragment 주석뿐", "<!--StartFragment--><!--EndFragment-->"],
      ["공백뿐", "   "],
      ["무효 문자뿐인 문단", `<p>${SOH}</p>`],
    ] as const)("%s html과 평문 x를 drop하면 x가 들어간다", (_label, html) => {
      const { editor, editable } = mountDropAt(plainDocument(), "p1", 2);

      htmlPlainDrop(editable, html, "x");

      expect(outline(blocksOf(editor))).toEqual(["p:abxcd", "p:tail"]);
    });
  });

  describe("위치 종류(E2)", () => {
    it("자식 있는 문단 위에서는 평문이 들어가고 기존 자식이 그대로다", () => {
      const { editor, editable } = mountDropAt(childDocument(), "p1", 2);

      htmlPlainDrop(editable, META, "x");

      const blocks = blocksOf(editor);
      expect(outline(blocks)).toEqual(["p:abxcd[p:child]", "p:tail"]);
      expect(blocks[0]?.id).toBe("p1");
      const children =
        "children" in blocks[0]! ? blocks[0].children : undefined;
      expect(children?.[0]?.id).toBe("c1");
    });

    it("접힌 toggle 라벨 위에서는 평문이 라벨에 들어가고 숨은 자식이 그대로다", () => {
      const { editor, editable } = mountDropAt(
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

      htmlPlainDrop(editable, META, "x");

      expect(outline(blocksOf(editor))).toEqual([
        "toggle~:abxcd[p:hidden]",
        "p:tail",
      ]);
    });

    it("표 셀 위에서는 평문이 셀에 들어가고 같은 위치 캐럿 붙여넣기와 문서가 같다", () => {
      const dropped = mountCellDrop();
      htmlPlainDrop(dropped.editable, META, "x");

      const pasted = mountCellDrop();
      pasted.tiptap.commands.setTextSelection(pasted.pos);
      pasteData(pasted.editable, { "text/html": META, "text/plain": "x" });

      expect(kindsOf(dropped.tiptap, "t-r0c0")).toEqual(["cexll"]);
      expect(dropped.editor.getDocument().blocks).toEqual(
        pasted.editor.getDocument().blocks,
      );
    });

    it("codeBlock 위에서는 평문이 코드 텍스트에 들어간다", () => {
      const { editor, editable } = mountDropAt(cellDropBlocks(), "cb", 2);

      htmlPlainDrop(editable, META, "x");

      expect(outline(blocksOf(editor)).slice(0, 3)).toEqual([
        "p:abcd",
        "code:coxde",
        "table:",
      ]);
    });

    it("codeBlock 위에서 Tab과 LF는 남기고 무효 문자만 지운다", () => {
      const { editor, editable } = mountDropAt(cellDropBlocks(), "cb", 2);

      htmlPlainDrop(editable, META, `a\tb${SOH}\r\nc`);

      expect(outline(blocksOf(editor))[1]).toBe("code:coa\tb\ncde");
    });
  });

  describe("여러 줄 평문(E4)", () => {
    it("일반 블록 위에서는 html 없는 여러 줄 drop(#285)과 같은 배치다", () => {
      const withHtml = mountDropAt(childDocument(), "p1", 2);
      htmlPlainDrop(withHtml.editable, META, "X\nY");

      const plainOnly = mountDropAt(childDocument(), "p1", 2);
      dropData(plainOnly.editable, { "text/plain": "X\nY" });

      expect(outline(blocksOf(withHtml.editor))).toEqual([
        "p:abX[p:Ycd,p:child]",
        "p:tail",
      ]);
      expect(withHtml.editor.getDocument().blocks).toEqual(
        plainOnly.editor.getDocument().blocks,
      );
    });

    it("접힌 toggle 라벨 위에서는 펼친 형제 toggle이 생기고 숨은 자식은 원본에 남는다(#252)", () => {
      const { editor, editable } = mountDropAt(
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

      htmlPlainDrop(editable, META, "X\nY");

      expect(outline(blocksOf(editor))).toEqual([
        "toggle~:abX[p:hidden]",
        "toggle:Ycd",
        "p:tail",
      ]);
    });

    it("표 셀 위에서는 줄 사이가 hardBreak로 이어진다(#309)", () => {
      const { editor, editable, tiptap } = mountCellDrop();

      htmlPlainDrop(editable, META, "X\nY");

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["ceX", "br", "Yll"]);
      expect(blocksOf(editor).map((block) => block.type)).toEqual([
        "paragraph",
        "codeBlock",
        "table",
        "paragraph",
      ]);
    });

    it("표 셀 위 여러 줄은 같은 위치 캐럿 붙여넣기와 문서가 같다", () => {
      const dropped = mountCellDrop();
      htmlPlainDrop(dropped.editable, META, "X\nY");

      const pasted = mountCellDrop();
      pasted.tiptap.commands.setTextSelection(pasted.pos);
      pasteData(pasted.editable, { "text/html": META, "text/plain": "X\nY" });

      expect(dropped.editor.getDocument().blocks).toEqual(
        pasted.editor.getDocument().blocks,
      );
    });
  });

  describe("한 줄 평문의 마크와 정리(E5)", () => {
    it("drop 위치의 마크를 입히고 selection의 마크는 입히지 않는다", () => {
      const { editor, editable, tiptap } = mountDropAt(
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
      // 선택은 마크 없는 "cd" 안이다. drop 위치("ab" 뒤)의 마크와 달라야 한다.
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "p1") + 3);

      htmlPlainDrop(editable, META, "x");

      expect(runsOf(blocksOf(editor)[0])).toEqual([
        { text: "abx", marks: [BOLD] },
        { text: "cd" },
      ]);
    });

    it("표 셀 위에서도 drop 위치의 마크를 입힌다", () => {
      const { editable, tiptap } = mountCellDrop(boldCellBlocks(), 3);

      htmlPlainDrop(editable, META, "x");

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["ce", "lxl*bold"]);
    });

    it("무효 문자는 지우고 남은 글자를 넣는다", () => {
      const { editor, editable } = mountDropAt(plainDocument(), "p1", 2);

      htmlPlainDrop(editable, META, `x${SOH}y`);

      expect(outline(blocksOf(editor))).toEqual(["p:abxycd", "p:tail"]);
    });
  });

  describe("selection과 transaction 계약(E6)", () => {
    it("삽입 범위가 TextSelection이다", () => {
      const { editable, tiptap, pos } = mountDropAt(plainDocument(), "p1", 2);

      htmlPlainDrop(editable, META, "xyz");

      const { selection } = tiptap.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(selection.from).toBe(pos);
      expect(selection.to).toBe(pos + 3);
      expect(tiptap.state.doc.textBetween(selection.from, selection.to)).toBe(
        "xyz",
      );
    });

    it("tr은 uiEvent drop만 달고 paste meta를 달지 않으며 dispatch 뒤 view.focus()를 부른다", () => {
      const { editable, tiptap } = mountDropAt(plainDocument(), "p1", 2);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");
      const focus = vi.spyOn(tiptap.view, "focus");

      const event = htmlPlainDrop(editable, META, "x");

      const transaction = dispatch.mock.calls[0]?.[0];
      expect(transaction?.getMeta("uiEvent")).toBe("drop");
      expect(transaction?.getMeta("paste")).toBeUndefined();
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus.mock.invocationCallOrder[0]).toBeGreaterThan(
        dispatch.mock.invocationCallOrder[0]!,
      );
      expect(event.defaultPrevented).toBe(true);
    });

    it.each([
      ["한 줄", "x"],
      ["여러 줄", "X\nY\nZ"],
    ] as const)(
      "%s은 dispatch 1회, revision +1, undo 1회로 원복된다",
      (_label, text) => {
        const { editor, editable, tiptap } = mountDropAt(
          childDocument(),
          "p1",
          2,
        );
        const initialJson = tiptap.state.doc.toJSON();
        const revision = editor.getDocument().revision;
        const dispatch = vi.spyOn(tiptap.view, "dispatch");

        htmlPlainDrop(editable, META, text);

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(editor.getDocument().revision).toBe(revision + 1);

        tiptap.commands.undo();
        expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
      },
    );

    it("drop과 무관한 곳의 범위 선택을 지우지 않는다", () => {
      const { editor, editable, tiptap } = mountDropAt(
        plainDocument(),
        "p1",
        2,
      );
      const tailStart = contentTextStart(tiptap, "tail");
      tiptap.commands.setTextSelection({ from: tailStart, to: tailStart + 2 });

      htmlPlainDrop(editable, META, "x");

      expect(outline(blocksOf(editor))).toEqual(["p:abxcd", "p:tail"]);
    });
  });

  describe("이전과 같은 입력(E7)", () => {
    it("html에 내용이 있으면(slice가 비지 않으면) PM 기본에 맡기고 평문은 쓰지 않는다", () => {
      const { tiptap } = mountDropAt(plainDocument(), "p1", 2);
      const before = tiptap.state.doc;
      const slice = new Slice(
        Fragment.from(tiptap.state.schema.text("H")),
        0,
        0,
      );

      expect(
        handledDrop(
          tiptap,
          dropEventOf({ "text/html": "<p>H</p>", "text/plain": "x" }),
          slice,
        ),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("html에 내용이 있는 실제 drop은 PM 기본 결과이고 평문이 섞이지 않는다", () => {
      const { editor, editable } = mountDropAt(plainDocument(), "p1", 2);

      htmlPlainDrop(editable, "<p>H</p>", "x");

      // PM 기본 drop 결과다. html의 H만 들어가고 평문 x는 쓰지 않는다.
      expect(outline(blocksOf(editor))).toEqual(["p:abHcd", "p:tail"]);
    });

    it("셀 위에서 html에 내용이 있으면 html만 셀에 들어간다", () => {
      const { tiptap, editable } = mountCellDrop();

      htmlPlainDrop(editable, "<p>H</p>", "x\ny");

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["ceHll"]);
    });

    it("평문이 없으면 위임한다", () => {
      const { tiptap } = mountDropAt(plainDocument(), "p1", 2);
      const before = tiptap.state.doc;

      expect(
        handledDrop(tiptap, dropEventOf({ "text/html": META })),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("평문이 정리 뒤 비면 위임한다", () => {
      const { tiptap } = mountDropAt(plainDocument(), "p1", 2);
      const before = tiptap.state.doc;

      expect(
        handledDrop(
          tiptap,
          dropEventOf({ "text/html": META, "text/plain": SOH }),
        ),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("codeBlock 위에서 평문이 무효 문자뿐이면 이벤트를 소비하고 문서는 그대로다", () => {
      const { tiptap } = mountDropAt(cellDropBlocks(), "cb", 2);
      const before = tiptap.state.doc;
      // codeBlock 안에서 PM은 html을 무시하고 평문 텍스트 노드로 slice를 만든다.
      const slice = new Slice(
        Fragment.from(tiptap.state.schema.text(SOH)),
        0,
        0,
      );

      expect(
        handledDrop(
          tiptap,
          dropEventOf({ "text/html": META, "text/plain": SOH }),
          slice,
        ),
      ).toBeTruthy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("내부 드래그(view.dragging)는 위임한다", () => {
      const { tiptap } = mountDropAt(plainDocument(), "p1", 2);
      tiptap.view.dragging = { slice: Slice.empty, move: false };
      const before = tiptap.state.doc;

      expect(
        handledDrop(
          tiptap,
          dropEventOf({ "text/html": META, "text/plain": "x" }),
        ),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("파일이 포함된 drop은 평문을 넣지 않는다", () => {
      const { editor, editable } = mountDropAt(plainDocument(), "p1", 2);
      const file = new File(["x"], "a.txt", { type: "text/plain" });

      dropData(editable, { "text/html": META, "text/plain": "x" }, [file]);

      expect(outline(blocksOf(editor))).not.toContain("p:abxcd");
    });

    it("posAtCoords가 null이면 위임한다", () => {
      const { tiptap } = mountDropAt(plainDocument(), "p1", 2);
      stubPosAtCoords(tiptap, null);
      const before = tiptap.state.doc;

      expect(
        handledDrop(
          tiptap,
          dropEventOf({ "text/html": META, "text/plain": "x" }),
        ),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("평문을 놓을 수 없는 atom 블록 위치는 위임한다", () => {
      const { tiptap } = mountDropAt(
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
      stubPosAtCoords(tiptap, dividerPos);
      const before = tiptap.state.doc;

      expect(
        handledDrop(
          tiptap,
          dropEventOf({ "text/html": META, "text/plain": "x" }),
        ),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });

    it("html이 없는 한 줄 평문은 여전히 PM 기본에 맡긴다", () => {
      const { tiptap } = mountDropAt(plainDocument(), "p1", 2);
      const before = tiptap.state.doc;

      expect(
        handledDrop(tiptap, dropEventOf({ "text/plain": "x" })),
      ).toBeFalsy();
      expect(tiptap.state.doc).toBe(before);
    });
  });

  describe("좌표 해석(E8)", () => {
    it("posAtCoords는 한 번만 부른다", () => {
      const { tiptap, pos } = mountDropAt(plainDocument(), "p1", 2);
      const posAtCoords = vi.fn(() => ({ pos, inside: pos }));
      tiptap.view.posAtCoords = posAtCoords;

      // 플러그인 handleDrop만 직접 부른다. 실제 drop 이벤트는 PM이 먼저 한 번 푼다.
      handledDrop(
        tiptap,
        dropEventOf({ "text/html": META, "text/plain": "x" }),
      );

      expect(posAtCoords).toHaveBeenCalledTimes(1);
    });
  });
});
