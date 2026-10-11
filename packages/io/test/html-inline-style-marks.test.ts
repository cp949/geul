/**
 * `importHtml`이 인라인 스타일과 `<del>`·`<strike>` 태그를 마크로 읽는지
 * 고정한다(Issue #320 단계 A).
 *
 * - `span`·`b`·`strong`의 `font-weight`·`font-style`·`text-decoration(-line)`
 *   값을 bold·italic·underline·strike로 읽는다. 마지막 선언이 이기고
 *   `!important`·대소문자·공백은 무시한다.
 * - 굵기·기울임을 끄는 값(`font-weight:normal`, `font-style:normal`)은 바깥
 *   요소의 굵게·기울임을 끈다. 두 속성은 상속 속성이라 안쪽 값이 이긴다.
 *   `inherit`·`unset`은 끄지 않고 부모를 따른다.
 * - 밑줄·취소선은 전파라 `text-decoration:none`이 바깥 요소의 마크를 지우지
 *   못한다.
 * - `p`·`div` 같은 블록 태그의 style은 sanitize가 지워서 읽지 않는다. `i` 등
 *   인라인 태그의 style은 Issue #334부터 읽는다(`html-inline-element-style`).
 * - 파서 단위 계약(`parseInlineStyleMarks`)과 `UNSAFE_ATTRIBUTE_REMOVED`
 *   경고 계약이 이전과 같은지도 함께 본다.
 * - Issue #339: 선언을 색 경로와 같은 흐름(선언 분리, 속성 읽기, `!important`,
 *   칸)으로 읽는다. 이슈 여섯 입력, 우선순위 칸, 값 판정 경계, 선언 분리를
 *   고정한다. 경계 표의 판정은 Chromium 153.0.8010.12 실측이다.
 * - Issue #363: `text-decoration`·`text-decoration-line`이 함수 토큰(색 함수,
 *   thickness 함수)과 색 식별자를 이름으로 읽는다. `var()` 같은 치환 함수는
 *   칸을 차지하지 않고, 무효를 만났을 때 값에 있으면 장식을 끈다.
 * - Issue #366: 함수 토큰이 괄호 짝을 본다. 바깥 `)`와 `)` 뒤 잉여 글자는
 *   무효이고, 닫히지 않은 함수 토큰은 값 끝에서 닫은 것으로 읽는다.
 * - Issue #367: 사용자 정의 함수 호출(`--f(…)`)이 값 어디에 있든 장식을 끈다.
 *   바깥 `)`가 있으면 호출이 있어도 무효다.
 */
import type { InlineContent, TextMark } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { InlineStyleMarks } from "../src/clipboard/style-declarations.js";
import { importHtml } from "../src/index.js";
import { parseInlineStyleMarks } from "./style-declarations-support.js";

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
    [
      "font-weight:bold !important;font-weight:400",
      "!important 선언이 뒤의 일반 선언을 이긴다",
    ],
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

