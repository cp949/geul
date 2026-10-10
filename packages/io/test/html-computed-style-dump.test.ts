/**
 * 브라우저 복사의 계산 스타일 덤프가 붙은 요소의 색·배경 style을 읽는 규칙을
 * 고정한다(Issue #334, #338, #341).
 *
 * - 표식은 요소 style의 `-webkit-text-stroke-width` 선언이다(속성 이름은 대소문자
 *   무시). Chromium이 복사할 때 요소에 color·background-color와 함께 font-family·
 *   orphans·widows 등 계산 스타일 전체를 싣는다. 앞쪽의 color·background-color는
 *   작성자가 쓴 색이 아니라 페이지 테마 색이므로 블록 속성이나 셀 색으로 읽으면
 *   안 된다.
 * - 적용 범위: 블록 속성(p·h1–h6·blockquote·li·callout·문단 div), 표 셀 색
 *   (td·th·tr·table 단마다, 그 단의 bgcolor 속성은 그대로 읽는다), 표 셀 안 블록
 *   요소의 색 마크(굵게·기울임·밑줄·취소선 마크는 그대로 읽는다), 인라인 요소
 *   (span·b·strong·em·i·u·s·del·strike·code·font·mark).
 * - 작성자가 쓴 색은 요소를 통째로 포함한 복사에서 덤프 맨 끝(표식 뒤의 마지막
 *   `text-decoration*` 선언 뒤)에 붙는다. 그 뒤의 선언만 색으로 읽는다. 그런
 *   앵커가 없으면 색을 읽지 않는다. 안쪽만 복사하면 작성자 색이 덤프 맨 앞에
 *   와서 테마 색과 구분할 수 없으므로 읽지 않는다.
 * - 스타일시트 클래스가 준 text-decoration은 style 첫 선언(표식 앞)에 온다.
 *   앵커가 아니므로 그 요소는 색을 읽지 않는다. 인라인 색을 같이 걸어도 같다
 *   (Issue #341 F1).
 * - u·s·del·strike·a는 `text-decoration*` 선언이 아예 없고 작성자 배경이 테마 배경과 같은
 *   자리에 와서 위치로 구분할 수 없다. 읽지 않는다.
 * - 서식 선언(굵게·기울임·밑줄·취소선)은 덤프 위치와 무관하게 전체에서 읽는다.
 *   font의 color 속성, mark의 기본 배경은 그대로다. 표식이 없는 style은 이전과
 *   같다.
 * - 아래 상수는 실제 Chromium 153 복사 원문(playwright, 2026-10-10)이다.
 *   원문은 `_works/20261010-08-issue341-chrome-copy-span-author-color/chromium-raw`에
 *   있다. 본문 페이지는 body color #24292f·배경 #fff, `code{background:#eee}`다.
 *   안쪽 `<code style="background: rgb(238, 238, 238);">`는 작성자 style이라 읽는다.
 *   font-family 등 판정과 무관한 중간 선언만 생략했고 나머지 순서는 원문 그대로다.
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
// 작성자 파랑 span 일부 선택: 작성자 color가 스타일 맨 끝(text-decoration-color
// 뒤)에 온다. 색 span을 통째로 포함한 복사(문단 전체 선택 포함)도 같은 모양이다.
const CHROME_SPAN_AUTHOR_BLUE =
  '<span style="font-size: medium; font-style: normal; font-weight: 400; letter-spacing: normal; text-align: start; text-indent: 0px; text-transform: none; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; background-color: rgb(255, 255, 255); text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial; color: rgb(0, 0, 255);">bl</span>';

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

  // Issue #341: 맨 끝 작성자 color를 읽는다. 위 each의 마지막 행이던 케이스를
  // 파랑 마크 있음으로 뒤집었다.
  it("실제 Chromium 부분 선택 복사 원문(작성자 파랑 일부(맨 끝 color))는 파랑 마크를 남긴다", () => {
    const expected = [
      { text: "bl", marks: [{ type: "textColor", color: "#0000FF" }] },
    ];
    const block = documentOf(`<p>${CHROME_SPAN_AUTHOR_BLUE}</p>`)
      .blocks[0] as DocumentBlock;
    expect(contentOf(block)).toEqual(expected);
    const html = `<table><tr><td>${CHROME_SPAN_AUTHOR_BLUE}</td></tr></table>`;
    expect(importedCells(html)[0]?.content).toEqual(expected);
    expect(clipboardCells(html)[0]?.content).toEqual(expected);
  });

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
  ])("%s: 태그 마크만 남긴다", (tag, expected) => {
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

// Issue #341: 요소를 통째로 포함한 Chromium 복사는 작성자 color·background-color를
// 덤프 맨 끝(표식 뒤의 마지막 text-decoration* 선언 뒤)에 붙인다. 아래 조각은 실측 원문
// (Chromium 153.0.8010.12, 2026-10-10)에서 font-family·orphans·widows 등 판정과
// 무관한 선언만 뺀 것이다. 나머지 선언 순서는 원문 그대로다.
const HEAD_COLOR = "color: rgb(36, 41, 47);";
const MID =
  "font-style: normal; font-weight: 400; -webkit-text-stroke-width: 0px; white-space: normal;";
const THEME_BG = "background-color: rgb(255, 255, 255);";
const DECORATION =
  "text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;";

/** 테마 색 span이다(색 span 앞뒤에 오는 문단 텍스트). */
const themeSpan = (text: string): string =>
  `<span style="${HEAD_COLOR} ${MID} ${THEME_BG} ${DECORATION} display: inline !important; float: none;">${text}</span>`;

