/**
 * 선언 판독기(`readInlineStyleMarks`·`readStyleDeclarations`·
 * `readWhiteSpaceMode`·`hasComputedStyleDump`·`readDumpAuthorDeclarations`)와
 * 그 앞단 `parseCssDeclarations`가 style 입력 길이에 선형임을 시간이 아니라
 * 관측 가능한 작업량으로 고정한다(G-TST-004, Issue #368).
 *
 * 선언 분리는 css/ 토크나이저가 맡는다. 토크나이저는 입력을 `value[index]`로만
 * 읽는다. 판독기는 선언 목록을 받는다. 테스트는 `style-declarations-support.ts`
 * 래퍼로 `style` 문자열을 넣는다. 두 축을 센다.
 * 1. String 메서드 작업량: 호출 횟수와 수신 문자열 길이 합
 *    (`measureStringWorkload`). 정상 구현은 큰 입력에 String 메서드를 부르지
 *    않는다. 작은 입력에서 작업량이 0이면 큰 입력에서도 0이어야 한다. 0이
 *    아니면 증가율이 `MAX_GROWTH` 이하여야 한다.
 * 2. 대괄호 읽기 수: `new String(value)`를 Proxy로 감싸 숫자 키 읽기를 센다
 *    (`countIndexReads`). 읽기 수가 입력 길이 이상이고 증가율이 `MAX_GROWTH`
 *    이하여야 한다. Proxy 계측은 느려 작은 크기(`READ_SIZE`)로 돌린다.
 *
 * 크기 N과 2N 입력의 증가율을 비교한다. 입력 모양은 선언이 아주 많은 입력,
 * 값이 긴 알파벳 run인 입력, `;`가 없는 긴 입력, 공백·토큰이 긴 입력과 font
 * 줄임, 선언 분리(닫히지 않은 따옴표·괄호, 개행이 끝내는 따옴표, `[`·`{`
 * 블록, 따옴표 없는 `url(` 토큰), text-decoration·font-style 값 판정이 만드는
 * 모양이다. 기계 속도와 동시 실행 부하에 의존하지 않는다.
 *
 * 한계: 정규식 엔진 내부 작업은 계측에 잡히지 않는다.
 * - 대괄호 읽기 축은 `parseCssDeclarations`가 입력을 읽는 만큼만 센다. 판독기는
 *   입력 글자를 읽지 않고 선언 값(component value)을 읽는다.
 * - `readInlineStyleMarks`의 font 줄임 판독은 `font 줄임 속성 판독기의 component
 *   읽기` 절이 센다. 선언 값 배열을 Proxy로 감싸 정수 키 읽기를 센다.
 * - `readDecoration`·`readFontStyle`의 순회(`findNestedFunctions` 포함)는 이
 *   계측에 보이지 않고 `readInlineStyleMarks` 시간 상한 테스트와 깊은 중첩 모양이
 *   덮는다(Issue #363·#366·#367·#368). 순회를 토큰마다 다시 시작하는 변이는 시간
 *   상한 행이 끝나지 않아 잡힌다. 재귀 순회 변이는 깊은 중첩 모양이 호출 스택
 *   초과로 잡는다.
 * - 색·background 판독기(css-color.ts)는 함수 안 component까지 읽는다. 선언
 *   값 배열만 감싸는 계측은 함수 안쪽을 못 본다. `색·background 판독기의
 *   component 읽기` 절이 함수 안 배열까지 감싼다.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  readInlineStyleMarks,
  readStyleDeclarations,
  readWhiteSpaceMode,
} from "../src/clipboard/style-declarations.js";
import type { CssComponentValue } from "../src/css/component-values.js";
import {
  type CssDeclaration,
  parseCssDeclarations,
} from "../src/css/declarations.js";
import {
  countIndexReads,
  MAX_READS_PER_CHAR,
  measureStringWorkload,
  restoreStringMethods,
  type StringWorkload,
} from "./string-workload-support.js";
import {
  hasComputedStyleDump,
  parseInlineStyleMarks,
  parseStyleDeclarations,
  parseWhiteSpaceMode,
  readDumpAuthorDeclarations,
} from "./style-declarations-support.js";

const measureWorkload = (style: string): StringWorkload =>
  measureStringWorkload(() => {
    parseInlineStyleMarks(style);
  });

afterEach(restoreStringMethods);

const BASE_SIZE = 20_000;

const MAX_GROWTH = 2.05;

/**
 * String 메서드 작업량(호출 횟수·처리 문자 수)이 입력 크기에 선형인지 본다.
 * 선언 읽기는 입력을 대괄호로만 읽는다(Issue #368). 큰 입력에 String 메서드를
 * 부르지 않는 것이 정상이다. 작은 입력에서 작업량이 0이면 큰 입력에서도 0이어야
 * 한다. 0이 아니면 증가율을 비교한다.
 */
const expectLinearStringWork = (
  run: (style: string) => unknown,
  build: (size: number) => string,
): void => {
  const small = measureStringWorkload(() => {
    run(build(BASE_SIZE));
  });
  const large = measureStringWorkload(() => {
    run(build(BASE_SIZE * 2));
  });

  if (small.chars === 0) {
    expect(large.calls).toBe(0);
    expect(large.chars).toBe(0);
    return;
  }
  expect(large.calls / small.calls, "호출 횟수 증가율").toBeLessThanOrEqual(
    MAX_GROWTH,
  );
  expect(large.chars / small.chars, "처리 문자 수 증가율").toBeLessThanOrEqual(
    MAX_GROWTH,
  );
};

// Proxy 계측은 느리다(입력 32만 자에 1.9초). 대괄호 읽기 축은 작은 크기로 돌린다.
const READ_SIZE = BASE_SIZE / 8;

/**
 * 대괄호 읽기 수(`value[index]`)가 입력 크기에 선형인지 본다. 토크나이저가
 * 입력을 읽는 방식이라 String 메서드 계측에 보이지 않는다. 읽기 수가 입력
 * 길이 이상이어야 입력을 끝까지 읽은 것이다.
 */
