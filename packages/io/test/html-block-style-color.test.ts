/**
 * 블록 요소(`p`·`h1`–`h6`·`blockquote`·`li`·callout·문단 `div`)의 `style`이 내는
 * 색과 서식을 읽는지 고정한다(Issue #334 단계 B).
 *
 * - `color`·`background-color`는 블록 속성(`textColor`·`backgroundColor`)으로
 *   읽는다. `data-geul-*`가 있는 필드는 그쪽이 이긴다(필드별).
 * - 굵게·기울임·밑줄·취소선은 안쪽 텍스트 마크로 읽는다. 블록 요소의 기본 굵기
 *   (`h1` 굵게 등)는 읽지 않는다.
 * - 블록 자식이 없는 `div`만 문단으로 읽는다. 래퍼 `div`(블록 자식이 있는 것)의
 *   색·배경·서식은 읽지 않는다. VS Code 복사 모양이 색 없이 들어온다.
 * - 표 셀 안 블록 요소는 블록 속성이 없으므로 색과 서식을 텍스트 마크로 읽는다.
 *   안쪽 `span` 색이 이긴다.
 * - 기대값은 Chromium `getComputedStyle` 실측(2026-10-10)이다. 래퍼 `div`와
 *   블록 기본 굵기처럼 의도해서 읽지 않는 값은 각 묶음에 이유를 적었다.
 * - sanitize 스키마는 `style`을 남기되 경고 기준(`htmlAllowedAttributes`)은
 *   늘리지 않는다. 이 요소들의 `style` 제거 경고는 이전과 같다.
 */
import type { DocumentBlock, Document, InlineContent } from "@cp949/geul-model";
import type { Schema } from "hast-util-sanitize";
import { describe, expect, it } from "vitest";

import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { htmlImportSanitizeSchema } from "../src/html/import-html-sanitize-schema.js";
import {
  clipboardSanitizeSchema,
  htmlAllowedAttributes,
  htmlSanitizeSchema,
} from "../src/html/sanitize-schema.js";
import { exportHtml, importHtml } from "../src/index.js";
import { expectSingleTable } from "./clipboard-table-support.js";

/** `importHtml` 성공 결과를 꺼낸다. 실패하면 오류 메시지로 던진다. */
const imported = (html: string) => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/** 문서의 모든 블록을 돌려준다. */
const blocksOf = (html: string): DocumentBlock[] =>
  imported(html).document.blocks;

