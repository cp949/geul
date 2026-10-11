/**
 * `tokenizeCss`를 `@csstools/css-tokenizer@4.0.0`(CSS Syntax 3 구현)과 짧은
 * 문자열 전수로 대조한다(Issue #368 Q8, ADR-0019).
 *
 * - 대조 기준 라이브러리는 테스트에서만 쓴다. 런타임 코드는 import하지 않는다.
 *   배포물에 `??`·`?.`가 있어 Chrome 75 하한(ADR-0008)을 깬다.
 * - 글자 묶음은 ASCII만 쓴다. 비ASCII 이름 글자는 Chromium(U+0080 이상 전부)과
 *   이 라이브러리(명세의 좁은 목록)가 다르다. 이 module은 Chromium을 따른다.
 * - 묶음마다 길이 1–4 문자열 전부를 넣는다. 토큰 종류, 원문, 이스케이프를
 *   푼 값(이름·함수·문자열·url)이 같아야 한다.
 * - 길이 4로는 `url(` 뒤 내용이나 문자열 안쪽을 덮지 못한다. 그래서 `url(`·
 *   `"` 같은 접두 뒤에 같은 전수 문자열을 붙인 입력도 넣는다. 접두 없이는
 *   url 안 `'`를 bad-url로 보지 않는 변이가 통과했다(2026-10-12).
 * - 불일치는 모아서 한 번에 단언한다. 케이스마다 expect를 부르면 느리다.
 */
import { tokenize } from "@csstools/css-tokenizer";
import { describe, expect, it } from "vitest";

import { type CssToken, tokenizeCss } from "../src/css/tokens.js";

const MAX_LENGTH = 4;

// 따옴표·url·주석·이스케이프·블록·선언 끝을 덮는다.
const URL_STRING_ALPHABET = [
  "u",
  "r",
  "l",
  "(",
  ")",
  "'",
  '"',
  "\\",
  "/",
  "*",
  ";",
  "\n",
  " ",
];

// `url(`·문자열·주석·함수 안쪽을 보려고 붙이는 접두다.
const PREFIXES = ["url(", "url( ", "\\75rl(", '"', "/*", "f("];

// 숫자·지수·부호·백분율·hash·at-keyword·CDO·CDC·이스케이프를 덮는다.
const NUMBER_NAME_ALPHABET = [
  "1",
  ".",
  "e",
  "+",
  "-",
  "%",
  "#",
  "@",
  "a",
  "\\",
  "<",
  "!",
];

/** 이 module의 토큰을 비교 표기로 바꾼다. */
const ours = (token: CssToken): string => {
  const type = token.type === "comment" ? "comment" : `${token.type}-token`;
  const value =
    token.type === "ident" ||
    token.type === "function" ||
    token.type === "string" ||
    token.type === "url"
      ? `=${token.value}`
      : "";
  return `${type}[${token.text}]${value}`;
};

type ReferenceToken = [
  type: string,
  raw: string,
  start: number,
  end: number,
  data?: { value?: unknown },
];

/** 대조 기준 라이브러리의 토큰을 비교 표기로 바꾼다. */
const reference = (token: ReferenceToken): string => {
  const [type, raw, , , data] = token;
  const value =
    type === "ident-token" ||
    type === "function-token" ||
    type === "string-token" ||
    type === "url-token"
      ? `=${String(data?.value)}`
      : "";
  return `${type}[${raw}]${value}`;
};

/** 글자 묶음으로 만든 길이 1–`MAX_LENGTH` 문자열을 모두 만든다. */
const allStrings = (alphabet: readonly string[]): string[] => {
  const result: string[] = [];
  let previous = [""];
  for (let length = 1; length <= MAX_LENGTH; length += 1) {
    const next: string[] = [];
    for (const prefix of previous) {
      for (const character of alphabet) next.push(prefix + character);
    }
    result.push(...next);
    previous = next;
  }
  return result;
};

/** 두 토크나이저가 다르게 읽는 입력과 두 결과를 모은다. */
const mismatches = (inputs: readonly string[]): string[] => {
  const found: string[] = [];
  for (const input of inputs) {
    const actual = tokenizeCss(input).map(ours).join(" ");
    const expected = (tokenize({ css: input }) as ReferenceToken[])
      .filter(([type]) => type !== "EOF-token")
      .map(reference)
      .join(" ");
    if (actual !== expected) {
      found.push(`${JSON.stringify(input)}: ${actual} != ${expected}`);
    }
  }
  return found;
};

describe("tokenizeCss와 @csstools/css-tokenizer 전수 대조", () => {
  it("따옴표·url·주석 글자 묶음의 길이 4 이하 문자열을 모두 같게 읽는다", () => {
    const inputs = allStrings(URL_STRING_ALPHABET);
    expect(inputs).toHaveLength(30_940);
    expect(mismatches(inputs).slice(0, 10)).toEqual([]);
  });

  it.each(PREFIXES)(
    "%j 뒤에 따옴표·url·주석 글자 묶음 문자열을 붙여도 같게 읽는다",
    (prefix) => {
      const inputs = allStrings(URL_STRING_ALPHABET).map(
        (suffix) => prefix + suffix,
      );
      expect(mismatches(inputs).slice(0, 10)).toEqual([]);
    },
  );

  it("숫자·이름 글자 묶음의 길이 4 이하 문자열을 모두 같게 읽는다", () => {
    const inputs = allStrings(NUMBER_NAME_ALPHABET);
    expect(inputs).toHaveLength(22_620);
    expect(mismatches(inputs).slice(0, 10)).toEqual([]);
  });
});
