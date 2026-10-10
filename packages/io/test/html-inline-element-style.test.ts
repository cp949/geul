/**
 * `span`·`b`·`strong` 밖의 인라인 요소가 내는 색과 서식을 읽는지 고정한다
 * (Issue #334 단계 A).
 *
 * - `font`(`color` 속성과 `style`), `mark`(기본 배경 `#FFFF00`), 기존 태그
 *   `em`·`i`·`u`·`s`·`del`·`strike`·`code`·`b`·`strong`의 `style` 색·배경·굵게·
 *   기울임·밑줄·취소선·`font` 줄임을 읽는다.
 * - 기대값은 Chromium `getComputedStyle` 실측(2026-10-10)이다. 실측과 다르게
 *   읽는 값은 맨 아래 "의도한 차이" 묶음에 따로 모았고, 각 행에 이유를 적었다.
 * - 같은 입력을 세 경로로 읽어 결과가 같은지 본다: `importHtml` 문단,
 *   `importHtml` 표 셀, `parseClipboardTable` 표 셀. 앞 둘은
 *   `htmlImportSanitizeSchema`, 마지막은 `clipboardSanitizeSchema`를 거친다.
 * - sanitize 스키마는 `style`을 남기되 경고 기준(`htmlAllowedAttributes`)은
 *   늘리지 않는다. 기존 태그의 `style` 제거 경고는 이전과 같고, `font`·`mark`의
 *   `color`·`style`은 정식 허용이라 경고가 없다.
 */
import type { InlineContent } from "@cp949/geul-model";
import type { Schema } from "hast-util-sanitize";
import { describe, expect, it } from "vitest";

import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { clipboardSanitizeSchema } from "../src/html/clipboard-sanitize-schema.js";
import {
  htmlAllowedAttributes,
  htmlSanitizeSchema,
} from "../src/html/sanitize-schema.js";
import { htmlImportSanitizeSchema } from "../src/html/import-html-sanitize-schema.js";
import { importHtml } from "../src/index.js";
import { expectSingleTable } from "./clipboard-table-support.js";

/** 글자 `x` 한 조각이 가진 마크를 비교하기 쉬운 모양으로 줄인 것이다. */
type Facts = {
  textColor?: string;
  backgroundColor?: string;
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  code?: true;
};

/** 색 마크의 color를 꺼낸다. 호출부가 type을 이미 확인했다. */
const colorOf = (mark: object): string => (mark as { color: string }).color;

/**
 * 인라인 content에서 글자 `x`의 마크를 Facts로 줄인다. 글자가 `x` 하나뿐인지도
 * 함께 단언해 다른 조각이 끼어든 결과를 놓치지 않는다.
 */
const factsOf = (content: InlineContent): Facts => {
  const text = content
    .map((item) => ("text" in item ? item.text : ""))
    .join("");
  expect(text).toBe("x");
  const facts: Facts = {};
  for (const item of content) {
    if (!("marks" in item) || item.marks === undefined) continue;
    for (const mark of item.marks) {
      // 사용자 정의 마크(type: string) 때문에 type 비교로는 color가 좁혀지지
      // 않는다.
      if (mark.type === "textColor") facts.textColor = colorOf(mark);
      else if (mark.type === "backgroundColor") {
        facts.backgroundColor = colorOf(mark);
      } else if (mark.type === "bold") facts.bold = true;
      else if (mark.type === "italic") facts.italic = true;
      else if (mark.type === "underline") facts.underline = true;
      else if (mark.type === "strike") facts.strike = true;
      else if (mark.type === "code") facts.code = true;
    }
  }
  return facts;
};

const imported = (html: string) => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/** `importHtml`로 `<p>` 한 문단을 읽는다. */
const paragraphFacts = (inner: string): Facts => {
  const [block] = imported(`<p>${inner}</p>`).document.blocks;
  if (block?.type !== "paragraph" || !Array.isArray(block.content)) {
    throw new Error("인라인 content를 가진 문단이 아니다");
  }
  return factsOf(block.content);
};

/** `importHtml`로 표 셀 하나를 읽는다. */
const importedCellFacts = (inner: string): Facts => {
  const [block] = imported(
    `<table><tbody><tr><td>${inner}</td></tr></tbody></table>`,
  ).document.blocks;
  if (block?.type !== "table" || !("rows" in block)) {
    throw new Error("표 블록이 아니다");
  }
  const content = block.rows[0]?.cells[0]?.content;
  if (content === undefined) throw new Error("셀이 없다");
  return factsOf(content);
};