const expectLinearIndexReads = (
  run: (style: string) => unknown,
  build: (size: number) => string,
): void => {
  const smallInput = build(READ_SIZE);
  const small = countIndexReads(smallInput, (proxy) => {
    run(proxy);
  });
  const large = countIndexReads(build(READ_SIZE * 2), (proxy) => {
    run(proxy);
  });

  expect(small).toBeGreaterThanOrEqual(smallInput.length);
  expect(large / small, "대괄호 읽기 증가율").toBeLessThanOrEqual(MAX_GROWTH);
};

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
  // 아래는 선언 분리와 값 판정(Issue #339)이 만든 입력 모양이다. 분할기는
  // 따옴표·괄호·주석 상태를 한 번 훑는다. text-decoration·font-style 값은
  // 토큰마다 일정한 일만 하고 무효를 찾는 즉시 끝낸다.
  // 변이로 확인한 RED다(Issue #339, 실측 2026-10-11). `readDecoration`이 토큰마다
  // 값 전체를 훑게 하는 변이(값의 모든 토큰에 `value.includes(token)`)는
  // text-decoration 토큰 모양 셋과 "공백·토큰이 긴 입력"이 처리 문자 수 증가율
  // 3.999로 잡는다. 호출 횟수 증가율은 2라서 처리 문자 수 축이 필요하다.
  // 무효를 찾는 즉시 끝내므로 값이 길어도 정상 구현은 토큰 몇 개만 본다.
  [
    "닫히지 않은 따옴표로 끝까지 이어지는 입력",
    (size) =>
      `font-weight:bold;font-family:'${"a;font-style:italic;".repeat(size)}`,
  ],
  [
    "닫히지 않은 괄호가 깊게 쌓이는 입력",
    (size) => `font-style:italic;font-family:${"(;".repeat(size)}`,
  ],
  [
    "괄호 안 세미콜론이 많은 입력",
    (size) => `font-weight:bold;font-family:url(${";".repeat(size)}) red`,
  ],
  ["주석이 많은 입력", (size) => `${"/**/".repeat(size)}font-weight:bold`],
  // 아래는 개행이 끝내는 따옴표(Issue #362)가 만든 입력 모양이다. bad 선언은
  // 조각마다 끝나고, 이스케이프된 개행은 열린 따옴표를 끝까지 잇는다.
  // 변이로 확인한 RED다(Issue #362, 실측 2026-10-11). 두 변이 모두 기존
  // 모양은 통과하고 새 모양만 처리 문자 수 증가율 3.999로 잡는다. 다섯 함수
  // 묶음이 모두 잡는다.
  // - bad 선언을 버릴 때마다 입력 전체에 `style.lastIndexOf("'")`를 부르는
  //   변이는 "개행에서 끝나는 따옴표가 아주 많은 입력"이 잡는다.
  // - 열린 따옴표 조각이 개행으로 끝날 때마다 `pending.trimEnd()`를 부르는
  //   변이는 "닫히지 않은 따옴표 뒤 이스케이프된 개행이 아주 많은 입력"이 잡는다.
  [
    "개행에서 끝나는 따옴표가 아주 많은 입력",
    (size) => `font-weight:bold;font-family:${"'a\n;".repeat(size)}`,
  ],
  [
    "닫히지 않은 따옴표 뒤 이스케이프된 개행이 아주 많은 입력",
    (size) => `font-weight:bold;font-family:'${"\\\n;\\\r\n;".repeat(size)}`,
  ],
  // 아래는 종류별 블록 스택(Issue #365)이 만든 입력 모양이다. 분할기는
  // 닫는 글자를 스택 맨 위와만 비교한다. 스택은 배열이라 이 계측에 보이지
  // 않는다. 스택 재순회 변이는 아래 시간 상한의 깊은 `[` 스택 행이 잡는다.
  [
    "닫히지 않은 `[`·`{`가 깊게 쌓이는 입력",
    (size) => `font-style:italic;font-family:${"[;{;".repeat(size)}`,
  ],
  [
    "`[` 블록 안 세미콜론이 많은 입력",
    (size) => `font-weight:bold;font-family:[${";".repeat(size)}]`,
  ],
  [
    "`[` 블록 안 짝 안 맞는 닫는 괄호가 많은 입력",
    (size) => `font-weight:bold;font-family:[${")};".repeat(size)}`,
  ],
  // 아래는 따옴표 없는 `url(` 토큰(Issue #364)이 만든 입력 모양이다. 분할기는
  // `url(`을 만나면 `)`를 앞으로 찾지 않고 글자마다 상태만 바꾼다. 닫는 `)`를
  // 앞으로 찾는 변이는 닫히지 않은 `url(`이 많은 입력에서 이차 시간이다.
  [
    "닫는 `)` 없는 `url(`이 아주 많은 입력",
    (size) => `font-weight:bold;font-family:${"url(a'".repeat(size)}`,
  ],
  [
    "`url(` 토큰 안 세미콜론이 아주 많은 입력",
    (size) => `font-weight:bold;font-family:url(${";".repeat(size)})`,
  ],
  [
    "`url(` 뒤 공백 run이 아주 긴 입력 뒤 따옴표",
    (size) => `font-weight:bold;font-family:url(${" ".repeat(size)}'a;b')`,
  ],
  [
    "text-decoration 토큰이 아주 많은 입력",
    (size) => `text-decoration:${"underline ".repeat(size)}`,
  ],
  [
    "text-decoration 서로 다른 토큰이 아주 많은 입력",
    (size) => `text-decoration:underline ${"red wavy ".repeat(size)}`,
  ],
  [
    "text-decoration-line 토큰이 아주 많은 입력",
    (size) => `text-decoration-line:${"blink ".repeat(size)}`,
  ],
  [
    "text-decoration 값 앞 공백이 긴 입력",
    (size) => `text-decoration:${" ".repeat(size * 16)}underline`,
  ],
  [
    "text-decoration 토큰 사이 공백이 긴 입력",
    (size) => `text-decoration:underline${" ".repeat(size * 16)}red`,
  ],
  [
    "text-decoration 긴 토큰 하나인 입력",
    (size) => `text-decoration:underline ${"a".repeat(size * 16)}`,
  ],
  [
    "text-decoration 긴 숫자 토큰 하나인 입력",
    (size) => `text-decoration:underline ${"1".repeat(size * 16)}px`,
  ],
  [
    "text-decoration 색 함수 인자가 많은 입력",
    (size) => `text-decoration:underline rgb(${"1,".repeat(size)}1)`,
  ],
  [
    "text-decoration 괄호가 깊게 쌓이는 토큰 하나인 입력",
    (size) => `text-decoration:underline ${"(".repeat(size)}`,
  ],
  [
    "text-decoration 괄호 안 공백이 긴 토큰 하나인 입력",
    (size) => `text-decoration:underline calc(${"1px + ".repeat(size)}1px)`,
  ],
  // 아래는 치환 함수 탐색과 함수 토큰 분류(Issue #363)가 만든 입력 모양이다.
  // 치환 함수 탐색은 무효를 만났을 때 값마다 한 번 글자를 대괄호로 읽어서
  // 이 계측에 보이지 않는다. 토큰마다 값 처음부터 다시 훑는 변이는 아래 시간
  // 상한이 잡는다. 이 모양들은 토큰 분류와 함수 이름 판독이 String 메서드를
  // 반복해 부르지 않는지 센다.
  [
    "text-decoration 치환 토큰이 아주 많은 입력",
    (size) => `text-decoration:underline ${"var(--x) ".repeat(size)}`,
  ],
  [
    "text-decoration 긴 치환 토큰 하나인 입력",
    (size) => `text-decoration:underline var(--${"a".repeat(size * 16)})`,
  ],
  [
    "text-decoration 긴 색 함수 토큰 하나인 입력",
    (size) => `text-decoration:underline lab(${"1 ".repeat(size)}1)`,
  ],
  [
    "text-decoration 무효 뒤 긴 꼬리와 치환 함수가 있는 입력",
    (size) => `text-decoration:underline foo ${"x ".repeat(size)}var(--x)`,
  ],
  [
    "text-decoration 치환 함수 이름과 비슷한 글자가 많은 입력",
    (size) => `text-decoration:underline ${"avar(".repeat(size)}`,
  ],
  // 아래는 함수 토큰의 괄호 짝(Issue #366)이 만든 입력 모양이다. component value
  // 순회는 입력 글자를 읽지 않아 이 계측에 보이지 않는다. 이 모양들은 열림·
  // 닫힘·잉여 글자 각 분기가 String 메서드를 반복해 부르지 않는지 센다. 깊은
  // 중첩 두 모양은 재귀 순회 변이를 호출 스택 초과로 잡는다.
  [
    "text-decoration 열린 괄호가 아주 많은 함수 토큰 하나인 입력",
    (size) => `text-decoration:underline calc${"(".repeat(size)}`,
  ],
  [
    "text-decoration 닫히지 않은 함수 토큰의 인자가 긴 입력",
    (size) => `text-decoration:underline lab(${"1 ".repeat(size)}`,
  ],
  [
    "text-decoration 닫힌 뒤 잉여 글자가 긴 입력",
    (size) => `text-decoration:underline calc(1px)${"a".repeat(size * 16)}`,
  ],
  [
    "text-decoration 짝 맞는 중첩이 깊은 함수 토큰 하나인 입력",
    (size) =>
      `text-decoration:underline calc(${"(".repeat(size)}1px${")".repeat(size)})`,
  ],
  [
    "text-decoration 바깥 `)`가 값 끝에 있는 긴 입력",
    (size) => `text-decoration:underline ${"red ".repeat(size)})`,
  ],
  [
    "text-decoration 닫힌 뒤 잉여 글자가 붙은 치환 토큰이 긴 입력",
    (size) => `text-decoration:underline var(--x)${"a".repeat(size * 16)}`,
  ],
  // 아래는 사용자 정의 함수 호출 탐색(Issue #367)이 만든 입력 모양이다. 탐색은
  // component value를 읽어 이 계측에 보이지 않는다. 호출이 없는 입력은 탐색이
  // 값 끝까지 가므로 component마다 하는 일이 다 드러난다. 값 앞부분을 다시 읽는
  // 변이는 아래 시간 상한이 잡는다.
  [
    "text-decoration `--` 이름 run이 아주 많고 호출이 없는 입력",
    (size) => `text-decoration:underline ${"--f ".repeat(size)}`,
  ],
  [
    "text-decoration `--`로 시작하는 이름 run 하나가 긴 입력",
    (size) => `text-decoration:underline --${"a".repeat(size * 16)}`,
  ],
  [
    "text-decoration 호출이 값 맨 끝에 있는 긴 입력",
    (size) => `text-decoration:underline ${"red ".repeat(size)}--f(1px)`,
  ],
  [
    "text-decoration `-`만 이어지는 이름 run이 긴 입력",
    (size) => `text-decoration:underline ${"-".repeat(size * 16)}`,
  ],
  [
    "font-style 긴 각도 토큰 하나인 입력",
    (size) => `font-style:oblique ${"1".repeat(size * 16)}deg`,
  ],
  [
    "font-style 토큰이 아주 많은 입력",
    (size) => `font-style:${"italic ".repeat(size)}`,
  ],
  [
    "font-style 값 앞 공백이 긴 입력",
    (size) => `font-style:${" ".repeat(size * 16)}oblique 10deg`,
  ],
  // 아래는 font 줄임 속성(Issue #334)이 만든 입력 모양이다. 줄임 파서는
  // 값을 한 번 훑고 토큰·글꼴 이름마다 일정한 일만 한다.
  [
    "font 줄임 선언이 아주 많은 입력",
    (size) => "font:bold 12px Arial;".repeat(size),
  ],
  [
    "font 줄임 값이 긴 알파벳 run인 입력",
    (size) => `font:${"a".repeat(size * 16)}`,
  ],
  [
    "font 줄임 앞 토큰 사이 공백이 긴 입력",
    (size) => `font:bold${" ".repeat(size * 16)}12px Arial`,
  ],
  [
    "font 줄임 글꼴 목록이 긴 입력",
    (size) => `font:12px ${"a,".repeat(size)}a`,
  ],
  [
    "font 줄임 글꼴 식별자가 많은 입력",
    (size) => `font:12px ${"a ".repeat(size)}`,
  ],
  [
    "font 줄임 따옴표가 닫히지 않은 긴 입력",
    (size) => `font:12px "${"a ".repeat(size)}`,
  ],
  [
    "font 줄임 계산 함수 토큰이 긴 입력",
    (size) => `font:calc(${"1px + ".repeat(size)}1px) a`,
  ],
  ["font 줄임 쉼표만 많은 입력", (size) => `font:12px ${",".repeat(size)}`],
  [
    "font 줄임 앞 토큰이 아주 많은 입력",
    (size) => `font:${"bold ".repeat(size)}12px a`,
  ],
  [
    "font 줄임 line-height 토큰이 긴 입력",
    (size) => `font:12px/${"1".repeat(size * 16)} a`,
  ],
];