/** 문단 전체를 복사한 원문이다. 작성자 요소 앞뒤에 테마 span이 붙는다. */
const wholeParagraph = (element: string): string =>
  `${themeSpan("a ")}${element}${themeSpan(" z")}`;

// 작성자 빨강 span (probe B). 테마 color가 빠지고 작성자 color가 맨 끝에 온다.
const AUTHOR_RED_SPAN = `<span style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">red</span>`;
// 작성자 노랑 배경 span (probe C). 테마 배경이 빠지고 배경이 맨 끝에 온다.
const AUTHOR_YELLOW_SPAN = `<span style="${HEAD_COLOR} ${MID} ${DECORATION} background-color: rgb(255, 255, 0);">yel</span>`;
// 색+배경 span (probe L).
const AUTHOR_BOTH_SPAN = `<span style="${MID} ${DECORATION} color: rgb(255, 0, 0); background-color: rgb(255, 255, 0);">both</span>`;
// 배경→색 순서로 쓴 span (probe span-color-then-bg-order). 작성자 선언 순서를 유지한다.
const AUTHOR_BG_THEN_COLOR_SPAN = `<span style="${MID} ${DECORATION} background-color: rgb(255, 255, 0); color: rgb(255, 0, 0);">x</span>`;
// 굵게+색 span (probe F). font-weight 700이 color 뒤에 온다.
const AUTHOR_BOLD_RED_SPAN = `<span style="font-style: normal; -webkit-text-stroke-width: 0px; white-space: normal; ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0); font-weight: 700;">bc</span>`;
// 색 span 안의 br (probe I).
const AUTHOR_RED_MULTILINE_SPAN = `<span style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">one<br>two</span>`;
// 줄임 text-decoration을 같이 건 span (probe O-raw). text-decoration-* 대신 줄임이 온다.
const AUTHOR_UNDERLINE_RED_SPAN = `<span style="${MID} ${THEME_BG} text-decoration: underline; color: rgb(255, 0, 0);">u</span>`;
// 밑줄+색+배경 span (probe uspan-color-bg). 테마 색·배경이 모두 빠진다.
const AUTHOR_UNDERLINE_BOTH_SPAN = `<span style="${MID} text-decoration: underline; color: rgb(255, 0, 0); background-color: rgb(255, 255, 0);">x</span>`;
// 취소선+배경 span (probe sspan-bg). 테마 color는 맨 앞에 남는다.
const AUTHOR_STRIKE_YELLOW_SPAN = `<span style="${HEAD_COLOR} ${MID} text-decoration: line-through; background-color: rgb(255, 255, 0);">x</span>`;
// 중첩 span (probe E). 덤프는 바깥에만 붙고 안쪽은 작성자 style 그대로 온다.
const AUTHOR_NESTED_SPAN = `<span style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">out <span style="color: rgb(0, 0, 255);">in</span> end</span>`;
// 바깥 색+안쪽 배경 (probe AD).
const AUTHOR_OUTER_COLOR_INNER_BG_SPAN = `<span style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">o<span style="background-color: rgb(255, 255, 0);">i</span></span>`;
// 색 span 안쪽만 선택 (probe D). 작성자 색이 맨 앞에 와서 테마 색과 같은 모양이다.
const INSIDE_RED_SPAN = `<span style="color: rgb(255, 0, 0); ${MID} ${THEME_BG} ${DECORATION} display: inline !important; float: none;">red</span>`;
// 색 span 안쪽만 선택한 배경 (probe p-single).
const INSIDE_RED_YELLOW_SPAN = `<span style="color: rgb(255, 0, 0); ${MID} background-color: rgb(255, 255, 0); ${DECORATION} display: inline !important; float: none;">pa</span>`;
// 색 span이 문단의 유일한 자식 (probe Y-only-child). 안쪽만 선택과 같은 모양이다.
const ONLY_CHILD_RED_SPAN = `<span style="color: rgb(255, 0, 0); ${MID} ${THEME_BG} ${DECORATION} display: inline !important; float: none;">only</span>`;
// 작성자 색이 없는 굵은 span (probe N). 테마 color가 맨 앞에 남고 맨 끝은 font-weight뿐이다.
const NO_AUTHOR_COLOR_BOLD_SPAN = `<span style="${HEAD_COLOR} font-style: normal; -webkit-text-stroke-width: 0px; white-space: normal; ${THEME_BG} ${DECORATION} font-weight: 700;">bold</span>`;
// 작성자 색이 테마 색과 같은 span (probe P). 맨 끝에 색 선언이 없다.
const SAME_AS_THEME_SPAN = `<span style="${HEAD_COLOR} ${MID} ${THEME_BG} ${DECORATION}">same</span>`;