/** 첫 블록을 돌려준다. 없으면 던진다. */
const firstBlock = (html: string): DocumentBlock => {
  const [block] = blocksOf(html);
  if (block === undefined) throw new Error("블록이 없다");
  return block;
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

/** 블록의 인라인 content를 돌려준다. 인라인 content가 없으면 던진다. */
const contentOf = (block: DocumentBlock): InlineContent => {
  const content = (block as unknown as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new Error("인라인 content가 없다");
  return content as InlineContent;
};

/** 마크 type만 모아 정렬한 문자열 배열로 줄인다. */
const markTypesOf = (content: InlineContent): string[] => {
  const types = new Set<string>();
  for (const item of content) {
    if (!("marks" in item) || item.marks === undefined) continue;
    for (const mark of item.marks) types.add(mark.type);
  }
  return [...types].sort();
};

/** 색 마크 하나의 color를 꺼낸다. 호출부가 type을 이미 확인했다. */
const colorOf = (mark: object): string => (mark as { color: string }).color;

/** 한 조각이 가진 마크를 `{type: color | true}`로 줄인다. */
const factsOfItem = (
  item: InlineContent[number],
): Record<string, string | true> => {
  const facts: Record<string, string | true> = {};
  if (!("marks" in item) || item.marks === undefined) return facts;
  for (const mark of item.marks) {
    facts[mark.type] =
      mark.type === "textColor" || mark.type === "backgroundColor"
        ? colorOf(mark)
        : true;
  }
  return facts;
};

/** 블록 하나를 만드는 HTML 생성기다. `style`은 속성 값이다. */
type Container = [
  name: string,
  type: DocumentBlock["type"],
  build: (style: string) => string,
];

const textBlockContainers: Container[] = [
  ["p", "paragraph", (s) => `<p style="${s}">x</p>`],
  ["h1", "heading", (s) => `<h1 style="${s}">x</h1>`],
  ["h2", "heading", (s) => `<h2 style="${s}">x</h2>`],
  ["h3", "heading", (s) => `<h3 style="${s}">x</h3>`],
  ["h4", "heading", (s) => `<h4 style="${s}">x</h4>`],
  ["h5", "heading", (s) => `<h5 style="${s}">x</h5>`],
  ["h6", "heading", (s) => `<h6 style="${s}">x</h6>`],
  ["blockquote", "quote", (s) => `<blockquote style="${s}">x</blockquote>`],
  ["ul > li", "bulletListItem", (s) => `<ul><li style="${s}">x</li></ul>`],
  ["ol > li", "numberedListItem", (s) => `<ol><li style="${s}">x</li></ol>`],
  [
    "callout div",
    "callout",
    (s) => `<div data-geul-callout="true" style="${s}">x</div>`,
  ],
  ["블록 자식 없는 div", "paragraph", (s) => `<div style="${s}">x</div>`],
];

describe("블록 style의 색은 블록 속성으로 읽는다", () => {
  it.each(textBlockContainers)(
    "%s의 style 글자색은 textColor 블록 속성이 된다",
    (_name, type, build) => {
      const block = firstBlock(build("color:#ff0000"));
      expect(block.type).toBe(type);
      expect(colorProps(block)).toEqual({ textColor: "#FF0000" });
    },
  );

  it.each(textBlockContainers)(
    "%s의 style 배경은 backgroundColor 블록 속성이 된다",
    (_name, type, build) => {
      const block = firstBlock(build("background-color:#00ff00"));
      expect(block.type).toBe(type);
      expect(colorProps(block)).toEqual({ backgroundColor: "#00FF00" });
    },
  );

  it.each(textBlockContainers)(
    "%s의 글자색과 배경을 함께 읽는다",
    (_name, _type, build) => {
      const block = firstBlock(build("color:#ff0000;background:#0000ff"));
      expect(colorProps(block)).toEqual({
        textColor: "#FF0000",
        backgroundColor: "#0000FF",
      });
    },
  );

  it.each([
    ["rgb(255, 0, 0)", "#FF0000"],
    ["red", "#FF0000"],
    ["#f00", "#FF0000"],
    ["hsl(120, 100%, 50%)", "#00FF00"],
    ["rebeccapurple", "#663399"],
  ])("color:%s는 canonical %s이다", (value, color) => {
    expect(colorProps(firstBlock(`<p style="color:${value}">x</p>`))).toEqual({
      textColor: color,
    });
  });

  it.each([
    ["transparent"],
    ["rgba(255,0,0,0.5)"],
    ["inherit"],
    ["currentcolor"],
    ["bogus"],
  ])(
    "color:%s는 값 없음이다(Chromium도 상속·기본·반투명을 쓰지 않는다)",
    (value) => {
      expect(colorProps(firstBlock(`<p style="color:${value}">x</p>`))).toEqual(
        {},
      );
    },
  );

  it("뒤 선언이 문법 오류면 앞의 유효한 색을 유지한다", () => {
    expect(
      colorProps(firstBlock('<p style="color:#ff0000;color:bogus">x</p>')),
    ).toEqual({ textColor: "#FF0000" });
  });

  it("색은 블록 속성으로만 읽고 안쪽 텍스트 마크로 이중 반영하지 않는다", () => {
    for (const [, , build] of textBlockContainers) {
      const block = firstBlock(build("color:#ff0000;background-color:#00ff00"));
      expect(contentOf(block)).toEqual([{ text: "x" }]);
    }
  });

  it("색이 없는 style은 블록 속성을 만들지 않는다", () => {
    expect(
      colorProps(firstBlock('<p style="font-size:12px;margin:0">x</p>')),
    ).toEqual({});
  });
});

describe("data-geul-*가 블록 style보다 필드별로 우선한다", () => {
  it("data-geul-text-color가 있으면 style의 글자색을 쓰지 않는다", () => {
    expect(
      colorProps(
        firstBlock(
          '<p data-geul-text-color="#112233" style="color:#ff0000">x</p>',
        ),
      ),
    ).toEqual({ textColor: "#112233" });
  });

  it("data-geul-background-color가 있으면 style의 배경을 쓰지 않는다", () => {
    expect(
      colorProps(
        firstBlock(
          '<p data-geul-background-color="#112233" style="background-color:#ff0000">x</p>',
        ),
      ),
    ).toEqual({ backgroundColor: "#112233" });
  });

  it("data-geul가 없는 필드만 style에서 채운다", () => {
    expect(
      colorProps(
        firstBlock(
          '<p data-geul-text-color="#112233" style="color:#ff0000;background-color:#00ff00">x</p>',
        ),
      ),
    ).toEqual({ textColor: "#112233", backgroundColor: "#00FF00" });
    expect(
      colorProps(
        firstBlock(
          '<h2 data-geul-background-color="#112233" style="color:#ff0000;background-color:#00ff00">x</h2>',
        ),
      ),
    ).toEqual({ textColor: "#FF0000", backgroundColor: "#112233" });
  });

  it("li·blockquote·callout도 같은 규칙이다", () => {
    expect(
      colorProps(
        firstBlock(
          '<ul><li data-geul-text-color="#112233" style="color:#ff0000;background-color:#00ff00">x</li></ul>',
        ),
      ),
    ).toEqual({ textColor: "#112233", backgroundColor: "#00FF00" });
    expect(
      colorProps(
        firstBlock(
          '<blockquote data-geul-text-color="#112233" style="color:#ff0000">x</blockquote>',
        ),
      ),
    ).toEqual({ textColor: "#112233" });
    expect(
      colorProps(
        firstBlock(
          '<div data-geul-callout="true" data-geul-background-color="#112233" style="background-color:#ff0000;color:#0000ff">x</div>',
        ),
      ),
    ).toEqual({ backgroundColor: "#112233", textColor: "#0000FF" });
  });

  it("data-geul 값은 원시 문자열 그대로 통과해 style로 보정되지 않는다", () => {
    // 비정규형 값은 style이 유효해도 살리지 않고, 문서 검증이 거절한다.
    const result = importHtml(
      '<p data-geul-text-color="red" style="color:#ff0000">x</p>',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("HTML_DOCUMENT_INVALID");
  });
});

describe("자기 export를 다시 읽는다", () => {
  const exportThenImport = (document: Document) => {
    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    return { html: exported.value, result: importHtml(exported.value) };
  };

  const colorDocument: Document = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "p1",
        type: "paragraph",
        content: [{ text: "para" }],
        textColor: "#FF0000",
        backgroundColor: "#00FF00",
      },
      {
        id: "h1",
        type: "heading",
        level: 3,
        content: [{ text: "head" }],
        textColor: "#112233",
      },
      {
        id: "q1",
        type: "quote",
        content: [{ text: "quote" }],
        backgroundColor: "#ABCDEF",
      },
      {
        id: "l1",
        type: "bulletListItem",
        content: [{ text: "item" }],
        textColor: "#0000FF",
        backgroundColor: "#FFFF00",
      },
      {
        id: "c1",
        type: "callout",
        content: [{ text: "call" }],
        textColor: "#FF00FF",
      },
    ],
  };

  it("블록 색이 있는 문서는 경고 없이 같은 결과로 왕복한다", () => {
    const { result } = exportThenImport(colorDocument);
    expect(result).toEqual({
      ok: true,
      value: { document: colorDocument, warnings: [] },
    });
  });

  it("export가 style과 data-geul-*를 함께 낸다(왕복 전제)", () => {
    const { html } = exportThenImport(colorDocument);
    expect(html).toContain('data-geul-text-color="#FF0000"');
    expect(html).toContain("color:#FF0000");
  });

  it("data-geul-* 색이 지워져도 style만으로 같은 색을 읽는다", () => {
    const { html } = exportThenImport(colorDocument);
    const stripped = html.replace(
      / data-geul-(text|background)-color="[^"]*"/g,
      "",
    );
    expect(stripped).not.toContain("data-geul-text-color");
    expect(stripped).not.toContain("data-geul-background-color");
    const value = imported(stripped);
    const props = value.document.blocks.map(colorProps);
    expect(props).toEqual(blocksOf(html).map(colorProps));
  });

  it("글자 정렬만 있는 블록은 색을 만들지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          content: [{ text: "a" }],
          textAlignment: "center",
        },
      ],
    };
    const { result } = exportThenImport(document);
    expect(result).toEqual({ ok: true, value: { document, warnings: [] } });
  });
});

