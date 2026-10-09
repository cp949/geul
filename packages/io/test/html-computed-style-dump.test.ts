/**
 * 브라우저 복사의 계산 스타일 덤프가 붙은 요소의 색·배경 style은 새로 읽는
 * 블록·표 셀 표면에서 읽지 않는다는 결정을 고정한다(Issue #334).
 *
 * - 표식은 요소 style의 `-webkit-text-stroke-width` 선언이다(속성 이름은 대소문자
 *   무시). Chromium이 복사할 때 블록·표 루트에 color·background-color와 함께
 *   font-family·orphans·widows 등 계산 스타일 전체를 싣는다. 작성자가 쓴 색이
 *   아니라 페이지 테마 색이므로 블록 속성이나 셀 색으로 읽으면 안 된다.
 * - 적용 범위: 블록 속성(p·h1–h6·blockquote·li·callout·문단 div), 표 셀 색
 *   (td·th·tr·table 단마다, 그 단의 bgcolor 속성은 그대로 읽는다), 표 셀 안 블록
 *   요소의 색 마크(굵게·기울임·밑줄·취소선 마크는 그대로 읽는다).
 * - span·b·strong·em·i·u·s·del·strike·code·font·mark는 덤프 표식이 있으면 style의
 *   색·배경을 읽지 않는다(span은 Issue #338). 서식 선언과 font의 color 속성,
 *   mark의 기본 배경은 그대로다. 표식이 없는 span의 색은 이전과 같다.
 * - 작성자 색이 덤프와 같이 온 span(안쪽 복사)도 색을 읽지 않는다. 작성자 색과
 *   테마 색을 구분할 수 없어 작성자 색 소실을 한계로 받아들인다.
 * - 아래 상수는 실제 Chromium 복사 원문(playwright, 2026-10-10)이다. 본문 페이지는
 *   body color #24292f·배경 #fff, `code{background:#eee}`다. 안쪽
 *   `<code style="background: rgb(238, 238, 238);">`는 작성자 style이라 읽는다.
 *   td에는 작성자 style만 있고 덤프가 없다.
 */
import type { Document, DocumentBlock, InlineContent } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { hasComputedStyleDump } from "../src/clipboard/style-declarations.js";
import { importHtml } from "../src/index.js";
import { expectSingleTable } from "./clipboard-table-support.js";

const CHROME_H1 =
  '<h1 style="margin: 0px; color: rgb(36, 41, 47); font-family: Arial; font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; letter-spacing: normal; orphans: 2; text-align: start; text-indent: 0px; text-transform: none; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; background-color: rgb(255, 255, 255); text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;">Title</h1>';
const CHROME_P =
  '<p style="margin: 0px 0px 16px; color: rgb(36, 41, 47); font-family: Arial; font-size: medium; font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: start; text-indent: 0px; text-transform: none; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; background-color: rgb(255, 255, 255); text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;">hello <b>bold</b> <a href="https://a.b/">link</a> <code style="background: rgb(238, 238, 238);">c</code></p>';
const CHROME_UL =
  '<ul style="margin: 0px; color: rgb(36, 41, 47); font-family: Arial; font-size: medium; font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: start; text-indent: 0px; text-transform: none; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; background-color: rgb(255, 255, 255); text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;"><li>item</li></ul>';
const CHROME_BLOCKQUOTE =
  '<blockquote style="color: rgb(36, 41, 47); font-family: Arial; font-size: medium; font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: start; text-indent: 0px; text-transform: none; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; background-color: rgb(255, 255, 255); text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;">quote</blockquote>';
const CHROME_TABLE =
  '<table style="border-collapse: collapse; color: rgb(36, 41, 47); font-family: Arial; font-size: medium; font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: start; text-transform: none; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; background-color: rgb(255, 255, 255); text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;"><tbody><tr><td style="border: 1px solid rgb(204, 204, 204); padding: 4px;">a</td><td style="border: 1px solid rgb(204, 204, 204); padding: 4px;">b</td></tr></tbody></table>';