describe("parseInlineStyleMarks의 선형 시간", () => {
  it.each(inputShapes)(
    "%s은 크기가 2배가 되면 호출 횟수와 처리 문자 수가 2배 이하로 는다",
    (_name, build) => {
      expectLinearStringWork(parseInlineStyleMarks, build);
    },
  );

  it.each(inputShapes)(
    "%s은 크기가 2배가 되면 대괄호 읽기가 2배 이하로 는다",
    (_name, build) => {
      expectLinearIndexReads(parseInlineStyleMarks, build);
    },
  );

  it("계측이 끝나면 String.prototype 메서드를 원래대로 되돌린다", () => {
    const before = String.prototype.slice;
    measureWorkload("font-weight:700");
    expect(String.prototype.slice).toBe(before);
  });

  // 선언 분할기는 글자를 대괄호로 읽어 위 계측(String 메서드 호출 수와 수신
  // 문자열 길이)에 보이지 않는다. 괄호·따옴표가 열려 있는 동안 조각마다 앞부분을
  // 처음부터 다시 훑는 변이는 두 비율이 1과 2로 남아 통과한다. 그 변이를 잡으려고
  // parseStyleDeclarations와 같은 형태의 시간 상한을 둔다(PIT-0034). 상한은
  // 심각한 붕괴만 잡는 보조 장치이고, 결정적 작업량 단언은 위 모양들이 맡는다.
  // 실측(Node, 2026-10-11, 80,000개): 선형 구현은 단독 6–11ms다. 열린 pending을
  // 조각마다 `pending[k]`로 처음부터 다시 읽는 변이는 닫히지 않은 괄호와
  // 따옴표에서 2.3초이고(입력이 2배가 되면 시간이 약 3.4배), 같은 변이를 위
  // 작업량 모양 중 "닫히지 않은 따옴표로 끝까지 이어지는 입력"이 5초 제한
  // 초과로 잡는다. 상한 1초는 선형 구현의 최대보다 약 100배 크고 변이보다
  // 작아 둘이 겹치지 않는다. 읽은 값을 쓰지 않는 변이는 V8이 읽기를 지울 수
  // 있어 괄호 안 세미콜론 모양에서는 통과한다.
  // 변이로 확인한 RED다(Issue #365, 실측 Node, 2026-10-11, 80,000개).
  // 짝 안 맞는 닫는 글자마다 `state.closers.lastIndexOf(character)`로 스택
  // 전체를 훑는 변이는 깊은 `[` 스택 행이 28.0초로 잡는다. 정상 구현은 단독
  // 실행 테스트 시간 19ms다. 상한 1초는 그보다 약 50배 크고 변이보다 작아
  // 둘이 겹치지 않는다. 위 작업량 모양은 이 변이를 잡지 못한다.
  // 아래 치환 함수 두 행은 Issue #363이 더했다. 치환 함수 탐색
  // (`hasSubstitutionFunction`)은 무효를 만났을 때 값마다 한 번 글자를 대괄호로
  // 읽어서 위 String 메서드 계측에 보이지 않는다.
  // 변이로 확인한 RED다(Issue #363, 실측 Node, 2026-10-11, 80,000개).
  // - 치환 토큰마다 탐색을 값 처음부터 끝까지 다시 하는 변이는 "치환 토큰이
  //   아주 많고 끝이 무효" 행이 438.3초로 잡는다. 같은 변이를 위 "치환 토큰이
  //   아주 많은 입력" 모양이 5초 제한 초과로 잡는다(끝나기까지 117초).
  // - 이름 글자 run마다 값 앞부분을 처음부터 다시 읽는 변이는 "무효 토큰 뒤
  //   치환 함수 이름과 비슷한 글자" 행이 39.1초로 잡는다. `foo var(…`처럼 앞쪽에
  //   호출이 있는 입력은 탐색이 일찍 끝나 이 변이를 잡지 못해서, 이 행은 호출이
  //   없는 `avar(`를 쓴다.
  // - 치환 토큰을 `value.slice`로 잘라 보는 변이는 위 "치환 토큰이 아주 많은
  //   입력" 모양이 처리 문자 수 증가율 3.999로 잡는다. 계측이 호출마다 긴 값
  //   전체를 수신 문자열로 세기 때문이다. 그래서 치환 토큰은 자르지 않고
  //   대괄호로 읽어 판정한다.
  // 정상 구현은 단독 실행 테스트 시간 18–19ms와 41–42ms다. 상한 1초는 그보다
  // 약 24배 이상 크고 변이보다 작아 둘이 겹치지 않는다. 변이 RED는 오래 걸리므로
  // 이 두 행이 깨지면 실행이 수 분 걸릴 수 있다.
  // "치환 토큰이 아주 많고 끝이 잉여 글자" 행은 Issue #366이 더했다. 짝 판정
  // (`pairParens`)과 바깥 `)` 사전 검사(`hasStrayCloseParen`)는 글자를 대괄호로
  // 읽어서 위 String 메서드 계측에 보이지 않는다.
  // 변이로 확인한 RED다(Issue #366, 실측 Node, 2026-10-11, 80,000개).
  // - 사전 검사를 토큰마다 값 처음부터 다시 도는 변이는 이 행이 134.8초,
  //   "끝이 무효" 행이 135.1초로 잡는다. "치환 토큰이 아주 많은 입력" 모양도
  //   46.9초로 5초 제한 초과다.
  // - 짝 판정이 닫는 `)`를 찾은 뒤 토큰 끝이 아니라 값 끝까지 계속 읽는 변이는
  //   이 행이 72.0초, "끝이 무효" 행이 73.2초로 잡는다. 같은 모양이 22.6초로
  //   5초 제한 초과다.
  // 정상 구현은 단독 실행 테스트 시간 46–55ms다. 상한 1초는 그보다 약 18배
  // 크고 변이보다 작아 둘이 겹치지 않는다.
  // "호출 없이 `--` 이름 run이 아주 많은 입력" 행은 Issue #367이 더했다. 사용자
  // 정의 함수 호출 탐색(`hasCustomFunctionCall`)은 글자를 대괄호로 읽어서 위
  // String 메서드 계측에 보이지 않는다.
  // 변이로 확인한 RED다(Issue #367, 실측 Node, 2026-10-11, 80,000개).
  // - 이름 글자 run마다 값 앞부분(`value[0..index)`)을 처음부터 다시 읽는
  //   변이는 이 행이 26.7초로 잡는다. 위 작업량 모양 "`--` 이름 run이 아주
  //   많고 호출이 없는 입력"과 "호출이 값 맨 끝에 있는 긴 입력"도 각각 8.3초로
  //   5초 제한 초과다. 호출이 없는 입력이라야 탐색이 값 끝까지 가서 이 변이가
  //   드러난다. 다시 읽은 값은 조건에 써야 V8이 읽기를 지우지 못한다.
  // - 이름 글자 run마다 `value.slice(index, index + 2)`로 앞 두 글자를 보는
  //   변이는 시간이 아니라 위 작업량 모양이 잡는다. 두 모양의 처리 문자 수
  //   증가율이 각각 3.9988과 3.9987이다(상한 2). 이 행은 못 잡는다.
  // - 이름 글자 run 안에서 한 글자씩 다시 시작하는 변이(`index = runEnd` 대신
  //   `index += 1`)는 "호출 없이 `-` 글자만 이어지는 이름 run 하나의 글자" 행이
  //   10.8초로 잡는다. 이 변이는 run이 긴 입력에서만 이차이고 run이 하나라
  //   작업량 모양과 `--f ` 행은 못 잡는다.
  // 정상 구현은 단독 실행 테스트 시간 32–40ms다. 상한 1초는 그보다 약 25배
  // 크고 변이보다 작아 둘이 겹치지 않는다.
  // "닫는 `)` 없는 `url(`" 행은 Issue #364가 더했다. `url(`마다 닫는 `)`를 앞으로
  // 찾고(조각 끝까지 대괄호 루프) 못 찾으면 토큰으로 보지 않는 변이는 이 행이
  // 26.7초로 잡는다(실측 Node, 2026-10-11, 80,000개). 닫는 `)`가 없으면 `url(`
  // 80,000개가 각각 입력 끝까지 훑는다. 정상 구현은 단독 실행 테스트 시간 7ms다.
  // 대괄호 루프는 String 메서드 계측에 보이지 않는다. 같은 변이를
  // `piece.indexOf(")", index)`로 쓰면 위 작업량 모양 "닫는 `)` 없는 `url(`이 아주
  // 많은 입력"이 처리 문자 수 증가율 3.998–3.999로 잡는다(Issue #364, 상한 2).
  // Issue #368이 선언 분리를 `css/` 토크나이저로 옮겨 치환 토큰 두 행의 단독 실행
  // 시간이 늘었다(실측 Node, 2026-10-12, 80,000개: 276–294ms. 위에 적은 옛 시간
  // 46–55ms는 옛 분할기 시점이다). 토큰마다 객체와 원문을 만들기 때문이다. 부하가
  // 큰 `verify` 첫 실행에서 1117ms가 나와 상한 1초를 넘었다. 그래서 두 행은 개수를
  // 40,000개로 줄였다.
  // 변이로 확인한 RED다(2026-10-12, 40,000개). `readDecoration`의 토큰 루프 안에서
  // `hasStrayCloseParen(value)`를 토큰마다 다시 부르는 변이는 두 행이 41.0초와
  // 40.8초로 잡는다.
  // Issue #368 RD-003이 `readDecoration`을 component value 위로 옮겨, 위에 적은
  // 글자 스캐너(`hasSubstitutionFunction`·`pairParens`·`hasStrayCloseParen`·
  // `hasCustomFunctionCall`)는 없다. 위 변이 서술은 옛 구현 기준 이력이다. 같은 두
  // 행이 지금 잡는 변이는 `readDecoration`의 토큰 루프 안에서 `findNestedFunctions`를
  // 토큰마다 다시 부르는 것이다. 그 변이는 두 행이 끝나지 않아(300초 넘음, 실측
  // Node, 2026-10-12, 40,000개) 게이트가 시간 초과로 실패한다. 순회를 재귀로 바꾸는
  // 변이는 깊은 중첩 모양 다섯 행과 이 파일의 "무효 토큰 뒤 치환 함수 이름과 비슷한
  // 글자" 행이 호출 스택 초과로 잡는다.
  it.each([
    [
      "괄호 안 세미콜론",
      `font-weight:bold;font-family:url(${";".repeat(80_000)}) red`,
    ],
    [
      "닫히지 않은 괄호와 따옴표",
      `text-decoration:underline;font-family:url("${"a;(".repeat(80_000)}`,
    ],
    [
      "깊은 `[` 스택 뒤 짝 안 맞는 닫는 괄호",
      `font-weight:bold;font-family:${"[".repeat(80_000)}${");".repeat(80_000)}`,
    ],
    [
      "닫는 `)` 없는 `url(`",
      `font-weight:bold;font-family:${"url(a'".repeat(80_000)}`,
    ],
    [
      "무효 토큰 뒤 치환 함수 이름과 비슷한 글자",
      `text-decoration:underline foo ${"avar(".repeat(80_000)}`,
    ],
    [
      "치환 토큰 40,000개가 있고 끝이 무효",
      `text-decoration:underline ${"var(--x) ".repeat(40_000)}foo`,
    ],
    [
      "치환 토큰 40,000개가 있고 끝이 잉여 글자",
      `text-decoration:underline ${"var(--x) ".repeat(40_000)}var(--y)foo`,
    ],
    [
      "호출 없이 `--` 이름 run이 아주 많은 입력",
      `text-decoration:underline ${"--f ".repeat(80_000)}`,
    ],
    [
      "호출 없이 `-` 글자만 이어지는 이름 run 하나의 글자",
      `text-decoration:underline ${"-".repeat(80_000)}`,
    ],
  ])("%s 입력을 1초 안에 읽는다", (_name, style) => {
    const started = performance.now();
    parseInlineStyleMarks(style);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(1000);
  });
});

