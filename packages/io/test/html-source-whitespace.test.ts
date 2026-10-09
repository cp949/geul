/**
 * `importHtml`이 외부 HTML의 소스 공백을 브라우저 렌더링 규칙대로 접는지
 * 고정한다(Issue #320 단계 B).
 *
 * - 탭·개행·FF·CR·스페이스 run은 공백 하나로 접는다. 요소 경계를 넘어 접고,
 *   공백은 앞쪽 텍스트에 남긴다.
 * - 블록 경계 태그의 안쪽 양끝과 `<br>` 옆 공백은 지운다. `<br>`는 줄바꿈으로
 *   남고 소스 개행과 구분된다. 공백뿐인 텍스트 노드는 블록을 만들지 않는다.
 * - 블록 경계에서 단어가 붙지 않는다. figure·figcaption·details·summary는
 *   문단 경계이고, importHtml 표 셀은 경계마다 줄바꿈을 넣는다(Issue #323).
 * - NBSP는 접지도 자르지도 않는다.
 * - `<pre>`와 `white-space`가 pre·pre-wrap·break-spaces인 `span` 안은 접지
 *   않는다. pre-line과 다른 태그의 `white-space`는 접는다.
 * - 입력에 `data-geul-block-id` 또는 `data-geul-cell-id`가 하나라도 있으면
 *   문서 전체를 접지 않는다. 우리 export 결과의 공백을 보존하기 위해서다.
 * - 외부 `<table>`의 셀 안 텍스트도 접는다. 클립보드 표 파서의 결과는 이미
 *   접고 있어 바뀌지 않는다.
 */
import type { Document, InlineContent } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { importHtml } from "../src/index.js";
import { expectSingleTable } from "./clipboard-table-support.js";

const NBSP = String.fromCodePoint(0xa0);

/** `importHtml`이 성공했음을 확인하고 value를 꺼낸다. */
const importedValue = (html: string) => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/** `importHtml`이 만든 문서만 꺼낸다. */
const importedDocument = (html: string): Document =>
  importedValue(html).document;

/** content 배열을 가진 블록의 content를 꺼낸다. */
const contentOf = (block: Document["blocks"][number] | undefined) => {
  if (block === undefined || !("content" in block)) {
    throw new Error("content를 가진 블록이 아니다");
  }
  if (!Array.isArray(block.content)) {
    throw new Error("인라인 content 배열이 아니다");
  }
  return block.content as InlineContent;
};

/** `<p>…</p>` 한 문단의 content만 꺼낸다. */
const paragraphContent = (inner: string): InlineContent => {
  const { blocks } = importedDocument(`<p>${inner}</p>`);
  expect(blocks).toHaveLength(1);
  return contentOf(blocks[0]);
};

describe("소스 개행과 연속 공백", () => {
  it("문단 안 소스 개행은 공백 하나로 접힌다", () => {
    expect(paragraphContent("one\ntwo")).toEqual([{ text: "one two" }]);
  });

  it("<br>는 줄바꿈으로 남아 소스 개행과 구분된다", () => {
    expect(paragraphContent("a<br>b")).toEqual([{ text: "a\nb" }]);
    expect(paragraphContent("a<br>b")).not.toEqual(paragraphContent("a\nb"));
  });

  it("연속 스페이스는 공백 하나로 접힌다", () => {
    expect(paragraphContent("a    b")).toEqual([{ text: "a b" }]);
  });

  it.each([
    ["탭", "a\t\tb"],
    ["개행과 스페이스", "a \n \n b"],
    ["FF", "a\f\fb"],
    ["CR", "a\r\rb"],
    ["탭·FF·CR·개행·스페이스가 섞인 run", "a\t\f\r\n b"],
  ])("%s run은 공백 하나로 접힌다", (_name, inner) => {
    expect(paragraphContent(inner)).toEqual([{ text: "a b" }]);
  });
});