/** 문단 하나의 content를 돌려준다. */
const paragraphContent = (html: string): InlineContent =>
  contentOf(documentOf(`<p>${html}</p>`).blocks[0] as DocumentBlock);

const RED = { type: "textColor", color: "#FF0000" } as const;
const BLUE = { type: "textColor", color: "#0000FF" } as const;
const YELLOW_BG = { type: "backgroundColor", color: "#FFFF00" } as const;

describe("덤프 style 맨 끝의 작성자 색·배경은 마크로 읽는다 (Issue #341)", () => {
  it.each([
    ["색 단독", AUTHOR_RED_SPAN, [{ text: "red", marks: [RED] }]],
    ["배경 단독", AUTHOR_YELLOW_SPAN, [{ text: "yel", marks: [YELLOW_BG] }]],
    ["색+배경", AUTHOR_BOTH_SPAN, [{ text: "both", marks: [RED, YELLOW_BG] }]],
    [
      "배경→색 순서",
      AUTHOR_BG_THEN_COLOR_SPAN,
      [{ text: "x", marks: [RED, YELLOW_BG] }],
    ],
    [
      "굵게+색",
      AUTHOR_BOLD_RED_SPAN,
      [{ text: "bc", marks: [{ type: "bold" }, RED] }],
    ],
    [
      "여러 줄(br)",
      AUTHOR_RED_MULTILINE_SPAN,
      [{ text: "one\ntwo", marks: [RED] }],
    ],
  ])(
    "통째로 포함한 문단 복사(%s)는 작성자 마크만 남긴다",
    (_name, span, marked) => {
      expect(paragraphContent(wholeParagraph(span))).toEqual([
        { text: "a " },
        ...marked,
        { text: " z" },
      ]);
    },
  );

  it("줄임 text-decoration을 같이 건 span의 작성자 색을 읽는다", () => {
    expect(paragraphContent(wholeParagraph(AUTHOR_UNDERLINE_RED_SPAN))).toEqual(
      [
        { text: "a " },
        { text: "u", marks: [{ type: "underline" }, RED] },
        { text: " z" },
      ],
    );
  });

  it.each([
    [
      "밑줄+색+배경",
      AUTHOR_UNDERLINE_BOTH_SPAN,
      [{ type: "underline" }, RED, YELLOW_BG],
    ],
    [
      "취소선+배경(테마 color는 맨 앞)",
      AUTHOR_STRIKE_YELLOW_SPAN,
      [{ type: "strike" }, YELLOW_BG],
    ],
  ])(
    "줄임 text-decoration 뒤의 작성자 선언(%s)을 읽는다",
    (_name, span, marks) => {
      expect(paragraphContent(wholeParagraph(span))).toEqual([
        { text: "a " },
        { text: "x", marks },
        { text: " z" },
      ]);
    },
  );

  it("부분 선택으로 앞이나 뒤가 잘려도 작성자 색을 읽는다", () => {
    const left = `<span style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">text</span>${themeSpan(" t")}`;
    const right = `${themeSpan("ain ")}<span style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">red</span>`;
    expect(paragraphContent(left)).toEqual([
      { text: "text", marks: [RED] },
      { text: " t" },
    ]);
    expect(paragraphContent(right)).toEqual([
      { text: "ain " },
      { text: "red", marks: [RED] },
    ]);
  });

  it("작성자 색 span만 복사해도 읽는다(문단 앞뒤 테마 span 없음)", () => {
    expect(paragraphContent(AUTHOR_RED_SPAN)).toEqual([
      { text: "red", marks: [RED] },
    ]);
  });

  it("바깥 span만 덤프를 가질 때 안쪽 span 색은 안쪽 글자에 이긴다", () => {
    expect(paragraphContent(wholeParagraph(AUTHOR_NESTED_SPAN))).toEqual([
      { text: "a " },
      { text: "out ", marks: [RED] },
      { text: "in", marks: [BLUE] },
      { text: " end", marks: [RED] },
      { text: " z" },
    ]);
  });

  it("바깥 덤프 span의 색과 안쪽 span의 배경이 함께 남는다", () => {
    expect(
      paragraphContent(wholeParagraph(AUTHOR_OUTER_COLOR_INNER_BG_SPAN)),
    ).toEqual([
      { text: "a " },
      { text: "o", marks: [RED] },
      { text: "i", marks: [RED, YELLOW_BG] },
      { text: " z" },
    ]);
  });

  it("셀 안 span도 작성자 마크를 남긴다(importHtml 표 셀)", () => {
    const html = `<table><tr><td>${wholeParagraph(AUTHOR_RED_SPAN)}</td></tr></table>`;
    expect(importedCells(html)[0]?.content).toEqual([
      { text: "a " },
      { text: "red", marks: [RED] },
      { text: " z" },
    ]);
  });

  it("셀 안 span도 작성자 마크를 남긴다(클립보드 표 셀)", () => {
    const html = `<table><tr><td>${wholeParagraph(AUTHOR_BOTH_SPAN)}</td></tr></table>`;
    expect(clipboardCells(html)[0]?.content).toEqual([
      { text: "a " },
      { text: "both", marks: [RED, YELLOW_BG] },
      { text: " z" },
    ]);
  });
});

