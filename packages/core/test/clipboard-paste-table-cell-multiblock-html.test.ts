/**
 * 표 셀 안 여러 블록 html 붙여넣기 계약을 고정한다(Issue #304).
 * 수정 전에는 여러 블록 html을 PM 기본에 맡겼다. 문단 여러 개는 첫 문단만 셀에
 * 들어가고 나머지가 표 뒤 문단이 됐다. 목록·`<pre>` 여러 블록은 PM이 셀 조각으로
 * 오인해 되돌림 guard가 붙여넣기를 지웠다. 이제 importHtml이 만든 블록을 줄로
 * 평탄화해 hardBreak로 이어 셀 안에 한 transaction으로 직접 넣는다.
 *
 * 다루는 축은 다음과 같다.
 * - H1~H2 문단·목록 여러 블록(문서가 바뀌고 되돌려지지 않음)
 * - H3 선택 종류(셀 중간 캐럿·같은 셀 범위·마지막이 아닌 셀·인라인 atom)
 * - H4 줄 안 마크 유지와 캐럿 마크 비상속
 * - H5 서식 없는 블록 종류(제목·인용·중첩 목록)와 깊이 우선 순서
 * - H6 codeBlock(내부 개행은 hardBreak, code 마크 없음)
 * - H7~H8 빈 블록·구분선·이미지는 줄을 내지 않음
 * - H9 표 포함 html은 이전 경로
 * - H10 줄이 1개인 html. Issue #316 전에는 이전 경로(PM 기본)였고 지금은
 *   같은 평탄화로 넣는다(`<pre>` 단독은 개행이 hardBreak로 바뀌었다)
 * - 한 블록 html(Issue #316) 색 마크·`<pre>` 개행·소스 개행과 줄 0개 입력
 * - H11 무효 문자 정리(정리 뒤 줄이 1개여도 셀에 넣음)
 * - F1·F2·F4 개행·공백뿐인 문단 접기, 줄 1개만 남는 html, 마크 공존
 *   (Issue #304 리뷰)
 * - H13 dispatch 1회·undo 1회·삽입 끝 캐럿·pasteHandler 미호출
 * - H14 서식 없이 붙여넣기·표 밖은 이전과 같음. 셀 위 drop은 Issue #311이
 *   정정(planDrop이 같은 평탄화로 셀에 넣음). CellSelection은
 *   Issue #308이 정정(같은 평탄화로 첫 셀에 넣음)
 *
 * 셀 결과는 모델 요약(outline)과 PM 셀 노드의 자식 종류(text·hardBreak)를
 * 함께 본다. outline은 hardBreak를 개행 문자로 보여 준다.
 */
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { dropEventOf } from "./clipboard-test-support.js";
import { documentOf, mounted } from "./editor-controller-support.js";
import { inBlock, inCell, outline } from "./table-boundary-test-support.js";
import {
  atomBlocks,
  atomSelected,
  boldCellBlocks,
  docOutline,
  expectTableIntact,
  findCell,
  firstCellBlocks,
  kindsOf,
  lastCellBlocks,
  pasteIn,
  selectFirstTwoCells,
  textSelection,
  withTag,
} from "./table-cell-paste-test-support.js";

const SOH = String.fromCharCode(1);
const TAB = String.fromCharCode(9);

/** 마지막 셀 끝 캐럿에 html과 평문을 붙인다. */
const pasteAtCellEnd = (html: string, text: string, shift = false) =>
  pasteIn(
    lastCellBlocks(),
    textSelection(inCell("t-r0c0", 4)),
    { "text/html": html, "text/plain": text },
    { shift },
  );