// `font:` 접두를 뗀 값 수준 모양이다. 선언 수준인 "선언이 아주 많은 입력"은
// 뺐고, 긴 글꼴 식별자 하나를 더했다. 같은 모양을 두 계측에 넣는다.
// - 입력 글자 읽기: `parseCssDeclarations`(css/ 토크나이저)가 입력을 대괄호로 읽는
//   횟수. 토크나이저는 값을 끝까지 읽으므로 모든 모양에서 읽기 수가 입력 길이
//   이상이어야 한다.
// - component 읽기: `readInlineStyleMarks`가 선언 값 배열(`value`)에서 component를
//   읽는 횟수. 판독기는 값을 `filter`로 한 번 훑어 낱말 목록을 만든다. 쉼표만 많은
//   입력과 앞 토큰이 아주 많은 입력도 그 한 번은 읽는다.
const fontShorthandValueShapes: Array<
  [name: string, build: (size: number) => string]
> = [
  ["값이 긴 알파벳 run인 입력", (size) => "a".repeat(size * 16)],
  [
    "앞 토큰 사이 공백이 긴 입력",
    (size) => `bold${" ".repeat(size * 16)}12px Arial`,
  ],
  ["글꼴 목록이 긴 입력", (size) => `12px ${"a,".repeat(size)}a`],
  ["글꼴 식별자가 많은 입력", (size) => `12px ${"a ".repeat(size)}`],
  ["따옴표가 닫히지 않은 긴 입력", (size) => `12px "${"a ".repeat(size)}`],
  ["계산 함수 토큰이 긴 입력", (size) => `calc(${"1px + ".repeat(size)}1px) a`],
  ["쉼표만 많은 입력", (size) => `12px ${",".repeat(size)}`],
  ["앞 토큰이 아주 많은 입력", (size) => `${"normal ".repeat(size)}12px a`],
  ["line-height 토큰이 긴 입력", (size) => `12px/${"1".repeat(size * 16)} a`],
  ["긴 글꼴 식별자 하나", (size) => `12px ${"a".repeat(size * 16)}`],
  ["글꼴 문자열이 많은 입력", (size) => `12px ${'"a",'.repeat(size)}b`],
  ["주석이 낱말 사이에 낀 긴 입력", (size) => `12px ${"a/**/".repeat(size)}`],
];