describe("덤프 style 맨 끝의 작성자 선언 위치 규칙 (Issue #341)", () => {
  it("테마 color·background-color는 마지막 text-decoration* 앞이라 읽지 않는다", () => {
    expect(paragraphContent(themeSpan("t"))).toEqual([{ text: "t" }]);
    expect(paragraphContent(SAME_AS_THEME_SPAN)).toEqual([{ text: "same" }]);
  });

  it("작성자 색이 없는 덤프 span은 서식만 남기고 색 마크가 없다", () => {
    expect(paragraphContent(wholeParagraph(NO_AUTHOR_COLOR_BOLD_SPAN))).toEqual(
      [
        { text: "a " },
        { text: "bold", marks: [{ type: "bold" }] },
        { text: " z" },
      ],
    );
  });

  it.each([
    ["안쪽만 복사(작성자 색이 맨 앞)", INSIDE_RED_SPAN, "red"],
    ["안쪽만 복사(작성자 색+배경이 앞쪽)", INSIDE_RED_YELLOW_SPAN, "pa"],
    ["유일한 자식", ONLY_CHILD_RED_SPAN, "only"],
  ])("%s 원문은 색 마크가 없다(세 경로)", (_name, span, text) => {
    const expected = [{ text }];
    expect(paragraphContent(span)).toEqual(expected);
    const html = `<table><tr><td>${span}</td></tr></table>`;
    expect(importedCells(html)[0]?.content).toEqual(expected);
    expect(clipboardCells(html)[0]?.content).toEqual(expected);
  });

  it("text-decoration* 선언이 없는 덤프는 색을 읽지 않는다", () => {
    expect(
      paragraphContent(
        `<span style="${MID} ${THEME_BG} color: rgb(255, 0, 0);">x</span>`,
      ),
    ).toEqual([{ text: "x" }]);
  });

  it("속성 이름의 대소문자를 무시한다", () => {
    expect(
      paragraphContent(
        `<span style="-WEBKIT-text-stroke-width: 0px; Text-Decoration-Color: initial; COLOR: rgb(255, 0, 0);">x</span>`,
      ),
    ).toEqual([{ text: "x", marks: [RED] }]);
  });

  it("!important 색도 읽는다", () => {
    expect(
      paragraphContent(
        `<span style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0) !important;">imp</span>`,
      ),
    ).toEqual([{ text: "imp", marks: [RED] }]);
  });

  it("작성자 색이 투명이면 마크를 만들지 않는다", () => {
    expect(
      paragraphContent(
        `<span style="${MID} ${THEME_BG} ${DECORATION} color: transparent;">x</span>`,
      ),
    ).toEqual([{ text: "x" }]);
  });
});