const CHROME_COPY =
  CHROME_H1 + CHROME_P + CHROME_UL + CHROME_BLOCKQUOTE + CHROME_TABLE;

/** `importHtml` 성공 결과의 문서를 꺼낸다. */
const documentOf = (html: string): Document => {
  const result = importHtml(html);
  if (!result.ok) throw new Error(result.error.code);
  return result.value.document;
};

/** 블록 속성 두 개만 꺼낸다. 없는 필드는 키가 없다. */
const colorProps = (block: DocumentBlock): Record<string, unknown> => {
  const record = block as unknown as Record<string, unknown>;
  const props: Record<string, unknown> = {};
  if (record.textColor !== undefined) props.textColor = record.textColor;
  if (record.backgroundColor !== undefined) {
    props.backgroundColor = record.backgroundColor;
  }
  return props;
};

/** 블록의 인라인 content를 돌려준다. */
const contentOf = (block: DocumentBlock): InlineContent =>
  (block as unknown as { content: InlineContent }).content;

/** 표 블록의 첫 행 셀 필드를 모은다. */
const importedCells = (html: string) => {
  const table = documentOf(html).blocks.find((block) => block.type === "table");
  if (table === undefined || !("rows" in table)) throw new Error("표가 없다");
  return (table.rows[0]?.cells ?? []).map((cell) => ({
    textColor: cell.textColor,
    backgroundColor: cell.backgroundColor,
    content: cell.content,
  }));
};

/** 클립보드 경로로 읽은 첫 행 셀 필드다. */
const clipboardCells = (html: string) =>
  (expectSingleTable(parseClipboardTable({ html })).rows[0]?.cells ?? []).map(
    (cell) => ({
      textColor: cell.textColor,
      backgroundColor: cell.backgroundColor,
      content: cell.content,
    }),
  );

/** 두 경로의 셀 색(content 제외)을 같은 모양으로 돌려준다. */
const cellColorsOnBothPaths = (html: string) => {
  const strip = (cells: ReturnType<typeof importedCells>) =>
    cells.map(({ textColor, backgroundColor }) => ({
      textColor,
      backgroundColor,
    }));
  return {
    importHtml: strip(importedCells(html)),
    clipboard: strip(clipboardCells(html)),
  };
};

const DUMP = "-webkit-text-stroke-width: 0px";

// 실제 Chromium 부분 선택 복사 원문(playwright, 2026-10-10)이다. 스타일 중간의
// font-family 등은 생략했다. 마크 판정은 표식과 color·background-color만 본다.
// 문단 일부 선택: 테마 색(검정 글자·흰 배경)이 덤프로 온다.
const CHROME_SPAN_THEME =
  '<span style="color: rgb(36, 41, 47); font-size: medium; font-style: normal; font-weight: 400; letter-spacing: normal; text-align: start; text-indent: 0px; text-transform: none; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; background-color: rgb(255, 255, 255); display: inline !important; float: none;">words</span>';
// 작성자 빨강 span 안쪽 선택: 작성자 색이 덤프 맨 앞에 같은 모양으로 온다.
const CHROME_SPAN_AUTHOR_RED =
  '<span style="color: rgb(255, 0, 0); font-size: medium; font-style: normal; font-weight: 400; letter-spacing: normal; text-align: start; text-indent: 0px; text-transform: none; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; background-color: rgb(255, 255, 255); display: inline !important; float: none;">red w</span>';
// 작성자 노랑 배경 span 안쪽 선택.
const CHROME_SPAN_AUTHOR_YELLOW =
  '<span style="color: rgb(255, 0, 0); font-size: medium; font-style: normal; font-weight: 400; letter-spacing: normal; text-align: start; text-indent: 0px; text-transform: none; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; background-color: rgb(255, 255, 0); display: inline !important; float: none;">thor b</span>';
// 작성자 파랑 span 일부 선택: 작성자 color가 스타일 맨 끝에 온다.
const CHROME_SPAN_AUTHOR_BLUE =
  '<span style="font-size: medium; font-style: normal; font-weight: 400; letter-spacing: normal; text-align: start; text-indent: 0px; text-transform: none; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; background-color: rgb(255, 255, 255); color: rgb(0, 0, 255);">bl</span>';

