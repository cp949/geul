/**
 * 표 셀 위 여러 블록 text/html drop 계약을 고정한다(Issue #311). 수정 전에는
 * PM 기본 drop이 셀에 첫 블록만 넣고 나머지를 표 뒤로 뺐다. 목록 여러 항목은
 * PM이 셀 조각으로 파싱해 되돌림 guard가 drop을 지웠다. 이제 importHtml 블록을
 * 줄로 평탄화해 hardBreak로 이어 셀 안에 한 transaction으로 넣는다. 같은 위치
 * 캐럿 붙여넣기(#304)와 문서가 같다.
 *
 * 다루는 축은 다음과 같다.
 * - D1 이슈 재현 문서와 입력 종류(문단 둘·셋, 제목+문단, 목록 둘)
 * - D2 같은 위치 캐럿 붙여넣기와 문서가 같음
 * - D3 줄 안 마크는 html의 것이고 위치의 마크는 입히지 않음
 * - D4 selection·meta·dispatch 1회·revision +1·undo 1회·현재 selection 보존
 * - D5 현행을 유지하는 입력(importHtml 실패·내부 드래그·파일 동반·좌표
 *   null). 한 블록 html은 Issue #316이 정정해 셀 안에 직접 넣는다. 표를 포함한
 *   html은 표 단독까지 Issue #312, #313이 정정해
 *   clipboard-drop-cell-html-table.test.ts가 소유한다
 * - D6 셀이 아닌 위치는 importHtml을 부르지 않고 좌표를 한 번만 푼다
 *
 * jsdom은 좌표를 해석하지 못해 view.posAtCoords를 stub한다. 위임 입력은
 * view.someProp("handleDrop")으로 호출해 플러그인의 반환값을 직접 읽는다.
 * 실제 브라우저 drop은 e2e/clipboard-paste.spec.ts가 맡는다.
 */