describe("u·s·del·strike·a의 덤프는 작성자 색·배경을 읽지 않는다 (Issue #341)", () => {
  // Chromium은 u·s·del·strike·a에 text-decoration* 선언을 싣지 않고 작성자 배경을 테마
  // 배경과 같은 자리에 둔다. 위치로 구분할 수 없어 읽지 않는다.
  it.each([
    [
      "u 색+배경",
      `<u style="${MID} color: rgb(255, 0, 0); background-color: rgb(255, 255, 0);">x</u>`,
      [{ type: "underline" }],
    ],
    [
      "u 배경",
      `<u style="${HEAD_COLOR} ${MID} background-color: rgb(255, 255, 0);">x</u>`,
      [{ type: "underline" }],
    ],
    [
      "s 배경",
      `<s style="${HEAD_COLOR} ${MID} background-color: rgb(255, 255, 0);">x</s>`,
      [{ type: "strike" }],
    ],
    [
      "del 색+배경",
      `<del style="${MID} color: rgb(255, 0, 0); background-color: rgb(255, 255, 0);">x</del>`,
      [{ type: "strike" }],
    ],
    [
      "strike 색+배경",
      `<strike style="${MID} color: rgb(255, 0, 0); background-color: rgb(255, 255, 0);">x</strike>`,
      [{ type: "strike" }],
    ],
    [
      "a 색+배경",
      `<a href="https://x.test/" style="${MID} color: rgb(255, 0, 0); background-color: rgb(255, 255, 0);">x</a>`,
      [{ type: "link", href: "https://x.test/" }],
    ],
    [
      "a 색",
      `<a href="https://x.test/" style="${MID} ${THEME_BG} color: rgb(255, 0, 0);">x</a>`,
      [{ type: "link", href: "https://x.test/" }],
    ],
  ])("%s: 태그 마크만 남긴다", (_name, element, marks) => {
    expect(paragraphContent(wholeParagraph(element))).toEqual([
      { text: "a " },
      { text: "x", marks },
      { text: " z" },
    ]);
  });
});