describe("블록 style의 서식은 안쪽 텍스트 마크로 읽는다", () => {
  const formatContainers = textBlockContainers.filter(
    ([name]) => name !== "h3" && name !== "h4" && name !== "h5",
  );

  it.each(formatContainers)(
    "%s의 font-weight:700은 굵게다",
    (_name, _type, build) => {
      const content = contentOf(firstBlock(build("font-weight:700")));
      expect(content).toEqual([{ text: "x", marks: [{ type: "bold" }] }]);
    },
  );

  it.each(formatContainers)(
    "%s의 font-style:italic은 기울임이다",
    (_name, _type, build) => {
      const content = contentOf(firstBlock(build("font-style:italic")));
      expect(content).toEqual([{ text: "x", marks: [{ type: "italic" }] }]);
    },
  );

  it.each(formatContainers)(
    "%s의 text-decoration:underline은 밑줄이다",
    (_name, _type, build) => {
      const content = contentOf(firstBlock(build("text-decoration:underline")));
      expect(content).toEqual([{ text: "x", marks: [{ type: "underline" }] }]);
    },
  );

  it.each(formatContainers)(
    "%s의 text-decoration:line-through는 취소선이다",
    (_name, _type, build) => {
      const content = contentOf(
        firstBlock(build("text-decoration:line-through")),
      );
      expect(content).toEqual([{ text: "x", marks: [{ type: "strike" }] }]);
    },
  );

  it("font 줄임의 기울임·굵게를 읽는다", () => {
    expect(
      markTypesOf(
        contentOf(firstBlock('<p style="font:italic bold 12px Arial">x</p>')),
      ),
    ).toEqual(["bold", "italic"]);
  });

  it("밑줄과 취소선을 함께 읽는다", () => {
    expect(
      markTypesOf(
        contentOf(
          firstBlock('<p style="text-decoration:underline line-through">x</p>'),
        ),
      ),
    ).toEqual(["strike", "underline"]);
  });

  it.each([
    ["font-weight:400"],
    ["font-weight:normal"],
    ["font-weight:500"],
    ["font-weight:lighter"],
    ["font-weight:bogus"],
    ["font-style:normal"],
    ["text-decoration:none"],
    ["font:12px Arial"],
  ])("%s는 마크를 만들지 않는다", (style) => {
    expect(contentOf(firstBlock(`<p style="${style}">x</p>`))).toEqual([
      { text: "x" },
    ]);
  });

  it("font-weight:600 이상은 굵게다(Chromium 실측)", () => {
    expect(
      markTypesOf(contentOf(firstBlock('<p style="font-weight:600">x</p>'))),
    ).toEqual(["bold"]);
  });

  it("블록 색과 서식이 함께 있으면 색은 블록 속성, 서식은 마크다", () => {
    const block = firstBlock(
      '<p style="color:#ff0000;background-color:#00ff00;font-weight:700">x</p>',
    );
    expect(colorProps(block)).toEqual({
      textColor: "#FF0000",
      backgroundColor: "#00FF00",
    });
    expect(contentOf(block)).toEqual([
      { text: "x", marks: [{ type: "bold" }] },
    ]);
  });

  it("안쪽 span의 마크와 합쳐진다", () => {
    const content = contentOf(
      firstBlock(
        '<p style="font-weight:700">a<span style="font-style:italic">b</span></p>',
      ),
    );
    expect(content).toEqual([
      { text: "a", marks: [{ type: "bold" }] },
      { text: "b", marks: [{ type: "bold" }, { type: "italic" }] },
    ]);
  });

  it("제목의 기본 굵기는 읽지 않는다", () => {
    expect(contentOf(firstBlock("<h1>x</h1>"))).toEqual([{ text: "x" }]);
    expect(contentOf(firstBlock('<h2 style="color:#ff0000">x</h2>'))).toEqual([
      { text: "x" },
    ]);
  });

  it("li 안 첫 문단의 자식 span도 li 서식을 받는다", () => {
    const content = contentOf(
      firstBlock('<ul><li style="font-weight:700">a<span>b</span></li></ul>'),
    );
    expect(markTypesOf(content)).toEqual(["bold"]);
    expect(
      content.map((item) => ("text" in item ? item.text : "")).join(""),
    ).toBe("ab");
  });
});

