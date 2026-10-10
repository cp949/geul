/**
 * `parseClipboardTable`이 `li` 안 첫 자식이 아닌 `p`·`h1`–`h6`를 `importHtml`과
 * 같게 목록 항목의 자식 블록으로 읽는지 검증한다(Issue #346).
 *
 * - 이전에는 이 요소의 글자가 항목 content에 합쳐졌다.
 * - 합쳐진 글자는 자기 `style`을 잃고 `li` 색을 받았다.
 * - 입력마다 뒤에 2×2 데이터 표를 붙인다. 표가 없으면 파서가 표 붙여넣기를 하지 않는다.
 * - 기대값은 같은 HTML의 `importHtml` 결과다. 표를 뺀 블록 트리를 children까지 비교한다.
 * - 비교만으로는 둘이 함께 틀려도 통과하므로, 재현 3행은 명시 값으로도 고정한다.
 * - 내용 없는 `p`·제목(빈 요소, 공백뿐, `<br>`만 든 `p`)도 `importHtml`처럼 빈 자식 블록으로 남는다(Issue #356 Q8).
 */
import { describe, expect, it } from "vitest";

import { clipboardBlocks, importedBlocks } from "./clipboard-table-support.js";

const TABLE =
  "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>";

/** 비교에 쓰는 블록 모양이다. id와 블록별 부가 필드는 뺀다. */
type BlockShape = {
  type: unknown;
  level: unknown;
  textColor: unknown;
  backgroundColor: unknown;
  content: unknown;
  children: BlockShape[] | undefined;
};

/** 블록에서 종류·레벨·블록 색·콘텐츠를 남기고 children을 재귀로 같은 모양으로 바꾼다. */
const shapeOf = (block: unknown): BlockShape => {
  const record = block as Record<string, unknown>;
  const children = Array.isArray(record.children) ? record.children : [];
  return {
    type: record.type,
    level: record.level,
    textColor: record.textColor,
    backgroundColor: record.backgroundColor,
    content: record.content,
    children:
      children.length === 0 ? undefined : shapesOf(children as unknown[]),
  };
};

/** 표 블록을 빼고 나머지를 모양으로 바꾼다. */
const shapesOf = (blocks: readonly unknown[]): BlockShape[] =>
  blocks
    .filter((block) => (block as { type?: unknown }).type !== "table")
    .map(shapeOf);

/** importHtml이 만든 문서 블록의 모양이다. */
const importedShapes = (html: string): BlockShape[] =>
  shapesOf(importedBlocks(html));

/** parseClipboardTable이 만든 블록의 모양이다. */
const clipboardShapes = (html: string): BlockShape[] =>
  shapesOf(clipboardBlocks(html));