import { importHtml } from "@cp949/geul-io";
import { Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { contentTextStart } from "./block-test-support.js";
import {
  cellDropBlocks,
  handledDrop,
  htmlDrop,
  mountCellDrop,
  stubPosAtCoords,
} from "./clipboard-drop-test-support.js";
import {
  blocksOf,
  dropData,
  dropEventOf,
  outline,
  pasteData,
} from "./clipboard-test-support.js";
import { dividerBlock, paragraphBlock } from "./editor-controller-support.js";
import { inCell } from "./table-boundary-test-support.js";
import { boldCellBlocks, kindsOf } from "./table-cell-paste-test-support.js";
import { findCellBoundaryPosition } from "./table-test-support.js";

// importHtml 호출 여부를 본다. 기본은 원본 그대로이고, 실패 케이스만 한 번 실패로 바꾼다.
vi.mock("@cp949/geul-io", async (importOriginal) => {
  const original = await importOriginal<typeof import("@cp949/geul-io")>();
  return { ...original, importHtml: vi.fn(original.importHtml) };
});

const TWO_PARAGRAPHS = "<p>H1</p><p>H2</p>";

beforeEach(() => {
  vi.mocked(importHtml).mockClear();
});

describe("표 셀 위 여러 블록 html drop(Issue #311)", () => {
  describe("입력 종류(D1)", () => {
    it("이슈 재현 문서에서 문단 둘 html이 셀 안 hardBreak로 들어가고 표 뒤 문단이 생기지 않는다", () => {
      const { editor, editable, tiptap } = mountCellDrop();

      htmlDrop(editable, TWO_PARAGRAPHS);

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["ceH1", "br", "H2ll"]);
      expect(blocksOf(editor).map((block) => block.type)).toEqual([
        "paragraph",
        "codeBlock",
        "table",
        "paragraph",
      ]);
      expect(outline(blocksOf(editor)).at(-1)).toBe("p:tail");
    });

    it.each([
      ["문단 셋", "<p>a</p><p>b</p><p>c</p>", ["cea", "br", "b", "br", "cll"]],
      ["제목+문단", "<h1>a</h1><p>b</p>", ["cea", "br", "bll"]],
      ["목록 둘", "<ul><li>a</li><li>b</li></ul>", ["cea", "br", "bll"]],
    ] as const)(
      "%s html이 한 셀 안에 hardBreak로 들어간다",
      (_label, html, kinds) => {
        const { editor, editable, tiptap } = mountCellDrop();

        htmlDrop(editable, html);

        expect(kindsOf(tiptap, "t-r0c0")).toEqual(kinds);
        expect(blocksOf(editor).map((block) => block.type)).toEqual([
          "paragraph",
          "codeBlock",
          "table",
          "paragraph",
        ]);
        expect(outline(blocksOf(editor)).at(-1)).toBe("p:tail");
      },
    );
  });

  describe("같은 위치 캐럿 붙여넣기와 같은 문서(D2)", () => {
    it.each([
      ["문단 둘", TWO_PARAGRAPHS],
      ["문단 셋", "<p>a</p><p>b</p><p>c</p>"],
      ["제목+문단", "<h1>a</h1><p>b</p>"],
      ["목록 둘", "<ul><li>a</li><li>b</li></ul>"],
    ] as const)("%s 입력은 문서가 같다", (_label, html) => {
      const entries = { "text/html": html, "text/plain": "plain" };
      const dropped = mountCellDrop();
      dropData(dropped.editable, entries);

      const pasted = mountCellDrop();
      pasted.tiptap.commands.setTextSelection(pasted.pos);
      pasteData(pasted.editable, entries);

      expect(dropped.editor.getDocument().blocks).not.toEqual(
        mountCellDrop().editor.getDocument().blocks,
      );
      expect(dropped.editor.getDocument().blocks).toEqual(
        pasted.editor.getDocument().blocks,
      );
    });
  });

  describe("마크(D3)", () => {
    it("줄 안 마크는 html의 것이다", () => {
      const { editable, tiptap } = mountCellDrop();

      htmlDrop(editable, "<p><strong>B</strong></p><p>c</p>");

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["ce", "B*bold", "br", "cll"]);
    });

    it("drop 위치의 마크를 입히지 않는다", () => {
      // 셀은 "ce" + bold "ll"이다. drop 위치는 bold "ll" 안(offset 3)이다.
      const { editable, tiptap } = mountCellDrop(boldCellBlocks(), 3);

      htmlDrop(editable, "<p>X</p><p>Y</p>");

      expect(kindsOf(tiptap, "t-r0c0")).toEqual([
        "ce",
        "l*bold",
        "X",
        "br",
        "Y",
        "l*bold",
      ]);
    });
  });

  describe("한 블록 html(Issue #316)", () => {
    it("색 마크를 유지해 셀에 넣고 표 뒤 문단을 만들지 않는다", () => {
      const { editor, editable, tiptap } = mountCellDrop();

      htmlDrop(editable, '<p><span style="color:#ff0000">red</span></p>');

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["ce", "red*textColor", "ll"]);
      expect(blocksOf(editor).map((block) => block.type)).toEqual([
        "paragraph",
        "codeBlock",
        "table",
        "paragraph",
      ]);
    });

    it("`<pre><code>` 개행은 hardBreak이고 code 마크가 없다", () => {
      const { editable, tiptap } = mountCellDrop();

      htmlDrop(editable, "<pre><code>l1\nl2\nl3</code></pre>");

      expect(kindsOf(tiptap, "t-r0c0")).toEqual([
        "cel1",
        "br",
        "l2",
        "br",
        "l3ll",
      ]);
    });

    it("drop 위치의 마크를 입히지 않는다", () => {
      // 셀은 "ce" + bold "ll"이다. drop 위치는 bold "ll" 안(offset 3)이다.
      const { editable, tiptap } = mountCellDrop(boldCellBlocks(), 3);

      htmlDrop(editable, "<p>X</p>");

      expect(kindsOf(tiptap, "t-r0c0")).toEqual([
        "ce",
        "l*bold",
        "X",
        "l*bold",
      ]);
    });

    it.each([
      ["색 마크 한 블록", '<p><span style="color:#ff0000">r</span></p>'],
      ["한 항목 목록", "<ul><li>a</li></ul>"],
      ["pre 단독", "<pre>x</pre>"],
    ] as const)(
      "%s drop은 같은 위치 캐럿 붙여넣기와 문서가 같다",
      (_label, html) => {
        const entries = { "text/html": html, "text/plain": "plain" };
        const dropped = mountCellDrop();
        dropData(dropped.editable, entries);

        const pasted = mountCellDrop();
        pasted.tiptap.commands.setTextSelection(pasted.pos);
        pasteData(pasted.editable, entries);

        expect(dropped.editor.getDocument().blocks).not.toEqual(
          mountCellDrop().editor.getDocument().blocks,
        );
        expect(dropped.editor.getDocument().blocks).toEqual(
          pasted.editor.getDocument().blocks,
        );
      },
    );

    it.each([
      ["빈 문단", "<p></p>"],
      ["구분선", "<hr>"],
    ] as const)(
      "줄이 0개인 %s는 html을 직접 삽입하지 않고 빈 slice라 평문을 셀에 넣는다(Issue #316으로 정정)",
      (_label, html) => {
        const { tiptap } = mountCellDrop();

        // Issue #316 전에는 PM 기본에 위임해 문서가 그대로였다. 빈 slice html은
        // 평문 폴백이 평문을 넣는다. html의 줄은 넣지 않아 hardBreak가 없다.
        expect(
          handledDrop(
            tiptap,
            dropEventOf({ "text/html": html, "text/plain": "plain" }),
          ),
        ).toBeTruthy();
        expect(kindsOf(tiptap, "t-r0c0")).toEqual(["ceplainll"]);
      },
    );
  });

  describe("transaction 계약(D4)", () => {
    it("drop 뒤 selection은 삽입 범위이고 tr은 uiEvent drop만 단다", () => {
      const { editable, tiptap, pos } = mountCellDrop();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      const event = htmlDrop(editable, "<p>X</p><p>Y</p>");

      const { selection } = tiptap.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(selection.from).toBe(pos);
      // X(1) + hardBreak(1) + Y(1)
      expect(selection.to).toBe(pos + 3);
      expect(
        tiptap.state.doc.textBetween(selection.from, selection.to, "", "\n"),
      ).toBe("X\nY");
      const transaction = dispatch.mock.calls[0]?.[0];
      expect(transaction?.getMeta("uiEvent")).toBe("drop");
      expect(transaction?.getMeta("paste")).toBeUndefined();
      expect(event.defaultPrevented).toBe(true);
    });

    it("dispatch 1회, revision +1, undo 1회로 원복된다", () => {
      const { editor, editable, tiptap } = mountCellDrop();
      const initialJson = tiptap.state.doc.toJSON();
      const revision = editor.getDocument().revision;
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      htmlDrop(editable, "<p>X</p><p>Y</p><p>Z</p>");

      expect(kindsOf(tiptap, "t-r0c0")).toEqual([
        "ceX",
        "br",
        "Y",
        "br",
        "Zll",
      ]);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(editor.getDocument().revision).toBe(revision + 1);

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("drop과 무관한 범위 선택을 지우지 않는다", () => {
      const { editor, editable, tiptap } = mountCellDrop();
      const tailStart = contentTextStart(tiptap, "tail");
      tiptap.commands.setTextSelection({
        from: tailStart,
        to: tailStart + 2,
      });

      htmlDrop(editable, "<p>X</p><p>Y</p>");

      expect(outline(blocksOf(editor)).at(-1)).toBe("p:tail");
      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["ceX", "br", "Yll"]);
    });

    it("같은 셀 안의 다른 범위 선택을 지우지 않는다", () => {
      const { editable, tiptap } = mountCellDrop(cellDropBlocks(), 1);
      tiptap.commands.setTextSelection({
        from: inCell("t-r0c0", 2)(tiptap),
        to: inCell("t-r0c0", 4)(tiptap),
      });

      htmlDrop(editable, "<p>X</p><p>Y</p>");

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["cX", "br", "Yell"]);
    });
  });

  describe("현행을 유지하는 입력(D5, 한 블록은 Issue #316으로 정정)", () => {
    // Issue #316 정정: 한 블록 html도 셀 안에 직접 넣는다. 이전에는 위임했다.
    it.each([
      ["한 블록 html", "<p>H</p>"],
      ["한 항목 목록", "<ul><li>a</li></ul>"],
      ["pre 단독", "<pre>x</pre>"],
    ] as const)(
      "%s는 위임하지 않고 셀 안에 직접 삽입한다(Issue #316으로 정정)",
      (_label, html) => {
        const { tiptap } = mountCellDrop();
        const before = tiptap.state.doc;

        // 평문을 싣지 않는다. 평문이 있으면 셀 html 분기가 깨져도 빈 slice 평문
        // 폴백이 평문을 넣어 이 테스트가 거짓 통과한다(Issue #316 리뷰 m3).
        // 평문이 없으면 분기가 깨질 때 위임(falsy)이고 문서가 그대로다.
        expect(
          handledDrop(tiptap, dropEventOf({ "text/html": html })),
        ).toBeTruthy();
        expect(tiptap.state.doc).not.toBe(before);
        expect(kindsOf(tiptap, "t-r0c0")).not.toEqual(["cell"]);
      },
    );

    // Issue #316 정정: 결과는 PM 기본과 같지만 직접 삽입이 만든다.
    it.each([
      ["한 블록 html", "<p>H</p>", ["ceHll"]],
      ["한 항목 목록", "<ul><li>a</li></ul>", ["ceall"]],
      ["pre 단독", "<pre>x</pre>", ["cexll"]],
    ] as const)(
      "%s drop은 셀 안 한 줄 결과가 정상이다(Issue #316으로 정정)",
      (_label, html, kinds) => {
        const { editable, tiptap } = mountCellDrop();

        htmlDrop(editable, html);

        expect(kindsOf(tiptap, "t-r0c0")).toEqual(kinds);
        expect(tiptap.state.doc.childCount).toBe(4);
      },
    );

    // Issue #316 리뷰 M1: Google Docs 복사는 굵지 않은 `<b>`로 문서를 감싼다.
    it("Google Docs 모양(굵지 않은 <b> 래퍼) drop은 bold 없이 text와 textColor가 된다", () => {
      const { editable, tiptap } = mountCellDrop();

      htmlDrop(
        editable,
        '<b style="font-weight:normal;" id="docs-internal-guid-x"><p><span style="color:#000000;font-weight:400;">hello</span></p></b>',
      );

      expect(kindsOf(tiptap, "t-r0c0")).toEqual([
        "ce",
        "hello*textColor",
        "ll",
      ]);
      expect(tiptap.state.doc.childCount).toBe(4);
    });

    // Issue #316 리뷰 m1: 줄 양끝의 소스 들여쓰기는 남지 않는다.
    it("문단 양끝의 소스 공백·개행은 자르고 한 줄로 넣는다", () => {
      const { editable, tiptap } = mountCellDrop();

      htmlDrop(editable, "<p>\n      Some text here\n    </p>");

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["ceSome text herell"]);
    });

    it("importHtml이 실패하면 위임한다", () => {
      vi.mocked(importHtml).mockImplementationOnce(() => ({
        ok: false,
        error: { code: "HTML_PARSE_FAILED", message: "forced" },
      }));
      const { tiptap } = mountCellDrop();
      const before = tiptap.state.doc;

      expect(
        handledDrop(tiptap, dropEventOf({ "text/html": TWO_PARAGRAPHS })),
      ).toBeFalsy();
      expect(importHtml).toHaveBeenCalledTimes(1);
      expect(tiptap.state.doc).toBe(before);
    });

    it("내부 드래그(view.dragging)는 importHtml을 부르지 않고 위임한다", () => {
      const { tiptap } = mountCellDrop();
      tiptap.view.dragging = { slice: Slice.empty, move: false };
      const before = tiptap.state.doc;

      expect(
        handledDrop(tiptap, dropEventOf({ "text/html": TWO_PARAGRAPHS })),
      ).toBeFalsy();
      expect(importHtml).not.toHaveBeenCalled();
      expect(tiptap.state.doc).toBe(before);
    });

    it("파일 동반 drop은 importHtml을 부르지 않고 직접 삽입하지 않는다", () => {
      const { editable, tiptap } = mountCellDrop();
      const file = new File(["x"], "a.txt", { type: "text/plain" });

      dropData(editable, { "text/html": TWO_PARAGRAPHS }, [file]);

      expect(importHtml).not.toHaveBeenCalled();
      expect(kindsOf(tiptap, "t-r0c0")).not.toContain("br");
    });

    it("posAtCoords가 null이면 importHtml을 부르지 않고 위임한다", () => {
      const { tiptap } = mountCellDrop();
      stubPosAtCoords(tiptap, null);
      const before = tiptap.state.doc;

      expect(
        handledDrop(tiptap, dropEventOf({ "text/html": TWO_PARAGRAPHS })),
      ).toBeFalsy();
      expect(importHtml).not.toHaveBeenCalled();
      expect(tiptap.state.doc).toBe(before);
    });
  });

  describe("셀이 아닌 위치(D6)", () => {
    // 위치를 stub하고 handleDrop을 직접 호출한다. importHtml 미호출과 좌표
    // 해석 1회를 함께 본다.
    const expectDelegatedWithoutImport = (
      tiptap: ReturnType<typeof mountCellDrop>["tiptap"],
      pos: number,
    ): void => {
      const posAtCoords = vi.fn(() => ({ pos, inside: pos }));
      tiptap.view.posAtCoords = posAtCoords;
      const before = tiptap.state.doc;

      expect(
        handledDrop(tiptap, dropEventOf({ "text/html": TWO_PARAGRAPHS })),
      ).toBeFalsy();

      expect(importHtml).not.toHaveBeenCalled();
      expect(posAtCoords).toHaveBeenCalledTimes(1);
      expect(tiptap.state.doc).toBe(before);
    };

    it("문단 위치는 importHtml을 부르지 않는다", () => {
      const { tiptap } = mountCellDrop();
      expectDelegatedWithoutImport(tiptap, contentTextStart(tiptap, "p1") + 2);
    });

    it("codeBlock 위치는 importHtml을 부르지 않는다", () => {
      const { tiptap } = mountCellDrop();
      expectDelegatedWithoutImport(tiptap, contentTextStart(tiptap, "cb") + 2);
    });

    it("표 셀 경계(부모가 행) 위치는 importHtml을 부르지 않는다", () => {
      const { tiptap } = mountCellDrop();
      const boundary = findCellBoundaryPosition(tiptap, "t-r0c0");
      if (boundary === null) throw new Error("셀 위치 조회 실패");
      expectDelegatedWithoutImport(tiptap, boundary);
    });

    it("블록 사이 경계 위치는 importHtml을 부르지 않는다", () => {
      const { tiptap } = mountCellDrop();
      // tail container 바로 앞이다. 부모가 blockGroup이다.
      expectDelegatedWithoutImport(
        tiptap,
        contentTextStart(tiptap, "tail") - 2,
      );
    });

    it("atom 블록(divider) 위치는 importHtml을 부르지 않는다", () => {
      const { tiptap } = mountCellDrop([
        paragraphBlock("p1", "abcd"),
        dividerBlock("d1"),
        ...cellDropBlocks().slice(2),
      ]);
      const dividerPos = findBlockPosition(tiptap.state.doc, "d1");
      if (dividerPos === null) throw new Error("divider 위치 조회 실패");
      expectDelegatedWithoutImport(tiptap, dividerPos);
    });

    it("문단 위치의 여러 블록 html drop은 PM 기본이고 셀을 건드리지 않는다", () => {
      const { editable, tiptap } = mountCellDrop();
      stubPosAtCoords(tiptap, contentTextStart(tiptap, "p1") + 2);

      htmlDrop(editable, TWO_PARAGRAPHS);

      expect(kindsOf(tiptap, "t-r0c0")).toEqual(["cell"]);
    });
  });
});