describe("hasComputedStyleDump", () => {
  it.each([
    ["표식 하나", "-webkit-text-stroke-width: 0px"],
    ["대문자 속성 이름", "-WEBKIT-Text-Stroke-Width: 0px"],
    ["앞뒤 선언 사이", "color: red; -webkit-text-stroke-width: 0px; widows: 2"],
    ["공백 없는 선언", "color:red;-webkit-text-stroke-width:0px"],
    ["!important 값", "-webkit-text-stroke-width: 0px !important"],
  ])("표식이 있다: %s", (_name, style) => {
    expect(hasComputedStyleDump(style)).toBe(true);
  });

  it.each([
    ["빈 style", ""],
    ["작성자 style", "color: red; background: #fff"],
    [
      "비슷한 속성 이름",
      "-webkit-text-stroke-color: red; text-stroke-width: 1px",
    ],
    ["값에만 들어 있는 이름", "font-family: -webkit-text-stroke-width"],
    ["주석 안의 선언", "/* -webkit-text-stroke-width: 0px */ color: red"],
    ["따옴표 안의 선언", 'content: "a; -webkit-text-stroke-width: 0px"'],
  ])("표식이 없다: %s", (_name, style) => {
    expect(hasComputedStyleDump(style)).toBe(false);
  });
});

describe("Chromium 복사 원문(계산 스타일 덤프)을 importHtml로 읽는다", () => {
  const blocks = documentOf(CHROME_COPY).blocks;

  it("h1·p·blockquote 블록 속성에 색·배경이 없다", () => {
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "bulletListItem",
      "quote",
      "table",
    ]);
    for (const block of blocks.slice(0, 4)) {
      expect(colorProps(block), block.type).toEqual({});
    }
  });

  it("본문 마크(굵게·링크·code와 작성자 배경)는 그대로다", () => {
    const paragraph = blocks[1] as DocumentBlock;
    expect(contentOf(paragraph)).toEqual([
      { text: "hello " },
      { text: "bold", marks: [{ type: "bold" }] },
      { text: " " },
      { text: "link", marks: [{ type: "link", href: "https://a.b/" }] },
      { text: " " },
      {
        text: "c",
        marks: [
          { type: "code" },
          { type: "backgroundColor", color: "#EEEEEE" },
        ],
      },
    ]);
  });

  it("p의 font-weight:400·font-style:normal 같은 덤프 선언이 서식 마크를 만들지 않는다", () => {
    expect(
      contentOf(blocks[0] as DocumentBlock).flatMap((item) =>
        "marks" in item ? (item.marks ?? []) : [],
      ),
    ).toEqual([]);
  });

  it("표 셀 색이 없다(table 루트 덤프가 셀로 번지지 않는다)", () => {
    expect(cellColorsOnBothPaths(CHROME_TABLE)).toEqual({
      importHtml: [
        { textColor: undefined, backgroundColor: undefined },
        { textColor: undefined, backgroundColor: undefined },
      ],
      clipboard: [
        { textColor: undefined, backgroundColor: undefined },
        { textColor: undefined, backgroundColor: undefined },
      ],
    });
  });

  it("클립보드 경로도 표 앞뒤 문단·목록에 색을 싣지 않는다", () => {
    const result = parseClipboardTable({ html: CHROME_COPY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const block of result.value) {
      if (block.type === "table") continue;
      expect(colorProps(block as unknown as DocumentBlock), block.type).toEqual(
        {},
      );
    }
  });
});