describe("요소 경계를 넘는 접기", () => {
  it("앞 요소 끝 공백과 뒤 텍스트 앞 공백은 앞쪽에 하나만 남는다", () => {
    expect(paragraphContent("<b>a </b> b")).toEqual([
      { text: "a ", marks: [{ type: "bold" }] },
      { text: "b" },
    ]);
  });

  it("앞 텍스트 끝 공백과 뒤 요소 앞 공백은 앞쪽에 하나만 남는다", () => {
    expect(paragraphContent("a <b> b</b>")).toEqual([
      { text: "a " },
      { text: "b", marks: [{ type: "bold" }] },
    ]);
  });

  it("요소 사이 공백뿐인 텍스트는 이미 공백이 있으면 사라진다", () => {
    expect(paragraphContent("<b>a </b> <i>b</i>")).toEqual([
      { text: "a ", marks: [{ type: "bold" }] },
      { text: "b", marks: [{ type: "italic" }] },
    ]);
  });

  it("요소 사이 공백뿐인 텍스트는 앞에 공백이 없으면 하나 남는다", () => {
    expect(paragraphContent("<b>a</b> <i>b</i>")).toEqual([
      { text: "a", marks: [{ type: "bold" }] },
      { text: " " },
      { text: "b", marks: [{ type: "italic" }] },
    ]);
  });

  it("마크가 빈 텍스트만 남기면 그 조각은 사라진다", () => {
    expect(paragraphContent("a <b> </b> b")).toEqual([{ text: "a b" }]);
  });
});

describe("블록 양끝과 <br> 옆 공백", () => {
  it("문단 안쪽 양끝의 공백과 개행은 지운다", () => {
    expect(paragraphContent("\n   lead trail  \n")).toEqual([
      { text: "lead trail" },
    ]);
  });

  it("요소로 감싼 양끝 공백도 지운다", () => {
    expect(paragraphContent(" <b> a </b> ")).toEqual([
      { text: "a", marks: [{ type: "bold" }] },
    ]);
  });

  it("<br> 앞뒤 공백은 지운다", () => {
    expect(paragraphContent("a <br> b")).toEqual([{ text: "a\nb" }]);
    expect(paragraphContent("a\n<br>\nb")).toEqual([{ text: "a\nb" }]);
  });

  it("목록 항목 content는 뒤따르는 자식 블록 앞 소스 들여쓰기를 갖지 않는다", () => {
    const { blocks } = importedDocument(
      "<ul><li>부모\n  <p>자식</p></li></ul>",
    );

    expect(blocks).toHaveLength(1);
    const [item] = blocks;
    expect(item?.type).toBe("bulletListItem");
    expect(contentOf(item)).toEqual([{ text: "부모" }]);
    expect(
      item !== undefined && "children" in item ? item.children : undefined,
    ).toMatchObject([{ type: "paragraph", content: [{ text: "자식" }] }]);
  });

  it("블록 사이 공백뿐인 텍스트는 블록을 만들지 않는다", () => {
    const sequence = importedDocument("<p>a</p>\n  <p>b</p>\n");
    expect(sequence.blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);

    const wrapped = importedDocument(
      "<div>\n  <p>a</p>\n  <p>b</p>\n</div>\n<hr>\n  ",
    );
    expect(wrapped.blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "paragraph",
      "divider",
    ]);
  });

  it("공백뿐인 문단은 빈 content가 된다", () => {
    expect(paragraphContent(" \n ")).toEqual([]);
  });
});

describe("NBSP", () => {
  it("연속 NBSP는 접지 않는다", () => {
    expect(paragraphContent("a&nbsp;&nbsp;b")).toEqual([
      { text: `a${NBSP}${NBSP}b` },
    ]);
  });

  it("양끝 NBSP는 자르지 않는다", () => {
    expect(paragraphContent("&nbsp;x&nbsp;")).toEqual([
      { text: `${NBSP}x${NBSP}` },
    ]);
  });

  it("NBSP 옆 스페이스는 공백이 아닌 글자 뒤라서 남는다", () => {
    expect(paragraphContent(`a&nbsp; b`)).toEqual([{ text: `a${NBSP} b` }]);
    expect(paragraphContent(" &nbsp;x")).toEqual([{ text: `${NBSP}x` }]);
  });
});

