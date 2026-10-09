/**
 * `parseInlineStyleMarks`와 `parseStyleDeclarations`가 style 입력 길이에
 * 선형임을 시간이 아니라 관측 가능한 작업량으로 고정한다(G-TST-004).
 *
 * 두 파서는 큰 문자열을 `String.prototype`의 문자열 메서드(split·indexOf·slice·
 * trim 등)로 읽는다. 그 메서드를 감싸 두 축을 센다.
 * 1. 호출 횟수: 선언마다 다시 훑는 형태(이미 읽은 조각을 되돌아가 재처리)는
 *    호출 횟수가 선언 수의 제곱으로 뛴다.
 * 2. 처리 문자 수: 호출마다 수신 문자열의 길이를 더한다. 긴 문자열 전체를
 *    선언마다 다시 처리하거나, 긴 값을 위치마다 잘라 보는 형태는 호출 횟수가
 *    선형이어도 처리 문자 수가 제곱으로 뛴다. 호출 횟수만 세면 놓친다.
 *
 * 크기 N과 2N 입력의 작업량 증가율이 2 이하여야 한다. 입력 모양은 네 가지다.
 * 선언이 아주 많은 입력, 값이 긴 알파벳 run인 입력, `;`가 없는 긴 입력,
 * 공백·토큰이 긴 입력이다. 기계 속도와 동시 실행 부하에 의존하지 않는다.
 *
 * 한계: 정규식 엔진 내부 작업과 대괄호로 글자를 읽는 루프(`parseStyleDeclarations`의
 * 선언 분할기)는 이 계측에 잡히지 않는다.
 * `parseInlineStyleMarks`는 `!important` 제거와 선언 분리에 정규식을 쓰지
 * 않는다(공백 run 입력에서 이차 시간이 되는 `\s*!important\s*$` 형태를
 * 피했다). `parseStyleDeclarations`의 옛 정규식 구현은 `:`가 없는 알파벳
 * run에서 이차 시간이었지만 `matchAll` 호출 1회라 이 계측의 증가율이
 * 2로 보였다. 그래서 `parseStyleDeclarations`에는 이 작업량 테스트에 더해
 * 시간 상한 테스트를 하나 둔다.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  parseInlineStyleMarks,
  parseStyleDeclarations,
  parseWhiteSpaceMode,
} from "../src/clipboard/style-declarations.js";
import {
  measureStringWorkload,
  restoreStringMethods,
  type StringWorkload,
} from "./string-workload-support.js";

const measureWorkload = (style: string): StringWorkload =>
  measureStringWorkload(() => {
    parseInlineStyleMarks(style);
  });

afterEach(restoreStringMethods);

const BASE_SIZE = 20_000;

const inputShapes: Array<[string, (size: number) => string]> = [
  ["선언이 아주 많은 입력", (size) => "font-weight:700;".repeat(size)],
  [
    "값이 긴 알파벳 run인 입력",
    (size) => `font-weight:${"a".repeat(size * 16)}`,
  ],
  ["`;`와 `:`가 없는 긴 입력", (size) => "a".repeat(size * 16)],
  [
    "공백·토큰이 긴 입력",
    (size) =>
      `text-decoration:${"underline ".repeat(size)}!important;font-style:${" ".repeat(size * 16)}italic`,
  ],
];

describe("parseInlineStyleMarks의 선형 시간", () => {
  it.each(inputShapes)(
    "%s은 크기가 2배가 되면 호출 횟수와 처리 문자 수가 2배 이하로 는다",
    (_name, build) => {
      const small = measureWorkload(build(BASE_SIZE));
      const large = measureWorkload(build(BASE_SIZE * 2));

      // 계측이 실제로 일을 셌는지 확인한다. 0이면 아래 비율 단언이 공허하다.
      expect(small.calls).toBeGreaterThan(0);
      expect(small.chars).toBeGreaterThanOrEqual(BASE_SIZE);

      expect(large.calls / small.calls, "호출 횟수 증가율").toBeLessThanOrEqual(
        2,
      );
      expect(
        large.chars / small.chars,
        "처리 문자 수 증가율",
      ).toBeLessThanOrEqual(2);
    },
  );

  it("계측이 끝나면 String.prototype 메서드를 원래대로 되돌린다", () => {
    const before = String.prototype.slice;
    measureWorkload("font-weight:700");
    expect(String.prototype.slice).toBe(before);
  });
});

const declarationInputShapes: Array<[string, (size: number) => string]> = [
  ["선언이 아주 많은 입력", (size) => "color:#ff0000;".repeat(size)],
  ["값이 긴 알파벳 run인 입력", (size) => `color:${"a".repeat(size)}`],
  ["`;`와 `:`가 없는 긴 입력", (size) => "a".repeat(size)],
  [
    "공백·토큰이 긴 입력",
    (size) =>
      `background:${" ".repeat(size * 16)}#fff;color:${"x ".repeat(size)}: text-align :${" ".repeat(size)}left`,
  ],
  // 아래는 색 값 문법(Issue #333)이 만든 입력 모양이다. 선언 분할은 괄호·
  // 따옴표·주석 상태를 한 번 훑고, 색 읽기는 큰 문자열에 String 메서드를
  // 반복해 부르지 않는다.
  [
    "괄호 안 세미콜론이 많은 입력",
    (size) => `background:url(${";".repeat(size)}) red`,
  ],
  ["주석이 많은 입력", (size) => `${"/**/".repeat(size)}color:red`],
  [
    "주석 안 세미콜론이 많은 입력",
    (size) => `color:red/*${";".repeat(size)}*/;background:blue`,
  ],
  [
    "background 토큰이 많은 입력",
    (size) => `background:${"no-repeat ".repeat(size)}red`,
  ],
  [
    "background 레이어가 많은 입력",
    (size) => `background:${"none,".repeat(size)}red`,
  ],
  [
    "background 괄호 토큰이 많은 입력",
    (size) => `background:${"url(a.png) ".repeat(size)}red`,
  ],
  ["색 함수 인자가 많은 입력", (size) => `color:rgb(${"1,".repeat(size)}1)`],
  [
    "색 함수 공백이 긴 입력",
    (size) => `color:rgb(${" ".repeat(size * 16)}1 2 3)`,
  ],
  [
    "색 함수 숫자가 긴 입력",
    (size) => `color:rgb(${"1".repeat(size * 16)},0,0)`,
  ],
  [
    "닫히지 않은 괄호와 따옴표가 많은 입력",
    (size) => `color:red;background:url("${"a;(".repeat(size)}`,
  ],
  [
    "선언이 많고 !important가 반복된 입력",
    (size) => `color:red${" !important".repeat(size)};`.repeat(2),
  ],
  [
    "!important 선언이 아주 많은 입력",
    (size) => "color:#ff0000 !important;".repeat(size),
  ],
];

