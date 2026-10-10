/**
 * `importHtml`이 `pre` 안 무효 문자를 문서 거절 없이 지우고 경고하는지 검증한다(Issue #352).
 *
 * - 이전에는 `pre` 안 CR(`&#13;`)·C0 제어문자·NUL이 `HTML_DOCUMENT_INVALID`로 문서 전체를 거절했다.
 * - 이제 무효 문자를 지운 `codeBlock`을 만들고 `UNSAFE_CODE_POINT_REMOVED` 경고를 낸다.
 * - 정제 규칙은 model의 `sanitizeCodeBlockSource`다. CR은 줄바꿈으로 바꾸지 않고 지운다.
 * - bare `pre`, `pre > code`, `figure` 안 `pre`, 목록 항목 안 `pre`를 모두 고정한다.
 * - 경고 `element`는 텍스트의 부모 태그다. bare `pre`는 `pre`, `pre > code`는 `code`다.
 * - Tab·LF만 든 `pre`와 무효 문자 없는 `pre`는 결과와 경고가 이전과 같다.
 * - 표 안 `pre`의 기존 경고 동작은 그대로다.
 * - `data-language`의 무효 문자는 이번 범위 밖이라 여전히 문서를 거절한다.
 *
 * Issue #354 — 변환이 `pre`를 `codeBlock`이 아닌 인라인 글자로 평탄화할 때 지우는 Tab도 경고한다.
 * - 문맥(최상위·div·li·중첩 li·blockquote·callout·표 셀 등)과 인라인 래퍼의 행렬을 고정한다.
 * - 평탄화되는 자리는 표 셀과 toggle `summary`다. 본문이 `ab`이고 Tab 경고가 `pre`(또는
 *   `code`) element로 난다.
 * - 목록 항목·인용·callout 안 인라인 래퍼가 품은 `pre`는 children `codeBlock`이다(Issue #336,
 *   Issue #356 RD-005 DELTA-04). 그 전에는 본문으로 평탄화됐다. Tab이 남고 경고가 없다.
 * - CR·C0 경고 개수는 텍스트 노드마다 한 번이다.
 */