describe("접지 않는 예외", () => {
  it("<pre> 안 개행과 공백은 그대로 둔다", () => {
    const { blocks } = importedDocument("<pre>a  b\n  c</pre>");

    expect(blocks).toMatchObject([
      { type: "codeBlock", content: [{ text: "a  b\n  c" }] },
    ]);
  });

  it.each(["pre", "pre-wrap", "break-spaces"])(
    "span의 white-space:%s 안은 접지 않는다",
    (keyword) => {
      expect(
        paragraphContent(`<span style="white-space:${keyword}">a  b\nc</span>`),
      ).toEqual([{ text: "a  b\nc" }]);
    },
  );

  it.each([
    ["대소문자와 !important", "WHITE-SPACE : PRE-WRAP !important"],
    ["다른 선언과 함께", "color:red;white-space:pre"],
    ["마지막 선언이 이긴다", "white-space:normal;white-space:pre"],
  ])("span의 white-space는 %s로 써도 읽는다", (_name, style) => {
    const content = paragraphContent(`<span style="${style}">a  b</span>`);

    expect(content.map((item) => ("text" in item ? item.text : ""))).toContain(
      "a  b",
    );
  });

  it("span의 white-space:pre-line은 접는다", () => {
    expect(
      paragraphContent('<span style="white-space:pre-line">a  b\nc</span>'),
    ).toEqual([{ text: "a b c" }]);
  });

  it("마지막 선언이 normal이면 접는다", () => {
    expect(
      paragraphContent(
        '<span style="white-space:pre;white-space:normal">a  b</span>',
      ),
    ).toEqual([{ text: "a b" }]);
  });

  it("span이 아닌 태그의 white-space는 접는다", () => {
    expect(paragraphContent('<b style="white-space:pre">a  b</b>')).toEqual([
      { text: "a b", marks: [{ type: "bold" }] },
    ]);
    expect(paragraphContent('<i style="white-space:pre">a  b</i>')).toEqual([
      { text: "a b", marks: [{ type: "italic" }] },
    ]);
    const { blocks } = importedDocument('<p style="white-space:pre">a  b</p>');
    expect(contentOf(blocks[0])).toEqual([{ text: "a b" }]);
  });

  it("보호 span 바깥 공백은 접고 안쪽은 그대로 둔다", () => {
    expect(
      paragraphContent('x   <span style="white-space:pre">  y  </span>   z'),
    ).toEqual([{ text: "x   y   z" }]);
  });

  it("보호 span 앞 공백 run은 하나로 접고 span 안 첫 글자는 건드리지 않는다", () => {
    expect(
      paragraphContent('x    <span style="white-space:pre">  y</span>'),
    ).toEqual([{ text: "x   y" }]);
  });

  it("보호 span 안 마크는 유지된다", () => {
    expect(
      paragraphContent('<span style="white-space:pre"><b>a  b</b>\nc</span>'),
    ).toEqual([{ text: "a  b", marks: [{ type: "bold" }] }, { text: "\nc" }]);
  });

  it("보호 span 안 <br> 앞 공백은 지우지 않고 span 바깥 줄 끝 공백은 지운다", () => {
    expect(
      paragraphContent('a  <span style="white-space:pre"><br>b  </span>'),
    ).toEqual([{ text: "a\nb  " }]);
  });
});