describe("블록 자식이 없는 div만 문단으로 읽는다", () => {
  it("인라인 자식만 든 div는 색과 서식을 읽는다", () => {
    const block = firstBlock(
      '<div style="color:#ff0000;background-color:#00ff00;font-weight:700">a<span>b</span></div>',
    );
    expect(block.type).toBe("paragraph");
    expect(colorProps(block)).toEqual({
      textColor: "#FF0000",
      backgroundColor: "#00FF00",
    });
    expect(contentOf(block)).toEqual([
      { text: "ab", marks: [{ type: "bold" }] },
    ]);
  });

  it("안쪽 span 색은 마크로 남고 div 색은 블록 속성이다", () => {
    const block = firstBlock(
      '<div style="color:#ff0000"><span style="color:#00ff00">x</span></div>',
    );
    expect(colorProps(block)).toEqual({ textColor: "#FF0000" });
    expect(contentOf(block)).toEqual([
      { text: "x", marks: [{ type: "textColor", color: "#00FF00" }] },
    ]);
  });

  // 문단 div는 style만 읽는다. data-geul-*는 p·h1–h6·blockquote·li·callout의
  // 계약이라 평범한 div에서 읽으면 잘못된 값이 문서 전체를 거절시킨다(리뷰
  // MINOR-2). #334 전에는 이 값이 무시됐다.
  it.each([
    ["글자색", 'data-geul-text-color="#abc"'],
    ["배경", 'data-geul-background-color="not-a-color"'],
    ["정렬", 'data-geul-text-alignment="bogus"'],
    [
      "셋 다",
      'data-geul-text-color="#abc" data-geul-background-color="x" data-geul-text-alignment="y"',
    ],
  ])(
    "문단 div의 잘못된 data-geul-* 값(%s)은 무시하고 문서를 거절하지 않는다",
    (_name, attrs) => {
      const block = firstBlock(`<div ${attrs}>x</div>`);
      expect(block.type).toBe("paragraph");
      expect(colorProps(block)).toEqual({});
      expect(contentOf(block)).toEqual([{ text: "x" }]);
    },
  );

  it("문단 div는 유효한 data-geul-* 값도 읽지 않고 style만 읽는다", () => {
    const block = firstBlock(
      '<div data-geul-text-color="#112233" data-geul-text-alignment="center" style="color:#ff0000">x</div>',
    );
    expect(colorProps(block)).toEqual({ textColor: "#FF0000" });
    expect(block).not.toHaveProperty("textAlignment");
  });

  it("p·h1·blockquote·li의 data-geul-* 계약은 그대로다", () => {
    for (const html of [
      '<p data-geul-text-color="#112233">x</p>',
      '<h1 data-geul-text-color="#112233">x</h1>',
      '<blockquote data-geul-text-color="#112233">x</blockquote>',
      '<ul><li data-geul-text-color="#112233">x</li></ul>',
      '<div data-geul-callout="true" data-geul-text-color="#112233">x</div>',
    ]) {
      expect(colorProps(firstBlock(html)), html).toEqual({
        textColor: "#112233",
      });
    }
    expect(importHtml('<p data-geul-text-color="#abc">x</p>').ok).toBe(false);
  });

  it("br로 나뉜 줄도 한 문단이다", () => {
    const blocks = blocksOf('<div style="color:#ff0000">a<br>b</div>');
    expect(blocks).toHaveLength(1);
    expect(colorProps(blocks[0] as DocumentBlock)).toEqual({
      textColor: "#FF0000",
    });
    expect(contentOf(blocks[0] as DocumentBlock)).toEqual([{ text: "a\nb" }]);
  });

  it("형제 div마다 자기 색만 읽는다", () => {
    const blocks = blocksOf(
      '<div style="color:#ff0000">a</div><div>b</div><div style="color:#0000ff">c</div>',
    );
    expect(blocks.map(colorProps)).toEqual([
      { textColor: "#FF0000" },
      {},
      { textColor: "#0000FF" },
    ]);
  });

  it("div 앞뒤 loose 텍스트는 div의 색을 받지 않는다", () => {
    const blocks = blocksOf('lead<div style="color:#ff0000">a</div>tail');
    expect(blocks.map(colorProps)).toEqual([{}, { textColor: "#FF0000" }, {}]);
  });

  it("빈 div와 공백뿐인 div는 블록을 만들지 않는다", () => {
    expect(
      blocksOf(
        '<div style="color:#ff0000"></div><div style="color:#ff0000"> </div><p>y</p>',
      ).map((block) => contentOf(block)),
    ).toEqual([[{ text: "y" }]]);
  });

  it("블록 자식(p)이 있는 div는 래퍼라 색을 읽지 않는다", () => {
    // 뒤쪽 텍스트(c)도 래퍼 색을 받지 않는다. 래퍼가 문단을 끝내는 마지막
    // flush에서 origin을 싣는 변이를 잡는다.
    const blocks = blocksOf('<div style="color:#ff0000">a<p>b</p>c</div>');
    expect(blocks.map(colorProps)).toEqual([{}, {}, {}]);
  });

  it("블록 자식(div)이 있는 div는 래퍼라 색을 읽지 않는다", () => {
    const blocks = blocksOf(
      '<div style="color:#ff0000;font-weight:700"><div>x</div></div>',
    );
    expect(blocks).toHaveLength(1);
    expect(colorProps(blocks[0] as DocumentBlock)).toEqual({});
    expect(contentOf(blocks[0] as DocumentBlock)).toEqual([{ text: "x" }]);
  });

  it("래퍼 안쪽 div는 자기 색을 읽고 래퍼 색은 따라오지 않는다", () => {
    const blocks = blocksOf(
      '<div style="color:#ff0000"><div style="color:#00ff00">x</div></div>',
    );
    expect(blocks.map(colorProps)).toEqual([{ textColor: "#00FF00" }]);
  });

  it.each([
    ["ul", '<div style="color:#ff0000"><ul><li>x</li></ul></div>'],
    ["ol", '<div style="color:#ff0000"><ol><li>x</li></ol></div>'],
    [
      "table",
      '<div style="color:#ff0000"><table><tbody><tr><td>x</td></tr></tbody></table></div>',
    ],
    ["hr", '<div style="color:#ff0000">a<hr>b</div>'],
  ])("%s를 품은 div는 래퍼라 색을 읽지 않는다", (_name, html) => {
    for (const block of blocksOf(html)) {
      expect(colorProps(block)).toEqual({});
    }
  });
});