describe("다른 인라인 요소의 덤프 맨 끝 작성자 색도 읽는다 (Issue #341)", () => {
  it.each([
    [
      "b",
      `<b style="font-style: normal; -webkit-text-stroke-width: 0px; white-space: normal; ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">x</b>`,
      [{ type: "bold" }, RED],
    ],
    [
      "strong",
      `<strong style="font-style: normal; -webkit-text-stroke-width: 0px; white-space: normal; ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">x</strong>`,
      [{ type: "bold" }, RED],
    ],
    [
      "em",
      `<em style="font-weight: 400; -webkit-text-stroke-width: 0px; white-space: normal; ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">x</em>`,
      [{ type: "italic" }, RED],
    ],
    [
      "i(배경)",
      `<i style="${HEAD_COLOR} font-weight: 400; -webkit-text-stroke-width: 0px; white-space: normal; ${DECORATION} background-color: rgb(255, 255, 0);">x</i>`,
      [{ type: "italic" }, YELLOW_BG],
    ],
    [
      "code",
      `<code style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">x</code>`,
      [{ type: "code" }, RED],
    ],
    [
      "font style",
      `<font style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">x</font>`,
      [RED],
    ],
    [
      "mark 배경",
      `<mark style="${MID} ${DECORATION} background-color: rgb(0, 255, 0);">x</mark>`,
      [{ type: "backgroundColor", color: "#00FF00" }],
    ],
  ])("%s", (_name, element, marks) => {
    expect(paragraphContent(wholeParagraph(element))).toEqual([
      { text: "a " },
      { text: "x", marks },
      { text: " z" },
    ]);
  });

  it("font의 color 속성만 있는 덤프(작성자 style 색 없음)는 속성 색을 읽는다", () => {
    expect(
      paragraphContent(
        wholeParagraph(
          `<font color="#f00" style="${MID} ${THEME_BG} ${DECORATION}">x</font>`,
        ),
      ),
    ).toEqual([{ text: "a " }, { text: "x", marks: [RED] }, { text: " z" }]);
  });

  it("mark에 작성자 배경이 없는 덤프는 기본 노랑을 낸다", () => {
    expect(
      paragraphContent(
        wholeParagraph(`<mark style="${MID} ${DECORATION}">m</mark>`),
      ),
    ).toEqual([
      { text: "a " },
      { text: "m", marks: [YELLOW_BG] },
      { text: " z" },
    ]);
  });
});

describe("블록·표의 덤프 맨 끝 작성자 색도 읽는다 (Issue #341)", () => {
  const themeP = (text: string): string =>
    `<p style="${HEAD_COLOR} ${MID} ${THEME_BG} ${DECORATION}">${text}</p>`;

  it.each([
    [
      "p 색",
      `<p style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">pa</p>`,
      { textColor: "#FF0000" },
    ],
    [
      "p 배경",
      `<p style="${HEAD_COLOR} ${MID} ${DECORATION} background-color: rgb(255, 255, 0);">pa</p>`,
      { backgroundColor: "#FFFF00" },
    ],
    [
      "h2 색",
      `<h2 style="font-style: normal; -webkit-text-stroke-width: 0px; white-space: normal; ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">pa</h2>`,
      { textColor: "#FF0000" },
    ],
    [
      "blockquote 색",
      `<blockquote style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">pa</blockquote>`,
      { textColor: "#FF0000" },
    ],
  ])("%s: 블록 속성이 된다", (_name, block, expected) => {
    const blocks = documentOf(block + themeP("pb")).blocks;
    expect(colorProps(blocks[0] as DocumentBlock)).toEqual(expected);
    expect(colorProps(blocks[1] as DocumentBlock)).toEqual({});
  });

  it("작성자 색 없는 덤프 블록은 색이 없다", () => {
    expect(
      colorProps(documentOf(themeP("pb")).blocks[0] as DocumentBlock),
    ).toEqual({});
  });

  it("표 style의 작성자 색·배경은 모든 셀 색이 된다(두 경로)", () => {
    const html = `<table id="t" border="1" style="${MID} ${DECORATION} background-color: rgb(255, 255, 0); color: rgb(0, 0, 255);"><tbody><tr><td>c1</td><td>c2</td></tr></tbody></table>`;
    const expected = [
      { textColor: "#0000FF", backgroundColor: "#FFFF00" },
      { textColor: "#0000FF", backgroundColor: "#FFFF00" },
    ];
    expect(cellColorsOnBothPaths(html)).toEqual({
      importHtml: expected,
      clipboard: expected,
    });
  });

  it("작성자 색 없는 덤프 표는 셀 색이 없다(두 경로)", () => {
    const html = `<table id="t" style="${HEAD_COLOR} ${MID} ${DECORATION}"><tbody><tr><td>c1</td></tr></tbody></table>`;
    const expected = [{ textColor: undefined, backgroundColor: undefined }];
    expect(cellColorsOnBothPaths(html)).toEqual({
      importHtml: expected,
      clipboard: expected,
    });
  });

  it("셀 안 블록의 작성자 색은 마크가 된다(두 경로)", () => {
    const html = `<table><tr><td><p style="${MID} ${THEME_BG} ${DECORATION} color: rgb(255, 0, 0);">x</p></td></tr></table>`;
    const marked = [{ text: "x", marks: [RED] }];
    expect(importedCells(html)[0]?.content).toEqual(marked);
    expect(clipboardCells(html)[0]?.content).toEqual(marked);
  });
});

