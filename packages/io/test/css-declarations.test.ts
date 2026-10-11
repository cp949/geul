/**
 * `parseCssDeclarations`가 `style` 속성을 선언 목록으로 나누는 규칙을
 * 검증한다(Issue #368).
 *
 * 기대값은 Chromium 153.0.8010.12 실측(2026-10-12)이다. `div`에
 * `setAttribute("style", 입력)` 뒤 `style.cssText`를 읽었다. 값 문법이 아무거나
 * 받는 사용자 정의 속성(`--a`)을 써서 분할 규칙만 봤다. 표준 속성 행은
 * Chromium이 남긴 선언과 이 module이 내는 선언의 이름·중요도가 같다.
 *
 * 의도한 차이: 빈 값 선언(`--a:`)은 버린다. Chromium은 사용자 정의 속성의 빈
 * 값을 받지만 표준 속성은 받지 않는다. 판독기는 표준 속성만 읽는다.
 *
 * 표기: 선언마다 `이름:값원문`, important면 뒤에 `!`를 붙인다.
 */
import { describe, expect, it } from "vitest";

import {
  type CssDeclaration,
  parseCssDeclarations,
} from "../src/css/declarations.js";

/** 선언 하나를 표기로 바꾼다. */
const show = (declaration: CssDeclaration): string =>
  `${declaration.name}:${declaration.text}${declaration.important ? "!" : ""}`;

/** 입력을 선언 표기 목록으로 바꾼다. */
const declarations = (style: string): string[] =>
  parseCssDeclarations(style).map(show);

describe("parseCssDeclarations 이름과 콜론", () => {
  it.each<[string, string[]]>([
    ["--a:1;--b:2", ["--a:1", "--b:2"]],
    ["x --a:1;--b:2", ["--b:2"]],
    ["--a :1", ["--a:1"]],
    ["--a/**/:1", ["--a:1"]],
    ["\\2d\\2d a:1", ["--a:1"]],
    ["COLOR:red", ["color:red"]],
    ["--A:1", ["--A:1"]],
    ["--a:1;;--b:2", ["--a:1", "--b:2"]],
    ["}--a:1;--b:2", ["--b:2"]],
    ["<!-- --a:1;--b:2", ["--b:2"]],
    ["a{color:red};--b:1", ["--b:1"]],
    ["a{color:red} --b:1", []],
    ["--a\u00a0:1", ["--a\u00a0:1"]],
    ["--a:1;\u00a0--b:2", ["--a:1", "\u00a0--b:2"]],
  ])("%j은 %j다", (style, expected) => {
    expect(declarations(style)).toEqual(expected);
  });
});

describe("parseCssDeclarations !important", () => {
  it.each<[string, string[]]>([
    ["--a:1 !important", ["--a:1!"]],
    ["--a:1!IMPORTANT", ["--a:1!"]],
    ["--a:1 ! important", ["--a:1!"]],
    ["--a:1 !important ", ["--a:1!"]],
    ["--a:1 /*c*/ !important", ["--a:1!"]],
    ["--a:1 !imp\\6frtant", ["--a:1!"]],
    ["--a:(1 !important)", ["--a:(1 !important)"]],
    ["--a:(1 !important", ["--a:(1 !important"]],
    ["--a:f(1 !important", ["--a:f(1 !important"]],
    ["--a:1 !important)", []],
    ["--a:1 !important x", []],
    ["color:red ! x;--b:1", ["--b:1"]],
    ["--a:1 !important !important", []],
    ["--a:1 [!]", ["--a:1 [!]"]],
    ["COLOR:red !IMPORTANT;color:blue", ["color:red!", "color:blue"]],
  ])("%j은 %j다", (style, expected) => {
    expect(declarations(style)).toEqual(expected);
  });
});