/** `parseClipboardTable`로 표 셀 하나를 읽는다. */
const clipboardCellFacts = (inner: string): Facts => {
  const table = expectSingleTable(
    parseClipboardTable({
      html: `<table><tbody><tr><td>${inner}</td></tr></tbody></table>`,
    }),
  );
  const content = table.rows[0]?.cells[0]?.content;
  if (content === undefined) throw new Error("셀이 없다");
  return factsOf(content);
};

const paths: Array<[string, (inner: string) => Facts]> = [
  ["importHtml 문단", paragraphFacts],
  ["importHtml 표 셀", importedCellFacts],
  ["clipboard 표 셀", clipboardCellFacts],
];

/** 한 입력을 세 경로로 읽어 모두 기대와 같은지 본다. */
const expectEveryPath = (inner: string, expected: Facts): void => {
  for (const [name, read] of paths) {
    expect(read(inner), name).toEqual(expected);
  }
};

describe("font 태그의 color 속성", () => {
  // Chromium은 `#` 없는 3자리나 5자리, 함수 표기도 옛 규칙으로 색을 만들지만
  // 이 표는 읽는 값만 고정한다. 읽지 않는 값은 "의도한 차이"에 있다.
  it.each([
    ["#ff0000", "#FF0000"],
    ["#FF0000", "#FF0000"],
    ["red", "#FF0000"],
    ["Red", "#FF0000"],
    ["rebeccapurple", "#663399"],
    ["#f00", "#FF0000"],
    ["#FFF", "#FFFFFF"],
    ["ff0000", "#FF0000"],
    ["FF0000", "#FF0000"],
    ["123456", "#123456"],
    ["abcdef", "#ABCDEF"],
    ["  red  ", "#FF0000"],
    ["ff0000 ", "#FF0000"],
    ["#ff0000 ", "#FF0000"],
  ])("color=%j는 글자색 %s이다", (value, color) => {
    expectEveryPath(`<font color="${value}">x</font>`, { textColor: color });
  });

  it.each([["transparent"], [""]])(
    "color=%j는 색 마크가 없다(Chromium도 기본 글자색)",
    (value) => {
      expectEveryPath(`<font color="${value}">x</font>`, {});
    },
  );

  it("face·size는 읽지 않고 color만 읽는다", () => {
    expectEveryPath('<font face="Arial" size="5" color="#ff0000">x</font>', {
      textColor: "#FF0000",
    });
  });
});

describe("font 태그의 중첩과 style", () => {
  it("안쪽 font 색이 바깥 font 색을 덮는다", () => {
    expectEveryPath('<font color="red"><font color="blue">x</font></font>', {
      textColor: "#0000FF",
    });
  });

  it("바깥 span 색보다 안쪽 font 색이 이긴다", () => {
    expectEveryPath(
      '<span style="color:blue"><font color="red">x</font></span>',
      {
        textColor: "#FF0000",
      },
    );
  });

  it("바깥 font 색보다 안쪽 span 색이 이긴다", () => {
    expectEveryPath(
      '<font color="red"><span style="color:blue">x</span></font>',
      {
        textColor: "#0000FF",
      },
    );
  });

  it("font의 style 색이 color 속성을 이긴다", () => {
    expectEveryPath('<font color="red" style="color:blue">x</font>', {
      textColor: "#0000FF",
    });
  });

  it("style 색이 문법 오류면 color 속성을 쓴다", () => {
    expectEveryPath('<font color="red" style="color:bogus">x</font>', {
      textColor: "#FF0000",
    });
  });

  it("style 색이 상속 키워드면 color 속성도 쓰지 않는다", () => {
    expectEveryPath('<font color="red" style="color:inherit">x</font>', {});
  });

  it("style의 색·배경을 읽는다", () => {
    expectEveryPath(
      '<font style="background-color:#00ff00;color:#0000ff">x</font>',
      { textColor: "#0000FF", backgroundColor: "#00FF00" },
    );
  });

  it("font 안의 굵게는 색을 물려받는다", () => {
    expectEveryPath('<font color="red"><b>x</b></font>', {
      textColor: "#FF0000",
      bold: true,
    });
  });

  // 블록 경계를 품은 font·mark는 태그만 벗겨 #334 이전 구조를 유지한다(리뷰
  // MAJOR-2, html-font-mark-block-unwrap.test.ts). 벗겨진 font의 color는 읽지
  // 않는다.
  it("font이 블록 문단을 품으면 벗겨져 색을 읽지 않는다", () => {
    expect(
      imported('<font color="red"><p>x</p></font>').document.blocks,
    ).toEqual([{ id: "html-1", type: "paragraph", content: [{ text: "x" }] }]);
  });
});