import {
  type DocumentBlock,
  isValidCodeBlockSource,
  type InlineContent,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

/** 성공한 import 결과를 돌려준다. 실패하면 테스트를 실패시킨다. */
const imported = (html: string) => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/** content에서 글자만 이어 붙인다. */
const textOf = (content: InlineContent): string =>
  content.map((item) => ("text" in item ? item.text : "")).join("");

/** 블록 트리에서 codeBlock 글자를 문서 순서대로 모은다. */
const codeTexts = (blocks: readonly DocumentBlock[]): string[] =>
  blocks.flatMap((block) => [
    ...(block.type === "codeBlock" && Array.isArray(block.content)
      ? [textOf(block.content)]
      : []),
    ...("children" in block ? codeTexts(block.children ?? []) : []),
  ]);

const REMOVED = "UNSAFE_CODE_POINT_REMOVED";

describe("importHtml pre 안 무효 문자(Issue #352)", () => {
  it.each([
    ["CR 참조", "<pre>a&#13;b</pre>"],
    ["C0 참조", "<pre>a&#1;b</pre>"],
    ["DEL 참조", "<pre>a&#127;b</pre>"],
    ["목록 항목 안 CR 참조", "<ul><li><pre>a&#13;b</pre></li></ul>"],
    ["pre 안 code의 C0 참조", "<pre><code>a&#1;b</code></pre>"],
    [
      "figure 안 pre의 C0 참조",
      "<figure><pre>a&#1;b</pre><figcaption>c</figcaption></figure>",
    ],
    ["NUL 원문", "<pre>a\u0000b</pre>"],
    ["C0 원문", "<pre>a\u0001b</pre>"],
  ])("%s는 거절하지 않고 무효 문자를 지운다", (_name, html) => {
    const value = imported(html);

    expect(codeTexts(value.document.blocks)).toEqual(["ab"]);
    for (const text of codeTexts(value.document.blocks)) {
      expect(isValidCodeBlockSource(text)).toBe(true);
    }
  });

  it("bare pre의 CR은 줄바꿈으로 바꾸지 않고 지우며 경고 element는 pre다", () => {
    const value = imported("<pre>a&#13;b</pre>");

    expect(value.document.blocks).toEqual([
      { id: "html-1", type: "codeBlock", content: [{ text: "ab" }] },
    ]);
    expect(value.warnings).toEqual([
      expect.objectContaining({ kind: REMOVED, element: "pre" }),
    ]);
  });

  it("pre 안 code의 경고 element는 code다", () => {
    const value = imported("<pre><code>a&#1;b</code></pre>");

    expect(value.warnings).toEqual([
      expect.objectContaining({ kind: REMOVED, element: "code" }),
    ]);
  });

  it.each([
    ["목록 항목 안 pre", "<ul><li><pre>a&#13;b</pre></li></ul>"],
    [
      "figure 안 pre",
      "<figure><pre>a&#1;b</pre><figcaption>c</figcaption></figure>",
    ],
    ["NUL 원문", "<pre>a\u0000b</pre>"],
  ])("%s도 UNSAFE_CODE_POINT_REMOVED 경고를 한 번 낸다", (_name, html) => {
    const warnings = imported(html).warnings.filter(
      (warning) => warning.kind === REMOVED,
    );

    expect(warnings).toHaveLength(1);
  });

  it("정제 뒤 빈 글자가 되는 pre는 빈 codeBlock과 경고를 낸다", () => {
    const value = imported("<pre>&#1;&#13;</pre>");

    expect(value.document.blocks).toEqual([
      { id: "html-1", type: "codeBlock", content: [] },
    ]);
    expect(value.warnings).toEqual([
      expect.objectContaining({ kind: REMOVED, element: "pre" }),
    ]);
  });

  it("Tab 사이 무효 문자만 지우고 Tab과 LF를 남긴다", () => {
    const value = imported("<pre>a&#9;&#1;&#9;b\nc</pre>");

    expect(codeTexts(value.document.blocks)).toEqual(["a\t\tb\nc"]);
  });

  it("짝 없는 surrogate 참조는 파서가 U+FFFD로 바꿔 유효 입력이고 경고가 없다", () => {
    const value = imported("<pre>a&#xD800;b</pre>");

    expect(codeTexts(value.document.blocks)).toEqual(["a�b"]);
    expect(value.warnings).toEqual([]);
  });

  it.each([
    ["Tab과 LF만 든 pre", "<pre>a\tb\nc</pre>", "a\tb\nc"],
    ["무효 문자 없는 pre", "<pre>plain</pre>", "plain"],
    ["pre 안 code", "<pre><code>x\ty</code></pre>", "x\ty"],
  ])("%s는 결과가 같고 경고가 없다", (_name, html, expected) => {
    const value = imported(html);

    expect(codeTexts(value.document.blocks)).toEqual([expected]);
    expect(value.warnings).toEqual([]);
  });

  it("표 안 pre의 기존 경고 동작은 그대로다", () => {
    const value = imported(
      "<table><tbody><tr><td><pre>a&#1;b</pre></td></tr></tbody></table>",
    );

    expect(value.warnings).toEqual([
      expect.objectContaining({ kind: REMOVED, element: "pre" }),
    ]);
  });

  it("data-language의 무효 문자는 거절하지 않고 language 없이 가져오며 속성 제거를 경고한다(Issue #353)", () => {
    const value = imported('<pre data-language="bad&#x7f;">source</pre>');

    expect(value.document.blocks).toEqual([
      expect.objectContaining({
        type: "codeBlock",
        content: [{ text: "source" }],
      }),
    ]);
    expect(value.document.blocks[0]).not.toHaveProperty("language");
    expect(value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "pre",
        attribute: "dataLanguage",
      }),
    ]);
  });
});

/** 블록 트리를 [type, 글자, children?] 형태로 줄인다. */
type Outline = [string, string] | [string, string, Outline[]];
const outline = (blocks: readonly DocumentBlock[]): Outline[] =>
  blocks.map((block): Outline => {
    const text =
      "content" in block && Array.isArray(block.content)
        ? textOf(block.content)
        : "";
    const children = "children" in block ? (block.children ?? []) : [];
    return children.length > 0
      ? [block.type, text, outline(children)]
      : [block.type, text];
  });

/** 래퍼 이름 배열로 인라인 래퍼를 안쪽부터 감싼다. */
const wrapWith = (wrappers: readonly string[], inner: string): string =>
  wrappers.reduceRight(
    (acc, tag) =>
      `<${tag}${tag === "a" ? ' href="https://example.com/"' : ""}>${acc}</${tag}>`,
    inner,
  );

const TAB_PRE = "<pre>a\tb</pre>";