describe("끄는 값은 굵기·기울임만 바깥 값을 끈다", () => {
  it("bold 안의 font-weight:normal span은 bold를 끈다", () => {
    expect(
      paragraphContent('<b><span style="font-weight:normal">x</span></b>'),
    ).toEqual([{ text: "x" }]);
  });

  it.each(["400", "300", "lighter", "initial"])(
    "bold 안의 font-weight:%s span은 bold를 끈다",
    (value) => {
      expect(
        paragraphContent(`<b><span style="font-weight:${value}">x</span></b>`),
      ).toEqual([{ text: "x" }]);
    },
  );

  it.each(["inherit", "unset"])(
    "bold 안의 font-weight:%s span은 부모를 따라 bold를 유지한다",
    (value) => {
      expect(
        paragraphContent(`<b><span style="font-weight:${value}">x</span></b>`),
      ).toEqual(markedText([{ type: "bold" }]));
    },
  );

  it("b의 font-weight:inherit는 UA 굵기를 덮고 부모를 따른다", () => {
    expect(paragraphContent('<b style="font-weight:inherit">x</b>')).toEqual([
      { text: "x" },
    ]);
    expect(
      paragraphContent('<strong><b style="font-weight:inherit">x</b></strong>'),
    ).toEqual(markedText([{ type: "bold" }]));
  });

  it("끈 뒤 안쪽 b·strong은 다시 굵게다", () => {
    expect(
      paragraphContent(
        '<b><span style="font-weight:normal"><strong>x</strong></span></b>',
      ),
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

  it("em 안의 font-style:normal span은 italic을 끈다", () => {
    expect(
      paragraphContent('<em><span style="font-style:normal">x</span></em>'),
    ).toEqual([{ text: "x" }]);
  });

  it("em의 font-style:normal은 UA 기울임을 끈다", () => {
    expect(paragraphContent('<em style="font-style:normal">x</em>')).toEqual([
      { text: "x" },
    ]);
    expect(
      paragraphContent('<em><em style="font-style:normal">x</em></em>'),
    ).toEqual([{ text: "x" }]);
  });

  it("em의 font-style:inherit는 UA 기울임을 덮고 부모를 따른다", () => {
    expect(paragraphContent('<em style="font-style:inherit">x</em>')).toEqual([
      { text: "x" },
    ]);
    expect(
      paragraphContent(
        '<span style="font-style:italic"><em style="font-style:inherit">x</em></span>',
      ),
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

  it("b는 유효한 비굵기 font-weight를 굵게로 읽지 않고 무효 값은 굵게로 읽는다", () => {
    // Issue #334로 판정이 바뀌었다. 유효하지만 굵지 않은 값(500·lighter)은
    // 굵게가 아니고, 무효한 값은 선언이 무시돼 UA 굵기(bold)가 남는다.
    expect(paragraphContent('<b style="font-weight:500">x</b>')).toEqual([
      { text: "x" },
    ]);
    expect(paragraphContent('<b style="font-weight:lighter">x</b>')).toEqual([
      { text: "x" },
    ]);
    expect(paragraphContent('<b style="font-weight:foo">x</b>')).toEqual(
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

describe("style 속성 제거 경고 계약", () => {
  it("p의 style은 서식을 마크로 읽고 속성 제거 경고를 낸다", () => {
    const value = importedValue('<p style="font-weight:700">x</p>');

    // Issue #334 단계 B부터 블록 style의 굵기를 안쪽 텍스트 마크로 읽는다.
    // 이전에는 마크가 없었다. 경고는 이전과 같다.
    expect(value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "x", marks: [{ type: "bold" }] }],
      },
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

  it("문단 div의 style은 서식을 마크로 읽고 속성 제거 경고를 낸다", () => {
    const value = importedValue('<div style="font-weight:700">x</div>');

    // Issue #334 단계 B부터 블록 자식이 없는 div는 style 굵기를 안쪽 텍스트
    // 마크로 읽는다. 이전에는 마크가 없었다. 경고는 이전과 같다.
    expect(value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "x", marks: [{ type: "bold" }] }],
      },
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

  it("i의 style은 읽은 마크를 더하고 속성 제거 경고를 낸다", () => {
    // Issue #334 이전에는 i의 style을 읽지 않아 italic만 남았다. 지금은
    // font-weight:700도 bold로 읽는다. 경고는 이전과 같다.
    const value = importedValue('<p><i style="font-weight:700">x</i></p>');

    expect(value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: markedText([{ type: "bold" }, { type: "italic" }]),
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
      fontStyle: undefined,
      underline: false,
      strike: false,
    });
    expect(parseInlineStyleMarks("color:red;;:;font-family:Arial")).toEqual({
      fontWeight: undefined,
      fontStyle: undefined,
      underline: false,
      strike: false,
    });
  });

  it("font-weight는 bold·normal·light로 분류하고 무효 값은 정하지 않는다", () => {
    expect(parseInlineStyleMarks("font-weight:700").fontWeight).toBe("bold");
    expect(parseInlineStyleMarks("font-weight:400").fontWeight).toBe("normal");
    expect(parseInlineStyleMarks("font-weight:500").fontWeight).toBe("light");
    expect(parseInlineStyleMarks("font-weight:foo").fontWeight).toBeUndefined();
    expect(
      parseInlineStyleMarks("font-weight:1200").fontWeight,
    ).toBeUndefined();
  });

  it("font-weight revert·revert-layer는 other다", () => {
    expect(parseInlineStyleMarks("font-weight:revert").fontWeight).toBe(
      "other",
    );
    expect(parseInlineStyleMarks("font-weight:revert-layer").fontWeight).toBe(
      "other",
    );
  });

  it("font-weight inherit·unset은 부모를 따르는 값으로 분류한다", () => {
    expect(parseInlineStyleMarks("font-weight:inherit").fontWeight).toBe(
      "inherit",
    );
    expect(parseInlineStyleMarks("font-weight:unset").fontWeight).toBe(
      "inherit",
    );
    expect(parseInlineStyleMarks("font-weight:initial").fontWeight).toBe(
      "light",
    );
  });

  it.each([
    ["italic", "italic"],
    ["oblique", "italic"],
    ["oblique 10deg", "italic"],
    ["normal", "normal"],
    ["initial", "normal"],
    ["inherit", "inherit"],
    ["unset", "inherit"],
    ["ITALIC !important", "italic"],
  ] as const)("font-style:%s는 %s다", (value, expected) => {
    expect(parseInlineStyleMarks(`font-style:${value}`).fontStyle).toBe(
      expected,
    );
  });

  it("font-style revert·revert-layer는 앞의 선언을 지우고 정하지 않는다", () => {
    expect(
      parseInlineStyleMarks("font-style:italic;font-style:revert").fontStyle,
    ).toBeUndefined();
    expect(
      parseInlineStyleMarks("font-style:italic;font-style:revert-layer")
        .fontStyle,
    ).toBeUndefined();
  });

  it("무효한 font-style 선언은 앞의 값을 지우지 않는다", () => {
    expect(
      parseInlineStyleMarks("font-style:italic;font-style:foo").fontStyle,
    ).toBe("italic");
    expect(
      parseInlineStyleMarks("font-style:normal;font-style:").fontStyle,
    ).toBe("normal");
  });

  it("마지막 text-decoration 계열 선언이 이긴다", () => {
    expect(
      parseInlineStyleMarks(
        "text-decoration:underline;text-decoration-line:line-through",
      ),
    ).toMatchObject({ underline: false, strike: true });
  });
});

const NO_MARKS: InlineStyleMarks = {
  fontWeight: undefined,
  fontStyle: undefined,
  underline: false,
  strike: false,
};

const marksWith = (marks: Partial<InlineStyleMarks>): InlineStyleMarks => ({
  ...NO_MARKS,
  ...marks,
});

/** 단일 속성 하나의 속성 이름·값을 실은 style을 `<span>`으로 읽은 content다. */
const spanContent = (style: string): InlineContent =>
  paragraphContent(`<span style="${style.replaceAll('"', "&quot;")}">x</span>`);

// 이슈 #339의 여섯 입력이다. 각 줄은 importHtml 결과와 parseInlineStyleMarks
// 값 양쪽을 본다. 판정은 Chromium 153 실측이다: 무효 선언은 앞의 유효 값을
// 지우지 않고, `!important` 선언은 일반 선언이 덮지 못하고, 따옴표 안 `;`는
// 선언을 끝내지 않는다.
describe("이슈 #339 선언 읽기", () => {
  it.each<[string, string, InlineStyleMarks, TextMark[]]>([
    [
      "font-style:italic;font-style:foo",
      "무효 font-style은 앞의 italic을 지우지 않는다",
      marksWith({ fontStyle: "italic" }),
      [{ type: "italic" }],
    ],
    [
      "text-decoration:underline;text-decoration:foo",
      "무효 text-decoration은 앞의 밑줄을 지우지 않는다",
      marksWith({ underline: true }),
      [{ type: "underline" }],
    ],
    [
      "font-weight:normal !important;font-weight:bold",
      "!important normal을 일반 bold가 덮지 못한다",
      marksWith({ fontWeight: "normal" }),
      [],
    ],
    [
      "text-decoration:underline !important;text-decoration:none",
      "!important 밑줄을 일반 none이 덮지 못한다",
      marksWith({ underline: true }),
      [{ type: "underline" }],
    ],
    [
      "font-weight:bold ! important",
      "!와 important 사이 공백을 허용한다",
      marksWith({ fontWeight: "bold" }),
      [{ type: "bold" }],
    ],
    [
      "font-family:'a;font-style:italic '",
      "따옴표 안 ;는 선언을 끝내지 않는다",
      NO_MARKS,
      [],
    ],
  ])("%s: %s", (style, _name, parsed, marks) => {
    expect(parseInlineStyleMarks(style)).toEqual(parsed);
    expect(spanContent(style)).toEqual(
      marks.length === 0 ? [{ text: "x" }] : markedText(marks),
    );
  });
});

// 굵기·기울임·장식은 각각 칸 하나다. `!important` 선언이 칸을 차지하면 일반
// 선언은 못 덮고 같은 중요도끼리는 뒤가 이긴다. 무효 선언은 `!important`가
// 붙어도 칸을 건드리지 않는다. 줄임 `font`는 굵기·기울임 두 칸에 쓰고
// `text-decoration`과 `text-decoration-line`은 장식 칸 하나를 공유한다.
describe("인라인 서식 우선순위 칸", () => {
  it.each<[string, Partial<InlineStyleMarks>]>([
    ["font-weight:bold !important;font-weight:400", { fontWeight: "bold" }],
    [
      "font-weight:bold !important;font-weight:400 !important",
      { fontWeight: "normal" },
    ],
    ["font-weight:bold;font-weight:foo !important", { fontWeight: "bold" }],
    ["font-weight:foo !important;font-weight:bold", { fontWeight: "bold" }],
    ["font-weight:bold !important;font-weight:revert", { fontWeight: "bold" }],
    ["font-weight:bold;font-weight:revert", { fontWeight: "other" }],
    [
      "font:bold 12px a !important;font-weight:normal",
      { fontWeight: "bold", fontStyle: "normal" },
    ],
    [
      "font-weight:bold !important;font:12px a",
      { fontWeight: "bold", fontStyle: "normal" },
    ],
    ["font-weight:bold;font:foo !important", { fontWeight: "bold" }],
    [
      "font-style:italic !important;font:12px a",
      { fontWeight: "normal", fontStyle: "italic" },
    ],
    [
      "font:italic 12px a !important;font-style:normal",
      { fontWeight: "normal", fontStyle: "italic" },
    ],
    ["font-style:italic;font:foo !important", { fontStyle: "italic" }],
    ["font-style:italic !important;font-style:revert", { fontStyle: "italic" }],
    ["font-style:italic;font-style:revert", {}],
    ["font-style:italic !important;font-style:normal", { fontStyle: "italic" }],
    [
      "font-style:italic !important;font-style:normal !important",
      { fontStyle: "normal" },
    ],
    [
      "text-decoration:underline !important;text-decoration-line:none",
      { underline: true },
    ],
    [
      "text-decoration-line:underline !important;text-decoration:line-through",
      { underline: true },
    ],
    [
      "text-decoration:underline;text-decoration-line:line-through",
      { strike: true },
    ],
    [
      "text-decoration-line:line-through;text-decoration:underline",
      { underline: true },
    ],
    [
      "text-decoration:underline !important;text-decoration:foo",
      { underline: true },
    ],
    [
      "text-decoration:underline;text-decoration:none !important;text-decoration:line-through",
      {},
    ],
    [
      "text-decoration:underline !important;text-decoration:line-through !important",
      { strike: true },
    ],
    ["text-decoration:underline;text-decoration:red", {}],
    ["text-decoration:underline;text-decoration:blink", {}],
    ["text-decoration:underline;text-decoration:revert", {}],
  ])("%s", (style, expected) => {
    expect(parseInlineStyleMarks(style)).toEqual(marksWith(expected));
  });
});

type Decoration = Pick<InlineStyleMarks, "underline" | "strike">;
const NO_LINE: Decoration = { underline: false, strike: false };
const UNDERLINE: Decoration = { underline: true, strike: false };
const STRIKE: Decoration = { underline: false, strike: true };
const UNDERLINE_STRIKE: Decoration = { underline: true, strike: true };

const decorationOf = (style: string): Decoration => {
  const { underline, strike } = parseInlineStyleMarks(style);
  return { underline, strike };
};

// 유효 선언이 앞의 어떤 값도 덮고, 무효 선언은 앞의 값을 그대로 남기는지
// 서로 다른 앞 값 둘에 덧대어 본다. 앞 값의 결과가 달라야 판정이 갈린다.
const DECORATION_PRIORS = [
  [": underline line-through", UNDERLINE_STRIKE],
  [": blink", NO_LINE],
] as const;

const decorationAfterPriors = (property: string, value: string): Decoration[] =>
  DECORATION_PRIORS.map(([prior]) =>
    decorationOf(`${property}${prior};${property}:${value}`),
  );

// Chromium 153.0.8010.12 실측이다. line 낱말(underline·overline·line-through·
// blink)은 붙어 있어야 하고 한 번씩만 쓴다. none·spelling-error·grammar-error는
// 다른 line 낱말과 못 섞인다. style 낱말·thickness·색은 각각 한 번이다.
describe("text-decoration 값 판정", () => {
  it("공백만 있는 값은 무효라 앞의 밑줄을 지우지 않는다", () => {
    expect(
      parseInlineStyleMarks("text-decoration:underline;text-decoration: ;"),
    ).toMatchObject({ underline: true, strike: false });
    expect(
      parseInlineStyleMarks(
        "text-decoration:underline;text-decoration-line:  ;",
      ),
    ).toMatchObject({ underline: true, strike: false });
  });

  it.each<[string, Decoration]>([
    ["underline", UNDERLINE],
    ["line-through", STRIKE],
    ["underline line-through", UNDERLINE_STRIKE],
    ["line-through underline", UNDERLINE_STRIKE],
    ["underline  line-through", UNDERLINE_STRIKE],
    ["overline underline", UNDERLINE],
    ["underline overline line-through", UNDERLINE_STRIKE],
    ["underline blink overline line-through", UNDERLINE_STRIKE],
    ["underline blink", UNDERLINE],
    ["UNDERLINE", UNDERLINE],
    ["Underline WAVY", UNDERLINE],
    ["blink", NO_LINE],
    ["overline", NO_LINE],
    ["none", NO_LINE],
    ["spelling-error", NO_LINE],
    ["grammar-error", NO_LINE],
    ["spelling-error red", NO_LINE],
    ["red spelling-error", NO_LINE],
    ["grammar-error wavy", NO_LINE],
    ["underline red wavy", UNDERLINE],
    ["underline wavy red", UNDERLINE],
    ["red underline", UNDERLINE],
    ["dotted underline", UNDERLINE],
    ["2px underline", UNDERLINE],
    ["from-font underline", UNDERLINE],
    ["underline red 2px dotted", UNDERLINE],
    ["underline from-font wavy red", UNDERLINE],
    ["underline overline red", UNDERLINE],
    ["red underline overline", UNDERLINE],
    ["underline 2px", UNDERLINE],
    ["underline -2px", UNDERLINE],
    ["underline +2px", UNDERLINE],
    ["underline .5px", UNDERLINE],
    ["underline 1e1px", UNDERLINE],
    ["underline 10PX", UNDERLINE],
    ["underline 1em", UNDERLINE],
    ["underline 1rem", UNDERLINE],
    ["underline 0", UNDERLINE],
    ["underline -0", UNDERLINE],
    ["underline 0px", UNDERLINE],
    ["underline 10%", UNDERLINE],
    ["underline -5%", UNDERLINE],
    ["underline auto", UNDERLINE],
    ["underline from-font", UNDERLINE],
    ["underline currentcolor", UNDERLINE],
    ["underline currentColor", UNDERLINE],
    ["underline rgb(0, 0, 0)", UNDERLINE],
    ["underline rgb(0,0,0)", UNDERLINE],
    ["underline rgb(0 0 0 / 50%)", UNDERLINE],
    ["underline #f00", UNDERLINE],
    ["underline transparent", UNDERLINE],
    ["red", NO_LINE],
    ["wavy", NO_LINE],
    ["solid", NO_LINE],
    ["none red", NO_LINE],
    ["none 2px", NO_LINE],
    ["none wavy", NO_LINE],
    ["none solid red", NO_LINE],
    ["inherit", NO_LINE],
    ["initial", NO_LINE],
    ["unset", NO_LINE],
    ["revert", NO_LINE],
    ["revert-layer", NO_LINE],
  ])("text-decoration:%s는 유효하다", (value, expected) => {
    for (const result of decorationAfterPriors("text-decoration", value)) {
      expect(result).toEqual(expected);
    }
  });

  it.each([
    "underline wavy line-through",
    "underline red overline",
    "underline red blink",
    "blink red underline",
    "underline underline",
    "underline line-through underline",
    "none underline",
    "underline none",
    "line-through none",
    "none none",
    "underline spelling-error",
    "underline foo",
    "foo",
    "underline solid double",
    "underline dotted dashed",
    "wavy wavy",
    "underline auto auto",
    "from-font from-font",
    "underline 2px 3px",
    "underline 1",
    "underline 1foo",
    "underline 5.px",
    "underline red red",
    "underline currentcolor currentcolor",
    "underline transparent red",
    "underline rgb(0,0,0) rgb(0,0,0)",
    "underline #ggg",
    "underline #12",
    "underline inherit",
    "underline initial",
    "underline revert",
    "inherit underline",
    "underline / red",
    "underline 'x'",
    "underline url(a)",
    "",
  ])("text-decoration:%s는 무효라 앞의 값을 지킨다", (value) => {
    const [afterUnderlineStrike, afterBlink] = decorationAfterPriors(
      "text-decoration",
      value,
    );
    expect(afterUnderlineStrike).toEqual(UNDERLINE_STRIKE);
    expect(afterBlink).toEqual(NO_LINE);
  });

  it.each<[string, Decoration]>([
    ["underline", UNDERLINE],
    ["line-through", STRIKE],
    ["underline line-through", UNDERLINE_STRIKE],
    ["line-through underline overline", UNDERLINE_STRIKE],
    ["underline  line-through", UNDERLINE_STRIKE],
    ["underline overline blink", UNDERLINE],
    ["blink underline", UNDERLINE],
    ["UNDERLINE", UNDERLINE],
    ["underline overline", UNDERLINE],
    ["blink", NO_LINE],
    ["none", NO_LINE],
    ["spelling-error", NO_LINE],
    ["grammar-error", NO_LINE],
    ["inherit", NO_LINE],
    ["initial", NO_LINE],
    ["unset", NO_LINE],
    ["revert", NO_LINE],
    ["revert-layer", NO_LINE],
  ])("text-decoration-line:%s는 유효하다", (value, expected) => {
    for (const result of decorationAfterPriors("text-decoration-line", value)) {
      expect(result).toEqual(expected);
    }
  });

  it.each([
    "underline underline",
    "none underline",
    "underline spelling-error",
    "underline foo",
    "underline red",
    "underline wavy",
    "underline 2px",
    "underline inherit",
    "red",
    "",
  ])("text-decoration-line:%s는 무효라 앞의 값을 지킨다", (value) => {
    const [afterUnderlineStrike, afterBlink] = decorationAfterPriors(
      "text-decoration-line",
      value,
    );
    expect(afterUnderlineStrike).toEqual(UNDERLINE_STRIKE);
    expect(afterBlink).toEqual(NO_LINE);
  });
});

// Issue #363: `text-decoration`·`text-decoration-line`이 읽지 못하던 함수·
// 식별자 토큰이다. 판정은 Chromium 153.0.8010.12 실측이다.
// - 색 함수 14개, thickness 함수 10개, 색 식별자 45개는 이름만 보고 칸에 넣는다.
//   함수 안쪽은 검증하지 않는다.
// - `var()`·`env()`·`attr()`·`if()`는 값 어디에 있든 인자가 정상이면 Chromium이
//   선언을 파싱 단계에서 버리지 않고 앞 선언을 덮는다. 치환 결과를 알 수 없으므로 그 토큰은
//   칸을 차지하지 않고 건너뛴다. 무효를 만났을 때 값에 치환 함수가 있으면 꺼짐이다.
const COLOR_IDENTIFIERS = [
  // CSS Color 4 시스템 색
  "accentcolor",
  "accentcolortext",
  "activetext",
  "buttonborder",
  "buttonface",
  "buttontext",
  "canvas",
  "canvastext",
  "field",
  "fieldtext",
  "graytext",
  "highlight",
  "highlighttext",
  "linktext",
  "mark",
  "marktext",
  "selecteditem",
  "selecteditemtext",
  "visitedtext",
  // 폐기된 시스템 색
  "activeborder",
  "activecaption",
  "appworkspace",
  "background",
  "buttonhighlight",
  "buttonshadow",
  "captiontext",
  "inactiveborder",
  "inactivecaption",
  "inactivecaptiontext",
  "infobackground",
  "infotext",
  "menu",
  "menutext",
  "scrollbar",
  "threeddarkshadow",
  "threedface",
  "threedhighlight",
  "threedlightshadow",
  "threedshadow",
  "window",
  "windowframe",
  "windowtext",
  // WebKit 색
  "-webkit-link",
  "-webkit-activelink",
  "-webkit-focus-ring-color",
];

describe("text-decoration이 읽는 함수·식별자 토큰 (Issue #363)", () => {
  const expectBothPriors = (
    property: string,
    value: string,
    expected: Decoration,
  ) => {
    for (const result of decorationAfterPriors(property, value)) {
      expect(result).toEqual(expected);
    }
  };

  const expectInvalid = (property: string, value: string) => {
    const [afterUnderlineStrike, afterBlink] = decorationAfterPriors(
      property,
      value,
    );
    expect(afterUnderlineStrike).toEqual(UNDERLINE_STRIKE);
    expect(afterBlink).toEqual(NO_LINE);
  };

  // 이슈 다섯 입력이다. 모두 #339 이후 무효로 버려져 밑줄·취소선이 꺼졌다.
  it.each<[string, Decoration, "underline" | "strike"]>([
    ["underline windowtext", UNDERLINE, "underline"],
    ["underline lab(50 20 20)", UNDERLINE, "underline"],
    ["underline color-mix(in srgb, red, blue)", UNDERLINE, "underline"],
    ["underline calc(1px + 2px)", UNDERLINE, "underline"],
    ["line-through oklch(0.5 0.2 30)", STRIKE, "strike"],
  ])(
    "이슈 입력 text-decoration:%s는 유효하고 importHtml이 마크로 읽는다",
    (value, expected, markType) => {
      expectBothPriors("text-decoration", value, expected);
      expect(spanContent(`text-decoration:${value}`)).toEqual(
        markedText([{ type: markType }]),
      );
    },
  );

  it.each([
    "underline rgb(1 2 3)",
    "underline rgba(1, 2, 3, 0.5)",
    "underline hsl(10 20% 30%)",
    "underline hsla(10, 20%, 30%, 1)",
    "underline hwb(10 20% 30%)",
    "underline lab(50 20 20)",
    "underline lch(50 20 20)",
    "underline oklab(0.5 0.1 0.1)",
    "underline oklch(0.5 0.2 30)",
    "underline color(srgb 1 0 0)",
    "underline color-mix(in srgb, red, blue)",
    "underline light-dark(red, blue)",
    "underline contrast-color(red)",
    "underline alpha(from red / 0.5)",
    "underline rgb(calc(1) 2 3)",
    "underline rgb(from red r g b)",
    "underline LAB(50 20 20)",
    "underline Color-Mix(in srgb, red, blue)",
  ])("색 함수 text-decoration:%s는 밑줄이다", (value) => {
    expectBothPriors("text-decoration", value, UNDERLINE);
  });

  it.each([
    "underline calc(1px + 2px)",
    "underline min(1px, 2px)",
    "underline max(1px, 2px)",
    "underline clamp(1px, 2px, 3px)",
    "underline round(2.5px, 1px)",
    "underline mod(7px, 3px)",
    "underline rem(7px, 3px)",
    "underline abs(-2px)",
    "underline hypot(3px, 4px)",
    "underline -webkit-calc(1px + 2px)",
    "underline CALC(1px)",
    // 서로 다른 칸이라 함께 쓴다.
    "underline calc(1px) lab(50 20 20) wavy",
    "underline wavy lab(50 20 20) calc(1px)",
  ])("thickness 함수 text-decoration:%s는 밑줄이다", (value) => {
    expectBothPriors("text-decoration", value, UNDERLINE);
  });

  it("색 식별자 목록은 45개다", () => {
    expect(COLOR_IDENTIFIERS).toHaveLength(45);
    expect(new Set(COLOR_IDENTIFIERS).size).toBe(45);
  });

  it.each(COLOR_IDENTIFIERS)("색 식별자 underline %s는 밑줄이다", (name) => {
    expectBothPriors("text-decoration", `underline ${name}`, UNDERLINE);
  });

  it("색 식별자는 대소문자를 가리지 않는다", () => {
    expectBothPriors("text-decoration", "underline WindowText", UNDERLINE);
    expectBothPriors("text-decoration", "underline -WebKit-Link", UNDERLINE);
  });

  // 같은 칸을 두 번 쓰거나 모르는 이름이면 Chromium도 무효다.
  // `-webkit-focus-ring-color`는 Chromium 153이 색으로 받아 유효 목록에 있다.
  it.each([
    "underline lab(1 2 3) red",
    "underline lab(1 2 3) oklch(0.5 0.2 30)",
    "underline windowtext red",
    "underline windowtext windowtext",
    "underline calc(1px) 2px",
    "underline calc(1px) min(1px, 2px)",
    "underline sin(1rad)",
    "underline sign(1px)",
    "underline device-cmyk(0 0 0 1)",
    "underline linear-gradient(red, blue)",
    "underline calc-size(auto, size)",
    "underline -webkit-text",
    "underline foo(1px)",
    "underline windowtext(1px)",
    "underline calc",
    "underline lab",
    "underline (1px)",
  ])("text-decoration:%s는 무효라 앞의 값을 지킨다", (value) => {
    expectInvalid("text-decoration", value);
  });

  it.each([
    "underline lab(1 2 3)",
    "underline calc(1px)",
    "underline windowtext",
  ])("text-decoration-line:%s는 무효라 앞의 값을 지킨다", (value) => {
    expectInvalid("text-decoration-line", value);
  });

  // line 낱말이 없으면 line이 none이라 유효하고 장식을 끈다.
  it.each([
    "lab(1 2 3)",
    "calc(1px + 2px)",
    "windowtext wavy",
    "windowtext",
    "color-mix(in srgb, red, blue) 2px",
  ])("text-decoration:%s는 line 낱말이 없어 앞의 밑줄도 끈다", (value) => {
    expectBothPriors("text-decoration", value, NO_LINE);
  });

  // 치환 함수가 든 값이다. Chromium은 값 어디에 있든 선언을 파싱 단계에서
  // 버리지 않고 항상 앞 선언을 덮는다. 장식 여부는 치환 결과로 정해진다.
  // 우리는 `<style>`과 조상의 `--x` 정의를 추적하지 않아 결과를 알 수 없다.
  it.each<[string, Decoration]>([
    // 치환 토큰은 칸을 차지하지 않고 건너뛴다.
    ["underline var(--x)", UNDERLINE],
    ["underline var(--x, red)", UNDERLINE],
    ["underline VAR(--x)", UNDERLINE],
    ["var(--x) underline", UNDERLINE],
    ["underline env(foo, red)", UNDERLINE],
    ["underline attr(data-c type(<color>), red)", UNDERLINE],
    ["underline if(media(print): red; else: blue)", UNDERLINE],
    ["underline rgb(var(--r) 0 0)", UNDERLINE],
    ["underline var(--a) var(--b)", UNDERLINE],
    ["underline var(--x) red", UNDERLINE],
    ["var(--x) underline line-through", UNDERLINE_STRIKE],
    ["line-through var(--x)", STRIKE],
    ["none var(--x)", NO_LINE],
    // 치환 토큰이 line 낱말 연속을 끊는다.
    ["underline var(--x) line-through", NO_LINE],
    ["underline var(--x) underline", NO_LINE],
    // 분류가 무효인데 값에 치환 함수가 있으면 꺼짐이다.
    ["underline foo var(--x)", NO_LINE],
    ["underline red red var(--x)", NO_LINE],
    ["underline 1px 2px var(--x)", NO_LINE],
    ["underline wavy wavy var(--x)", NO_LINE],
    ["underline none var(--x)", NO_LINE],
    ["underline var(--x)foo", NO_LINE],
    ["inherit var(--x)", NO_LINE],
    ["var(--x) inherit", NO_LINE],
    ["underline var(--x) foo", NO_LINE],
    ["underline foo(var(--x))", NO_LINE],
    ["underline foo((var(--x)))", NO_LINE],
    ["underline foo(env(x))", NO_LINE],
    ["underline foo(attr(x))", NO_LINE],
    ["underline foo(if(x))", NO_LINE],
    ["underline foo(1 var(--x))", NO_LINE],
  ])("치환 함수 text-decoration:%s", (value, expected) => {
    expectBothPriors("text-decoration", value, expected);
  });

  // 치환 함수 이름과 비슷하지만 호출이 아니면 치환 함수로 보지 않는다.
  // 이름 글자(`a`–`z`, `0`–`9`, `-`, `_`) run이 이름과 정확히 같고 바로 뒤가 `(`여야 한다.
  it.each([
    "underline foo(avar(--x))",
    "underline foo(-var(--x))",
    "underline foo(x_var(1))",
    "underline foo(3var(1))",
    "underline foo(var (--x))",
    "underline foo(var-x(1))",
    "underline foo(vars(1))",
    "underline foo(var)",
    "underline foo(ifx(1))",
  ])("치환 함수가 아닌 text-decoration:%s는 무효다", (value) => {
    expectInvalid("text-decoration", value);
  });

  // 건너뛴 치환 토큰만 있고 line 낱말도 단독 낱말도 없으면 선언을 버린다.
  it.each(["var(--d)", "red var(--x)", "wavy var(--x)", "lab(1 2 3) var(--x)"])(
    "text-decoration:%s는 line 값을 알 수 없어 앞의 값을 지킨다",
    (value) => {
      expectInvalid("text-decoration", value);
    },
  );

  it.each<[string, Decoration]>([
    ["underline var(--x)", UNDERLINE],
    ["line-through var(--x)", STRIKE],
    ["var(--x) underline", UNDERLINE],
    ["none var(--x)", NO_LINE],
    ["underline var(--x) line-through", NO_LINE],
    ["underline red var(--x)", NO_LINE],
    ["underline foo(var(--x))", NO_LINE],
  ])("치환 함수 text-decoration-line:%s", (value, expected) => {
    expectBothPriors("text-decoration-line", value, expected);
  });

  it("text-decoration-line:var(--x)는 line 값을 알 수 없어 앞의 값을 지킨다", () => {
    expectInvalid("text-decoration-line", "var(--x)");
  });

  it("importHtml이 underline var(--x)를 밑줄 마크로 읽는다", () => {
    expect(spanContent("text-decoration:underline var(--x)")).toEqual(
      markedText([{ type: "underline" }]),
    );
    expect(spanContent("text-decoration-line:underline var(--x)")).toEqual(
      markedText([{ type: "underline" }]),
    );
  });

  // 의도한 차이다. Chromium은 함수 안쪽 인자와 결과 타입까지 검증해 아래 값을
  // 모두 무효로 버린다. 우리는 함수 이름만 보므로 밑줄이다. 안쪽을 읽으려면
  // 수식·색 문법 전체가 필요해 범위 밖이다(Issue #363 그릴링 Q4).
  it.each([
    "underline lab(foo)",
    "underline calc(1)",
    "underline calc(red)",
    "underline calc()",
    "underline rgb(1,2)",
    "underline color-mix(in srgb, red)",
  ])(
    "text-decoration:%s는 Chromium은 무효지만 함수 안쪽을 검증하지 않아 밑줄이다",
    (value) => {
      expectBothPriors("text-decoration", value, UNDERLINE);
    },
  );
});

// Issue #366: 함수 토큰의 괄호 짝이다. 판정은 Chromium 153.0.8010.12 실측이다
// (조상 `--x: red` 아래, `underline line-through; text-decoration: <값>`).
// - 깊이 0의 바깥 `)`가 값 어디에 있든 무효다. 치환 함수가 있어도 꺼짐이
//   아니라 무효라 앞 값을 지킨다.
// - 토큰의 첫 `(`가 닫힌 뒤 글자가 더 남으면 함수 토큰이 아니다.
// - 닫히지 않은 함수 토큰은 값 끝에서 닫은 것으로 읽는다. 열린 괄호는 값
//   끝까지 한 토큰이라 이 토큰이 값의 마지막이다.
// - 치환 토큰은 닫혔을 때만 치환 토큰이다. 열린 치환과 잉여 글자가 붙은 치환은
//   분류에 못 들어가 무효이고, 값에 치환 함수가 있으므로 꺼짐이다.
describe("text-decoration 함수 토큰의 괄호 짝 (Issue #366)", () => {
  const expectBothPriors = (
    property: string,
    value: string,
    expected: Decoration,
  ) => {
    for (const result of decorationAfterPriors(property, value)) {
      expect(result).toEqual(expected);
    }
  };

  const expectInvalid = (property: string, value: string) => {
    const [afterUnderlineStrike, afterBlink] = decorationAfterPriors(
      property,
      value,
    );
    expect(afterUnderlineStrike).toEqual(UNDERLINE_STRIKE);
    expect(afterBlink).toEqual(NO_LINE);
  };

  // 이슈 일곱 입력이다. 앞 다섯은 #363 뒤 밑줄이 켜졌고 Chromium은 무효다.
  it.each([
    "underline calc(1px))",
    "underline lab(50 20 20))",
    "underline calc(1px)foo(2px)",
    "underline calc(1px)calc(2px)",
    "underline rgb(0,0,0))",
  ])("이슈 입력 text-decoration:%s는 무효라 앞의 값을 지킨다", (value) => {
    expectInvalid("text-decoration", value);
  });

  it.each(["underline lab(50 20 20", "underline calc(1px"])(
    "이슈 입력 text-decoration:%s는 닫히지 않아도 밑줄이다",
    (value) => {
      expectBothPriors("text-decoration", value, UNDERLINE);
    },
  );

  it("importHtml이 무효 선언 뒤에도 앞의 밑줄·취소선 마크를 유지한다", () => {
    expect(
      paragraphContent(
        '<span style="text-decoration:underline line-through;text-decoration:underline calc(1px))">x</span>',
      ),
    ).toEqual(markedText([{ type: "strike" }, { type: "underline" }]));
  });

  it("importHtml이 닫히지 않은 lab(을 밑줄 마크로 읽는다", () => {
    expect(spanContent("text-decoration:underline lab(50 20 20")).toEqual(
      markedText([{ type: "underline" }]),
    );
  });

  // 열린 함수 토큰은 값 끝에서 닫은 것으로 읽는다.
  it.each([
    "underline calc((1px)",
    "underline calc((1px))",
    "underline color-mix(in srgb, red, blue",
    "underline min(1px, 2px",
    "underline calc(1px) lab(50 20 20",
    "wavy underline lab(1 2 3",
    // 안쪽 끝 공백은 토큰을 끊지 않는다.
    "underline lab(50 20 20 )",
  ])("열린 함수 text-decoration:%s는 밑줄이다", (value) => {
    expectBothPriors("text-decoration", value, UNDERLINE);
  });

  // 치환 함수가 없는 무효다.
  it.each([
    // 열려도 모르는 이름은 무효다.
    "underline foo(1px",
    "underline calc(1px)(2px)",
    "underline lab(50 20 20) )",
    "underline ) lab(1 2 3)",
    "underline )",
    "underline lab(1 2 3))  red",
  ])("text-decoration:%s는 무효라 앞의 값을 지킨다", (value) => {
    expectInvalid("text-decoration", value);
  });

  // 치환 함수가 있어도 깊이 0의 바깥 `)`는 꺼짐이 아니라 무효다. Chromium은
  // `--x`가 정의돼 있어도 앞 선언을 덮지 않는다.
  it.each([
    "underline var(--x))",
    "underline var(--x) )",
    "underline foo(var(--x)))",
    "underline red var(--x))",
    "underline env(x))",
    "underline VAR(--x))",
    "underline calc(1px)) red var(--x)",
  ])("바깥 )가 있는 text-decoration:%s는 무효라 앞의 값을 지킨다", (value) => {
    expectInvalid("text-decoration", value);
  });

  // 치환 함수 호출이 있지만 닫힌 치환 토큰이 아니면 분류에 못 들어간다. 그래서
  // 무효이고 값에 치환 함수가 있으므로 꺼짐이다.
  it.each([
    "underline var(--x)foo(1)",
    "underline var(--x)(",
    "underline foo var(--x",
    "underline attr(x",
  ])(
    "text-decoration:%s는 치환 토큰이 아니라 분류에 못 들어가 꺼짐이다",
    (value) => {
      expectBothPriors("text-decoration", value, NO_LINE);
    },
  );

  it.each([
    "underline calc(1px))",
    "underline lab(1 2 3",
    "underline var(--x))",
  ])("text-decoration-line:%s는 무효라 앞의 값을 지킨다", (value) => {
    expectInvalid("text-decoration-line", value);
  });

  it("text-decoration-line:underline var(--x)foo(1)은 꺼짐이다", () => {
    expectBothPriors(
      "text-decoration-line",
      "underline var(--x)foo(1)",
      NO_LINE,
    );
  });

  // 닫힌 형태는 #363 그대로다.
  it.each<[string, Decoration]>([
    ["underline calc(1px)", UNDERLINE],
    ["underline lab(50 20 20)", UNDERLINE],
    ["underline var(--x)", UNDERLINE],
    ["underline foo(var(--x))", NO_LINE],
    ["underline foo((var(--x)))", NO_LINE],
  ])("닫힌 text-decoration:%s는 그대로다", (value, expected) => {
    expectBothPriors("text-decoration", value, expected);
  });

  // 의도한 차이다. Chromium은 함수 안쪽 인자를 검증해 아래 값을 무효로 버린다.
  // 우리는 함수 이름만 보고 열린 괄호를 값 끝에서 닫은 것으로 읽으므로 밑줄이다.
  // 인자 개수와 열린 괄호 안 낱말까지 읽으려면 색·수식 문법 전체가 필요해 범위
  // 밖이다. `underline rgb(0, 0`은 #366 전에는 `)`로 끝나지 않아 무효였다.
  it.each(["underline rgb(0, 0", "underline calc(1px) lab(50 20 20 wavy"])(
    "text-decoration:%s는 Chromium은 무효지만 함수 안쪽을 검증하지 않아 밑줄이다",
    (value) => {
      expectBothPriors("text-decoration", value, UNDERLINE);
    },
  );

  // `)` 바로 뒤에 공백 없이 붙은 토큰은 새 component value다. Chromium과 같이
  // 유효 토큰이면 받는다(Issue #368).
  // 치환 함수 뒤에 붙은 토큰도 새 component value다. 닫힌 치환 함수는 칸을
  // 차지하지 않고 건너뛴다. 공백이 있는 `var(--x) var(--y)`와 같다. Chromium은
  // `--x`·`--y`가 정의돼 있으면 밑줄이고 없으면 꺼짐이다(Issue #368).
  it.each(["underline var(--x)var(--y)", "underline var(--x)red"])(
    "text-decoration:%s는 닫힌 치환 함수를 건너뛰고 밑줄이다",
    (value) => {
      expectBothPriors("text-decoration", value, UNDERLINE);
    },
  );

  it.each([
    "underline calc(1px)red",
    "underline calc(1px)solid",
    "underline rgb(0,0,0)2px",
    "calc(1px)underline",
  ])(
    "text-decoration:%s는 ) 뒤에 붙은 유효 토큰을 새 토큰으로 읽어 밑줄이다",
    (value) => {
      expectBothPriors("text-decoration", value, UNDERLINE);
    },
  );

  // 의도한 차이다. 열린 치환 함수는 치환 결과를 추적하지 않아 닫힌 형태와 같은
  // 규칙으로 읽는다. 닫힌 `underline var(--x)`는 밑줄이고 열린 `var(--x`는
  // 치환 토큰이 아니라 꺼짐이다. Chromium은 `--x`가 정의돼 있으면 밑줄이고 없으면
  // 꺼짐이다.
  it("text-decoration:underline var(--x는 Chromium은 --x 정의에 따라 갈리지만 치환 토큰이 아니라 꺼짐이다", () => {
    expectBothPriors("text-decoration", "underline var(--x", NO_LINE);
  });

  // 의도한 차이다. 열린 `calc(`은 함수 토큰이라 안쪽 치환 함수를 이름으로 본다.
  // 닫힌 `underline calc(var(--x))`가 이미 밑줄인 것과 같다. Chromium은
  // 치환 결과를 알아야 해서 꺼짐으로 읽는다.
  it.each(["underline calc(var(--x)", "underline calc(var(--x))"])(
    "text-decoration:%s는 Chromium은 꺼짐이지만 함수 안 치환 함수를 이름으로만 봐 밑줄이다",
    (value) => {
      expectBothPriors("text-decoration", value, UNDERLINE);
    },
  );
});

// Issue #367: 사용자 정의 함수 호출(`--f(…)`)이다. 판정은 Chromium
// 153.0.8010.12 실측이다(`underline line-through; text-decoration: <값>`).
// - 호출은 값 어디에 있든(다른 함수 인자, `[`·`{` 안, 닫히지 않은 경우 포함)
//   장식을 끈다. 호출 앞뒤 토큰이 유효한지도 보지 않는다.
// - 호출은 이름 글자 run이 `--`로 시작하고 길이가 3 이상이며 바로 뒤가 `(`인
//   경우다. `--(`는 호출이 아니다. run 바로 앞 글자가 `!`·`#`·`@`·`{`·`}`·`]`·
//   따옴표·비ASCII 글자이면 호출이 아니다(Chromium 실측: 그 값은 무효다).
// - 깊이 0의 바깥 `)`가 있으면 호출이 있어도 무효다.
// - 호출이 꺼짐인 이유: `@function --f` 정의는 스타일시트에만 둘 수 있고
//   `importHtml`은 `<style>`을 읽지 않는다. 클립보드 입력에서 호출은 늘 미정의라
//   Chromium 결과가 늘 꺼짐이다.
describe("text-decoration이 사용자 정의 함수 호출을 꺼짐으로 읽는다 (Issue #367)", () => {
  const expectBothPriors = (
    property: string,
    value: string,
    expected: Decoration,
  ) => {
    for (const result of decorationAfterPriors(property, value)) {
      expect(result).toEqual(expected);
    }
  };

  const expectInvalid = (property: string, value: string) => {
    const [afterUnderlineStrike, afterBlink] = decorationAfterPriors(
      property,
      value,
    );
    expect(afterUnderlineStrike).toEqual(UNDERLINE_STRIKE);
    expect(afterBlink).toEqual(NO_LINE);
  };

  // 이슈 네 입력이다. #363 뒤 모두 무효라 앞 값을 지켰다. Chromium은 꺼짐이다.
  it.each([
    "underline --f(1px)",
    "underline --f()",
    "underline red --f(1px)",
    "--f(1px)",
  ])("이슈 입력 text-decoration:%s는 꺼짐이다", (value) => {
    expectBothPriors("text-decoration", value, NO_LINE);
  });

  it("importHtml이 사용자 정의 함수 호출 선언 뒤에는 밑줄·취소선 마크를 모두 잃는다", () => {
    expect(
      paragraphContent(
        '<span style="text-decoration:underline line-through;text-decoration:underline --f(1px)">x</span>',
      ),
    ).toEqual([{ text: "x" }]);
  });

  // 호출이 값 어디에 있어도 꺼짐이다.
  it.each([
    // 다른 토큰과 함께
    "foo --f(1px)",
    "underline underline --f(1px)",
    "inherit --f(1px)",
    "none --f(1px)",
    "--f(1px) underline",
    "underline calc(1px) --f(2px)",
    "underline var(--x) --f(1px)",
    "underline --f(1px) var(--x)",
    "underline calc(var(--x)) --f()",
    // 중첩과 붙음
    "underline calc(--f(1px))",
    "underline foo(--f(1px))",
    "underline --f(var(--x))",
    "underline --f(--g(1px))",
    "underline x[--f(1px)]",
    "underline --f(1px)red",
    "underline --f(1px)--g(2px)",
    "underline calc(1px)--f(2px)",
    // 닫히지 않은 호출
    "underline --f(",
    "underline foo(--f(",
    "underline --f(1px",
    // 중요도
    "underline --f(1px) !important",
  ])("text-decoration:%s는 호출이 어디에 있어도 꺼짐이다", (value) => {
    expectBothPriors("text-decoration", value, NO_LINE);
  });

  // 이름 글자 run이 `--`로 시작하고 길이 3 이상이면 호출이다. 값은 소문자로
  // 읽어서 `--F(`도 호출이다.
  it.each([
    "underline ---f(1px)",
    "underline ---(1px)",
    "underline ----(1px)",
    "underline --1(1px)",
    "underline --F(1px)",
    "underline --f-g(1px)",
    "underline --f_g(1px)",
  ])("이름 문법 text-decoration:%s는 호출이라 꺼짐이다", (value) => {
    expectBothPriors("text-decoration", value, NO_LINE);
  });

  // 호출이 아니다. 모르는 함수 토큰이거나 낱말이라 무효다.
  it.each([
    "underline --(1px)",
    "--(1px)",
    "underline --f (1px)",
    "underline foo--f(1px)",
    "underline 1--f(1px)",
    "underline -f(1px)",
    "underline -ab(1px)",
    "underline -webkit-x(1px)",
  ])("호출이 아닌 text-decoration:%s는 무효라 앞의 값을 지킨다", (value) => {
    expectInvalid("text-decoration", value);
  });

  // 이름 글자 run은 ASCII 이름 글자만 이어 붙인다. run 바로 앞 글자가 아래와
  // 같으면 Chromium은 `--f(`를 호출로 읽지 않고 값을 통째로 무효로 버린다.
  // 비ASCII 글자는 Chromium이 이름 글자로 읽어 `é--f`가 한 이름이 된다.
  it.each([
    "underline #--f(1px)",
    "underline @--f(1px)",
    "underline !--f(1px)",
    "underline <!--f(1px)",
    "underline é--f(1px)",
    "underline ·--f(1px)",
    "underline 😀--f(1px)",
    "underline x{--f(1px)}",
    "underline }--f(1px)",
    "underline ]--f(1px)",
    'underline "--f(1px)"',
    "underline '--f(1px)'",
  ])(
    "앞 글자 때문에 호출이 아닌 text-decoration:%s는 무효라 앞의 값을 지킨다",
    (value) => {
      expectInvalid("text-decoration", value);
    },
  );

  // 호출이 있어도 깊이 0의 바깥 `)`는 꺼짐이 아니라 무효다.
  it.each(["underline --f(1px))", "underline --f(1px) )"])(
    "바깥 )가 있는 text-decoration:%s는 호출이 있어도 무효라 앞의 값을 지킨다",
    (value) => {
      expectInvalid("text-decoration", value);
    },
  );

  // `text-decoration-line`도 같은 규칙이다.
  it.each(["underline --f(1px)", "--f(1px)", "underline foo --f(1px)"])(
    "text-decoration-line:%s는 꺼짐이다",
    (value) => {
      expectBothPriors("text-decoration-line", value, NO_LINE);
    },
  );

  it("text-decoration-line:underline --f(1px))는 무효라 앞의 값을 지킨다", () => {
    expectInvalid("text-decoration-line", "underline --f(1px))");
  });

  // 이름은 이스케이프를 푼 함수 이름이다. 비ASCII 글자와 `\` 이스케이프도 이름
  // 글자라 Chromium처럼 호출이고 꺼짐이다(Issue #368 재현 10행).
  it.each(["underline --é(1px)", "underline --\\66(1px)"])(
    "text-decoration:%s는 비ASCII·이스케이프 이름도 호출이라 꺼짐이다",
    (value) => {
      expectBothPriors("text-decoration", value, NO_LINE);
    },
  );

  // 따옴표 안 낱말은 문자열 토큰이다. 문자열은 호출도 치환도 아니라 Chromium처럼
  // 무효다(Issue #368 재현 11행). 최상위 `{}` 블록은 안쪽에 호출·치환 함수가 있어도
  // 값을 무효로 만든다.
  it.each([
    'underline "a --f(1px)"',
    "underline 'a --f(1px)'",
    'underline "var(--x)"',
    'underline foo "var(--x)"',
    "underline {a --f(1px)}",
    "underline {a var(--x)}",
    "underline {a} var(--x)",
    "underline var(--x) {a}",
    "underline x {var(--x)}",
  ])(
    "text-decoration:%s는 문자열이거나 최상위 {} 블록이라 무효라 앞의 값을 지킨다",
    (value) => {
      expectInvalid("text-decoration", value);
    },
  );

  // 소괄호·함수·대괄호 안에서는 `{}` 블록도 안쪽 호출·치환 함수를 찾는다.
  it.each([
    "underline ({a --f(1)})",
    "underline foo({a --f(1)})",
    "underline ({a var(--x)})",
    "underline [a --f(1px)]",
    "underline x[--f(1px)]",
    "underline [var(--x)]",
    "underline --f({a})",
  ])("text-decoration:%s는 안쪽에 호출·치환 함수가 있어 꺼짐이다", (value) => {
    expectBothPriors("text-decoration", value, NO_LINE);
  });

  // 의도한 차이다. Chromium은 아래 값을 무효로 버린다. 우리는 `env(`·`attr(` 인자의
  // 호출을 구분하지 않고 꺼짐으로 읽는다(값 문법). 이전에는 치환 토큰으로 읽어
  // 밑줄만 남았다.
  it.each(["underline env(--f(1))", "underline attr(--f(1))"])(
    "text-decoration:%s는 Chromium은 무효지만 치환 함수 인자를 구분하지 않아 꺼짐이다",
    (value) => {
      expectBothPriors("text-decoration", value, NO_LINE);
    },
  );

  // 주석은 토큰을 끊는다. `underline/**/overline`은 두 낱말이다.
  it("text-decoration:underline/**/overline은 두 line 낱말이다", () => {
    expect(decorationOf("text-decoration:underline/**/overline")).toEqual(
      UNDERLINE,
    );
  });

  it("text-decoration:under/**/line은 낱말 둘이라 무효다", () => {
    expectInvalid("text-decoration", "under/**/line");
  });

  // 따옴표 없는 url 안의 `(`·공백은 bad url이다. 선언 단계가 그 선언을
  // 버리므로 Chromium처럼 무효다(Issue #368).
  it.each(["underline url(--f(1px))", "underline url( --f(1px) )"])(
    "text-decoration:%s는 bad url 선언이라 Chromium처럼 무효다",
    (value) => {
      expectInvalid("text-decoration", value);
    },
  );

  // 따옴표 안 `)`는 문자열 안이라 호출을 닫지 않는다. Chromium처럼 꺼짐이다.
  it('text-decoration:underline --f("a)")는 따옴표 안 )를 문자열로 읽어 꺼짐이다', () => {
    expectBothPriors("text-decoration", 'underline --f("a)")', NO_LINE);
  });

  // 의도한 차이다. Chromium은 `var(--x(1))`을 파싱 단계에서 버려 무효다. 우리는
  // 값에 호출이 있어 꺼짐이다. #367 전에는 `var(…)` 치환 토큰으로 읽어 밑줄이었다.
  // 입력이 드물어 Chromium과 맞추지 않는다.
  it("text-decoration:underline var(--x(1))은 Chromium은 무효지만 호출이 있어 꺼짐이다", () => {
    expectBothPriors("text-decoration", "underline var(--x(1))", NO_LINE);
  });

  // 의도한 차이다. Chromium은 `--x`가 정의돼 있으면 폴백을 쓰지 않아 밑줄이고
  // 없으면 폴백의 호출이 꺼짐이다. 우리는 `--x` 정의를 읽지 않으므로 꺼짐이다
  // (`QA-162` 한계와 같은 뿌리).
  it("text-decoration:underline var(--x, --f(1px))는 Chromium은 --x 정의에 따라 갈리지만 정의를 읽지 않아 꺼짐이다", () => {
    expectBothPriors(
      "text-decoration",
      "underline var(--x, --f(1px))",
      NO_LINE,
    );
  });
});

// Chromium 153.0.8010.12 실측이다. 값 전체가 문법이다: 한 낱말(`normal`·
// `italic`·`oblique`·전역 키워드) 또는 `oblique <angle>`이다. 각도는
// deg·grad·rad·turn 단위가 있어야 한다. 단위 없는 숫자는 `0`도 무효다.
// Chromium은 `oblique 91deg`를 무효로 보지만 여기서는 각도 범위를 검사하지
// 않는다(Issue #339 결정). 그 행은 두지 않는다.
describe("font-style 값 판정", () => {
  const fontStyleAfterPriors = (value: string) =>
    ["font-style:italic", "font-style:normal"].map(
      (prior) =>
        parseInlineStyleMarks(`${prior};font-style:${value}`).fontStyle,
    );

  it.each<[string, InlineStyleMarks["fontStyle"]]>([
    ["italic", "italic"],
    ["ITALIC", "italic"],
    ["italic  ", "italic"],
    ["oblique", "italic"],
    ["oblique 10deg", "italic"],
    ["oblique  10deg", "italic"],
    ["oblique 10DEG", "italic"],
    ["Oblique 10DEG", "italic"],
    ["oblique 0deg", "italic"],
    ["oblique 90deg", "italic"],
    ["oblique -90deg", "italic"],
    ["oblique +10deg", "italic"],
    ["oblique 10.5deg", "italic"],
    ["oblique .5deg", "italic"],
    ["oblique 1e1deg", "italic"],
    ["oblique 1rad", "italic"],
    ["oblique 1turn", "italic"],
    ["oblique -1grad", "italic"],
    // 주석은 토큰을 끊고, 이스케이프는 푼 낱말로 읽는다(Issue #368).
    ["oblique/**/10deg", "italic"],
    ["italic/**/", "italic"],
    ["it\\61 lic", "italic"],
    ["normal", "normal"],
    ["initial", "normal"],
    ["inherit", "inherit"],
    ["unset", "inherit"],
    ["revert", undefined],
    ["revert-layer", undefined],
  ])("font-style:%s는 유효하다", (value, expected) => {
    for (const result of fontStyleAfterPriors(value)) {
      expect(result).toBe(expected);
    }
  });

  it.each([
    "oblique 10",
    "oblique 0",
    "oblique 10px",
    "oblique 10%",
    "oblique 10 deg",
    "oblique deg",
    "oblique 5.deg",
    "oblique 10deg 20deg",
    "oblique 10deg foo",
    "ob/**/lique",
    'italic"a"',
    "oblique italic",
    "oblique inherit",
    "italic foo",
    "italic italic",
    "italic oblique",
    "italic normal",
    "normal italic",
    "italic 10deg",
    "normal 10deg",
    "inherit italic",
    "foo",
    "left",
    "",
  ])("font-style:%s는 무효라 앞의 값을 지킨다", (value) => {
    expect(fontStyleAfterPriors(value)).toEqual(["italic", "normal"]);
  });
});

// 선언 분리는 색 경로와 같다: 따옴표·괄호 안 `;`는 선언을 끝내지 않고,
// `/* */` 주석은 공백 하나이며, 닫히지 않은 따옴표·괄호·주석은 끝까지 간다.
describe("인라인 서식 선언 분리", () => {
  it.each<[string, Partial<InlineStyleMarks>]>([
    ["font-family:'a;font-style:italic '", {}],
    ['font-family:"a;font-style:italic"', {}],
    [
      'font-style:italic;font-family:"a;font-style:normal',
      { fontStyle: "italic" },
    ],
    [
      "font-style:italic;font-family:'a;font-style:normal",
      { fontStyle: "italic" },
    ],
    [
      "font-style:italic;font-family:(a;font-style:normal)",
      { fontStyle: "italic" },
    ],
    [
      "font-style:italic;font-family:(a;font-style:normal",
      { fontStyle: "italic" },
    ],
    [
      "font-style:italic;font-family:url(a;b);font-style:normal",
      { fontStyle: "normal" },
    ],
    ["font-style:/* ; */italic", { fontStyle: "italic" }],
    ["font-style:italic /* ; font-style:normal */", { fontStyle: "italic" }],
    ["font-style:italic /* font-style:normal", { fontStyle: "italic" }],
    ["font-style:italic;x:'\\';font-style:normal'", { fontStyle: "italic" }],
    ["font-style:italic;;font-style:normal", { fontStyle: "normal" }],
    [
      "text-decoration:underline;font-family:'a;text-decoration:none",
      { underline: true },
    ],
    [
      "font-weight:bold;font-family:url(a;font-weight:normal",
      { fontWeight: "bold" },
    ],
  ])("%s", (style, expected) => {
    expect(parseInlineStyleMarks(style)).toEqual(marksWith(expected));
  });

  it("따옴표가 든 style 값도 importHtml이 같게 읽는다", () => {
    expect(spanContent('font-family:"a;font-style:italic"')).toEqual([
      { text: "x" },
    ]);
    expect(
      spanContent('font-family:"a;font-style:normal";font-style:italic'),
    ).toEqual(markedText([{ type: "italic" }]));
  });
});

// Issue #368 재현 3·4·9·10·11행의 importHtml 결과다. 기대값은 Chromium 153.0.8010.12
// 실측(2026-10-11)이다.
describe("span style의 선언 단계 Chromium 동등성 (Issue #368)", () => {
  it("재현 3행: 이름에 이스케이프가 든 url 함수의 bad url 선언만 버리고 뒤 color를 읽는다", () => {
    expect(
      paragraphContent(
        `<span style="color:red;background:\\75rl(it's.png);color:blue">a</span>`,
      ),
    ).toEqual([
      { text: "a", marks: [{ type: "textColor", color: "#0000FF" }] },
    ]);
  });

  it("재현 4행: 속성 이름 앞 쓰레기 글자가 있는 선언은 버린다", () => {
    expect(paragraphContent(`<span style="x color:red">a</span>`)).toEqual([
      { text: "a" },
    ]);
  });

  it("재현 9행: 이름이 `_white-space`인 선언은 공백 모드를 정하지 않는다", () => {
    expect(
      paragraphContent(`<span style="_white-space:pre">a  b</span>`),
    ).toEqual([{ text: "a b" }]);
  });

  it("재현 10행: 이름이 비ASCII 글자인 사용자 정의 함수 호출은 장식을 끈다", () => {
    expect(
      paragraphContent(
        `<span style="text-decoration:underline;text-decoration:underline --é(x)">a</span>`,
      ),
    ).toEqual([{ text: "a" }]);
  });

  it("재현 11행: 따옴표 안 사용자 정의 함수 모양은 호출이 아니라 무효 선언이라 앞의 밑줄을 지킨다", () => {
    expect(
      paragraphContent(
        `<span style="text-decoration:underline;text-decoration:line-through &quot;a --f(1px)&quot;">a</span>`,
      ),
    ).toEqual([{ text: "a", marks: [{ type: "underline" }] }]);
  });
});