describe("mark 태그", () => {
  it("기본은 배경 #FFFF00이고 글자색은 읽지 않는다", () => {
    expectEveryPath("<mark>x</mark>", { backgroundColor: "#FFFF00" });
  });

  it.each([
    ["background-color:#0000ff", "#0000FF"],
    ["background:#0000ff", "#0000FF"],
    ["background-color:red;background-color:bogus", "#FF0000"],
    ["background-color:bogus", "#FFFF00"],
    ["background-color:rgb(0 0 255 / 100%)", "#0000FF"],
    ["background:url(x.png) #00ff00", "#00FF00"],
  ])("style %s는 배경 %s이다", (style, color) => {
    expectEveryPath(`<mark style="${style}">x</mark>`, {
      backgroundColor: color,
    });
  });

  it.each([
    ["background-color:transparent"],
    ["background:none"],
    ["background:url(x.png)"],
    ["background-color:inherit"],
    ["background-color:initial"],
    ["background-color:red;background-color:transparent"],
    ["background-color:transparent;background-color:bogus"],
  ])("style %s는 기본 노랑도 내지 않는다", (style) => {
    expectEveryPath(`<mark style="${style}">x</mark>`, {});
  });

  it("style의 글자색은 읽고 기본 배경은 유지한다", () => {
    expectEveryPath('<mark style="color:#0000ff">x</mark>', {
      textColor: "#0000FF",
      backgroundColor: "#FFFF00",
    });
    expectEveryPath(
      '<mark style="background-color:#ff0000;color:#0000ff">x</mark>',
      { textColor: "#0000FF", backgroundColor: "#FF0000" },
    );
  });

  it("안쪽 mark 노랑이 바깥 span 배경을 덮는다", () => {
    expectEveryPath(
      '<span style="background-color:#00ff00"><mark>x</mark></span>',
      {
        backgroundColor: "#FFFF00",
      },
    );
  });

  it("안쪽 span 배경이 mark 노랑을 덮는다", () => {
    expectEveryPath(
      '<mark><span style="background-color:#00ff00">x</span></mark>',
      {
        backgroundColor: "#00FF00",
      },
    );
  });

  it("안쪽 span의 투명 배경은 mark 노랑을 지우지 않는다", () => {
    expectEveryPath(
      '<mark><span style="background-color:transparent">x</span></mark>',
      { backgroundColor: "#FFFF00" },
    );
  });

  it("바깥 mark의 style 배경은 안쪽 mark 노랑에 덮인다", () => {
    expectEveryPath(
      '<mark style="background-color:#0000ff"><mark>x</mark></mark>',
      { backgroundColor: "#FFFF00" },
    );
  });
});

/** 태그와 그 태그가 스스로 내는 마크. */
const inlineTags: Array<[string, Facts]> = [
  ["em", { italic: true }],
  ["i", { italic: true }],
  ["u", { underline: true }],
  ["s", { strike: true }],
  ["del", { strike: true }],
  ["strike", { strike: true }],
  ["code", { code: true }],
  ["b", { bold: true }],
  ["strong", { bold: true }],
];

describe.each(inlineTags)("%s의 style 색", (tag, own) => {
  it("color를 글자색으로 읽는다", () => {
    expectEveryPath(`<${tag} style="color:#ff0000">x</${tag}>`, {
      ...own,
      textColor: "#FF0000",
    });
  });

  it("background-color를 배경색으로 읽는다", () => {
    expectEveryPath(`<${tag} style="background-color:#ffff00">x</${tag}>`, {
      ...own,
      backgroundColor: "#FFFF00",
    });
  });

  it("둘을 함께 읽는다", () => {
    expectEveryPath(
      `<${tag} style="color:#ff0000;background-color:#ffff00">x</${tag}>`,
      { ...own, textColor: "#FF0000", backgroundColor: "#FFFF00" },
    );
  });

  it("안쪽 요소의 색이 바깥 span 색을 덮는다", () => {
    expectEveryPath(
      `<span style="color:#00ff00"><${tag} style="color:#ff0000">x</${tag}></span>`,
      { ...own, textColor: "#FF0000" },
    );
  });

  it("안쪽 span 색이 바깥 요소 색을 덮는다", () => {
    expectEveryPath(
      `<${tag} style="color:#ff0000"><span style="color:#00ff00">x</span></${tag}>`,
      { ...own, textColor: "#00FF00" },
    );
  });

  it("style이 읽는 선언이 없으면 태그 마크만 남는다", () => {
    expectEveryPath(`<${tag} style="font-family:Arial">x</${tag}>`, own);
  });
});