describe("parseStyleDeclarations의 선형 시간", () => {
  it.each(declarationInputShapes)(
    "%s은 크기가 2배가 되면 호출 횟수와 처리 문자 수가 2배 이하로 는다",
    (_name, build) => {
      const small = measureStringWorkload(() => {
        parseStyleDeclarations(build(BASE_SIZE));
      });
      const large = measureStringWorkload(() => {
        parseStyleDeclarations(build(BASE_SIZE * 2));
      });

      // 계측이 실제로 일을 셌는지 확인한다. 0이면 아래 비율 단언이 공허하다.
      expect(small.calls).toBeGreaterThan(0);
      expect(small.chars).toBeGreaterThanOrEqual(BASE_SIZE);

      expect(large.calls / small.calls, "호출 횟수 증가율").toBeLessThanOrEqual(
        2,
      );
      expect(
        large.chars / small.chars,
        "처리 문자 수 증가율",
      ).toBeLessThanOrEqual(2);
    },
  );

  // 작업량 계측은 정규식 엔진 내부의 되돌아가기(backtracking)를 세지 못한다.
  // 옛 구현은 `:`가 없는 알파벳 run에서 시작 위치마다 끝까지 매칭했다가
  // 되돌아가 이차 시간이었고, 계측에는 `matchAll` 호출 1회로 보였다. 그
  // 구현으로 되돌리는 변이를 잡으려고 시간 상한을 하나 둔다. 이슈 실측은
  // 80,000자에서 6.6초였고 선형 구현은 밀리초 단위다. 둘이 겹치지 않도록
  // 상한은 1초로 잡는다. 느린 기계나 병렬 부하의 지터는 이 간격이 흡수하고,
  // 이 상한은 심각한 붕괴만 잡는다.
  // 실측(Node, 2026-10-09): 옛 구현 6.46–6.53초. 선형 구현은 단독 1ms,
  // io 전체 병렬 실행에서 최대 14ms다. 상한과 최대 사이가 약 70배다.
  it("`:`가 없는 알파벳 run 80,000자를 1초 안에 읽는다", () => {
    const style = "a".repeat(80_000);

    const started = performance.now();
    const result = parseStyleDeclarations(style);
    const elapsed = performance.now() - started;

    expect(result).toEqual({});
    expect(elapsed).toBeLessThan(1000);
  });

  // 선언 분할기는 글자를 대괄호로 읽어 위 계측(String 메서드 호출 수와 수신
  // 문자열 길이)에 보이지 않는다. 괄호·따옴표·주석이 열려 있는 동안 조각마다
  // 앞부분을 처음부터 다시 훑는 변이는 두 비율이 1과 2로 남아 통과한다.
  // 그 변이를 잡으려고 시간 상한을 둔다. 80,000개 조각에서 그 변이는 입력이
  // 2배가 될 때마다 시간이 약 4배다.
  // 실측(Node, 2026-10-10, 80,000개): 재순회 변이는 괄호 안 `;` 1.3–9.7초,
  // 닫히지 않은 괄호·따옴표 3.9–30.8초다(변이 세기에 따라 다르다). 선형
  // 구현은 33개 병적 모양 최대 68ms다. 상한 1초는 이 최대보다 약 15배 크고
  // 가장 약한 변이보다 작아, 둘이 겹치지 않는다.
  it.each([
    ["괄호 안 세미콜론", `background:url(${";".repeat(80_000)}) red`],
    [
      "닫히지 않은 괄호와 따옴표",
      `color:red;background:url("${"a;(".repeat(80_000)}`,
    ],
  ])("%s 80,000개를 1초 안에 읽는다", (_name, style) => {
    const started = performance.now();
    parseStyleDeclarations(style);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(1000);
  });
});