// 소스 공백 접기는 블록 경계 태그 양쪽 공백을 지운다. importHtml이 그 경계를
// 구분자 없이 이어 붙이면 단어가 붙는다(Issue #323). figure·figcaption·
// details·summary는 문단 경계로 나누고, 표 셀처럼 블록을 담지 못하는 곳은
// 경계마다 줄바꿈을 넣는다.
describe("블록 경계에서 단어가 붙지 않는다", () => {
  it("figure 앞뒤 텍스트는 별도 문단이다", () => {
    const { blocks } = importedDocument(
      "<div>Intro <figure>Figure body</figure> outro</div>",
    );

    expect(blocks.map(contentOf)).toEqual([
      [{ text: "Intro" }],
      [{ text: "Figure body" }],
      [{ text: "outro" }],
    ]);
  });

  it("summary와 details 본문은 별도 문단이다", () => {
    const { blocks } = importedDocument(
      "<details><summary>Title</summary> body text </details>",
    );

    expect(blocks.map(contentOf)).toEqual([
      [{ text: "Title" }],
      [{ text: "body text" }],
    ]);
  });

  it("figcaption과 뒤따르는 텍스트는 별도 문단이다", () => {
    const { blocks } = importedDocument(
      "<p>Before</p>\n<figure>\n  <figcaption>Fig 1</figcaption>\n  <span>text</span>\n</figure>",
    );

    expect(blocks.map(contentOf)).toEqual([
      [{ text: "Before" }],
      [{ text: "Fig 1" }],
      [{ text: "text" }],
    ]);
  });

  it("목록 항목 안 figure는 항목 content를 끝내고 자식이 된다", () => {
    const { blocks } = importedDocument(
      "<ul>\n <li>\n  a\n  <figure>f</figure>\n  b\n </li>\n</ul>",
    );

    expect(blocks).toMatchObject([
      {
        type: "bulletListItem",
        content: [{ text: "a" }],
        children: [
          { type: "paragraph", content: [{ text: "f" }] },
          { type: "paragraph", content: [{ text: "b" }] },
        ],
      },
    ]);
  });

  it("인용 안 figure 뒤 텍스트는 별도 문단이다", () => {
    const { blocks } = importedDocument(
      "<blockquote><p>q</p> <figure>f</figure> x</blockquote>",
    );

    expect(blocks).toMatchObject([
      {
        type: "quote",
        content: [{ text: "q" }],
        children: [
          { type: "paragraph", content: [{ text: "f" }] },
          { type: "paragraph", content: [{ text: "x" }] },
        ],
      },
    ]);
  });

  it.each([
    ["p", "<td>\n <p>a</p>\n <p>b</p>\n</td>", "a\nb"],
    ["공백 없는 p", "<td><p>a</p><p>b</p></td>", "a\nb"],
    ["div", "<td><div>a</div>\n<div>b</div></td>", "a\nb"],
    ["pre", "<td>x\n<pre>code</pre>\ny</td>", "x\ncode\ny"],
    ["figure", "<td>a <figure>f</figure> b</td>", "a\nf\nb"],
    [
      "details·summary",
      "<td>a <details><summary>s</summary> d</details> b</td>",
      "a\ns\nd\nb",
    ],
    ["끝 <br> 뒤 p", "<td><p>a<br></p><p>b</p></td>", "a\nb"],
  ])("표 셀 안 %s 경계는 줄바꿈 하나가 된다", (_name, cell, text) => {
    const { blocks } = importedDocument(`<table><tr>${cell}</tr></table>`);

    expect(blocks).toMatchObject([
      { type: "table", rows: [{ cells: [{ content: [{ text }] }] }] },
    ]);
  });

  it.each([
    ["div", "<div><blockquote>q</blockquote></div>"],
    ["figure", "<figure><blockquote>q</blockquote></figure>"],
    ["details", "<details><blockquote>q</blockquote></details>"],
  ])("%s 안 인용의 텍스트는 인용 content다", (_name, html) => {
    expect(importedDocument(html).blocks).toMatchObject([
      { type: "quote", content: [{ text: "q" }] },
    ]);
  });

  it.each([
    [
      "details 안 목록",
      "<details><summary>S</summary><ul><li><blockquote>q</blockquote></li></ul></details>",
    ],
    [
      "figure 안 목록",
      "<figure><ol><li><blockquote>q</blockquote></li></ol></figure>",
    ],
  ])("%s 속 인용의 텍스트는 인용 content다", (_name, html) => {
    const quote = (blocks: Document["blocks"]): unknown =>
      blocks
        .flatMap((block) => [
          block,
          ...("children" in block && Array.isArray(block.children)
            ? (block.children as Document["blocks"])
            : []),
        ])
        .find((block) => block.type === "quote");

    expect(quote(importedDocument(html).blocks)).toMatchObject({
      type: "quote",
      content: [{ text: "q" }],
    });
  });

  it("공백 접기가 꺼진 입력의 셀 블록 사이 공백뿐인 텍스트는 줄바꿈과 섞이지 않는다", () => {
    const { blocks } = importedDocument(
      '<p data-geul-block-id="x">z</p><table><tr><td><p>a</p> <p>b</p></td></tr></table>',
    );

    expect(blocks[1]).toMatchObject({
      type: "table",
      rows: [{ cells: [{ content: [{ text: "a\nb" }] }] }],
    });
  });

  it("figure 안 인용과 figcaption은 인용과 문단이 된다", () => {
    const { blocks } = importedDocument(
      "<figure><blockquote> q </blockquote><figcaption> - author </figcaption></figure>",
    );

    expect(blocks).toMatchObject([
      { type: "quote", content: [{ text: "q" }] },
      { type: "paragraph", content: [{ text: "- author" }] },
    ]);
    expect(blocks[0]).not.toHaveProperty("children");
  });

  it.each([
    [
      "img와 figcaption이 든 조각 끝 figure",
      "<figure>\n <img src='https://example.com/a.png'>\n <figcaption>\n  A caption\n </figcaption>\n</figure>\n",
      [
        { type: "image" },
        { type: "paragraph", content: [{ text: "A caption" }] },
      ],
    ],
    [
      "summary와 p가 든 details",
      "<details>\n <summary>\n  Title\n </summary>\n <p>\n  Body\n </p>\n</details>",
      [
        { type: "paragraph", content: [{ text: "Title" }] },
        { type: "paragraph", content: [{ text: "Body" }] },
      ],
    ],
    [
      "codeBlock figure의 caption",
      "<figure><pre>code</pre><figcaption>\n Cap\n</figcaption></figure>\n",
      [{ type: "codeBlock", caption: "Cap" }],
    ],
    [
      "toggle details의 summary",
      "<details data-geul-toggleable='true'>\n<summary> Label </summary>\n</details>",
      [{ type: "toggleListItem", content: [{ text: "Label" }] }],
    ],
  ])("%s는 양끝 공백 없이 들어온다", (_name, html, expected) => {
    expect(importedDocument(html).blocks).toMatchObject(expected);
  });
});