describe("덤프 표식이 없으면 이전처럼 읽는다", () => {
  it("p의 style 색·배경은 블록 속성이다", () => {
    const block = documentOf(
      '<p style="color:red;background-color:#00ff00">x</p>',
    ).blocks[0] as DocumentBlock;
    expect(colorProps(block)).toEqual({
      textColor: "#FF0000",
      backgroundColor: "#00FF00",
    });
  });

  it("td style 색은 셀 색이다(두 경로)", () => {
    const html = '<table><tr><td style="color:red">a</td></tr></table>';
    const expected = [{ textColor: "#FF0000", backgroundColor: undefined }];
    expect(cellColorsOnBothPaths(html)).toEqual({
      importHtml: expected,
      clipboard: expected,
    });
  });

  it("table style 배경은 모든 셀로 번진다(두 경로)", () => {
    const html =
      '<table style="background:#ff0000"><tr><td>a</td></tr></table>';
    const expected = [{ textColor: undefined, backgroundColor: "#FF0000" }];
    expect(cellColorsOnBothPaths(html)).toEqual({
      importHtml: expected,
      clipboard: expected,
    });
  });

  it("셀 안 p의 style 색은 마크다(두 경로)", () => {
    const html = '<table><tr><td><p style="color:red">x</p></td></tr></table>';
    const marked = [
      { text: "x", marks: [{ type: "textColor", color: "#FF0000" }] },
    ];
    expect(importedCells(html)[0]?.content).toEqual(marked);
    expect(clipboardCells(html)[0]?.content).toEqual(marked);
  });
});

describe("덤프 표식이 있어도 읽는 것", () => {
  it("td·tr·table 어느 단이든 그 단의 bgcolor 속성은 읽는다", () => {
    for (const html of [
      `<table><tr><td bgcolor="#ff0000" style="color: red; ${DUMP}">a</td></tr></table>`,
      `<table><tr bgcolor="#ff0000" style="color: red; ${DUMP}"><td>a</td></tr></table>`,
      `<table bgcolor="#ff0000" style="color: red; ${DUMP}"><tr><td>a</td></tr></table>`,
    ]) {
      const expected = [{ textColor: undefined, backgroundColor: "#FF0000" }];
      expect(cellColorsOnBothPaths(html), html).toEqual({
        importHtml: expected,
        clipboard: expected,
      });
    }
  });

  it("덤프가 붙은 table 아래 작성자 style td는 자기 색을 읽는다", () => {
    const html = `<table style="color: #24292f; background-color: #fff; ${DUMP}"><tr><td style="color: red">a</td></tr></table>`;
    const expected = [{ textColor: "#FF0000", backgroundColor: undefined }];
    expect(cellColorsOnBothPaths(html)).toEqual({
      importHtml: expected,
      clipboard: expected,
    });
  });

  it("셀 안 블록의 굵게·기울임·밑줄·취소선 style은 마크로 읽고 색만 버린다", () => {
    const html = `<table><tr><td><p style="color: red; background-color: #fff; font-weight: 700; font-style: italic; text-decoration: underline line-through; ${DUMP}">x</p></td></tr></table>`;
    const expected = [
      {
        text: "x",
        marks: [
          { type: "bold" },
          { type: "italic" },
          { type: "underline" },
          { type: "strike" },
        ],
      },
    ];
    for (const cells of [importedCells(html), clipboardCells(html)]) {
      const content = cells[0]?.content as InlineContent;
      expect(
        content.map((item) => ({
          ...item,
          marks: [...(("marks" in item ? item.marks : undefined) ?? [])].sort(
            (a, b) => a.type.localeCompare(b.type),
          ),
        })),
      ).toEqual(
        expected.map((item) => ({
          ...item,
          marks: [...item.marks].sort((a, b) => a.type.localeCompare(b.type)),
        })),
      );
    }
  });

  it("셀 밖 p의 굵게 style은 안쪽 마크로 읽는다", () => {
    const block = documentOf(
      `<p style="color: red; font-weight: 700; ${DUMP}">x</p>`,
    ).blocks[0] as DocumentBlock;
    expect(colorProps(block)).toEqual({});
    expect(contentOf(block)).toEqual([
      { text: "x", marks: [{ type: "bold" }] },
    ]);
  });
});