describe("VS Code 복사 모양", () => {
  const vscode =
    '<div style="color:#d4d4d4;background-color:#1e1e1e;font-family:Consolas;white-space:pre">' +
    '<div><span style="color:#569cd6">const</span><span style="color:#d4d4d4"> x</span></div>' +
    "<div><span>return</span></div>" +
    "</div>";

  it("바깥 div의 테마 글자색·배경이 따라오지 않는다", () => {
    const blocks = blocksOf(vscode);
    expect(blocks).toHaveLength(2);
    expect(blocks.map(colorProps)).toEqual([{}, {}]);
  });

  it("span의 토큰 색은 마크로 남는다", () => {
    const [first] = blocksOf(vscode);
    expect(contentOf(first as DocumentBlock)).toEqual([
      { text: "const", marks: [{ type: "textColor", color: "#569CD6" }] },
      { text: " x", marks: [{ type: "textColor", color: "#D4D4D4" }] },
    ]);
  });

  it("바깥 div의 white-space 보존은 그대로 동작한다", () => {
    const [, second] = blocksOf(vscode);
    expect(contentOf(second as DocumentBlock)).toEqual([{ text: "return" }]);
  });
});

describe("표 셀 안 블록 요소는 색과 서식을 텍스트 마크로 읽는다", () => {
  /** 한 셀 content를 두 경로(importHtml, 클립보드)로 읽는다. */
  const cellContents = (inner: string): Array<[string, InlineContent]> => {
    const html = `<table><tbody><tr><td>${inner}</td></tr></tbody></table>`;
    const [block] = blocksOf(html);
    if (block?.type !== "table" || !("rows" in block)) {
      throw new Error("표 블록이 아니다");
    }
    const importedContent = block.rows[0]?.cells[0]?.content;
    const clipboard = expectSingleTable(parseClipboardTable({ html }));
    const clipboardContent = clipboard.rows[0]?.cells[0]?.content;
    if (importedContent === undefined || clipboardContent === undefined) {
      throw new Error("셀이 없다");
    }
    return [
      ["importHtml 표 셀", importedContent],
      ["clipboard 표 셀", clipboardContent],
    ];
  };

  const expectBothPaths = (inner: string, expected: InlineContent): void => {
    for (const [name, content] of cellContents(inner)) {
      expect(content, name).toEqual(expected);
    }
  };

  it.each([
    ["p", '<p style="color:#ff0000">x</p>'],
    ["div", '<div style="color:#ff0000">x</div>'],
    ["h1", '<h1 style="color:#ff0000">x</h1>'],
    ["h2", '<h2 style="color:#ff0000">x</h2>'],
    ["h3", '<h3 style="color:#ff0000">x</h3>'],
    ["h4", '<h4 style="color:#ff0000">x</h4>'],
    ["h5", '<h5 style="color:#ff0000">x</h5>'],
    ["h6", '<h6 style="color:#ff0000">x</h6>'],
    ["blockquote", '<blockquote style="color:#ff0000">x</blockquote>'],
    ["li", '<ul><li style="color:#ff0000">x</li></ul>'],
  ])("%s의 style 글자색은 글자색 마크다", (_name, inner) => {
    expectBothPaths(inner, [
      { text: "x", marks: [{ type: "textColor", color: "#FF0000" }] },
    ]);
  });

  // h1–h6 어느 하나가 cellBlockStyleTagNames에서 빠지면 그 레벨만 마크를 잃는다
  // (리뷰 MINOR-6). 색 말고 배경과 서식도 레벨마다 고정한다.
  it.each(["h1", "h2", "h3", "h4", "h5", "h6"])(
    "%s의 style 배경·굵게·기울임·밑줄·취소선도 마크로 읽는다",
    (tag) => {
      for (const [name, content] of cellContents(
        `<${tag} style="color:#ff0000;background-color:#00ff00;font-weight:700;font-style:italic;text-decoration:underline line-through">x</${tag}>`,
      )) {
        expect(factsOfItem(content[0] as InlineContent[number]), name).toEqual({
          textColor: "#FF0000",
          backgroundColor: "#00FF00",
          bold: true,
          italic: true,
          underline: true,
          strike: true,
        });
      }
    },
  );

  it("배경과 서식도 마크로 읽는다", () => {
    for (const [name, content] of cellContents(
      '<p style="background-color:#00ff00;font-weight:700;font-style:italic">x</p>',
    )) {
      expect(factsOfItem(content[0] as InlineContent[number]), name).toEqual({
        backgroundColor: "#00FF00",
        bold: true,
        italic: true,
      });
    }
  });

  it("안쪽 span 색이 블록 색을 덮는다", () => {
    expectBothPaths(
      '<p style="color:#ff0000"><span style="color:#00ff00">x</span></p>',
      [{ text: "x", marks: [{ type: "textColor", color: "#00FF00" }] }],
    );
  });

  it("span이 색을 정하지 않으면 블록 색이 남는다", () => {
    expectBothPaths('<p style="color:#ff0000"><span>x</span></p>', [
      { text: "x", marks: [{ type: "textColor", color: "#FF0000" }] },
    ]);
  });

  it("색은 해당 블록의 글자에만 붙고 줄바꿈과 이웃 블록에는 붙지 않는다", () => {
    expectBothPaths('<p style="color:#ff0000">a</p><p>b</p>', [
      { text: "a", marks: [{ type: "textColor", color: "#FF0000" }] },
      { text: "\nb" },
    ]);
  });

  // 래퍼 div의 색은 소스 앱 테마 색이라 읽지 않는다. 셀 밖 래퍼 div와 같은 규칙이다
  // (리뷰 MINOR-1).
  it.each([
    ["p", '<div style="color:#000000;background-color:#ffffff"><p>x</p></div>'],
    ["div", '<div style="color:#000000"><div>x</div></div>'],
    ["ul", '<div style="color:#000000"><ul><li>x</li></ul></div>'],
    ["h2", '<div style="color:#000000"><h2>x</h2></div>'],
    [
      "blockquote",
      '<div style="color:#000000"><blockquote>x</blockquote></div>',
    ],
    [
      "table",
      '<div style="color:#000000"><table><tr><td>x</td></tr></table></div>',
    ],
    ["span 뒤 p", '<div style="color:#000000"><span>x</span><p>y</p></div>'],
  ])("블록 자식(%s)이 있는 래퍼 div의 색은 읽지 않는다", (_name, inner) => {
    for (const [name, content] of cellContents(inner)) {
      expect(markTypesOf(content), name).toEqual([]);
    }
  });

  it("블록 자식이 없는 div는 색을 읽는다(인라인 자식만 든 경우)", () => {
    expectBothPaths('<div style="color:#ff0000"><span>x</span><br></div>', [
      { text: "x\n", marks: [{ type: "textColor", color: "#FF0000" }] },
    ]);
  });

  it("래퍼 안쪽 p의 색은 읽고 래퍼 div 색은 따라오지 않는다", () => {
    expectBothPaths(
      '<div style="color:#ff0000"><p style="color:#0000ff">x</p></div>',
      [{ text: "x", marks: [{ type: "textColor", color: "#0000FF" }] }],
    );
    expectBothPaths(
      '<div style="color:#ff0000"><p>x</p><p style="color:#0000ff">y</p></div>',
      [
        { text: "x\n" },
        { text: "y", marks: [{ type: "textColor", color: "#0000FF" }] },
      ],
    );
  });

  it("바깥 래퍼 div는 읽지 않고 안쪽 블록 자식 없는 div는 읽는다", () => {
    expectBothPaths(
      '<div style="color:#ff0000"><div style="color:#0000ff">x</div></div>',
      [{ text: "x", marks: [{ type: "textColor", color: "#0000FF" }] }],
    );
  });

  it("셀 밖에서는 같은 style이 마크가 아니라 블록 속성이다", () => {
    const block = firstBlock('<p style="color:#ff0000">x</p>');
    expect(colorProps(block)).toEqual({ textColor: "#FF0000" });
    expect(contentOf(block)).toEqual([{ text: "x" }]);
  });

  it("블록 자식 없는 div도 셀 밖에서는 색이 마크가 아니라 블록 속성이다", () => {
    const block = firstBlock('<div style="color:#ff0000">x</div>');
    expect(colorProps(block)).toEqual({ textColor: "#FF0000" });
    expect(contentOf(block)).toEqual([{ text: "x" }]);
  });
});