describe("parseCssDeclarations 버리는 선언", () => {
  it.each<[string, string[]]>([
    ['--a:"x\n;--b:2', ["--b:2"]],
    ['--a:"x\n";--b:2', []],
    ["--a:url(a b);--b:2", ["--b:2"]],
    ["--a:f(url(a b));--b:2", ["--b:2"]],
    ["--a:1)", []],
    ["--a:1]", []],
    ["--a:1}", []],
    ["--a:[)]", []],
    ["--a:([)])", []],
    ["color:red}", []],
    ["color:red;color:", ["color:red"]],
    ["--a:", []],
    ["--a:/**/", []],
  ])("%j은 %j다", (style, expected) => {
    expect(declarations(style)).toEqual(expected);
  });
});

describe("parseCssDeclarations 블록과 at-rule", () => {
  it.each<[string, string[]]>([
    ["--a:{;};--b:2", ["--a:{;}", "--b:2"]],
    ["--a:[;--b:2]", ["--a:[;--b:2]"]],
    ["color:red;--a:f(;--b:2", ["color:red", "--a:f(;--b:2"]],
    ["@x;--a:1", ["--a:1"]],
    ["@x {--b:1} --a:2", ["--a:2"]],
    ["@x {--b:1};--a:2", ["--a:2"]],
    ["@x {--b:1} @y; --a:2", ["--a:2"]],
    ["@x (--b:1) --a:2;--c:3", ["--c:3"]],
    ["--a:1 @x;--b:2", ["--a:1 @x", "--b:2"]],
  ])("%j은 %j다", (style, expected) => {
    expect(declarations(style)).toEqual(expected);
  });
});

describe("parseCssDeclarations 값 원문", () => {
  it.each<[string, string[]]>([
    ["--a:  1  ", ["--a:1"]],
    ["--a:1/**/", ["--a:1"]],
    ["--a:/**/1", ["--a:1"]],
    ["--a:1/**/2", ["--a:1 2"]],
    ["--a:a\\62 c", ["--a:a\\62 c"]],
    ["--a:1\u000b;--b:2", ["--a:1\u000b", "--b:2"]],
    ["--a:\u00a01", ["--a:\u00a01"]],
  ])("%j은 %j다", (style, expected) => {
    expect(declarations(style)).toEqual(expected);
  });

  it("값을 component value로도 준다", () => {
    const [declaration] = parseCssDeclarations("color: rgb(1 2 3) !important");
    expect(declaration?.value).toMatchObject([
      { type: "function", name: "rgb", closed: true },
    ]);
  });
});

// Issue #368 재현 12행의 선언 단계 결과다. Chromium 열은 Issue 본문에 있다.
// 이 module은 속성 이름·값 문법을 모르므로 모르는 이름(`x1color`)도 남긴다.
// 판독기가 버린다.
describe("parseCssDeclarations Issue #368 재현 입력", () => {
  it.each<[string, string[]]>([
    [
      "color:red;background-color:blue;background:url(it's.png)",
      ["color:red", "background-color:blue"],
    ],
    ["background:url(a b.png) red", []],
    [
      "color:red;background:\\75rl(it's.png);color:blue",
      ["color:red", "color:blue"],
    ],
    ["x color:red", []],
    ["x1color:red", ["x1color:red"]],
    ["\u00a0color:red", ["\u00a0color:red"]],
    ["color:\u00a0red", ["color:\u00a0red"]],
    ["x font-weight:bold", []],
    ["_white-space:pre", ["_white-space:pre"]],
    [
      "text-decoration:underline;text-decoration:underline --\u00e9(x)",
      ["text-decoration:underline", "text-decoration:underline --\u00e9(x)"],
    ],
    [
      'text-decoration:underline;text-decoration:line-through "a --f(1px)"',
      [
        "text-decoration:underline",
        'text-decoration:line-through "a --f(1px)"',
      ],
    ],
    ["text-align:center !important", ["text-align:center!"]],
  ])("%j은 %j다", (style, expected) => {
    expect(declarations(style)).toEqual(expected);
  });
});