describe("블록 표면 전체에서 덤프 표식을 따른다", () => {
  it.each([
    ["h2", `<h2 style="color: red; ${DUMP}">x</h2>`],
    ["blockquote", `<blockquote style="color: red; ${DUMP}">x</blockquote>`],
    ["li", `<ul><li style="color: red; ${DUMP}">x</li></ul>`],
    [
      "callout div",
      `<div data-geul-callout="true" style="color: red; ${DUMP}">x</div>`,
    ],
    ["문단 div", `<div style="color: red; ${DUMP}">x</div>`],
  ])("%s의 style 색은 블록 속성이 되지 않는다", (_name, html) => {
    expect(colorProps(documentOf(html).blocks[0] as DocumentBlock)).toEqual({});
  });

  it("data-geul-* 색은 덤프 표식이 있어도 그대로 읽는다", () => {
    const block = documentOf(
      `<p data-geul-text-color="#112233" data-geul-background-color="#445566" style="color: red; ${DUMP}">x</p>`,
    ).blocks[0] as DocumentBlock;
    expect(colorProps(block)).toEqual({
      textColor: "#112233",
      backgroundColor: "#445566",
    });
  });

  it("표식은 속성 이름만 보고 대소문자를 무시한다", () => {
    expect(
      colorProps(
        documentOf(
          '<p style="color: red; -Webkit-TEXT-Stroke-Width: 0px">x</p>',
        ).blocks[0] as DocumentBlock,
      ),
    ).toEqual({});
  });
});

describe("span의 style도 덤프 표식이 있으면 색·배경을 읽지 않는다", () => {
  it("span의 색·배경 style은 색 마크를 만들지 않는다", () => {
    const block = documentOf(
      `<p>a<span style="color: red; background-color: #00ff00; ${DUMP}">x</span></p>`,
    ).blocks[0] as DocumentBlock;
    // 마크가 없으면 이웃 텍스트와 합쳐진다.
    expect(contentOf(block)).toEqual([{ text: "ax" }]);
  });

  it("셀 안 span도 색 마크를 만들지 않는다(두 경로)", () => {
    const html = `<table><tr><td><span style="color: red; ${DUMP}">x</span></td></tr></table>`;
    const expected = [{ text: "x" }];
    expect(importedCells(html)[0]?.content).toEqual(expected);
    expect(clipboardCells(html)[0]?.content).toEqual(expected);
  });

  it.each([
    ["문단 일부(테마 색)", CHROME_SPAN_THEME, "words"],
    ["작성자 빨강 안쪽", CHROME_SPAN_AUTHOR_RED, "red w"],
    ["작성자 노랑 배경 안쪽", CHROME_SPAN_AUTHOR_YELLOW, "thor b"],
    ["작성자 파랑 일부(맨 끝 color)", CHROME_SPAN_AUTHOR_BLUE, "bl"],
  ])(
    "실제 Chromium 부분 선택 복사 원문(%s)은 색 마크가 없다",
    (_name, span, text) => {
      const block = documentOf(`<p>${span}</p>`).blocks[0] as DocumentBlock;
      expect(contentOf(block)).toEqual([{ text }]);
      const html = `<table><tr><td>${span}</td></tr></table>`;
      expect(importedCells(html)[0]?.content).toEqual([{ text }]);
      expect(clipboardCells(html)[0]?.content).toEqual([{ text }]);
    },
  );

  it("덤프가 있어도 span의 서식 선언은 읽는다", () => {
    const block = documentOf(
      `<p><span style="color: red; font-weight: 700; ${DUMP}">x</span></p>`,
    ).blocks[0] as DocumentBlock;
    expect(contentOf(block)).toEqual([
      { text: "x", marks: [{ type: "bold" }] },
    ]);
  });

  it("표식 없는 span의 색은 이전과 같다", () => {
    const block = documentOf(
      '<p><span style="color: red; background-color: #00ff00">x</span></p>',
    ).blocks[0] as DocumentBlock;
    expect(contentOf(block)).toEqual([
      {
        text: "x",
        marks: [
          { type: "textColor", color: "#FF0000" },
          { type: "backgroundColor", color: "#00FF00" },
        ],
      },
    ]);
  });

  it("덤프 span 안쪽의 표식 없는 span 색은 유지된다", () => {
    const block = documentOf(
      `<p><span style="color: red; ${DUMP}"><span style="color: #0000ff">x</span></span></p>`,
    ).blocks[0] as DocumentBlock;
    expect(contentOf(block)).toEqual([
      { text: "x", marks: [{ type: "textColor", color: "#0000FF" }] },
    ]);
  });

  it("덤프 span을 감싼 바깥 요소의 색은 유지된다", () => {
    const block = documentOf(
      `<p><span style="color: #0000ff"><span style="color: red; background-color: #fff; ${DUMP}">x</span></span></p>`,
    ).blocks[0] as DocumentBlock;
    expect(contentOf(block)).toEqual([
      { text: "x", marks: [{ type: "textColor", color: "#0000FF" }] },
    ]);
  });
});