describe("외부 표", () => {
  it("importHtml의 표 셀 안 텍스트도 접힌다", () => {
    const { blocks } = importedDocument(
      "<table>\n  <tr>\n    <td> a   b \n</td>\n    <td>\n c\n d </td>\n  </tr>\n</table>",
    );

    expect(blocks).toMatchObject([
      {
        type: "table",
        rows: [
          {
            cells: [
              { content: [{ text: "a b" }] },
              { content: [{ text: "c d" }] },
            ],
          },
        ],
      },
    ]);
  });

  it("클립보드 표 파서의 결과는 이미 접어서 그대로다", () => {
    const table = expectSingleTable(
      parseClipboardTable({
        html: "<table><tr><td> a   b \n</td><td>\n c\n d </td></tr></table>",
      }),
    );

    expect(table.rows[0]?.cells.map((cell) => cell.content)).toEqual([
      [{ text: "a b" }],
      [{ text: "c d" }],
    ]);
  });
});

describe("data-geul-* 입력은 접지 않는다", () => {
  it("data-geul-block-id가 있는 문단의 공백은 그대로 둔다", () => {
    const { blocks } = importedDocument('<p data-geul-block-id="p1">a  b </p>');

    expect(blocks).toMatchObject([
      { id: "p1", type: "paragraph", content: [{ text: "a  b " }] },
    ]);
  });

  it("data-geul-cell-id가 있는 표의 셀 공백은 그대로 둔다", () => {
    const { blocks } = importedDocument(
      '<table><tbody><tr><td data-geul-cell-id="c1">c  d</td></tr></tbody></table>',
    );

    expect(blocks).toMatchObject([
      {
        type: "table",
        rows: [{ cells: [{ id: "c1", content: [{ text: "c  d" }] }] }],
      },
    ]);
  });

  it("id가 있는 조각 옆의 외부 조각도 접지 않는다", () => {
    const { blocks } = importedDocument(
      '<p data-geul-block-id="p1">a  b</p><p>c  d\ne</p>',
    );

    expect(blocks.map(contentOf)).toEqual([
      [{ text: "a  b" }],
      [{ text: "c  d\ne" }],
    ]);
  });

  it("id 속성이 비어 있으면 id로 보지 않아 접는다", () => {
    const { blocks } = importedDocument('<p data-geul-block-id="">a  b</p>');

    expect(contentOf(blocks[0])).toEqual([{ text: "a b" }]);
  });
});

describe("접은 결과의 검증", () => {
  it("공백뿐인 마크 조각이 사라져도 model 검증을 통과한다", () => {
    const { document, warnings } = importedValue(
      "<p><b> </b><i> </i><u>\n</u></p><p> <b>x</b> <i> </i></p>",
    );

    expect(document.blocks.map(contentOf)).toEqual([
      [],
      [{ text: "x", marks: [{ type: "bold" }] }],
    ]);
    expect(warnings).toEqual([]);
  });

  it("무효 코드 포인트는 접은 뒤에도 제거되고 경고가 남는다", () => {
    const invalid = String.fromCodePoint(1);
    const { document, warnings } = importedValue(`<p>a ${invalid} b</p>`);

    expect(contentOf(document.blocks[0])).toEqual([{ text: "a  b" }]);
    expect(warnings.map((warning) => warning.kind)).toContain(
      "UNSAFE_CODE_POINT_REMOVED",
    );
  });
});
