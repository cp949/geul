/**
 * `importHtml`이 인라인 스타일과 `<del>`·`<strike>` 태그를 마크로 읽는지
 * 고정한다(Issue #320 단계 A).
 *
 * - `span`·`b`·`strong`의 `font-weight`·`font-style`·`text-decoration(-line)`
 *   값을 bold·italic·underline·strike로 읽는다. 마지막 선언이 이기고
 *   `!important`·대소문자·공백은 무시한다.
 * - 꺼 주는 값(`font-weight:normal`, `text-decoration:none`)은 바깥 요소가
 *   만든 마크를 지우지 않는다. 마크는 누적만 한다.
 * - `p`·`div`·`i` 같은 다른 태그의 style은 sanitize가 지워서 읽지 않는다.
 * - 파서 단위 계약(`parseInlineStyleMarks`)과 `UNSAFE_ATTRIBUTE_REMOVED`
 *   경고 계약이 이전과 같은지도 함께 본다.
 */
import type { InlineContent, TextMark } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { parseInlineStyleMarks } from "../src/clipboard/style-declarations.js";
import { importHtml } from "../src/index.js";

const importedValue = (html: string) => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/** `<p>…</p>` 한 문단의 content만 꺼낸다. */
const paragraphContent = (inner: string): InlineContent => {
  const { document } = importedValue(`<p>${inner}</p>`);
  expect(document.blocks).toHaveLength(1);
  const [block] = document.blocks;
  if (block?.type !== "paragraph" || !Array.isArray(block.content)) {
    throw new Error("인라인 content를 가진 문단이 아니다");
  }
  return block.content;
};

const markedText = (marks: TextMark[]): InlineContent => [{ text: "x", marks }];

describe("span의 font-weight 스타일", () => {
  it.each([
    ["font-weight:700", "700"],
    ["font-weight:bold", "bold"],
    ["font-weight:bolder", "bolder"],
    ["font-weight:600", "600"],
    ["font-weight:800", "800"],
    ["font-weight:normal;font-weight:700", "마지막 선언이 700"],
    ["FONT-WEIGHT : BOLD", "대소문자와 콜론 앞 공백"],
    ["font-weight:700 !important", "!important"],
    ["font-family:Arial;font-weight:700;", "다른 선언과 함께"],
  ])("%s(%s)는 bold다", (style) => {
    expect(paragraphContent(`<span style="${style}">x</span>`)).toEqual(
      markedText([{ type: "bold" }]),
    );
  });

  it.each([
    ["font-weight:normal", "normal"],
    ["font-weight:400", "400"],
    ["font-weight:500", "500"],
    ["font-weight:lighter", "lighter"],
    ["font-weight:700;font-weight:normal", "마지막 선언이 normal"],
    ["font-weight:bold !important;font-weight:400", "마지막 선언이 400"],
    ["font-weight:", "값 없음"],
    ["font-weight", "콜론 없음"],
  ])("%s(%s)는 마크가 없다", (style) => {
    expect(paragraphContent(`<span style="${style}">x</span>`)).toEqual([
      { text: "x" },
    ]);
  });
});

describe("span의 font-style 스타일", () => {
  it.each([
    ["font-style:italic", "italic"],
    ["font-style:oblique", "oblique"],
    ["font-style:oblique 10deg", "oblique 각도"],
    ["FONT-STYLE : Italic !important", "대소문자·공백·!important"],
  ])("%s(%s)는 italic이다", (style) => {
    expect(paragraphContent(`<span style="${style}">x</span>`)).toEqual(
      markedText([{ type: "italic" }]),
    );
  });

  it.each([
    ["font-style:normal", "normal"],
    ["font-style:italic;font-style:normal", "마지막 선언이 normal"],
  ])("%s(%s)는 마크가 없다", (style) => {
    expect(paragraphContent(`<span style="${style}">x</span>`)).toEqual([
      { text: "x" },
    ]);
  });
});

describe("span의 text-decoration 스타일", () => {
  it.each<[string, TextMark[]]>([
    ["text-decoration:underline", [{ type: "underline" }]],
    ["text-decoration-line:underline", [{ type: "underline" }]],
    ["text-decoration:line-through", [{ type: "strike" }]],
    ["text-decoration-line:line-through", [{ type: "strike" }]],
    [
      "text-decoration:underline line-through",
      [{ type: "strike" }, { type: "underline" }],
    ],
    [
      "text-decoration-line:line-through   underline",
      [{ type: "strike" }, { type: "underline" }],
    ],
    ["TEXT-DECORATION : Underline !important", [{ type: "underline" }]],
    ["text-decoration:underline red wavy", [{ type: "underline" }]],
  ])("%s는 정규 순서의 마크가 된다", (style, marks) => {
    expect(paragraphContent(`<span style="${style}">x</span>`)).toEqual(
      markedText(marks),
    );
  });

  it.each([
    ["text-decoration:none", "none"],
    ["text-decoration:underline;text-decoration:none", "마지막 선언이 none"],
    ["text-decoration:overline", "읽지 않는 값"],
  ])("%s(%s)는 마크가 없다", (style) => {
    expect(paragraphContent(`<span style="${style}">x</span>`)).toEqual([
      { text: "x" },
    ]);
  });
});