/** 래퍼 행렬에 쓰는 인라인 래퍼 조합이다. 이름은 테스트 제목에 쓴다. */
const inlineWrappers: [string, string[]][] = [
  ["span", ["span"]],
  ["b", ["b"]],
  ["a", ["a"]],
  ["em", ["em"]],
  ["code", ["code"]],
  ["span 안 b", ["span", "b"]],
  ["b 안 span", ["b", "span"]],
];

describe("importHtml 평탄화 pre의 Tab 삭제 경고(Issue #354)", () => {
  // 목록 항목·인용·callout 안 인라인 래퍼가 블록(pre)을 품으면 그 래퍼는 children
  // 자리로 간다(Issue #336, Issue #356 RD-005 DELTA-04). pre는 codeBlock이다.
  // 그 전에는 본문 인라인 구간으로 평탄화돼 Tab이 지워지고 경고가 났다.
  const wrapperContexts: [string, (inner: string) => string, Outline[]][] = [
    [
      "li",
      (x) => `<ul><li>${x}</li></ul>`,
      [["bulletListItem", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "ol의 li",
      (x) => `<ol><li>${x}</li></ol>`,
      [["numberedListItem", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "중첩 li",
      (x) => `<ul><li>head<ul><li>${x}</li></ul></li></ul>`,
      [
        [
          "bulletListItem",
          "head",
          [["bulletListItem", "", [["codeBlock", "a\tb"]]]],
        ],
      ],
    ],
    [
      "blockquote",
      (x) => `<blockquote>${x}</blockquote>`,
      [["quote", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "callout",
      (x) => `<div data-geul-callout="true">${x}</div>`,
      [["callout", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "인용 안 목록의 li",
      (x) => `<blockquote><ul><li>${x}</li></ul></blockquote>`,
      [["quote", "", [["bulletListItem", "", [["codeBlock", "a\tb"]]]]]],
    ],
  ];

  describe.each(wrapperContexts)(
    "%s 안의 래퍼 pre",
    (_context, build, expected) => {
      it.each(inlineWrappers)(
        "%s 래퍼는 children codeBlock이고 Tab을 남기며 경고하지 않는다",
        (_name, wrappers) => {
          const value = imported(build(wrapWith(wrappers, TAB_PRE)));

          expect(outline(value.document.blocks)).toEqual(expected);
          expect(value.warnings).toEqual([]);
        },
      );
    },
  );

  it("평탄화 pre 안 code의 경고 element는 code다", () => {
    const value = imported(
      '<details data-geul-toggleable="true"><summary><span><pre><code>a\tb</code></pre></span></summary></details>',
    );

    expect(outline(value.document.blocks)).toEqual([["toggleListItem", "ab"]]);
    expect(value.warnings).toEqual([
      expect.objectContaining({ kind: REMOVED, element: "code" }),
    ]);
  });

  // 래퍼 안쪽의 블록(div·ul·blockquote·figure)과 미지원 태그 래퍼도 같다. pre는
  // codeBlock이 된다(Issue #356 RD-005 DELTA-04 전에는 평탄화됐다).
  it.each([
    [
      "span 안 div 안 pre",
      `<ul><li><span><div>${TAB_PRE}</div></span></li></ul>`,
    ],
    [
      "span 안 ul 안 li 안 pre",
      `<ul><li><span><ul><li>${TAB_PRE}</li></ul></span></li></ul>`,
    ],
    [
      "span 안 blockquote 안 pre",
      `<ul><li><span><blockquote>${TAB_PRE}</blockquote></span></li></ul>`,
    ],
    [
      "span 안 figure 안 pre",
      `<ul><li><span><figure>${TAB_PRE}<figcaption>c</figcaption></figure></span></li></ul>`,
    ],
    [
      "font 안 span 안 pre",
      `<ul><li><font><span>${TAB_PRE}</span></font></li></ul>`,
    ],
    [
      "span 안 font 안 pre",
      `<ul><li><span><font>${TAB_PRE}</font></span></li></ul>`,
    ],
    [
      "미지원 태그 안 span 안 pre",
      `<ul><li><center><span>${TAB_PRE}</span></center></li></ul>`,
    ],
    [
      "span 안 미지원 태그 안 pre",
      `<ul><li><span><center>${TAB_PRE}</center></span></li></ul>`,
    ],
    [
      "앞선 글자가 있는 span 안 pre",
      `<ul><li>head <span>${TAB_PRE}</span></li></ul>`,
    ],
    [
      "앞선 공백만 있는 span 안 pre",
      `<ul><li>  <span>${TAB_PRE}</span></li></ul>`,
    ],
    ["u 안 pre", `<ul><li><u>${TAB_PRE}</u></li></ul>`],
    ["strong 안 pre", `<ul><li><strong>${TAB_PRE}</strong></li></ul>`],
    [
      "center 안 ul 안 li 안 span 안 pre",
      `<center><ul><li><span>${TAB_PRE}</span></li></ul></center>`,
    ],
  ])(
    "확장 문맥 %s도 codeBlock이고 Tab을 남기며 경고하지 않는다",
    (_name, html) => {
      const value = imported(html);

      expect(codeTexts(value.document.blocks)).toEqual(["a\tb"]);
      expect(
        value.warnings.filter((warning) => warning.kind === REMOVED),
      ).toEqual([]);
    },
  );

  it("래퍼 pre 뒤의 pre도 children codeBlock으로 이어진다", () => {
    const value = imported(
      `<ul><li><span>${TAB_PRE}</span><pre>c\td</pre></li></ul>`,
    );

    expect(outline(value.document.blocks)).toEqual([
      [
        "bulletListItem",
        "",
        [
          ["codeBlock", "a\tb"],
          ["codeBlock", "c\td"],
        ],
      ],
    ]);
    expect(value.warnings).toEqual([]);
  });

  it("래퍼 pre 뒤 p와 목록도 같은 children에 순서대로 온다", () => {
    const value = imported(
      `<ul><li><span>${TAB_PRE}</span><p>h</p><ul><li>n</li></ul></li></ul>`,
    );

    expect(outline(value.document.blocks)).toEqual([
      [
        "bulletListItem",
        "",
        [
          ["codeBlock", "a\tb"],
          ["paragraph", "h"],
          ["bulletListItem", "n"],
        ],
      ],
    ]);
    expect(value.warnings).toEqual([]);
  });

  // codeBlock이 되는 문맥은 Tab을 남기고 경고하지 않는다(무변화 가드).
  const codeBlockContexts: [string, string, Outline[]][] = [
    ["최상위 span 안 pre", `<span>${TAB_PRE}</span>`, [["codeBlock", "a\tb"]]],
    [
      "div 안 span 안 pre",
      `<div><span>${TAB_PRE}</span></div>`,
      [["codeBlock", "a\tb"]],
    ],
    [
      "h1 안 span 안 pre",
      `<h1><span>${TAB_PRE}</span></h1>`,
      [["codeBlock", "a\tb"]],
    ],
    [
      "미지원 태그 안 pre",
      `<center>${TAB_PRE}</center>`,
      [["codeBlock", "a\tb"]],
    ],
    [
      "figure 안 pre",
      `<figure>${TAB_PRE}<figcaption>c</figcaption></figure>`,
      [["codeBlock", "a\tb"]],
    ],
    [
      "일반 details 안 span 안 pre",
      `<details><summary>s</summary><span>${TAB_PRE}</span></details>`,
      [
        ["paragraph", "s"],
        ["codeBlock", "a\tb"],
      ],
    ],
    [
      "래퍼 없는 li 안 pre",
      `<ul><li>${TAB_PRE}</li></ul>`,
      [["bulletListItem", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "래퍼 없는 blockquote 안 pre",
      `<blockquote>${TAB_PRE}</blockquote>`,
      [["quote", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "래퍼 없는 callout 안 pre",
      `<div data-geul-callout="true">${TAB_PRE}</div>`,
      [["callout", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "li 안 font 래퍼 pre",
      `<ul><li><font>${TAB_PRE}</font></li></ul>`,
      [["bulletListItem", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "li 안 mark 래퍼 pre",
      `<ul><li><mark>${TAB_PRE}</mark></li></ul>`,
      [["bulletListItem", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "li 안 div 안 span 안 pre",
      `<ul><li><div><span>${TAB_PRE}</span></div></li></ul>`,
      [["bulletListItem", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "li 안 div 안 b 안 span 안 pre",
      `<ul><li><div><b><span>${TAB_PRE}</span></b></div></li></ul>`,
      [["bulletListItem", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "li 안 p 뒤 span 안 pre",
      `<ul><li><p>h</p><span>${TAB_PRE}</span></li></ul>`,
      [["bulletListItem", "h", [["codeBlock", "a\tb"]]]],
    ],
    [
      "li 안 div 뒤 span 안 pre",
      `<ul><li><div>h</div><span>${TAB_PRE}</span></li></ul>`,
      [
        [
          "bulletListItem",
          "",
          [
            ["paragraph", "h"],
            ["codeBlock", "a\tb"],
          ],
        ],
      ],
    ],
    [
      "li 안 pre 뒤 span 안 pre",
      `<ul><li>${TAB_PRE}<span>${TAB_PRE}</span></li></ul>`,
      [
        [
          "bulletListItem",
          "",
          [
            ["codeBlock", "a\tb"],
            ["codeBlock", "a\tb"],
          ],
        ],
      ],
    ],
    [
      "blockquote 안 p 뒤 span 안 pre",
      `<blockquote><p>h</p><span>${TAB_PRE}</span></blockquote>`,
      [["quote", "h", [["codeBlock", "a\tb"]]]],
    ],
    [
      "blockquote 안 div 안 span 안 pre",
      `<blockquote><div><span>${TAB_PRE}</span></div></blockquote>`,
      [["quote", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "callout 안 p 뒤 span 안 pre",
      `<div data-geul-callout="true"><p>h</p><span>${TAB_PRE}</span></div>`,
      [["callout", "h", [["codeBlock", "a\tb"]]]],
    ],
    [
      "callout 안 div 안 span 안 pre",
      `<div data-geul-callout="true"><div><span>${TAB_PRE}</span></div></div>`,
      [["callout", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "h1 안 blockquote의 앞선 글자 뒤 span 안 pre",
      `<h1><blockquote>head <span>${TAB_PRE}</span></blockquote></h1>`,
      [
        [
          "quote",
          "",
          [
            ["heading", "head"],
            ["codeBlock", "a\tb"],
          ],
        ],
      ],
    ],
    [
      "ul 밖 li 안 span 안 pre",
      `<li><span>${TAB_PRE}</span></li>`,
      [["codeBlock", "a\tb"]],
    ],
    // 래퍼 div 안 ul도 목록이다(Issue #356 RD-005 DELTA-04).
    [
      "div 안 ul 안 li 안 span 안 pre",
      `<div><ul><li><span>${TAB_PRE}</span></li></ul></div>`,
      [["bulletListItem", "", [["codeBlock", "a\tb"]]]],
    ],
    [
      "li 안 div 안 ul 안 li 안 span 안 pre",
      `<ul><li><div><ul><li><span>${TAB_PRE}</span></li></ul></div></li></ul>`,
      [
        [
          "bulletListItem",
          "",
          [["bulletListItem", "", [["codeBlock", "a\tb"]]]],
        ],
      ],
    ],
  ];

  it.each(codeBlockContexts)(
    "%s은 codeBlock이고 Tab을 남기며 경고하지 않는다",
    (_name, html, expected) => {
      const value = imported(html);

      expect(outline(value.document.blocks)).toEqual(expected);
      expect(
        value.warnings.filter((warning) => warning.kind === REMOVED),
      ).toEqual([]);
    },
  );

  // CR·C0 경고 개수는 codeBlock이 되든 평탄화되든 텍스트 노드마다 한 번으로 같다.
  it.each([
    [
      "평탄화 summary 안 span 안 pre의 CR",
      '<details data-geul-toggleable="true"><summary><span><pre>a&#13;b</pre></span></summary></details>',
    ],
    [
      "평탄화 pre의 Tab과 C0",
      '<details data-geul-toggleable="true"><summary><span><pre>a\t&#1;b</pre></span></summary></details>',
    ],
    [
      "codeBlock li 안 span 안 pre의 CR",
      "<ul><li><span><pre>a&#13;b</pre></span></li></ul>",
    ],
    [
      "codeBlock li 안 span 안 pre의 C0",
      "<ul><li><span><pre>a&#1;b</pre></span></li></ul>",
    ],
    ["codeBlock span 안 pre의 CR", "<span><pre>a&#13;b</pre></span>"],
    ["codeBlock li 안 pre의 C0", "<ul><li><pre>a&#1;b</pre></li></ul>"],
  ])("%s는 경고를 한 번만 낸다", (_name, html) => {
    const warnings = imported(html).warnings.filter(
      (warning) => warning.kind === REMOVED,
    );

    expect(warnings).toHaveLength(1);
  });

  // 표 셀 안 pre는 평탄화 경로이며 이전에도 Tab 삭제를 경고했다.
  it.each([
    ["래퍼 없는 pre", TAB_PRE],
    ["span 래퍼 pre", `<span>${TAB_PRE}</span>`],
    ["div 래퍼 pre", `<div>${TAB_PRE}</div>`],
  ])("표 셀 안 %s의 Tab 삭제 경고는 그대로다", (_name, inner) => {
    const value = imported(
      `<table><tbody><tr><td>${inner}</td></tr></tbody></table>`,
    );

    expect(value.warnings).toEqual([
      expect.objectContaining({ kind: REMOVED, element: "pre" }),
    ]);
  });

  it("li 안 span이 품은 표 셀의 pre도 경고는 한 번이다", () => {
    const value = imported(
      `<ul><li><span><table><tbody><tr><td>${TAB_PRE}</td></tr></tbody></table></span></li></ul>`,
    );

    expect(
      value.warnings.filter((warning) => warning.kind === REMOVED),
    ).toHaveLength(1);
  });
});

// IMPL-REVIEW-01(Issue #354)이 찾은 어긋남을 고정한다.
describe("importHtml 평탄화 pre 경고의 어긋남 보정(Issue #354 리뷰)", () => {
  // 표 밖 td·th·tr·tbody는 sanitize가 조상(table) 부족으로 벗긴다.
  // 벗겨진 자리의 목록 항목 안 래퍼 pre도 children codeBlock이다(Issue #356
  // RD-005 DELTA-04 전에는 본문으로 평탄화됐다).
  it.each([
    ["td", `<td><ul><li><span>${TAB_PRE}</span></li></ul></td>`],
    ["th", `<th><ol><li><em>${TAB_PRE}</em></li></ol></th>`],
    [
      "tbody 안 tr 안 td",
      `<tbody><tr><td><ul><li><span>${TAB_PRE}</span></li></ul></td></tr></tbody>`,
    ],
  ])("표 밖 %s 안 래퍼 pre는 codeBlock이고 경고하지 않는다", (_name, html) => {
    const value = imported(html);

    expect(codeTexts(value.document.blocks)).toEqual(["a\tb"]);
    expect(
      value.warnings.filter((warning) => warning.kind === REMOVED),
    ).toEqual([]);
  });

  // 바깥 pre가 자식 전체를 소스로 읽는다. 안쪽 구조는 변환에 쓰이지 않는다.
  it.each([
    [
      "blockquote 안 span 안 pre",
      `<pre><blockquote><span>${TAB_PRE}</span></blockquote></pre>`,
    ],
    [
      "callout 안 span 안 pre",
      `<pre><div data-geul-callout="true"><span>${TAB_PRE}</span></div></pre>`,
    ],
  ])("pre 안 %s의 Tab은 codeBlock에 남고 경고하지 않는다", (_name, html) => {
    const value = imported(html);

    expect(codeTexts(value.document.blocks)).toEqual(["a\tb"]);
    expect(
      value.warnings.filter((warning) => warning.kind === REMOVED),
    ).toEqual([]);
  });

  // 제목 안 인용의 래퍼 pre는 quote children codeBlock이다(Issue #356 RD-005
  // DELTA-04 전에는 평탄화돼 경고가 났다).
  it("제목 안 인용 안 span 안 pre는 codeBlock이고 경고하지 않는다", () => {
    const value = imported(
      `<h1><blockquote><span>${TAB_PRE}</span></blockquote></h1>`,
    );

    expect(outline(value.document.blocks)).toEqual([
      ["quote", "", [["codeBlock", "a\tb"]]],
    ]);
    expect(value.warnings).toEqual([]);
  });

  // 변환기가 글자를 지우는 자리에서 경고하므로 수집기가 따라가지 못하던 자리도 경고한다.
  // RD-001 전에는 수집기 한계(QA-149)로 이 자리에 경고가 없었다.
  it.each([
    [
      "토글 summary 안 span 안 pre",
      `<details data-geul-toggleable="true"><summary><span>${TAB_PRE}</span></summary></details>`,
    ],
  ])("%s의 Tab 삭제를 경고한다", (_name, html) => {
    const value = imported(html);

    expect(codeTexts(value.document.blocks)).toEqual([]);
    expect(
      value.warnings.filter((warning) => warning.kind === REMOVED),
    ).toEqual([
      {
        kind: REMOVED,
        element: "pre",
        message:
          "Unsafe code point (C0 control, DEL, or unpaired surrogate) was removed from text",
      },
    ]);
  });
});