/** 서식을 읽는 모든 태그와 그 태그가 스스로 내는 마크. span·font는 마크가 없다. */
const formatTags: Array<[string, Facts]> = [
  ...inlineTags,
  ["span", {}],
  ["font", {}],
  ["mark", { backgroundColor: "#FFFF00" }],
];

describe.each(formatTags)("%s의 style 서식", (tag, own) => {
  const read = (style: string, extra: Facts) => {
    expectEveryPath(`<${tag} style="${style}">x</${tag}>`, {
      ...own,
      ...extra,
    });
  };

  it("font-weight 600 이상은 굵게다", () => {
    read("font-weight:700", { bold: true });
    read("font-weight:bold", { bold: true });
    read("font-weight:600", { bold: true });
  });

  it("font-style italic·oblique는 기울임이다", () => {
    read("font-style:italic", { italic: true });
    read("font-style:oblique", { italic: true });
  });

  it("font 줄임의 굵기와 기울임을 읽는다", () => {
    read("font:italic bold 12px Arial", { bold: true, italic: true });
    // 줄임에 기울임이 없으면 normal이라 em·i의 UA 기울임도 끈다.
    const withoutItalic: Facts = { ...own };
    delete withoutItalic.italic;
    expectEveryPath(`<${tag} style="font:bold 12px Arial">x</${tag}>`, {
      ...withoutItalic,
      bold: true,
    });
    expectEveryPath(`<${tag} style="font:700 12px/1.5 Arial">x</${tag}>`, {
      ...withoutItalic,
      bold: true,
    });
  });

  it("굵기 없는 font 줄임은 normal이라 b·strong의 UA 굵기도 끈다", () => {
    // b·strong은 UA가 굵게 한다. 줄임이 굵기를 normal로 덮으므로 굵게가 아니다.
    const withoutBold: Facts = { ...own };
    delete withoutBold.bold;
    expectEveryPath(`<${tag} style="font:italic 12px Arial">x</${tag}>`, {
      ...withoutBold,
      italic: true,
    });
  });
});

/** `s`·`del`·`strike`는 자기 태그와 다른 text-decoration을 Chromium이 대체한다. */
const decorationTags = formatTags.filter(
  ([tag]) => !["s", "del", "strike"].includes(tag),
);

describe.each(decorationTags)("%s의 style 밑줄", (tag, own) => {
  it("text-decoration underline은 밑줄이다", () => {
    expectEveryPath(`<${tag} style="text-decoration:underline">x</${tag}>`, {
      ...own,
      underline: true,
    });
  });
});

describe.each(formatTags.filter(([tag]) => tag !== "u"))(
  "%s의 style 취소선",
  (tag, own) => {
    it("text-decoration line-through는 취소선이다", () => {
      expectEveryPath(
        `<${tag} style="text-decoration:line-through">x</${tag}>`,
        {
          ...own,
          strike: true,
        },
      );
    });
  },
);