describe("꺼 주는 값은 바깥 마크를 지우지 않는다", () => {
  it("bold 안의 font-weight:normal span은 bold를 유지한다", () => {
    expect(
      paragraphContent('<b><span style="font-weight:normal">x</span></b>'),
    ).toEqual(markedText([{ type: "bold" }]));
  });

  it("링크 안의 text-decoration:none은 바깥 밑줄을 지우지 않는다", () => {
    expect(
      paragraphContent(
        '<u><a href="https://example.com/"><span style="text-decoration:none">x</span></a></u>',
      ),
    ).toEqual(
      markedText([
        { type: "link", href: "https://example.com/" },
        { type: "underline" },
      ]),
    );
  });

  it("em 안의 font-style:normal span은 italic을 유지한다", () => {
    expect(
      paragraphContent('<em><span style="font-style:normal">x</span></em>'),
    ).toEqual(markedText([{ type: "italic" }]));
  });
});

describe("del·strike·s·ins 태그", () => {
  it.each<[string, TextMark[]]>([
    ["<del>x</del>", [{ type: "strike" }]],
    ["<strike>x</strike>", [{ type: "strike" }]],
    ["<s>x</s>", [{ type: "strike" }]],
  ])("%s는 strike다", (inner, marks) => {
    expect(paragraphContent(inner)).toEqual(markedText(marks));
  });

  it("<ins>는 마크가 없다", () => {
    expect(paragraphContent("<ins>x</ins>")).toEqual([{ text: "x" }]);
  });

  it("del 안의 strike 스타일 span은 strike 하나만 남는다", () => {
    expect(
      paragraphContent(
        '<del><span style="text-decoration:line-through">x</span></del>',
      ),
    ).toEqual(markedText([{ type: "strike" }]));
  });

  it("del·strike는 raw 경고를 내지 않는다", () => {
    // 지원하는 인라인 태그라 목록 항목 안에서 블록 강등 경고를 내지 않는다.
    // 루트에 바로 놓인 인라인은 s와 같이 기존 강등 경고 계약을 유지한다.
    expect(importedValue("<ul><li><del>x</del></li></ul>").warnings).toEqual(
      [],
    );
    expect(
      importedValue("<ul><li><strike>x</strike></li></ul>").warnings,
    ).toEqual([]);
    expect(importedValue("<del>x</del>").warnings).toEqual([
      {
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "del",
        message: "Unsupported del block was downgraded to paragraph content",
      },
    ]);
    expect(importedValue("<s>x</s>").warnings).toEqual([
      {
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "s",
        message: "Unsupported s block was downgraded to paragraph content",
      },
    ]);
  });
});

describe("b·strong의 style", () => {
  it.each<[string, TextMark[]]>([
    [
      '<b style="font-style:italic">x</b>',
      [{ type: "bold" }, { type: "italic" }],
    ],
    [
      '<strong style="text-decoration:underline">x</strong>',
      [{ type: "bold" }, { type: "underline" }],
    ],
    [
      '<b style="text-decoration:line-through">x</b>',
      [{ type: "bold" }, { type: "strike" }],
    ],
    [
      '<b style="font-style:italic;text-decoration:underline line-through">x</b>',
      [
        { type: "bold" },
        { type: "italic" },
        { type: "strike" },
        { type: "underline" },
      ],
    ],
  ])("%s는 bold에 style 마크를 더한다", (inner, marks) => {
    expect(paragraphContent(inner)).toEqual(markedText(marks));
  });

  it("font-weight:normal 래퍼도 style의 italic은 읽는다", () => {
    expect(
      paragraphContent('<b style="font-weight:normal;font-style:italic">x</b>'),
    ).toEqual(markedText([{ type: "italic" }]));
  });

  it("b 안의 font-weight:700 span은 bold를 중복시키지 않는다", () => {
    expect(
      paragraphContent('<b><span style="font-weight:700">x</span></b>'),
    ).toEqual(markedText([{ type: "bold" }]));
  });

  it("b 자신의 font-weight:700과 안쪽 span의 bold도 하나다", () => {
    expect(
      paragraphContent(
        '<b style="font-weight:700"><span style="font-weight:bold">x</span></b>',
      ),
    ).toEqual(markedText([{ type: "bold" }]));
  });

  it("b는 normal·400이 아닌 font-weight를 기존처럼 bold로 읽는다", () => {
    // 이번 변경은 b·strong의 bold 판정을 넓히지 않는다.
    expect(paragraphContent('<b style="font-weight:500">x</b>')).toEqual(
      markedText([{ type: "bold" }]),
    );
    expect(paragraphContent('<b style="font-weight:lighter">x</b>')).toEqual(
      markedText([{ type: "bold" }]),
    );
  });
});

