/**
 * `parseCssComponentValues`가 토큰을 함수·블록으로 묶는 규칙을 검증한다
 * (CSS Syntax Level 3 §5, Issue #368).
 *
 * - 짝 맞는 닫는 토큰만 닫는다. 짝이 안 맞으면 보통 토큰이다.
 * - 입력 끝에서 열린 것은 닫는다(`closed: false`). Chromium 153 실측
 *   (2026-10-12): `color:blue;color:rgb(255,0,0`는 빨강이다.
 * - 주석은 버린다.
 *
 * 표기: 함수는 `이름(…)`, 블록은 `(…)`·`[…]`·`{…}`, 입력 끝에서 닫힌 것은
 * 닫는 글자 대신 `…`로 끝난다. 토큰은 `tokens.test.ts`와 같은 표기다.
 */
import { describe, expect, it } from "vitest";

import {
  type CssComponentValue,
  parseCssComponentValues,
} from "../src/css/component-values.js";
import { tokenizeCss } from "../src/css/tokens.js";

/** component value 하나를 표기로 바꾼다. */
const show = (value: CssComponentValue): string => {
  switch (value.type) {
    case "function":
      return `${value.name}(${showList(value.value)}${value.closed ? ")" : "…"}`;
    case "block": {
      const close = { "(": ")", "[": "]", "{": "}" }[value.open];
      return `${value.open}${showList(value.value)}${value.closed ? close : "…"}`;
    }
    case "whitespace":
      return " ";
    case "ident":
    case "delim":
      return value.value;
    case "number":
      return `${value.value}`;
    case "comma":
      return ",";
    case "semicolon":
      return ";";
    default:
      return value.type;
  }
};

/** component value 목록을 이어 붙인 표기로 바꾼다. */
const showList = (values: readonly CssComponentValue[]): string =>
  values.map(show).join("");

/** 입력을 토큰화해 묶은 표기다. */
const parse = (input: string): string =>
  showList(parseCssComponentValues(tokenizeCss(input)));

describe("parseCssComponentValues", () => {
  it.each<[string, string]>([
    ["rgb(1 2 3) red", "rgb(1 2 3) red"],
    ["var(--x, (1 [2]))", "var(--x, (1 [2]))"],
    ["a{b;c}d", "a{b;c}d"],
    ["([)]", "([)]…"],
    ["(]", "(]…"],
    ["a)b", "a)b"],
    ["]", "]"],
    ["rgb(255,0,0", "rgb(255,0,0…"],
    ["f(g(", "f(g(……"],
    ["a/**/b", "ab"],
    ["(/*)*/)", "()"],
  ])("%j은 %j다", (input, expected) => {
    expect(parse(input)).toBe(expected);
  });

  it("함수와 블록은 여는 토큰부터 닫는 토큰까지의 원문 위치를 갖는다", () => {
    expect(parseCssComponentValues(tokenizeCss("a rgb(1) [b"))).toMatchObject([
      { type: "ident" },
      { type: "whitespace" },
      { type: "function", name: "rgb", start: 2, end: 8, closed: true },
      { type: "whitespace" },
      { type: "block", open: "[", start: 9, end: 11, closed: false },
    ]);
  });

  it("토큰 범위만 묶는다", () => {
    const tokens = tokenizeCss("a;f(b;c);d");
    expect(showList(parseCssComponentValues(tokens, 2, 7))).toBe("f(b;c)");
  });

  it("1만 단 중첩에서도 호출 스택이 넘치지 않는다", () => {
    const depth = 10_000;
    const values = parseCssComponentValues(tokenizeCss("(".repeat(depth)));
    let level = 0;
    let current: readonly CssComponentValue[] = values;
    while (current.length === 1 && current[0]?.type === "block") {
      level += 1;
      current = current[0].value;
    }
    expect(level).toBe(depth);
  });
});