describe("경고 계약", () => {
  const styledTags: Array<[string, string]> = [
    ["p", '<p style="color:#ff0000">x</p>'],
    ["h1", '<h1 style="color:#ff0000">x</h1>'],
    ["h6", '<h6 style="color:#ff0000">x</h6>'],
    ["blockquote", '<blockquote style="color:#ff0000">x</blockquote>'],
    ["li", '<ul><li style="color:#ff0000">x</li></ul>'],
    ["div", '<div style="color:#ff0000">x</div>'],
  ];

  it.each(styledTags)(
    "%s의 style 제거 경고는 읽는 색이 있어도 이전과 같다",
    (tag, html) => {
      expect(imported(html).warnings).toEqual([
        {
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: tag,
          attribute: "style",
          message: `Unsupported style attribute was removed from ${tag}`,
        },
      ]);
    },
  );

  it("자기 export의 style 에코는 경고하지 않는다", () => {
    expect(
      imported(
        '<p data-geul-block-id="p1" data-geul-text-color="#112233" style="color:#112233">x</p>',
      ).warnings,
    ).toEqual([]);
  });

  it("에코가 설명하지 못하는 선언이 섞이면 경고를 유지한다", () => {
    const value = imported(
      '<p data-geul-block-id="p1" data-geul-text-color="#112233" style="color:#112233;font-weight:bold">x</p>',
    );
    expect(value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "p",
        attribute: "style",
      }),
    ]);
  });

  it("경고 기준 htmlAllowedAttributes에는 이 요소들의 style을 올리지 않는다", () => {
    for (const tag of [
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "li",
      "blockquote",
      "div",
    ]) {
      expect(htmlAllowedAttributes[tag] ?? []).not.toContain("style");
    }
  });

  it.each<[string, Schema]>([
    ["htmlSanitizeSchema", htmlSanitizeSchema],
    ["htmlImportSanitizeSchema", htmlImportSanitizeSchema],
    ["clipboardSanitizeSchema", clipboardSanitizeSchema],
  ])("%s는 읽기 전용 style을 이 요소들에서 남긴다", (_name, schema) => {
    for (const tag of [
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "li",
      "blockquote",
      "div",
    ]) {
      expect(schema.attributes?.[tag], tag).toContain("style");
    }
  });

  it.each([
    ["li", '<ul><li><font color="red">x</font></li></ul>'],
    ["div", '<div><font color="red">x</font></div>'],
    ["blockquote", '<blockquote><font color="red">x</font></blockquote>'],
    ["li", "<ul><li><mark>x</mark></li></ul>"],
    ["div", "<div><mark>x</mark></div>"],
    ["blockquote", "<blockquote><mark>x</mark></blockquote>"],
  ])("%s 안의 font·mark는 블록 강등 경고를 내지 않는다", (_name, html) => {
    expect(imported(html).warnings).toEqual([]);
  });

  it("루트에 놓인 font·mark의 블록 강등 경고는 유지된다", () => {
    expect(
      imported('<font color="red">x</font>').warnings.map(
        (warning) => warning.kind,
      ),
    ).toEqual(["SAFE_BLOCK_DOWNGRADED"]);
    expect(
      imported("<mark>x</mark>").warnings.map((warning) => warning.kind),
    ).toEqual(["SAFE_BLOCK_DOWNGRADED"]);
  });

  it("미지원 인라인 태그(sup)의 블록 강등 경고는 유지된다", () => {
    expect(
      imported("<div><sup>x</sup></div>").warnings.map(
        (warning) => warning.kind,
      ),
    ).toEqual(["SAFE_BLOCK_DOWNGRADED"]);
  });
});