describe("색과 스타일 마크", () => {
  it("한 span의 color·background-color·font-weight가 셋 다 마크가 된다", () => {
    expect(
      paragraphContent(
        '<span style="color:#FF0000;background-color:#00FF00;font-weight:700">x</span>',
      ),
    ).toEqual(
      markedText([
        { type: "bold" },
        { type: "textColor", color: "#FF0000" },
        { type: "backgroundColor", color: "#00FF00" },
      ]),
    );
  });

  it("스타일 마크가 없는 색 span의 결과는 이전과 같다", () => {
    expect(
      paragraphContent(
        '<span style="color:#FF0000;background-color:#00FF00">x</span>',
      ),
    ).toEqual(
      markedText([
        { type: "textColor", color: "#FF0000" },
        { type: "backgroundColor", color: "#00FF00" },
      ]),
    );
  });
});

describe("style을 읽지 않는 곳", () => {
  it("p의 style은 마크가 없고 속성 제거 경고를 낸다", () => {
    const value = importedValue('<p style="font-weight:700">x</p>');

    expect(value.document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "x" }] },
    ]);
    expect(value.warnings).toEqual([
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "p",
        attribute: "style",
        message: "Unsupported style attribute was removed from p",
      },
    ]);
  });

  it("div의 style은 마크가 없고 속성 제거 경고를 낸다", () => {
    const value = importedValue('<div style="font-weight:700">x</div>');

    expect(value.document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "x" }] },
    ]);
    expect(value.warnings).toEqual([
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "div",
        attribute: "style",
        message: "Unsupported style attribute was removed from div",
      },
    ]);
  });

  it("div의 white-space style도 속성 제거 경고를 낸다(Issue #321)", () => {
    // 소스 공백 접기가 div의 white-space를 읽으려고 sanitizer schema가 style을
    // 남기지만 raw 경고 계약은 그대로다.
    const value = importedValue('<div style="white-space:pre">x</div>');

    expect(value.warnings).toEqual([
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "div",
        attribute: "style",
        message: "Unsupported style attribute was removed from div",
      },
    ]);
  });

  it("i의 style은 italic만 남기고 속성 제거 경고를 낸다", () => {
    const value = importedValue('<p><i style="font-weight:700">x</i></p>');

    expect(value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: markedText([{ type: "italic" }]),
      },
    ]);
    expect(value.warnings).toEqual([
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "i",
        attribute: "style",
        message: "Unsupported style attribute was removed from i",
      },
    ]);
  });

  it("span의 스타일 마크는 경고를 내지 않는다", () => {
    expect(
      importedValue('<p><span style="font-weight:700">x</span></p>').warnings,
    ).toEqual([]);
  });

  it("b·strong의 style 제거 경고는 이전과 같다", () => {
    expect(
      importedValue('<p><b style="font-style:italic">x</b></p>').warnings,
    ).toEqual([
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "b",
        attribute: "style",
        message: "Unsupported style attribute was removed from b",
      },
    ]);
  });
});

describe("parseInlineStyleMarks", () => {
  it("선언이 없으면 모두 꺼진 상태다", () => {
    expect(parseInlineStyleMarks("")).toEqual({
      fontWeight: undefined,
      italic: false,
      underline: false,
      strike: false,
    });
    expect(parseInlineStyleMarks("color:red;;:;font-family:Arial")).toEqual({
      fontWeight: undefined,
      italic: false,
      underline: false,
      strike: false,
    });
  });

  it("font-weight는 bold·normal·other로 분류한다", () => {
    expect(parseInlineStyleMarks("font-weight:700").fontWeight).toBe("bold");
    expect(parseInlineStyleMarks("font-weight:400").fontWeight).toBe("normal");
    expect(parseInlineStyleMarks("font-weight:500").fontWeight).toBe("other");
    expect(parseInlineStyleMarks("font-weight:foo").fontWeight).toBe("other");
    expect(parseInlineStyleMarks("font-weight:1200").fontWeight).toBe("other");
  });

  it("마지막 text-decoration 계열 선언이 이긴다", () => {
    expect(
      parseInlineStyleMarks(
        "text-decoration:underline;text-decoration-line:line-through",
      ),
    ).toMatchObject({ underline: false, strike: true });
  });
});