// 인라인 요소는 덤프 표식이 있으면 style의 색·배경을 읽지 않는다.
// Chromium은 요소 안쪽만 선택해 복사해도 span·em·strong 등에 같은 덤프를 싣는다.
describe("인라인 요소는 덤프 표식이 있으면 style 색을 읽지 않는다", () => {
  /** 마크 종류만 문자열로 줄인다. 순서는 읽은 순서다. */
  const marksOf = (html: string): string[] => {
    const block = documentOf(html).blocks[0] as DocumentBlock;
    return contentOf(block).flatMap((item) =>
      "marks" in item
        ? (item.marks ?? []).map((mark) =>
            "color" in mark ? `${mark.type}:${mark.color}` : mark.type,
          )
        : [],
    );
  };

  it.each([
    ["b", ["bold"]],
    ["strong", ["bold"]],
    ["em", ["italic"]],
    ["i", ["italic"]],
    ["u", ["underline"]],
    ["s", ["strike"]],
    ["del", ["strike"]],
    ["strike", ["strike"]],
    ["code", ["code"]],
    ["span", []],
    ["font", []],
    // mark의 기본 노랑 배경은 style이 아니라 태그 의미라 남는다.
    ["mark", ["backgroundColor:#FFFF00"]],
  ])("%s는 태그 마크만 남긴다", (tag, expected) => {
    expect(
      marksOf(
        `<p><${tag} style="color: #ff0000; background-color: #00ff00; ${DUMP}">x</${tag}></p>`,
      ),
    ).toEqual(expected);
  });

  it("실제 Chromium 부분 선택 복사 원문(em)도 색을 읽지 않는다", () => {
    expect(
      marksOf(
        '<p>pre <em style="color: rgb(171, 205, 239); font-family: Arial; font-style: italic; -webkit-text-stroke-width: 0px; background-color: rgb(17, 34, 51);">alic t</em> post</p>',
      ),
    ).toEqual(["italic"]);
  });

  it("덤프가 있어도 서식 선언은 읽는다", () => {
    expect(
      marksOf(
        `<p><em style="color: red; font-weight: 700; text-decoration: underline; ${DUMP}">x</em></p>`,
      ),
    ).toEqual(["bold", "italic", "underline"]);
  });

  it("font의 color 속성은 덤프 style이 있어도 읽는다", () => {
    expect(
      marksOf(
        `<p><font color="#0000ff" style="color: #ff0000; ${DUMP}">x</font></p>`,
      ),
    ).toEqual(["textColor:#0000FF"]);
  });

  it("표식이 없는 style 색은 읽는다", () => {
    expect(
      marksOf(
        '<p><em style="color: #ff0000; background-color: #00ff00">x</em></p>',
      ),
    ).toEqual(["italic", "textColor:#FF0000", "backgroundColor:#00FF00"]);
  });

  it("셀 안에서도 두 경로가 같다", () => {
    const html = `<table><tr><td><em style="color: red; ${DUMP}">x</em></td></tr></table>`;
    const expected = [{ text: "x", marks: [{ type: "italic" }] }];
    expect(importedCells(html)[0]?.content).toEqual(expected);
    expect(clipboardCells(html)[0]?.content).toEqual(expected);
  });
});