// Issue #341 리뷰 F1: 스타일시트 클래스(`.ul{text-decoration:underline}` 등)로
// text-decoration을 받은 요소는 Chromium 153이 `text-decoration: ...`을 style의
// 첫 선언으로 싣는다(덤프 표식 앞). 이 선언은 앵커가 아니다. 앵커는 표식 뒤의
// 마지막 text-decoration* 선언이다. 이 요소의 테마 color·background-color는
// 작성자 색이 아니므로 읽지 않는다. 아래 원문은 probe5.out이다. 밑줄·취소선·굵게
// 서식은 지금처럼 읽는다.
describe("스타일시트 클래스가 text-decoration을 준 요소는 색을 읽지 않는다 (Issue #341 F1)", () => {
  const CLASS_MID =
    "font-style: normal; font-weight: 400; -webkit-text-stroke-width: 0px; white-space: normal;";
  // 클래스가 준 text-decoration이 첫 선언이고 테마 color, 표식, 테마 배경이 이어진다.
  const classDecorated = (tag: string, decoration: string, text: string) =>
    `<${tag} class="x" style="text-decoration: ${decoration}; ${HEAD_COLOR} ${CLASS_MID} ${THEME_BG}">${text}</${tag}>`;

  /** 텍스트와 마크 종류(정렬)만 남긴다. 색 마크는 종류와 색을 함께 적는다. */
  const shapeOf = (content: InlineContent): Array<[string, string[]]> =>
    content.map((item) => [
      "text" in item ? item.text : "",
      [
        ...("marks" in item ? (item.marks ?? []) : []).map((mark) =>
          "color" in mark ? `${mark.type}:${mark.color}` : mark.type,
        ),
      ].sort(),
    ]);

  it.each<[string, string, Array<[string, string[]]>]>([
    [
      "cls-ul-span 밑줄 클래스",
      wholeParagraph(classDecorated("span", "underline", "x")),
      [
        ["a ", []],
        ["x", ["underline"]],
        [" z", []],
      ],
    ],
    [
      "cls-lt-span 취소선 클래스",
      wholeParagraph(classDecorated("span", "line-through", "x")),
      [
        ["a ", []],
        ["x", ["strike"]],
        [" z", []],
      ],
    ],
    [
      "cls-ul-strong 밑줄 클래스",
      wholeParagraph(
        `<strong class="ul" style="text-decoration: underline; ${HEAD_COLOR} font-style: normal; -webkit-text-stroke-width: 0px; white-space: normal; ${THEME_BG}">x</strong>`,
      ),
      [
        ["a ", []],
        ["x", ["bold", "underline"]],
        [" z", []],
      ],
    ],
    [
      "cls-tdc-span 밑줄 클래스",
      wholeParagraph(classDecorated("span", "underline", "x")),
      [
        ["a ", []],
        ["x", ["underline"]],
        [" z", []],
      ],
    ],
    // 한계: 클래스가 text-decoration을 주면 인라인 color를 같이 걸어도 읽지 않는다.
    [
      "cls-ul-span-inline-red 인라인 빨강이 있어도 마크 없음(한계)",
      wholeParagraph(
        `<span class="ul" style="text-decoration: underline; ${CLASS_MID} ${THEME_BG} color: rgb(255, 0, 0);">x</span>`,
      ),
      [
        ["a ", []],
        ["x", ["underline"]],
        [" z", []],
      ],
    ],
    [
      "cls-ul-span-inline-bg 인라인 노랑 배경이 있어도 마크 없음(한계)",
      wholeParagraph(
        `<span class="ul" style="text-decoration: underline; ${HEAD_COLOR} ${CLASS_MID} background-color: rgb(255, 255, 0);">x</span>`,
      ),
      [
        ["a ", []],
        ["x", ["underline"]],
        [" z", []],
      ],
    ],
    // 클래스 색은 표식 앞(첫 선언 자리)에 있어 앵커가 없고 마크가 없다.
    [
      "cls-cc-span 클래스 글자색",
      wholeParagraph(
        `<span class="cc" style="color: rgb(204, 0, 204); ${CLASS_MID} ${THEME_BG} ${DECORATION}">x</span>`,
      ),
      [["a x z", []]],
    ],
    [
      "cls-cb-span 클래스 배경",
      wholeParagraph(
        `<span class="cb" style="background-color: rgb(255, 204, 0); ${HEAD_COLOR} ${CLASS_MID} ${DECORATION}">x</span>`,
      ),
      [["a x z", []]],
    ],
  ])(
    "%s: 문단·importHtml 표 셀·클립보드 표 셀 모두 색 마크가 없다",
    (_name, html, shape) => {
      expect(shapeOf(paragraphContent(html))).toEqual(shape);
      const table = `<table><tr><td>${html}</td></tr></table>`;
      expect(
        shapeOf(importedCells(table)[0]?.content as InlineContent),
      ).toEqual(shape);
      expect(
        shapeOf(clipboardCells(table)[0]?.content as InlineContent),
      ).toEqual(shape);
    },
  );

  it.each([
    [
      "cls-ul-p",
      `<p class="ul" style="text-decoration: underline; ${HEAD_COLOR} ${CLASS_MID} ${THEME_BG}">pa</p>`,
    ],
    [
      "cls-ul-h2",
      `<h2 class="ul" style="text-decoration: underline; ${HEAD_COLOR} font-style: normal; -webkit-text-stroke-width: 0px; white-space: normal; ${THEME_BG}">pa</h2>`,
    ],
  ])("%s: 블록 속성 색이 없고 밑줄은 안쪽 마크다", (_name, block) => {
    const blocks = documentOf(
      `${block}<p style="${HEAD_COLOR} ${MID} ${THEME_BG} ${DECORATION}">pb</p>`,
    ).blocks;
    expect(colorProps(blocks[0] as DocumentBlock)).toEqual({});
    expect(colorProps(blocks[1] as DocumentBlock)).toEqual({});
    expect(shapeOf(contentOf(blocks[0] as DocumentBlock))).toEqual([
      ["pa", ["underline"]],
    ]);
  });

  it("cls-ul-table: 표 셀 색이 없다(importHtml·클립보드 두 경로)", () => {
    const html = `<table id="t" class="ul" style="text-decoration: underline; ${HEAD_COLOR} ${CLASS_MID}"><tbody><tr><td>c1</td><td>c2</td></tr></tbody></table>`;
    const expected = [
      { textColor: undefined, backgroundColor: undefined },
      { textColor: undefined, backgroundColor: undefined },
    ];
    expect(cellColorsOnBothPaths(html)).toEqual({
      importHtml: expected,
      clipboard: expected,
    });
  });
});