describe("표 셀 안 여러 블록 html 붙여넣기(Issue #304)", () => {
  describe("문단·목록 여러 블록(H1~H2)", () => {
    it("문단 둘을 hardBreak로 이어 셀에 넣고 표 뒤에 문단을 만들지 않는다(H1)", () => {
      const result = pasteAtCellEnd("<p>a</p><p>b</p>", "a\nb");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
      expect(result.blocks()).toEqual(docOutline("table[cella\nb]"));
      expectTableIntact(result);
      expect(result.event.defaultPrevented).toBe(true);
    });

    it.each([
      { name: "순서 없는 목록", html: "<ul><li>a</li><li>b</li></ul>" },
      { name: "순서 있는 목록", html: "<ol><li>a</li><li>b</li></ol>" },
    ])(
      "$name 항목 둘을 셀에 넣는다. 문서가 바뀌고 되돌림 guard가 지우지 않는다(H2)",
      ({ html }) => {
        const result = pasteAtCellEnd(html, "a\nb");

        expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
        expect(result.blocks()).toEqual(docOutline("table[cella\nb]"));
        expect(result.editor.getDocument().revision).toBe(
          result.before.document.revision + 1,
        );
        expectTableIntact(result);
      },
    );
  });

  describe("선택 종류(H3)", () => {
    it("셀 중간 캐럿은 캐럿 앞뒤 텍스트를 첫 줄·끝 줄과 잇는다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 2)),
        { "text/html": "<p>a</p><p>b</p>", "text/plain": "a\nb" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cea", "br", "bll"]);
      expectTableIntact(result);
    });

    it("같은 셀 안 범위는 범위를 대체한다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 1), inCell("t-r0c0", 3)),
        { "text/html": "<ul><li>a</li><li>b</li></ul>", "text/plain": "a\nb" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["ca", "br", "bl"]);
      expectTableIntact(result);
    });

    it("마지막이 아닌 셀(1x2 첫 셀)에서도 붙여넣기가 사라지지 않고 표가 쪼개지지 않는다", () => {
      const result = pasteIn(
        firstCellBlocks(),
        textSelection(inCell("g-r0c0", 2)),
        { "text/html": "<ul><li>a</li><li>b</li></ul>", "text/plain": "a\nb" },
      );

      expect(kindsOf(result.tiptap, "g-r0c0")).toEqual(["c1a", "br", "b"]);
      expect(result.blocks()).toEqual(docOutline("table[c1a\nb|c2]"));
      expectTableIntact(result);
    });

    it("인라인 atom NodeSelection은 atom을 대체한다", () => {
      const result = pasteIn(
        atomBlocks(),
        atomSelected,
        { "text/html": "<p>a</p><p>b</p>", "text/plain": "a\nb" },
        withTag,
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["aba", "br", "bcd"]);
      expect(result.blocks()).toEqual(docOutline("table[aba\nbcd]"));
      expectTableIntact(result);
    });
  });

  describe("줄 안 마크(H4)", () => {
    it("bold·link·textColor를 유지한다", () => {
      const result = pasteAtCellEnd(
        '<p><b>a</b> <a href="https://x.y">l</a></p>' +
          '<p><span style="color:#ff0000">c</span></p>',
        "a l\nc",
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "cell",
        "a*bold",
        " ",
        "l*link",
        "br",
        "c*textColor",
      ]);
      expectTableIntact(result);
    });

    it("link 마크는 sanitize를 거친 href를 유지한다", () => {
      const result = pasteAtCellEnd(
        '<p><a href="https://x.y/z">l</a></p><p>b</p>',
        "l\nb",
      );

      let href: unknown = null;
      findCell(result.tiptap.state.doc, "t-r0c0").forEach((child) => {
        const link = child.marks.find((mark) => mark.type.name === "link");
        if (link !== undefined) href = link.attrs.href;
      });
      expect(href).toBe("https://x.y/z");
      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "cell",
        "l*link",
        "br",
        "b",
      ]);
    });

    it("캐럿 위치 마크는 삽입 텍스트와 hardBreak에 상속하지 않는다", () => {
      const result = pasteIn(
        boldCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/html": "<p>a</p><p>b</p>", "text/plain": "a\nb" },
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "ce",
        "ll*bold",
        "a",
        "br",
        "b",
      ]);
    });
  });

  describe("서식 없는 블록 종류와 순서(H5)", () => {
    it("제목은 서식 없이 한 줄이다", () => {
      const result = pasteAtCellEnd("<h1>a</h1><p>b</p>", "a\nb");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
      expectTableIntact(result);
    });

    it("인용 안 문단은 서식 없이 줄이 된다", () => {
      const result = pasteAtCellEnd(
        "<blockquote><p>a</p><p>b</p></blockquote>",
        "a\nb",
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
      expectTableIntact(result);
    });

    it("중첩 목록과 인용 children은 문서 순서 깊이 우선이고 들여쓰기·접두어가 없다", () => {
      const result = pasteAtCellEnd(
        "<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li></ul>",
        "a\nb\nc\nd",
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "cella",
        "br",
        "b",
        "br",
        "c",
        "br",
        "d",
      ]);
      expectTableIntact(result);
    });
  });

  describe("codeBlock(H6)", () => {
    it("내부 개행마다 hardBreak이고 code 마크가 없다", () => {
      const result = pasteAtCellEnd(
        "<pre><code>a\nb</code></pre><p>c</p>",
        "a\nb\nc",
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "cella",
        "br",
        "b",
        "br",
        "c",
      ]);
      expect(result.blocks()).toEqual(docOutline("table[cella\nb\nc]"));
      expect(result.editor.getDocument().revision).toBe(
        result.before.document.revision + 1,
      );
      expectTableIntact(result);
    });

    it("codeBlock 둘도 셀에 들어간다", () => {
      const result = pasteAtCellEnd(
        "<pre><code>a</code></pre><pre><code>b</code></pre>",
        "a\nb",
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
      expectTableIntact(result);
    });
  });

  describe("빈 블록·구분선·이미지(H7~H8)", () => {
    it.each([
      { name: "가운데 빈 문단", html: "<p>a</p><p></p><p>b</p>" },
      { name: "끝 빈 문단", html: "<p>a</p><p>b</p><p></p>" },
      { name: "앞 빈 문단", html: "<p></p><p>a</p><p>b</p>" },
      { name: "연속 빈 문단", html: "<p>a</p><p></p><p></p><p>b</p>" },
    ])("$name: 줄을 내지 않아 hardBreak 하나다", ({ html }) => {
      const result = pasteAtCellEnd(html, "a\nb");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
      expectTableIntact(result);
    });

    it.each([
      { name: "구분선", html: "<p>a</p><hr><p>b</p>" },
      {
        name: "이미지",
        html: '<p>a</p><img src="https://x.y/z.png"><p>b</p>',
      },
    ])("$name: 줄을 내지 않고 두 줄만 남는다", ({ html }) => {
      const result = pasteAtCellEnd(html, "a\nb");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
      expectTableIntact(result);
    });
  });

  describe("개행·공백뿐인 문단 접기(Issue #304 리뷰 F1)", () => {
    const TWO_LINES = ["cella", "br", "b"];

    it.each([
      {
        name: "가운데 `<br>` 문단",
        html: "<p>a</p><p><br></p><p>b</p>",
        expected: TWO_LINES,
      },
      {
        name: "앞 `<br>` 문단",
        html: "<p><br></p><p>a</p><p>b</p>",
        expected: TWO_LINES,
      },
      {
        name: "끝 `<br>` 문단",
        html: "<p>a</p><p>b</p><p><br></p>",
        expected: TWO_LINES,
      },
      {
        name: "연속 `<br>` 문단",
        html: "<p>a</p><p><br></p><p><br></p><p>b</p>",
        expected: TWO_LINES,
      },
      {
        name: "공백 문단",
        html: "<p>a</p><p> </p><p>b</p>",
        expected: TWO_LINES,
      },
      {
        name: "NBSP 문단",
        html: "<p>a</p><p>&nbsp;</p><p>b</p>",
        expected: TWO_LINES,
      },
      {
        name: "끝 개행을 가진 codeBlock",
        html: "<pre><code>a\nb\n</code></pre><p>c</p>",
        expected: ["cella", "br", "b", "br", "c"],
      },
    ])(
      "빈 줄 후보($name)는 줄을 내지 않아 hardBreak 하나로 이어진다",
      ({ html, expected }) => {
        const result = pasteAtCellEnd(html, "a\nb");

        expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(expected);
        expectTableIntact(result);
      },
    );

    it("줄 안쪽 `<br>`은 유지한다", () => {
      const result = pasteAtCellEnd("<p>a<br>b</p><p>c</p>", "a\nb\nc");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "cella",
        "br",
        "b",
        "br",
        "c",
      ]);
    });
  });

  describe("줄이 1개만 남는 html(Issue #304 리뷰 F2)", () => {
    it.each([
      { name: "무효 문자뿐인 둘째 문단", html: `<p>a</p><p>${SOH}</p>` },
      { name: "빈 둘째 문단", html: "<p>a</p><p></p>" },
      { name: "빈 첫 문단", html: "<p></p><p>a</p>" },
      { name: "`<br>`뿐인 둘째 문단", html: "<p>a</p><p><br></p>" },
    ])(
      "한 줄만 남는 html($name)은 남은 줄만 셀에 넣고 표 뒤에 빈 문단을 만들지 않는다",
      ({ html }) => {
        const result = pasteAtCellEnd(html, "a");

        expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella"]);
        expect(result.blocks()).toEqual(docOutline("table[cella]"));
        expectTableIntact(result);
      },
    );
  });

  describe("마크 공존(Issue #304 리뷰 F4, Issue #349로 정정)", () => {
    it("bold와 code가 함께인 텍스트는 둘 다 남고 문서가 스키마를 통과한다", () => {
      const result = pasteAtCellEnd(
        "<p><code><b>x</b></code></p><p>y</p>",
        "x\ny",
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "cell",
        "x*bold*code",
        "br",
        "y",
      ]);
      expect(() =>
        result.tiptap.schema
          .nodeFromJSON(result.tiptap.state.doc.toJSON())
          .check(),
      ).not.toThrow();
      expectTableIntact(result);
    });
  });

  describe("표 포함 html은 이전 경로(H9)", () => {
    it("표 뒤에 문단이 있는 html은 이전과 같다", () => {
      const result = pasteAtCellEnd(
        "<table><tr><td>x</td></tr></table><p>z</p>",
        "x\nz",
      );

      expect(result.blocks()).toEqual(docOutline("table[x\nz]"));
    });
  });

  describe("줄이 1개인 html은 같은 평탄화로 넣고 결과가 대체로 이전과 같다(H10, Issue #316으로 정정)", () => {
    it("굵은 한 줄은 이전과 같다", () => {
      const result = pasteAtCellEnd("<b>x</b>", "a\nb");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cell", "x*bold"]);
      expect(result.blocks()).toEqual(docOutline("table[cellx]"));
    });

    it.each([
      { name: "목록 항목 하나", html: "<ul><li>a</li></ul>" },
      { name: "제목 하나", html: "<h1>a</h1>" },
    ])("$name은 이전과 같다", ({ html }) => {
      const result = pasteAtCellEnd(html, "a\nb");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella"]);
      expect(result.blocks()).toEqual(docOutline("table[cella]"));
    });

    // Issue #316 정정: 수정 전에는 PM이 code 마크 텍스트로 셀에 넣고 개행은
    // 공백이었다(`cell`+`a b`*code). 이제 개행은 hardBreak이고 code 마크가 없다.
    it("codeBlock 단독은 개행이 hardBreak이고 code 마크가 없다(Issue #316으로 정정)", () => {
      const result = pasteAtCellEnd("<pre><code>a\nb</code></pre>", "a\nb");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
      expect(result.blocks()).toEqual(docOutline("table[cella\nb]"));
    });
  });

  describe("한 블록 html도 같은 평탄화로 넣는다(Issue #316)", () => {
    /** 셀 자식 중 마크 이름이 같은 첫 마크의 attrs를 돌려준다. 없으면 null이다. */
    const markAttrsOf = (
      result: ReturnType<typeof pasteAtCellEnd>,
      markName: string,
    ): Record<string, unknown> | null => {
      let found: Record<string, unknown> | null = null;
      findCell(result.tiptap.state.doc, "t-r0c0").forEach((child) => {
        const mark = child.marks.find((m) => m.type.name === markName);
        if (mark !== undefined && found === null) {
          found = { ...mark.attrs };
        }
      });
      return found;
    };

    /** 셀 중간(offset 2) 캐럿에 한 블록 html을 붙인다. */
    const pasteMiddle = (html: string, text = "plain") =>
      pasteIn(lastCellBlocks(), textSelection(inCell("t-r0c0", 2)), {
        "text/html": html,
        "text/plain": text,
      });

    it("색 마크(textColor)를 유지한다", () => {
      const result = pasteMiddle(
        '<p><span style="color:#ff0000">red</span></p>',
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "ce",
        "red*textColor",
        "ll",
      ]);
      expect(markAttrsOf(result, "textColor")).toEqual({ color: "#FF0000" });
      expectTableIntact(result);
    });

    it("배경색 마크(backgroundColor)를 유지한다", () => {
      const result = pasteMiddle(
        '<p><span style="background-color:#ffff00">y</span></p>',
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "ce",
        "y*backgroundColor",
        "ll",
      ]);
      expect(markAttrsOf(result, "backgroundColor")).toEqual({
        color: "#FFFF00",
      });
      expectTableIntact(result);
    });

    it("`<pre><code>`의 개행은 hardBreak이고 code 마크가 없다", () => {
      const result = pasteMiddle("<pre><code>l1\nl2\nl3</code></pre>");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "cel1",
        "br",
        "l2",
        "br",
        "l3ll",
      ]);
      expect(markAttrsOf(result, "code")).toBeNull();
      expectTableIntact(result);
    });

    // Issue #320: importHtml이 소스 개행을 공백으로 접어 `<br>`와 구분한다.
    // `<br>`만 hardBreak가 된다(아래 it.each의 "br로 나뉜 문단"). 여러
    // 블록·CellSelection도 같은 importHtml 결과를 쓴다.
    it("문단 안 소스 개행은 공백 하나로 접힌다(<br>만 hardBreak가 된다)", () => {
      const result = pasteMiddle("<p>one\ntwo</p>");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["ceone twoll"]);
      expectTableIntact(result);
    });

    it.each([
      { name: "bold", html: "<b>x</b>", kinds: ["ce", "x*bold", "ll"] },
      { name: "italic", html: "<i>x</i>", kinds: ["ce", "x*italic", "ll"] },
      {
        name: "underline",
        html: "<u>x</u>",
        kinds: ["ce", "x*underline", "ll"],
      },
      { name: "strike", html: "<s>x</s>", kinds: ["ce", "x*strike", "ll"] },
      { name: "code", html: "<code>x</code>", kinds: ["ce", "x*code", "ll"] },
      { name: "제목", html: "<h1>x</h1>", kinds: ["cexll"] },
      { name: "한 항목 목록", html: "<ul><li>x</li></ul>", kinds: ["cexll"] },
      {
        name: "br로 나뉜 문단",
        html: "<p>a<br>b</p>",
        kinds: ["cea", "br", "bll"],
      },
    ])("$name 결과는 이전과 같다", ({ html, kinds }) => {
      const result = pasteMiddle(html);

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(kinds);
      expectTableIntact(result);
    });

    // Issue #316 리뷰 M1: Google Docs 복사는 문서 전체를 굵지 않은 `<b>`로 감싼다.
    // io가 font-weight:normal|400 래퍼를 bold로 읽지 않는다.
    it("Google Docs 모양(굵지 않은 <b> 래퍼)은 bold 없이 text와 textColor가 된다", () => {
      const result = pasteMiddle(
        '<b style="font-weight:normal;" id="docs-internal-guid-x"><p><span style="color:#000000;font-weight:400;">hello</span></p></b>',
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "ce",
        "hello*textColor",
        "ll",
      ]);
      expect(markAttrsOf(result, "textColor")).toEqual({ color: "#000000" });
      expect(markAttrsOf(result, "bold")).toBeNull();
      expectTableIntact(result);
    });

    // Issue #316 리뷰 m1: HTML 소스의 들여쓰기가 줄 양끝에 남지 않는다.
    it.each([
      {
        name: "문단",
        html: "<p>\n      Some text here\n    </p>",
        kinds: ["ceSome text herell"],
      },
      {
        name: "목록 항목",
        html: "<ul><li>\n    item\n  </li></ul>",
        kinds: ["ceitemll"],
      },
      {
        name: "제목",
        html: "<h1>\n  title\n</h1>",
        kinds: ["cetitlell"],
      },
    ])(
      "$name 줄 양끝의 공백·개행은 자르고 줄 안쪽은 건드리지 않는다",
      ({ html, kinds }) => {
        const result = pasteMiddle(html);

        expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(kinds);
        expectTableIntact(result);
      },
    );

    // Issue #320: importHtml이 줄 안쪽 소스 개행과 연속 공백을 PM 기본처럼 공백
    // 하나로 접는다.
    it("줄 안쪽 소스 개행과 연속 공백은 공백 하나로 접는다", () => {
      const result = pasteMiddle("<p>a   b\n   c</p>");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cea b cll"]);
      expectTableIntact(result);
    });

    // Issue #316 리뷰 02 F1: codeBlock 줄은 앞뒤 hardBreak만 자르고 첫 줄
    // 들여쓰기를 보존한다.
    it("`<pre><code>` 첫 줄의 들여쓰기는 앞 개행이 있어도 보존한다", () => {
      const result = pasteMiddle(
        "<pre><code>\n  if (a) {\n    b\n  }\n</code></pre>",
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
        "ce  if (a) {",
        "br",
        "    b",
        "br",
        "  }ll",
      ]);
      expect(markAttrsOf(result, "code")).toBeNull();
      expectTableIntact(result);
    });

    // Issue #320: 개행이 없어도 블록 시작의 소스 공백은 렌더링에서 접힌다.
    it("개행 없이 앞에만 있는 공백도 줄 시작이라 자른다", () => {
      const result = pasteMiddle("<p>  lead</p>");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["celeadll"]);
    });

    describe("선택 종류별로 같은 변환을 쓴다", () => {
      const RED = '<p><span style="color:#ff0000">red</span></p>';

      it("같은 셀 안 범위(offset 1–3)는 범위를 색 마크 텍스트로 대체한다", () => {
        const result = pasteIn(
          lastCellBlocks(),
          textSelection(inCell("t-r0c0", 1), inCell("t-r0c0", 3)),
          { "text/html": RED, "text/plain": "plain" },
        );

        expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
          "c",
          "red*textColor",
          "l",
        ]);
        expect(markAttrsOf(result, "textColor")).toEqual({ color: "#FF0000" });
        expectTableIntact(result);
      });

      it("인라인 atom NodeSelection은 atom을 색 마크 텍스트로 대체한다", () => {
        const result = pasteIn(
          atomBlocks(),
          atomSelected,
          { "text/html": RED, "text/plain": "plain" },
          withTag,
        );

        expect(kindsOf(result.tiptap, "t-r0c0")).toEqual([
          "ab",
          "red*textColor",
          "cd",
        ]);
        expect(markAttrsOf(result, "textColor")).toEqual({ color: "#FF0000" });
        expectTableIntact(result);
      });

      it("같은 셀 안 범위의 <pre> 개행은 hardBreak이고 code 마크가 없다", () => {
        const result = pasteIn(
          lastCellBlocks(),
          textSelection(inCell("t-r0c0", 1), inCell("t-r0c0", 3)),
          { "text/html": "<pre><code>l1\nl2</code></pre>", "text/plain": "p" },
        );

        expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cl1", "br", "l2l"]);
        expect(markAttrsOf(result, "code")).toBeNull();
      });
    });

    it.each([
      { name: "빈 문단", html: "<p></p>" },
      { name: "br뿐인 문단", html: "<p><br></p>" },
      { name: "구분선", html: "<hr>" },
      { name: "이미지", html: '<img src="https://x.y/a.png" alt="">' },
    ])(
      "줄이 0개인 $name은 이전 경로라 평문이 있으면 평문을 넣는다",
      ({ html }) => {
        const result = pasteMiddle(html, "plain");

        expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["ceplainll"]);
        expectTableIntact(result);
      },
    );
  });

  describe("무효 문자(H11)", () => {
    it("줄 안 무효 문자를 지운다", () => {
      const result = pasteAtCellEnd(`<p>a${SOH}b</p><p>c</p>`, "ab\nc");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cellab", "br", "c"]);
      expectTableIntact(result);
    });

    // Issue #304 리뷰로 정정: 전에는 이전 경로라 셀 `cella` 뒤에 빈 문단
    // `paragraph:`가 표 밖에 남았다. 이제 남은 한 줄만 셀에 넣고 표 뒤에
    // 문단을 만들지 않는다.
    it("정리 뒤 줄이 1개이면 그 줄만 셀에 넣고 표 뒤에 문단을 만들지 않는다(Issue #304 리뷰로 정정)", () => {
      const result = pasteAtCellEnd(`<p>a</p><p>${SOH}</p>`, "a\nb");

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella"]);
      expect(result.blocks()).toEqual(docOutline("table[cella]"));
      expectTableIntact(result);
    });

    it("code 블록의 Tab은 셀에서 지운다", () => {
      const result = pasteAtCellEnd(
        `<pre><code>a${TAB}b</code></pre><p>c</p>`,
        "a\nc",
      );

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cellab", "br", "c"]);
      expectTableIntact(result);
    });
  });

  describe("transaction 계약(H13)", () => {
    it("dispatch 1회, undo 1회로 원복하고 캐럿은 삽입 끝이다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 2)),
        { "text/html": "<p>a</p><p>bc</p>", "text/plain": "a\nbc" },
      );

      expect(result.dispatch).toHaveBeenCalledTimes(1);
      expect(result.editor.getDocument().revision).toBe(
        result.before.document.revision + 1,
      );
      const { selection } = result.tiptap.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(selection.empty).toBe(true);
      // "ce" + "a" + br + "bc" 뒤다. "ll"은 캐럿 뒤에 남는다.
      expect(selection.$from.parentOffset).toBe(2 + 1 + 1 + 2);
      expect(selection.$from.parent.attrs.cellId).toBe("t-r0c0");

      result.tiptap.commands.undo();
      expect(result.tiptap.state.doc.toJSON()).toEqual(
        result.before.tiptapDocument,
      );
    });

    it("pasteHandler와 view.pasteText를 호출하지 않는다", () => {
      const pasteHandler = vi.fn(() => true);

      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inCell("t-r0c0", 4)),
        { "text/html": "<p>a</p><p>b</p>", "text/plain": "a\nb" },
        { pasteHandler },
      );

      expect(pasteHandler).not.toHaveBeenCalled();
      expect(result.pasteText).not.toHaveBeenCalled();
      expect(result.blocks()).toEqual(docOutline("table[cella\nb]"));
    });
  });

  describe("직접 삽입 대상 밖은 이전과 같다(H14)", () => {
    it("서식 없이 붙여넣기(Ctrl+Shift+V)는 평문 여러 줄을 직접 넣는다", () => {
      const result = pasteAtCellEnd("<p>x</p><p>y</p>", "a\nb", true);

      expect(kindsOf(result.tiptap, "t-r0c0")).toEqual(["cella", "br", "b"]);
      expectTableIntact(result);
    });

    // Issue #308이 정정: 수정 전에는 문서가 바뀌지 않았다(되돌림 guard).
    // 자세한 축은 clipboard-paste-cell-selection.test.ts가 소유한다.
    it("CellSelection은 같은 평탄화로 첫 셀에 넣고 나머지 선택 셀을 비운다(Issue #308이 정정)", () => {
      const result = pasteIn(firstCellBlocks(), selectFirstTwoCells, {
        "text/html": "<ul><li>a</li><li>b</li></ul>",
        "text/plain": "a\nb",
      });

      expect(kindsOf(result.tiptap, "g-r0c0")).toEqual(["a", "br", "b"]);
      expect(result.blocks()).toEqual(docOutline("table[a\nb|]"));
    });

    it("표 밖 캐럿은 표 밖 경로가 넣는다", () => {
      const result = pasteIn(
        lastCellBlocks(),
        textSelection(inBlock("p1", 2)),
        {
          "text/html": "<p>a</p><p>b</p>",
          "text/plain": "a\nb",
        },
      );

      expect(result.blocks()).toEqual([
        "paragraph:pa",
        "paragraph:a",
        "paragraph:b",
        "paragraph:ra",
        "table[cell]",
        "paragraph:tail",
      ]);
    });

    // 셀 위 drop은 붙여넣기 계획을 타지 않고 planDrop이 소유한다. 여러 블록
    // html drop은 Issue #311이 같은 평탄화로 셀에 넣는다. 전에는 첫 문단만
    // 셀에 넣고 나머지를 표 뒤 문단으로 뺐다.
    it("셀 위 drop은 붙여넣기 계획이 아니라 planDrop이 같은 평탄화로 처리한다(Issue #311)", () => {
      const m = mounted(documentOf(...lastCellBlocks()));
      textSelection(inCell("t-r0c0", 2))(m.tiptap);
      m.tiptap.view.posAtCoords = () => ({
        pos: inCell("t-r0c0", 4)(m.tiptap),
        inside: 0,
      });

      m.tiptap.view.dom.dispatchEvent(
        dropEventOf({
          "text/html": "<p>a</p><p>b</p>",
          "text/plain": "a\nb",
        }),
      );

      expect(outline(m.editor.getDocument().blocks)).toEqual(
        docOutline("table[cella\nb]"),
      );
    });
  });
});