const whiteSpaceInputShapes: Array<[string, (size: number) => string]> = [
  ["선언이 아주 많은 입력", (size) => "white-space:pre;".repeat(size)],
  [
    "값이 긴 알파벳 run인 입력",
    (size) => `white-space:${"a".repeat(size * 16)}`,
  ],
  ["`;`와 `:`가 없는 긴 입력", (size) => "a".repeat(size * 16)],
  [
    "공백이 긴 입력",
    (size) =>
      `white-space:${" ".repeat(size * 16)}pre${" ".repeat(size)}!important`,
  ],
];

describe("parseWhiteSpaceMode의 선형 시간", () => {
  it.each(whiteSpaceInputShapes)(
    "%s은 크기가 2배가 되면 호출 횟수와 처리 문자 수가 2배 이하로 는다",
    (_name, build) => {
      const small = measureStringWorkload(() => {
        parseWhiteSpaceMode(build(BASE_SIZE));
      });
      const large = measureStringWorkload(() => {
        parseWhiteSpaceMode(build(BASE_SIZE * 2));
      });

      // 계측이 실제로 일을 셌는지 확인한다. 0이면 아래 비율 단언이 공허하다.
      expect(small.calls).toBeGreaterThan(0);
      expect(small.chars).toBeGreaterThanOrEqual(BASE_SIZE);

      expect(large.calls / small.calls, "호출 횟수 증가율").toBeLessThanOrEqual(
        2,
      );
      expect(
        large.chars / small.chars,
        "처리 문자 수 증가율",
      ).toBeLessThanOrEqual(2);
    },
  );
});
