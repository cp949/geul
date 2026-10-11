/**
 * `tokenizeCss`가 CSS Syntax Level 3(§4) 규칙으로 토큰을 나누는지 검증한다
 * (Issue #368, ADR-0019).
 *
 * 기대값의 근거는 명세다. 명세와 Chromium이 갈리는 곳은 Chromium을 따른다.
 * - 비ASCII 글자: Chromium 153.0.8010.12 실측(2026-10-12). `font-family:serif;
 *   font-family:a`(U+00A0)`b`의 계산값이 `a b`라 U+00A0이 이름 글자다. U+00D7·
 *   U+2000도 같다. 명세의 좁은 목록(non-ASCII ident code point)은 이 글자들을
 *   이름 글자로 보지 않는다.
 *
 * 토큰 표기: `종류` 또는 `종류(값)`. whitespace는 `ws`다. hash는 id면
 * `hash(값,id)`다. dimension은 `dimension(숫자단위)`다.
 */
import { describe, expect, it } from "vitest";

import { type CssToken, tokenizeCss } from "../src/css/tokens.js";

/** 토큰 하나를 표의 표기로 바꾼다. */
const show = (token: CssToken): string => {
  switch (token.type) {
    case "whitespace":
      return "ws";
    case "ident":
    case "function":
    case "at-keyword":
    case "string":
    case "url":
    case "delim":
      return `${token.type}(${token.value})`;
    case "hash":
      return `hash(${token.value}${token.id ? ",id" : ""})`;
    case "number":
    case "percentage":
      return `${token.type}(${token.value})`;
    case "dimension":
      return `dimension(${token.value}${token.unit})`;
    default:
      return token.type;
  }
};

/** 입력을 토큰 표기 목록으로 바꾼다. */
const tokens = (input: string): string[] => tokenizeCss(input).map(show);

describe("tokenizeCss 기본 토큰", () => {
  it.each<[string, string[]]>([
    ["color:red", ["ident(color)", "colon", "ident(red)"]],
    ["a \t\n b", ["ident(a)", "ws", "ident(b)"]],
    ["a,b;c", ["ident(a)", "comma", "ident(b)", "semicolon", "ident(c)"]],
    ["()[]{}", ["(", ")", "[", "]", "{", "}"]],
    ["rgb(1", ["function(rgb)", "number(1)"]],
    ["@media", ["at-keyword(media)"]],
    ["@1", ["delim(@)", "number(1)"]],
    ["!important", ["delim(!)", "ident(important)"]],
    ["<!-- -->", ["CDO", "ws", "CDC"]],
    ["<!-", ["delim(<)", "delim(!)", "delim(-)"]],
    ["", []],
  ])("%j은 %j다", (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });
});

describe("tokenizeCss 이름", () => {
  it.each<[string, string[]]>([
    ["-a", ["ident(-a)"]],
    ["--a", ["ident(--a)"]],
    ["--", ["ident(--)"]],
    ["-\\61", ["ident(-a)"]],
    ["-", ["delim(-)"]],
    ["-1", ["number(-1)"]],
    ["_a1-", ["ident(_a1-)"]],
    ["1a", ["dimension(1a)"]],
    ["a\\62 c", ["ident(abc)"]],
    ["\\31 url(x)", ["function(1url)", "ident(x)", ")"]],
    ["x1color", ["ident(x1color)"]],
    ["\\63olor", ["ident(color)"]],
  ])("%j은 %j다", (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });

  it("U+0080 이상 글자는 모두 이름 글자다(Chromium)", () => {
    for (const character of ["\u0080", " ", "×", " ", "　", "é"]) {
      expect(tokens(`a${character}b`)).toEqual([`ident(a${character}b)`]);
    }
    expect(tokens("a\u{1f600}b")).toEqual(["ident(a\u{1f600}b)"]);
  });

  it("DEL은 이름 글자가 아니다", () => {
    expect(tokens("a\u007fb")).toEqual([
      "ident(a)",
      "delim(\u007f)",
      "ident(b)",
    ]);
  });
});

describe("tokenizeCss 이스케이프", () => {
  it.each<[string, string[]]>([
    ["\\41 b", ["ident(Ab)"]],
    ["\\41  b", ["ident(A)", "ws", "ident(b)"]],
    ["\\000041b", ["ident(Ab)"]],
    ["\\0000041", ["ident(\u00041)"]],
    ["\\0", ["ident(�)"]],
    ["\\d800", ["ident(�)"]],
    ["\\110000", ["ident(�)"]],
    ["\\1f600", ["ident(\u{1f600})"]],
    ["\\", ["ident(�)"]],
    ["a\\", ["ident(a�)"]],
    ["\\\n", ["delim(\\)", "ws"]],
    ["\\;", ["ident(;)"]],
  ])("%j은 %j다", (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });
});

describe("tokenizeCss 문자열", () => {
  it.each<[string, string[]]>([
    ['"a"', ["string(a)"]],
    ["'a\"b'", ['string(a"b)']],
    ['"a\\"b"', ['string(a"b)']],
    ['"a', ["string(a)"]],
    ['"a\nb"', ["bad-string", "ws", "ident(b)", "string()"]],
    ['"a\\\nb"', ["string(ab)"]],
    ['"a\\', ["string(a)"]],
    ['"a\\62 c"', ["string(abc)"]],
    ['"a\r\nb', ["bad-string", "ws", "ident(b)"]],
    ['"a\fb', ["bad-string", "ws", "ident(b)"]],
    ['"a\u000bb"', ["string(a\u000bb)"]],
    ['"a b"', ["string(a b)"]],
  ])("%j은 %j다", (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });
});