describe("font 줄임 속성 값의 대괄호 읽기(parseCssDeclarations)", () => {
  it.each(fontShorthandValueShapes)(
    "%s은 크기가 2배가 되면 대괄호 읽기가 2배 이하로 는다",
    (_name, build) => {
      const smallInput = `font:${build(READ_SIZE)}`;
      const small = countIndexReads(smallInput, (style) => {
        parseCssDeclarations(style);
      });
      const large = countIndexReads(`font:${build(READ_SIZE * 2)}`, (style) => {
        parseCssDeclarations(style);
      });

      // 계측이 실제로 일을 셌는지 확인한다. 입력을 끝까지 읽어야 한다.
      expect(small).toBeGreaterThanOrEqual(smallInput.length);
      expect(large / small, "대괄호 읽기 증가율").toBeLessThanOrEqual(2);
    },
  );
});

/**
 * 판독기가 선언 값 배열에서 component를 읽는 횟수를 센다. 선언 목록은 읽기를
 * 세기 전에 만들어 두므로 토크나이저의 읽기는 들어가지 않는다. `value` 배열을
 * Proxy로 감싸 정수 키 읽기를 센다(`filter`·`for…of`·`[i]` 모두 센다). 읽기
 * 수가 component 수의 `MAX_READS_PER_CHAR`배를 넘으면 던진다.
 */
