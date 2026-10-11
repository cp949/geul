/**
 * `tokenizeCss`와 `parseCssComponentValues`가 입력 길이에 선형임을 작업량으로
 * 고정한다(G-TST-004, Issue #368).
 *
 * 두 축을 센다.
 * 1. 대괄호 읽기 수: 토크나이저는 입력을 `value[index]`로만 읽는다. `new
 *    String(value)`를 Proxy로 감싸 숫자 키 읽기를 센다(`countIndexReads`).
 *    토큰마다 앞에서부터 다시 읽는 회귀는 읽기 수가 제곱으로 뛴다.
 * 2. String 메서드 처리 문자 수: 호출마다 수신 문자열 길이를 더한다
 *    (`measureStringWorkload`). 토큰마다 큰 입력을 `slice`하는 회귀는 호출
 *    횟수가 선형이어도 처리 문자 수가 제곱으로 뛴다. 정상 구현은 큰 입력에
 *    String 메서드를 부르지 않는다. 작은 토큰 값에만 부른다.
 *
 * 크기 N과 2N 입력에서 증가율이 `MAX_GROWTH`(2.05) 이하여야 한다. 선형
 * 구현도 입력 끝에서 앞보기가 줄어 증가율이 2를 아주 조금 넘는다(실측
 * 2.000006). 제곱 회귀는 4에 가깝고, N log N 회귀도 이 크기에서 약 2.14다.
 * 기계 속도와 동시 실행 부하에 의존하지 않는다.
 *
 * 변이로 확인한 RED(2026-10-12):
 * - 토큰 원문을 만들 때 입력 시작부터 다시 읽으면 대괄호 읽기가 상한을 넘어
 *   던진다.
 * - 토큰 원문을 `input.slice(start, position)`으로 만들면 처리 문자 수 증가율이
 *   4에 가깝다.
 */
import { afterEach, describe, expect, it } from "vitest";

import { parseCssComponentValues } from "../src/css/component-values.js";
import { tokenizeCss } from "../src/css/tokens.js";
import {
  countIndexReads,
  measureStringWorkload,
  restoreStringMethods,
} from "./string-workload-support.js";

const BASE_SIZE = 20_000;
const MAX_GROWTH = 2.05;

afterEach(() => {
  restoreStringMethods();
});

/** 토큰화와 component value 묶기를 한 번에 돌린다. */
const run = (input: string): void => {
  parseCssComponentValues(tokenizeCss(input));
};

const inputShapes: Array<[string, (size: number) => string]> = [
  ["긴 이름 하나", (size) => "a".repeat(size)],
  ["짧은 이름이 아주 많은 입력", (size) => "a ".repeat(size)],
  ["긴 문자열", (size) => `"${"a".repeat(size)}"`],
  ["개행으로 끝나는 문자열이 많은 입력", (size) => '"a\n'.repeat(size)],
  ["긴 url", (size) => `url(${"a".repeat(size)})`],
  ["남은 글자가 긴 나쁜 url", (size) => `url(a b${"c".repeat(size)}`],
  ["이스케이프가 많은 이름", (size) => "\\61".repeat(size)],
  ["긴 주석", (size) => `/*${"a".repeat(size)}*/`],
  ["긴 숫자", (size) => "1".repeat(size)],
  ["깊은 괄호 중첩", (size) => "(".repeat(size)],
  ["함수가 많은 입력", (size) => "f(".repeat(size)],
  ["세미콜론만 많은 입력", (size) => ";".repeat(size)],
  ["CRLF가 많은 입력", (size) => "\r\n".repeat(size)],
  ["surrogate 쌍이 많은 이름", (size) => "\u{1f600}".repeat(size)],
  ["hash가 많은 입력", (size) => "#a ".repeat(size)],
  ["대문자 url 함수가 많은 입력", (size) => "URL(a)".repeat(size)],
];

describe("tokenizeCss의 대괄호 읽기", () => {
  it.each(inputShapes)(
    "%s은 크기가 2배가 되면 대괄호 읽기가 2배 이하로 는다",
    (_name, build) => {
      const smallInput = build(BASE_SIZE);
      const small = countIndexReads(smallInput, run);
      const large = countIndexReads(build(BASE_SIZE * 2), run);

      // 입력을 끝까지 읽었는지 확인한다. 아래 비율 단언이 공허하지 않게 한다.
      expect(small).toBeGreaterThanOrEqual(smallInput.length);
      expect(large / small, "대괄호 읽기 증가율").toBeLessThanOrEqual(
        MAX_GROWTH,
      );
    },
  );
});

describe("tokenizeCss의 String 메서드 작업량", () => {
  it.each(inputShapes)(
    "%s은 크기가 2배가 되면 처리 문자 수가 2배 이하로 는다",
    (_name, build) => {
      const smallInput = build(BASE_SIZE);
      const largeInput = build(BASE_SIZE * 2);
      const small = measureStringWorkload(() => run(smallInput));
      const large = measureStringWorkload(() => run(largeInput));

      // 정상 구현은 큰 입력에 String 메서드를 부르지 않는다. 호출이 없으면
      // 큰 입력에서도 없어야 한다.
      if (small.chars === 0) {
        expect(large.chars).toBe(0);
        return;
      }
      expect(
        large.chars / small.chars,
        "처리 문자 수 증가율",
      ).toBeLessThanOrEqual(MAX_GROWTH);
      expect(large.calls / small.calls, "호출 횟수 증가율").toBeLessThanOrEqual(
        MAX_GROWTH,
      );
    },
  );
});