describe("b·strong의 font-weight 판정", () => {
  // Chromium 실측: 굵지 않은 값. 400 미만·초과 구간 값도 b의 UA 굵기를 덮는다.
  const notBold = [
    "100",
    "300",
    "400",
    "500",
    "599",
    "599.9",
    "1",
    "300.0",
    "+300",
    "5e2",
    ".5e3",
    "normal",
    "lighter",
    "Lighter",
    "inherit",
    "initial",
    "unset",
    "300 !important",
    "  300  ",
  ];
  // 600 이상과, 선언이 무효라 무시돼 UA 굵기가 남는 값.
  const bold = [
    "600",
    "700",
    "700.5",
    "1000",
    "1e3",
    "bold",
    "BOLD",
    "bolder",
    "bold !important",
    "revert",
    "revert-layer",
    "foo",
    "semibold",
    "0",
    "1001",
    "-1",
    "",
  ];

  it.each(["b", "strong"])("%s는 굵지 않은 값이면 굵게가 아니다", (tag) => {
    for (const value of notBold) {
      expectEveryPath(`<${tag} style="font-weight:${value}">x</${tag}>`, {});
    }
  });

  it.each(["b", "strong"])("%s는 굵은 값이나 무효한 값이면 굵게다", (tag) => {
    for (const value of bold) {
      expectEveryPath(`<${tag} style="font-weight:${value}">x</${tag}>`, {
        bold: true,
      });
    }
  });

  it("무효한 선언은 앞의 유효한 값을 지우지 않는다", () => {
    expectEveryPath('<b style="font-weight:300;font-weight:bogus">x</b>', {});
    expectEveryPath('<b style="font-weight:bogus;font-weight:300">x</b>', {});
    expectEveryPath('<b style="font-weight:700;font:bogus">x</b>', {
      bold: true,
    });
  });

  it("font 줄임은 굵기가 없으면 normal이라 굵게가 아니다", () => {
    expectEveryPath('<b style="font:12px Arial">x</b>', {});
    expectEveryPath('<b style="font:italic 12px Arial">x</b>', {
      italic: true,
    });
    expectEveryPath('<b style="font:lighter 12px Arial">x</b>', {});
    expectEveryPath('<b style="font:300 12px Arial">x</b>', {});
    expectEveryPath('<b style="font:inherit">x</b>', {});
    expectEveryPath('<b style="font:caption">x</b>', {});
  });

  it("font 줄임이 앞의 font-weight를 덮고 뒤의 font-weight가 줄임을 덮는다", () => {
    expectEveryPath('<b style="font-weight:700;font:12px Arial">x</b>', {});
    expectEveryPath('<b style="font:12px Arial;font-weight:700">x</b>', {
      bold: true,
    });
  });

  it("글꼴이 없는 줄임은 문법 오류라 선언을 버리고 b의 굵기가 남는다", () => {
    expectEveryPath('<b style="font:bold 12px">x</b>', { bold: true });
  });

  it("안쪽 span의 굵기는 굵지 않은 바깥 b에도 더해진다", () => {
    expectEveryPath(
      '<b style="font-weight:normal"><span style="font-weight:700">x</span></b>',
      { bold: true },
    );
  });
});

describe("span의 font-weight 판정", () => {
  it("유효한 굵은 값만 굵게이고 나머지는 마크가 없다", () => {
    for (const value of [
      "600",
      "700",
      "700.5",
      "1000",
      "1e3",
      "bold",
      "bolder",
    ]) {
      expectEveryPath(`<span style="font-weight:${value}">x</span>`, {
        bold: true,
      });
    }
    for (const value of [
      "1",
      "300",
      "599.9",
      "normal",
      "lighter",
      "inherit",
      "revert",
      "foo",
      "0",
      "1001",
      "-1",
      "",
    ]) {
      expectEveryPath(`<span style="font-weight:${value}">x</span>`, {});
    }
  });
});

/**
 * Chromium과 일부러 다르게 읽는 값이다. 각 행의 이유는 계획 2-1절과 5절이다.
 * 기대값은 이 구현이 읽는 값을 고정한다.
 */
