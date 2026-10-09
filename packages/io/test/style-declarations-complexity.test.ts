/**
 * `parseInlineStyleMarks`가 style 입력 길이에 선형임을 시간이 아니라
 * 관측 가능한 작업량으로 고정한다(G-TST-004).
 *
 * 파서는 `String.prototype`의 문자열 메서드(split·indexOf·slice·trim 등)만으로
 * 입력을 읽는다. 그 메서드를 감싸 두 축을 센다.
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
 * 한계: 정규식 엔진 내부 작업은 이 계측에 잡히지 않는다. 파서는
 * `!important` 제거와 선언 분리에 정규식을 쓰지 않는다(공백 run 입력에서
 * 이차 시간이 되는 `\s*!important\s*$` 형태를 피했다).
 */
import { afterEach, describe, expect, it } from "vitest";

import { parseInlineStyleMarks } from "../src/clipboard/style-declarations.js";

const INSTRUMENTED_METHODS = [
  "split",
  "indexOf",
  "lastIndexOf",
  "slice",
  "substring",
  "trim",
  "trimStart",
  "trimEnd",
  "toLowerCase",
  "toUpperCase",
  "startsWith",
  "endsWith",
  "includes",
  "charAt",
  "charCodeAt",
  "codePointAt",
  "at",
  "replace",
  "replaceAll",
  "match",
  "matchAll",
  "search",
] as const;

type Workload = { calls: number; chars: number };

type StringMethod = (this: string, ...args: unknown[]) => unknown;

const originals = new Map<string, PropertyDescriptor>();

const restoreStringMethods = (): void => {
  for (const [name, descriptor] of originals) {
    Object.defineProperty(String.prototype, name, descriptor);
  }
  originals.clear();
};

/**
 * 파서 한 번 호출 동안 String.prototype 메서드 호출 횟수와 수신 문자열 길이
 * 합을 센다. 계측 코드는 `.length`와 숫자 덧셈만 쓴다 — 계측된 메서드를
 * 부르면 자기 호출까지 세어 결과가 오염된다.
 */
const measureWorkload = (style: string): Workload => {
  const workload: Workload = { calls: 0, chars: 0 };

  for (const name of INSTRUMENTED_METHODS) {
    const descriptor = Object.getOwnPropertyDescriptor(String.prototype, name);
    if (descriptor === undefined) continue;
    originals.set(name, descriptor);
    const original = descriptor.value as StringMethod;
    Object.defineProperty(String.prototype, name, {
      ...descriptor,
      value: function (this: string, ...args: unknown[]) {
        workload.calls += 1;
        workload.chars += this.length;
        return original.apply(this, args);
      },
    });
  }

  try {
    parseInlineStyleMarks(style);
  } finally {
    restoreStringMethods();
  }
  return workload;
};

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