describe("parseClipboardTable li 안 p·제목 자식 블록 (Issue #346)", () => {
  it.each([
    [
      "글자 뒤 색 있는 p",
      '<ul><li style="color:#ff0000">t<p style="color:#00ff00">x</p></li></ul>',
    ],
    [
      "색 있는 제목만 든 항목",
      '<ul><li style="color:#ff0000"><h2 style="color:#00ff00">H</h2></li></ul>',
    ],
    [
      "굵은 글자 뒤 색 있는 p",
      '<ul><li><b>x</b><p style="color:#0000ff">a</p></li></ul>',
    ],
    ["p 뒤 p", "<ul><li>t<p>a</p><p>b</p></li></ul>"],
    ["p 뒤 h2", "<ul><li>t<p>a</p><h2>b</h2></li></ul>"],
    ["h1 뒤 중첩 목록", "<ul><li><h1>H</h1><ul><li>n</li></ul></li></ul>"],
    ["굵은 p", '<ul><li>t<p style="font-weight:bold">a</p></li></ul>'],
    ["순서 목록", "<ol><li>t<p>a</p></li></ol>"],
    ["글자 사이 제목", "<ul><li>t<h3>H</h3>u</li></ul>"],
    ["span이 감싼 p", "<ul><li>t<span><p>a</p></span></li></ul>"],
  ])("%s: importHtml과 같은 블록 트리로 읽는다", (_name, before) => {
    const html = `${before}${TABLE}`;

    expect(clipboardShapes(html)).toEqual(importedShapes(html));
  });

  describe("재현 입력의 명시 기대값", () => {
    it("글자 뒤 p는 항목 content와 분리된 자식 문단이고 자기 색을 가진다", () => {
      const html = `<ul><li style="color:#ff0000">t<p style="color:#00ff00">x</p></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([
        {
          type: "bulletListItem",
          level: undefined,
          textColor: "#FF0000",
          backgroundColor: undefined,
          content: [{ text: "t" }],
          children: [
            {
              type: "paragraph",
              level: undefined,
              textColor: "#00FF00",
              backgroundColor: undefined,
              content: [{ text: "x" }],
              children: undefined,
            },
          ],
        },
      ]);
    });

    it("항목 안 제목만 있으면 항목 content는 비고 자식 제목이 자기 색을 가진다", () => {
      const html = `<ul><li style="color:#ff0000"><h2 style="color:#00ff00">H</h2></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([
        {
          type: "bulletListItem",
          level: undefined,
          textColor: "#FF0000",
          backgroundColor: undefined,
          content: [],
          children: [
            {
              type: "heading",
              level: 2,
              textColor: "#00FF00",
              backgroundColor: undefined,
              content: [{ text: "H" }],
              children: undefined,
            },
          ],
        },
      ]);
    });

    it("굵은 글자 뒤 p는 항목 content에 합쳐지지 않고 자기 색을 가진다", () => {
      const html = `<ul><li><b>x</b><p style="color:#0000ff">a</p></li></ul>${TABLE}`;

      expect(clipboardShapes(html)).toEqual([
        {
          type: "bulletListItem",
          level: undefined,
          textColor: undefined,
          backgroundColor: undefined,
          content: [{ text: "x", marks: [{ type: "bold" }] }],
          children: [
            {
              type: "paragraph",
              level: undefined,
              textColor: "#0000FF",
              backgroundColor: undefined,
              content: [{ text: "a" }],
              children: undefined,
            },
          ],
        },
      ]);
    });
  });

  // 내용 없는 p·제목도 importHtml처럼 빈 자식 블록으로 남긴다(Issue #356 Q8).
  // 이전에는 블록을 만들지 않았다. 표 유무로 결과가 갈리지 않게 한다.
  describe("내용 없는 p·제목은 빈 자식 블록으로 남는다", () => {
    /** 항목 t 아래 자식 블록 하나를 둔 기대 모양이다. */
    const itemWith = (child: BlockShape): BlockShape[] => [
      {
        type: "bulletListItem",
        level: undefined,
        textColor: undefined,
        backgroundColor: undefined,
        content: [{ text: "t" }],
        children: [child],
      },
    ];
    /** 빈 자식 블록의 모양이다. */
    const emptyChild = (
      type: string,
      level: number | undefined,
      content: unknown,
    ): BlockShape => ({
      type,
      level,
      textColor: undefined,
      backgroundColor: undefined,
      content,
      children: undefined,
    });

    it.each<[string, string, BlockShape]>([
      [
        "빈 p",
        "<ul><li>t<p></p></li></ul>",
        emptyChild("paragraph", undefined, []),
      ],
      [
        "공백뿐인 p",
        "<ul><li>t<p>  </p></li></ul>",
        emptyChild("paragraph", undefined, []),
      ],
      [
        "br만 든 p",
        "<ul><li>t<p><br></p></li></ul>",
        emptyChild("paragraph", undefined, [{ text: "\n" }]),
      ],
      ["빈 제목", "<ul><li>t<h2></h2></li></ul>", emptyChild("heading", 2, [])],
      [
        "공백뿐인 제목",
        "<ul><li>t<h2>  </h2></li></ul>",
        emptyChild("heading", 2, []),
      ],
    ])(
      "%s: importHtml과 같은 빈 자식 블록이 남는다",
      (_name, before, child) => {
        const html = `${before}${TABLE}`;

        expect(clipboardShapes(html)).toEqual(itemWith(child));
        expect(clipboardShapes(html)).toEqual(importedShapes(html));
      },
    );
  });
});