describe("Chromium과 다르게 읽는 의도한 차이", () => {
  it("u·s는 자기 태그 마크를 끄는 text-decoration 값을 읽지 않는다", () => {
    // Chromium은 text-decoration:none이 u의 밑줄을 끈다. 태그 마크는 그대로다.
    expectEveryPath('<u style="text-decoration:none">x</u>', {
      underline: true,
    });
    expectEveryPath('<s style="text-decoration:none">x</s>', { strike: true });
  });

  it("u·s의 다른 text-decoration은 자기 마크를 대체하지 않고 더해진다", () => {
    // Chromium은 u의 text-decoration:line-through가 밑줄을 대체한다.
    expectEveryPath('<u style="text-decoration:line-through">x</u>', {
      underline: true,
      strike: true,
    });
    expectEveryPath('<s style="text-decoration:underline">x</s>', {
      underline: true,
      strike: true,
    });
  });

  it.each([
    ["font", "transparent"],
    ["span", "transparent"],
    ["em", "rgba(255,0,0,0.5)"],
  ])("%s의 %s 글자색은 마크가 없다", (tag, value) => {
    // Chromium은 반투명 글자로 그린다. 모델은 alpha를 담지 않아 합성하지 않는다.
    expectEveryPath(`<${tag} style="color:${value}">x</${tag}>`, {
      ...(tag === "em" ? { italic: true } : {}),
    });
  });

  it("font color 속성의 쓰레기 값은 읽지 않는다", () => {
    // Chromium은 옛 규칙으로 `garbage`를 #0ABAE0으로 바꿔 그린다.
    for (const value of [
      "garbage",
      "f00",
      "abc",
      "12345",
      "#ff000",
      "#ff00000",
      "#ff0000ff",
      "#12345g",
      "rgb(255,0,0)",
      "currentcolor",
      "inherit",
    ]) {
      expectEveryPath(`<font color="${value}">x</font>`, {});
    }
  });

  it("mark의 currentcolor 배경은 기본 노랑도 내지 않는다", () => {
    // Chromium은 글자색(검정)으로 칠한다. currentcolor는 색을 정하지 않는다.
    expectEveryPath('<mark style="background-color:currentcolor">x</mark>', {});
  });

  it("mark의 반투명 배경은 기본 노랑도 내지 않는다", () => {
    expectEveryPath(
      '<mark style="background-color:rgba(0,0,255,.5)">x</mark>',
      {},
    );
  });
});

describe("sanitize 스키마와 경고 기준", () => {
  const readOnlyStyleTags = ["em", "i", "u", "s", "del", "strike", "code"];

  it("경고 기준 htmlAllowedAttributes에는 기존 태그의 style을 올리지 않는다", () => {
    for (const tag of readOnlyStyleTags) {
      expect(htmlAllowedAttributes[tag] ?? []).not.toContain("style");
    }
  });

  it("font·mark는 htmlAllowedAttributes에 정식으로 올라간다", () => {
    expect(htmlAllowedAttributes.font).toEqual(["color", "style"]);
    expect(htmlAllowedAttributes.mark).toEqual(["style"]);
  });

  it.each<[string, Schema]>([
    ["htmlSanitizeSchema", htmlSanitizeSchema],
    ["htmlImportSanitizeSchema", htmlImportSanitizeSchema],
    ["clipboardSanitizeSchema", clipboardSanitizeSchema],
  ])("%s는 읽기 전용 style 속성과 font·mark를 남긴다", (_name, schema) => {
    for (const tag of readOnlyStyleTags) {
      expect(schema.attributes?.[tag]).toContain("style");
    }
    expect(schema.tagNames).toContain("font");
    expect(schema.tagNames).toContain("mark");
    expect(schema.attributes?.font).toEqual(
      expect.arrayContaining(["color", "style"]),
    );
    expect(schema.attributes?.mark).toEqual(expect.arrayContaining(["style"]));
  });

  it("기존 태그의 style 제거 경고는 이전과 같다", () => {
    for (const tag of readOnlyStyleTags) {
      expect(
        imported(`<p><${tag} style="color:red">x</${tag}></p>`).warnings,
      ).toEqual([
        {
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: tag,
          attribute: "style",
          message: `Unsupported style attribute was removed from ${tag}`,
        },
      ]);
    }
  });

  it("font의 color·style과 mark의 style은 경고가 없다", () => {
    expect(
      imported('<p><font color="red" style="color:blue">x</font></p>').warnings,
    ).toEqual([]);
    expect(
      imported('<p><mark style="background:red">x</mark></p>').warnings,
    ).toEqual([]);
  });

  it("font의 size·face는 이전처럼 속성 제거 경고를 낸다", () => {
    expect(
      imported('<p><font size="3" face="Arial">x</font></p>').warnings,
    ).toEqual([
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "font",
        attribute: "size",
        message: "Unsupported size attribute was removed from font",
      },
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "font",
        attribute: "face",
        message: "Unsupported face attribute was removed from font",
      },
    ]);
  });

  it("루트에 놓인 font·mark의 블록 강등 경고는 em과 같이 유지된다", () => {
    expect(imported('<font color="red">x</font>').warnings).toEqual([
      {
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "font",
        message: "Unsupported font block was downgraded to paragraph content",
      },
    ]);
    expect(imported("<mark>x</mark>").warnings).toEqual([
      {
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: "mark",
        message: "Unsupported mark block was downgraded to paragraph content",
      },
    ]);
  });
});