describe("클립보드 문단 경로는 블록 자식 없는 div의 style을 importHtml과 같게 읽는다", () => {
  const TABLE =
    "<table><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table>";

  /** 비교에 쓰는 블록 모양이다. id 같은 비교 대상이 아닌 필드는 뺀다. */
  type Shape = {
    type: string;
    content: unknown;
    textColor?: unknown;
    backgroundColor?: unknown;
    children?: Shape[];
  };

  /** 표가 아닌 블록을 비교용 모양으로 줄인다. */
  const shapeOf = (block: unknown): Shape => {
    const record = block as Record<string, unknown>;
    const children = record.children;
    return {
      type: record.type as string,
      content: record.content,
      ...(record.textColor === undefined
        ? {}
        : { textColor: record.textColor }),
      ...(record.backgroundColor === undefined
        ? {}
        : { backgroundColor: record.backgroundColor }),
      ...(Array.isArray(children) && children.length > 0
        ? { children: children.map(shapeOf) }
        : {}),
    };
  };

  /** 클립보드 파서가 읽은 표 아닌 블록이다. */
  const clipboardShapes = (html: string): Shape[] => {
    const result = parseClipboardTable({ html });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    return result.value
      .filter((block) => block.type !== "table")
      .map((block) => shapeOf(block));
  };

  /** importHtml이 읽은 표 아닌 블록이다. */
  const importedShapes = (html: string): Shape[] =>
    blocksOf(html)
      .filter((block) => block.type !== "table")
      .map((block) => shapeOf(block));

  it("표 앞 div 문단의 색·굵게를 읽는다", () => {
    const result = parseClipboardTable({
      html: '<div style="color:#ff0000;font-weight:700">intro</div>' + TABLE,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value[0]).toEqual({
      type: "paragraph",
      textColor: "#FF0000",
      content: [{ text: "intro", marks: [{ type: "bold" }] }],
    });
  });

  it("표 뒤 div 문단의 배경·기울임을 읽는다", () => {
    const result = parseClipboardTable({
      html:
        TABLE +
        '<div style="background-color:#ffff00;font-style:italic">E</div>',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value[1]).toEqual({
      type: "paragraph",
      backgroundColor: "#FFFF00",
      content: [{ text: "E", marks: [{ type: "italic" }] }],
    });
  });

  it("밑줄·취소선도 읽는다", () => {
    const result = parseClipboardTable({
      html:
        '<div style="text-decoration:underline line-through">u</div>' + TABLE,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value[0]).toEqual({
      type: "paragraph",
      content: [
        { text: "u", marks: [{ type: "strike" }, { type: "underline" }] },
      ],
    });
  });

  // 이슈 재현 두 행과 프로브 일곱 행을 importHtml 결과와 대조한다.
  it.each([
    ["이슈 재현: color", `<div style="color:#0000ff">D</div>${TABLE}`],
    [
      "이슈 재현: color + font-weight:bold",
      `<div style="color:#0000ff;font-weight:bold">D</div>${TABLE}`,
    ],
    [
      "표 뒤 배경 + 기울임",
      `${TABLE}<div style="background-color:#ffff00;font-style:italic">E</div>`,
    ],
    [
      "목록 항목 안 div",
      `<ul><li>x<div style="color:#00ff00">N</div></li></ul>${TABLE}`,
    ],
    [
      "래퍼 div 안쪽 div",
      `<div style="color:#0000ff"><div style="color:#ff0000">in</div></div>${TABLE}`,
    ],
    ["br 내용", `<div style="color:#0000ff">a<br>b</div>${TABLE}`],
    [
      "안쪽 span 색 공존",
      `<div style="color:#0000ff"><span style="color:#ff0000">S</span>t</div>${TABLE}`,
    ],
    [
      "형제 div마다 자기 색",
      `<div style="color:#ff0000">a</div><div>b</div><div style="color:#0000ff">c</div>${TABLE}`,
    ],
  ])("importHtml과 같다: %s", (_name, html) => {
    expect(clipboardShapes(html)).toEqual(importedShapes(html));
  });

  it("목록 항목 안 div는 자식 문단이 자기 색을 받는다", () => {
    const shapes = clipboardShapes(
      `<ul><li>x<div style="color:#00ff00">N</div></li></ul>${TABLE}`,
    );
    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.children).toEqual([
      {
        type: "paragraph",
        textColor: "#00FF00",
        content: [{ text: "N" }],
      },
    ]);
  });

  it("안쪽 span 색은 마크로 남고 div 색은 블록 속성이다", () => {
    expect(
      clipboardShapes(
        `<div style="color:#0000ff"><span style="color:#ff0000">S</span>t</div>${TABLE}`,
      ),
    ).toEqual([
      {
        type: "paragraph",
        textColor: "#0000FF",
        content: [
          { text: "S", marks: [{ type: "textColor", color: "#FF0000" }] },
          { text: "t" },
        ],
      },
    ]);
  });

  it("br 내용은 줄바꿈을 보존하고 색을 읽는다", () => {
    expect(
      clipboardShapes(`<div style="color:#0000ff">a<br>b</div>${TABLE}`),
    ).toEqual([
      {
        type: "paragraph",
        textColor: "#0000FF",
        content: [{ text: "a\nb" }],
      },
    ]);
  });

  it("블록 자식이 있는 래퍼 div의 색은 읽지 않고 안쪽 div 색만 남는다", () => {
    expect(
      clipboardShapes(
        `<div style="color:#0000ff;font-weight:700"><div style="color:#ff0000">in</div></div>${TABLE}`,
      ),
    ).toEqual([
      {
        type: "paragraph",
        textColor: "#FF0000",
        content: [{ text: "in" }],
      },
    ]);
  });

  it("블록 자식(p)이 있는 래퍼 div의 색은 읽지 않는다", () => {
    expect(
      clipboardShapes(`<div style="color:#0000ff"><p>b</p></div>${TABLE}`),
    ).toEqual([{ type: "paragraph", content: [{ text: "b" }] }]);
  });

  /** 블록 트리 어디에든 블록 색이 있는지 본다. */
  const hasBlockColor = (shapes: readonly Shape[]): boolean =>
    shapes.some(
      (shape) =>
        shape.textColor !== undefined ||
        shape.backgroundColor !== undefined ||
        hasBlockColor(shape.children ?? []),
    );

  // 목록을 품은 div도 래퍼다. 클립보드 분할기는 목록을 접으며 조상 div를
  // 텍스트 leaf마다 복제하는데, 그 복제가 블록 자식 없는 div로 보여 래퍼의
  // 테마 색이 항목 안 문단에 붙던 결함을 막는다(Issue #344 리뷰).
  it.each([
    [
      "목록을 품은 div",
      `<div style="color:#d4d4d4;background-color:#1e1e1e"><ul><li>a</li><li>b</li></ul></div>`,
    ],
    [
      "중첩 목록을 품은 div",
      `<div style="color:#d4d4d4;background-color:#1e1e1e"><ol><li>a<ul><li>n</li></ul></li></ol></div>`,
    ],
    [
      "span으로 감싼 목록을 품은 div",
      `<div style="color:#d4d4d4"><span><ul><li>a</li></ul></span></div>`,
    ],
    [
      "목록을 품은 div의 안쪽 div",
      `<div style="color:#d4d4d4"><div style="color:#ff0000"><ul><li>a</li></ul></div></div>`,
    ],
    [
      "li 안에서 목록을 품은 div",
      `<ul><li><div style="color:#ff0000"><ul><li>a</li></ul></div></li></ul>`,
    ],
  ])("%s의 색은 읽지 않는다", (_name, html) => {
    expect(hasBlockColor(clipboardShapes(`${html}${TABLE}`))).toBe(false);
  });

  it("목록을 품은 div 안 항목의 글자는 항목 content에 남는다", () => {
    expect(
      clipboardShapes(
        `<div style="color:#d4d4d4"><ul><li>y z</li></ul></div>${TABLE}`,
      ),
    ).toEqual([{ type: "bulletListItem", content: [{ text: "y z" }] }]);
  });

  it("목록을 품은 래퍼 div 안의 블록 자식 없는 div는 자기 색을 읽는다", () => {
    const html = `<div style="color:#d4d4d4"><ul><li><div style="color:#ff0000">x</div></li></ul></div>${TABLE}`;
    const shapes = clipboardShapes(html);
    expect(hasBlockColor(shapes)).toBe(true);
    expect(JSON.stringify(shapes)).not.toContain("#D4D4D4");
  });

  it("style이 없는 div는 색을 만들지 않는다", () => {
    expect(clipboardShapes(`<div>x</div>${TABLE}`)).toEqual([
      { type: "paragraph", content: [{ text: "x" }] },
    ]);
  });

  // 대조군이다. p 자신의 style은 원래 읽는다(Issue #343).
  it("표 앞 p 문단은 자기 style 색·굵게를 읽는다", () => {
    const result = parseClipboardTable({
      html: '<p style="color:#ff0000;font-weight:700">intro</p>' + TABLE,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value[0]).toEqual({
      type: "paragraph",
      textColor: "#FF0000",
      content: [{ text: "intro", marks: [{ type: "bold" }] }],
    });
  });
});