describe("tokenizeCss url", () => {
  it.each<[string, string[]]>([
    ["url(a.png)", ["url(a.png)"]],
    ["url(  a.png  )", ["url(a.png)"]],
    ["URL(a)", ["url(a)"]],
    ["\\75rl(a)", ["url(a)"]],
    ["u\\rl(a)", ["url(a)"]],
    ["url(a", ["url(a)"]],
    ["url(", ["url()"]],
    ["url()", ["url()"]],
    ["url(a\\)b)", ["url(a)b)"]],
    ["url(data:a;b,c)", ["url(data:a;b,c)"]],
    ["url(a/*b*/c)", ["url(a/*b*/c)"]],
    ["url(a[b{c)", ["url(a[b{c)"]],
    ["url(it's.png)", ["bad-url"]],
    ["url(a b.png)", ["bad-url"]],
    ["url(a(b)", ["bad-url"]],
    ['url(a"b)', ["bad-url"]],
    ["url(a\u0001b)", ["bad-url"]],
    ["url(a\\\nb)", ["bad-url"]],
    ["url(a b) c", ["bad-url", "ws", "ident(c)"]],
    ["url(a b\\) c) d", ["bad-url", "ws", "ident(d)"]],
    ["url(a b", ["bad-url"]],
    ['url("a")', ["function(url)", "string(a)", ")"]],
    ['url( "a")', ["function(url)", "ws", "string(a)", ")"]],
    ['url(  "a")', ["function(url)", "ws", "string(a)", ")"]],
    ["\\75rl(it's.png)", ["bad-url"]],
    ["url (a)", ["ident(url)", "ws", "(", "ident(a)", ")"]],
    ["xurl(a)", ["function(xurl)", "ident(a)", ")"]],
  ])("%j은 %j다", (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });
});

describe("tokenizeCss 숫자", () => {
  it.each<[string, string[]]>([
    ["1", ["number(1)"]],
    ["1.5", ["number(1.5)"]],
    [".5", ["number(0.5)"]],
    ["+.5", ["number(0.5)"]],
    ["-0.5", ["number(-0.5)"]],
    ["1e3", ["number(1000)"]],
    ["1E+3", ["number(1000)"]],
    ["1e-1", ["number(0.1)"]],
    ["1e", ["dimension(1e)"]],
    ["1.", ["number(1)", "delim(.)"]],
    ["10%", ["percentage(10)"]],
    ["12px", ["dimension(12px)"]],
    ["1-x", ["dimension(1-x)"]],
    ["1\\70 x", ["dimension(1px)"]],
    ["+", ["delim(+)"]],
    ["+a", ["delim(+)", "ident(a)"]],
    [".", ["delim(.)"]],
  ])("%j은 %j다", (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });

  it("정수 여부를 구분한다", () => {
    const [integer, real, exponent] = tokenizeCss("1 1.0 1e0").filter(
      (token) => token.type === "number",
    );
    expect(integer).toMatchObject({ integer: true });
    expect(real).toMatchObject({ integer: false });
    expect(exponent).toMatchObject({ integer: false });
  });
});

describe("tokenizeCss hash", () => {
  it.each<[string, string[]]>([
    ["#fff", ["hash(fff,id)"]],
    ["#1a", ["hash(1a)"]],
    ["#-", ["hash(-)"]],
    ["#-a", ["hash(-a,id)"]],
    ["#\\31", ["hash(1,id)"]],
    ["#", ["delim(#)"]],
    ["# a", ["delim(#)", "ws", "ident(a)"]],
  ])("%j은 %j다", (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });
});

describe("tokenizeCss 주석", () => {
  it.each<[string, string[]]>([
    ["a/*x*/b", ["ident(a)", "comment", "ident(b)"]],
    ["/*x", ["comment"]],
    ["/**/", ["comment"]],
    ["/*/", ["comment"]],
    ["'/*'", ["string(/*)"]],
    ["/", ["delim(/)"]],
  ])("%j은 %j다", (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });
});

describe("tokenizeCss 전처리", () => {
  it("CR·CRLF·FF는 LF 하나로 읽는다", () => {
    expect(tokenizeCss("a\r\nb")).toMatchObject([
      { type: "ident", text: "a" },
      { type: "whitespace", text: "\n", start: 1, end: 3 },
      { type: "ident", text: "b" },
    ]);
    expect(tokenizeCss("a\fb")[1]).toMatchObject({ text: "\n" });
    expect(tokenizeCss("a\rb")[1]).toMatchObject({ text: "\n" });
  });

  it("NUL과 짝 없는 surrogate는 U+FFFD다", () => {
    expect(tokens("a\0b")).toEqual(["ident(a�b)"]);
    expect(tokens("a\ud800b")).toEqual(["ident(a�b)"]);
    expect(tokens("a\udc00b")).toEqual(["ident(a�b)"]);
  });
});

describe("tokenizeCss 위치와 원문", () => {
  it("토큰마다 원문 위치와 이스케이프를 풀지 않은 원문을 준다", () => {
    expect(tokenizeCss("a\\62 c:url( x )")).toMatchObject([
      { type: "ident", value: "abc", text: "a\\62 c", start: 0, end: 6 },
      { type: "colon", text: ":", start: 6, end: 7 },
      { type: "url", value: "x", text: "url( x )", start: 7, end: 15 },
    ]);
  });
});