const countComponentReads = (
  style: string,
  read: (declarations: CssDeclaration[]) => unknown = readInlineStyleMarks,
): { reads: number; components: number } => {
  const declarations = parseCssDeclarations(style);
  const components = declarations.reduce(
    (total, declaration) => total + declaration.value.length,
    0,
  );
  const limit = components * MAX_READS_PER_CHAR;
  let reads = 0;
  const wrapped = declarations.map((declaration) => ({
    ...declaration,
    value: new Proxy(declaration.value, {
      get(target, key, receiver) {
        if (
          typeof key === "string" &&
          key !== "" &&
          Number.isInteger(Number(key))
        ) {
          reads += 1;
          if (reads > limit) {
            throw new Error(
              `component 읽기가 component 수 ${components}의 ${MAX_READS_PER_CHAR}배를 넘었다`,
            );
          }
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    }),
  }));
  read(wrapped);
  return { reads, components };
};

// 변이로 확인한 RED다(Issue #368 RD-004). 판독기가 글꼴 항목마다 `value.filter`로
// 낱말 목록을 다시 만드는 변이는 글꼴 목록이 긴 입력이 component 읽기 수 상한
// (`MAX_READS_PER_CHAR`)을 넘어 던진다. 옛 판독기(`text`를 글자로 읽던 구현)는
// component를 읽지 않아 하한 단언(읽기 수가 component 수 이상)이 깨졌다.
describe("font 줄임 속성 판독기의 component 읽기", () => {
  it.each(fontShorthandValueShapes)(
    "%s은 크기가 2배가 되면 component 읽기가 2배 이하로 는다",
    (_name, build) => {
      const small = countComponentReads(`font:${build(BASE_SIZE)}`);
      const large = countComponentReads(`font:${build(BASE_SIZE * 2)}`);

      // 계측이 실제로 일을 셌는지 확인한다. 값을 한 번은 읽어야 한다.
      expect(small.reads).toBeGreaterThanOrEqual(small.components);
      expect(
        large.reads / small.reads,
        "component 읽기 증가율",
      ).toBeLessThanOrEqual(2);
    },
  );
});

// `white-space` 판독기는 낱말을 둘까지만 읽고 셋째 낱말에서 끝낸다. 값이 아무리
// 길어도 component 읽기 수가 상수여야 한다. 값 전체를 훑는 변이(`filter` 등)는
// 읽기 수가 component 수로 늘어 상한을 넘는다.
const MAX_WHITE_SPACE_READS = 8;

describe("white-space 판독기의 component 읽기", () => {
  it.each([
    ["낱말이 아주 많은 입력", (size: number) => "pre ".repeat(size)],
    [
      "낱말 사이 주석이 아주 많은 입력",
      (size: number) => `pre${"/**/pre".repeat(size)}`,
    ],
    [
      "첫 낱말 뒤 공백이 긴 입력",
      (size: number) => `pre${" ".repeat(size * 16)}wrap`,
    ],
    [
      "낱말이 아닌 component가 아주 많은 입력",
      (size: number) => `pre ${"(a) ".repeat(size)}`,
    ],
    ["함수 안이 긴 입력", (size: number) => `pre foo(${"a ".repeat(size)})`],
  ])("%s은 크기와 상관없이 component 읽기가 상수다", (_name, build) => {
    for (const size of [BASE_SIZE, BASE_SIZE * 2]) {
      const { reads } = countComponentReads(
        `white-space:${build(size)}`,
        readWhiteSpaceMode,
      );

      // 계측이 실제로 일을 셌는지 확인한다. 값을 읽지 않으면 0이다.
      expect(reads).toBeGreaterThan(0);
      expect(reads).toBeLessThanOrEqual(MAX_WHITE_SPACE_READS);
    }
  });
});

/**
 * 함수·블록 안 배열까지 Proxy로 감싸 정수 키 읽기를 센다. 색 함수 인자는 함수
 * 안 배열에 있어 `countComponentReads`가 못 본다. component 수는 안쪽까지 센다.
 */
const countDeepComponentReads = (
  style: string,
  read: (declarations: CssDeclaration[]) => unknown,
): { reads: number; components: number } => {
  let reads = 0;
  let components = 0;
  let limit = Number.POSITIVE_INFINITY;
  const wrap = (value: CssComponentValue[]): CssComponentValue[] => {
    components += value.length;
    const copy = value.map((node) =>
      node.type === "function" || node.type === "block"
        ? { ...node, value: wrap(node.value) }
        : node,
    );
    return new Proxy(copy, {
      get(target, key, receiver) {
        if (
          typeof key === "string" &&
          key !== "" &&
          Number.isInteger(Number(key))
        ) {
          reads += 1;
          if (reads > limit) {
            throw new Error(
              `component 읽기가 component 수 ${components}의 ${MAX_READS_PER_CHAR}배를 넘었다`,
            );
          }
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
  };
  const wrapped = parseCssDeclarations(style).map((declaration) => ({
    ...declaration,
    value: wrap(declaration.value),
  }));
  limit = components * MAX_READS_PER_CHAR;
  read(wrapped);
  return { reads, components };
};

// 색 판독기는 값을 한 번 걸러(`filter`) 센다. 레이어·조각·낱말마다 값을 다시
// 걸러 세는 변이는 component 읽기 수가 component 수의 제곱으로 늘어 상한
// (`MAX_READS_PER_CHAR`)을 넘어 던진다. 옛 판독기(`text`를 글자로 읽던 구현)는
// component를 읽지 않아 하한 단언(읽기 수가 component 수 이상)이 깨졌다.
describe("색·background 판독기의 component 읽기", () => {
  it.each<[string, (size: number) => string]>([
    [
      "색 함수 쉼표 인자가 많은 입력",
      (size) => `color:rgb(${"1,".repeat(size)}1)`,
    ],
    [
      "색 함수 공백 인자가 많은 입력",
      (size) => `color:rgb(${"1 ".repeat(size)})`,
    ],
    [
      "닫히지 않은 색 함수 인자가 많은 입력",
      (size) => `color:rgb(${"1 ".repeat(size)}`,
    ],
    ["색 함수 안 쉼표만 많은 입력", (size) => `color:rgb(${",".repeat(size)})`],
    [
      "색 함수 안 주석이 많은 입력",
      (size) => `color:rgb(${"/**/".repeat(size)}1,2,3)`,
    ],
    ["값이 색 낱말로 가득한 입력", (size) => `color:${"red ".repeat(size)}`],
    [
      "background 레이어가 많은 입력",
      (size) => `background:${"none,".repeat(size)}red`,
    ],
    [
      "background 낱말이 많은 입력",
      (size) => `background:${"no-repeat ".repeat(size)}red`,
    ],
    [
      "background 이미지가 많은 입력",
      (size) => `background:${"url(a) ".repeat(size)}`,
    ],
    [
      "background 위치가 많은 입력",
      (size) => `background:${"10px 5% ".repeat(size)}red`,
    ],
    [
      "background 색이 반복된 입력",
      (size) => `background:${"red,".repeat(size)}red`,
    ],
    [
      "background 슬래시가 많은 입력",
      (size) => `background:${"/ ".repeat(size)}`,
    ],
  ])(
    "%s은 크기가 2배가 되면 component 읽기가 2배 이하로 는다",
    (_name, build) => {
      const small = countDeepComponentReads(
        build(BASE_SIZE),
        readStyleDeclarations,
      );
      const large = countDeepComponentReads(
        build(BASE_SIZE * 2),
        readStyleDeclarations,
      );

      // 계측이 실제로 일을 셌는지 확인한다. 값을 한 번은 읽어야 한다.
      expect(small.reads).toBeGreaterThanOrEqual(small.components);
      expect(
        large.reads / small.reads,
        "component 읽기 증가율",
      ).toBeLessThanOrEqual(2.05);
    },
  );
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
    "개행에서 끝나는 따옴표가 아주 많은 입력",
    (size) => `color:red;color:${"'a\n;".repeat(size)}`,
  ],
  [
    "닫히지 않은 따옴표 뒤 이스케이프된 개행이 아주 많은 입력",
    (size) => `color:red;background:'${"\\\n;\\\r\n;".repeat(size)}`,
  ],
  [
    "닫히지 않은 `[`·`{`가 깊게 쌓이는 입력",
    (size) => `color:red;background:${"[;{;".repeat(size)}`,
  ],
  [
    "`[` 블록 안 세미콜론이 많은 입력",
    (size) => `color:red;background:[${";".repeat(size)}] blue`,
  ],
  [
    "`[` 블록 안 짝 안 맞는 닫는 괄호가 많은 입력",
    (size) => `color:red;background:[${")};".repeat(size)}`,
  ],
  // 아래는 따옴표 없는 `url(` 토큰(Issue #364)이 만든 입력 모양이다. 분할기는
  // `url(`을 만나면 `)`를 앞으로 찾지 않고 글자마다 상태만 바꾼다. 닫는 `)`를
  // 앞으로 찾는 변이는 닫히지 않은 `url(`이 많은 입력에서 이차 시간이다.
  [
    "닫는 `)` 없는 `url(`이 아주 많은 입력",
    (size) => `color:red;background:${"url(a'".repeat(size)}`,
  ],
  [
    "`url(` 토큰 안 세미콜론이 아주 많은 입력",
    (size) => `color:red;background:url(${";".repeat(size)})`,
  ],
  [
    "`url(` 뒤 공백 run이 아주 긴 입력 뒤 따옴표",
    (size) => `color:red;background:url(${" ".repeat(size)}'a;b')`,
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
      expectLinearStringWork(parseStyleDeclarations, build);
    },
  );

  it.each(declarationInputShapes)(
    "%s은 크기가 2배가 되면 대괄호 읽기가 2배 이하로 는다",
    (_name, build) => {
      expectLinearIndexReads(parseStyleDeclarations, build);
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
  // "닫는 `)` 없는 `url(`" 행은 Issue #364가 더했다. `url(`마다 닫는 `)`를 앞으로
  // 찾는 변이는 이 행이 26.6–26.8초로 잡는다(Node, 2026-10-11, 80,000개). 정상
  // 구현은 단독 실행 테스트 시간 25ms다.
  // 깊은 `[` 스택 행은 Issue #365가 더했다. 짝 안 맞는 닫는 글자마다 스택
  // 전체를 훑는 변이는 이 행이 28.0–28.1초로 잡는다(Node, 2026-10-11). 정상 구현은
  // 단독 실행 테스트 시간 24–27ms다.
  it.each([
    ["괄호 안 세미콜론", `background:url(${";".repeat(80_000)}) red`],
    [
      "닫히지 않은 괄호와 따옴표",
      `color:red;background:url("${"a;(".repeat(80_000)}`,
    ],
    [
      "깊은 `[` 스택 뒤 짝 안 맞는 닫는 괄호",
      `color:red;background:${"[".repeat(80_000)}${");".repeat(80_000)}`,
    ],
    ["닫는 `)` 없는 `url(`", `color:red;background:${"url(a'".repeat(80_000)}`],
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
  // 아래는 선언 분리와 칸(Issue #361)이 만든 입력 모양이다. 분할기는 따옴표·
  // 주석 상태를 한 번 훑고, 칸은 선언마다 일정한 일만 한다.
  [
    "닫히지 않은 따옴표로 끝까지 이어지는 입력",
    (size) =>
      `white-space:pre;font-family:'${"a;white-space:normal;".repeat(size)}`,
  ],
  ["주석이 많은 입력", (size) => `${"/**/".repeat(size)}white-space:pre`],
  [
    "개행에서 끝나는 따옴표가 아주 많은 입력",
    (size) => `white-space:pre;font-family:${"'a\n;".repeat(size)}`,
  ],
  [
    "닫히지 않은 따옴표 뒤 이스케이프된 개행이 아주 많은 입력",
    (size) => `white-space:pre;font-family:'${"\\\n;\\\r\n;".repeat(size)}`,
  ],
  [
    "닫히지 않은 `[`·`{`가 깊게 쌓이는 입력",
    (size) => `white-space:pre;font-family:${"[;{;".repeat(size)}`,
  ],
  [
    "`[` 블록 안 세미콜론이 많은 입력",
    (size) => `white-space:pre;font-family:[${";".repeat(size)}]`,
  ],
  [
    "`[` 블록 안 짝 안 맞는 닫는 괄호가 많은 입력",
    (size) => `white-space:pre;font-family:[${")};".repeat(size)}`,
  ],
  // 아래는 따옴표 없는 `url(` 토큰(Issue #364)이 만든 입력 모양이다. 분할기는
  // `url(`을 만나면 `)`를 앞으로 찾지 않고 글자마다 상태만 바꾼다. 닫는 `)`를
  // 앞으로 찾는 변이는 닫히지 않은 `url(`이 많은 입력에서 이차 시간이다.
  [
    "닫는 `)` 없는 `url(`이 아주 많은 입력",
    (size) => `white-space:pre;font-family:${"url(a'".repeat(size)}`,
  ],
  [
    "`url(` 토큰 안 세미콜론이 아주 많은 입력",
    (size) => `white-space:pre;font-family:url(${";".repeat(size)})`,
  ],
  [
    "`url(` 뒤 공백 run이 아주 긴 입력 뒤 따옴표",
    (size) => `white-space:pre;font-family:url(${" ".repeat(size)}'a;b')`,
  ],
  [
    "!important 선언이 아주 많은 입력",
    (size) => "white-space:pre !important;".repeat(size),
  ],
];

describe("parseWhiteSpaceMode의 선형 시간", () => {
  it.each(whiteSpaceInputShapes)(
    "%s은 크기가 2배가 되면 호출 횟수와 처리 문자 수가 2배 이하로 는다",
    (_name, build) => {
      expectLinearStringWork(parseWhiteSpaceMode, build);
    },
  );

  it.each(whiteSpaceInputShapes)(
    "%s은 크기가 2배가 되면 대괄호 읽기가 2배 이하로 는다",
    (_name, build) => {
      expectLinearIndexReads(parseWhiteSpaceMode, build);
    },
  );

  // 선언 분할기의 대괄호 읽기는 위 계측에 보이지 않는다. parseInlineStyleMarks와
  // 같은 형태의 시간 상한을 둔다(PIT-0034). 위 모양들은 분할기에서 `split`·
  // `slice` 호출만 센다. 분할기 재순회 변이는 이 상한과 vitest 5초 제한이
  // 잡는다.
  // 변이로 확인한 RED다(Issue #361, 실측 Node, 2026-10-11). splitDeclarations가
  // 조각을 이어 붙일 때마다 pending 전체를 `pending[k]`로 다시 읽고 그 값을
  // 쓰는 변이는 이 테스트가 30.4초로 잡는다. 위 "닫히지 않은 따옴표로 끝까지
  // 이어지는 입력"은 같은 변이를 5초 제한 초과로 잡는다(끝나기까지 127초).
  // 선형 구현은 단독 실행 테스트 시간 11–16ms다. 상한 1초는 그보다 약 60배
  // 크고 변이보다 작아 둘이 겹치지 않는다.
  // 깊은 `[` 스택 행은 Issue #365가 더했다. 짝 안 맞는 닫는 글자마다 스택
  // 전체를 훑는 변이는 이 행이 27.9–28.1초로 잡는다(Node, 2026-10-11). 정상
  // 구현은 단독 실행 테스트 시간 10–12ms다.
  // "닫는 `)` 없는 `url(`" 행은 Issue #364가 더했다. `url(`마다 닫는 `)`를 앞으로
  // 찾는 변이는 이 행이 26.6–26.7초로 잡는다(Node, 2026-10-11, 80,000개). 정상
  // 구현은 단독 실행 테스트 시간 4ms다.
  it.each([
    [
      "닫히지 않은 괄호와 따옴표",
      `white-space:pre;font-family:url("${"a;(".repeat(80_000)}`,
    ],
    [
      "깊은 `[` 스택 뒤 짝 안 맞는 닫는 괄호",
      `white-space:pre;font-family:${"[".repeat(80_000)}${");".repeat(80_000)}`,
    ],
    [
      "닫는 `)` 없는 `url(`",
      `white-space:pre;font-family:${"url(a'".repeat(80_000)}`,
    ],
  ])("%s 80,000개를 1초 안에 읽는다", (_name, style) => {
    const started = performance.now();
    const mode = parseWhiteSpaceMode(style);
    const elapsed = performance.now() - started;

    expect(mode).toBe("preserve");
    expect(elapsed).toBeLessThan(1000);
  });
});

const dumpInputShapes: Array<[string, (size: number) => string]> = [
  ...declarationInputShapes,
  [
    "표식이 맨 끝에 있고 앞에 선언이 아주 많은 입력",
    (size) => `${"color:#ff0000;".repeat(size)}-webkit-text-stroke-width:0px`,
  ],
  [
    "표식과 비슷한 속성 이름이 아주 많은 입력",
    (size) => "-webkit-text-stroke-color:red;".repeat(size),
  ],
  [
    "표식 이름이 값에만 아주 많이 든 입력",
    (size) => `font-family:${"-webkit-text-stroke-width ".repeat(size)}`,
  ],
];

describe("hasComputedStyleDump의 선형 시간", () => {
  it.each(dumpInputShapes)(
    "%s은 크기가 2배가 되면 호출 횟수와 처리 문자 수가 2배 이하로 는다",
    (_name, build) => {
      expectLinearStringWork(hasComputedStyleDump, build);
    },
  );

  it.each(dumpInputShapes)(
    "%s은 크기가 2배가 되면 대괄호 읽기가 2배 이하로 는다",
    (_name, build) => {
      expectLinearIndexReads(hasComputedStyleDump, build);
    },
  );
});

const dumpAuthorInputShapes: Array<[string, (size: number) => string]> = [
  ...dumpInputShapes,
  [
    "표식과 text-decoration 뒤에 작성자 선언이 아주 많은 입력",
    (size) =>
      `-webkit-text-stroke-width:0px;text-decoration-color:initial;${"color:#ff0000;".repeat(size)}`,
  ],
  [
    "text-decoration 선언이 아주 많은 입력",
    (size) =>
      `-webkit-text-stroke-width:0px;${"text-decoration-color:initial;".repeat(size)}`,
  ],
];

describe("readDumpAuthorDeclarations의 선형 시간", () => {
  it.each(dumpAuthorInputShapes)(
    "%s은 크기가 2배가 되면 호출 횟수와 처리 문자 수가 2배 이하로 는다",
    (_name, build) => {
      expectLinearStringWork(readDumpAuthorDeclarations, build);
    },
  );

  it.each(dumpAuthorInputShapes)(
    "%s은 크기가 2배가 되면 대괄호 읽기가 2배 이하로 는다",
    (_name, build) => {
      expectLinearIndexReads(readDumpAuthorDeclarations, build);
    },
  );
});
