/**
 * `collapseSourceWhitespace`와 `hasGeulIdentityAttribute`가 입력 크기에 선형임을
 * 시간이 아니라 관측 가능한 작업량으로 고정한다(Issue #320, G-TST-004).
 *
 * 두 함수는 sanitize된 HAST 트리를 읽고 고친다. 계측 축은 셋이다.
 * 1. 노드 접근: 트리의 모든 노드를 Proxy로 감싸 속성 읽기와 쓰기를 센다.
 *    노드를 다시 훑는 형태(요소마다 하위 트리를 재순회)는 깊은 중첩에서
 *    접근 수가 제곱으로 뛴다.
 * 2. 문자열 메서드 호출 횟수.
 * 3. 문자열 메서드가 처리한 문자 수(수신 문자열 길이의 합). 긴 텍스트를
 *    위치마다 다시 처리하는 형태는 호출 횟수가 선형이어도 이 값이 제곱으로
 *    뛴다.
 *
 * 크기 N과 2N 입력의 작업량 증가율이 2 이하여야 한다. 입력 모양은 긴 공백
 * run, 긴 알파벳 run, 깊은 인라인 중첩, 깊은 블록 중첩, 줄 끝 공백을 되돌리는
 * 많은 줄, 긴 style 속성을 가진 보호 후보 span·div, pre-line 긴 텍스트, white-space
 * style을 가진 깊은 div 중첩이다. 기계 속도와 동시 실행
 * 부하에 의존하지 않는다.
 *
 * 한계: 정규식 엔진 내부 작업은 문자열 계측에 잡히지 않는다. 접기 정규식
 * `/[\t\n\f\r ]+/g`는 문자 클래스 한 개의 반복이라 백트래킹이 없고, 긴 공백 run
 * 입력으로 처리 문자 수가 입력 길이에 비례하는지 확인한다.
 */
import type { HtmlNode, HtmlRoot } from "../src/html/inline-content.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  collapseSourceWhitespace,
  hasGeulIdentityAttribute,
} from "../src/html/collapse-source-whitespace.js";
import {
  measureStringWorkload,
  restoreStringMethods,
} from "./string-workload-support.js";

type Workload = { nodeAccesses: number; calls: number; chars: number };

type Counter = { accesses: number };

/** 속성 읽기와 쓰기를 세는 Proxy로 노드를 감싼다. */
const tracked = <T extends object>(node: T, counter: Counter): T =>
  new Proxy(node, {
    get(target, property, receiver) {
      counter.accesses += 1;
      return Reflect.get(target, property, receiver) as unknown;
    },
    set(target, property, value, receiver) {
      counter.accesses += 1;
      return Reflect.set(target, property, value, receiver);
    },
  });

type Builder = {
  text: (value: string) => HtmlNode;
  element: (tagName: string, children: HtmlNode[], style?: string) => HtmlNode;
  root: (children: HtmlNode[]) => HtmlRoot;
  counter: Counter;
};

/** 접근 횟수를 한 카운터로 모으는 트리 빌더를 만든다. */
const builder = (): Builder => {
  const counter: Counter = { accesses: 0 };
  return {
    counter,
    text: (value) => tracked({ type: "text", value } as HtmlNode, counter),
    element: (tagName, children, style) =>
      tracked(
        {
          type: "element",
          tagName,
          properties: style === undefined ? {} : { style },
          children,
        } as HtmlNode,
        counter,
      ),
    root: (children) => tracked({ type: "root", children }, counter),
  };
};

const BASE_SIZE = 10_000;

const inputShapes: Array<[string, (b: Builder, size: number) => HtmlRoot]> = [
  [
    "긴 공백 run",
    (b, size) =>
      b.root([
        b.element("p", [
          b.text(`${" \t\n".repeat(size * 8)}x${" \r\f".repeat(size * 8)}`),
        ]),
      ]),
  ],
  [
    "긴 알파벳 run",
    (b, size) => b.root([b.element("p", [b.text("a".repeat(size * 16))])]),
  ],
  [
    "깊은 인라인 중첩",
    (b, size) => {
      let node = b.text("x ");
      for (let depth = 0; depth < size; depth += 1) {
        node = b.element("b", [b.text(" y "), node]);
      }
      return b.root([b.element("p", [node])]);
    },
  ],
  [
    "깊은 블록 중첩",
    (b, size) => {
      let node = b.text(" x ");
      for (let depth = 0; depth < size; depth += 1) {
        node = b.element("div", [b.text("\n "), node, b.text(" \n")]);
      }
      return b.root([node]);
    },
  ],
  [
    "줄 끝 공백을 되돌리는 많은 줄",
    (b, size) =>
      b.root([
        b.element(
          "p",
          Array.from({ length: size }, () => [
            b.text("line   "),
            b.element("br", []),
            b.text("  next \n"),
          ]).flat(),
        ),
      ]),
  ],
  [
    "긴 style 속성을 가진 span",
    (b, size) =>
      b.root([
        b.element("p", [
          b.element("span", [b.text("a  b")], "x".repeat(size * 16)),
          b.element(
            "span",
            [b.text("c  d")],
            `${"color:red;".repeat(size)}white-space:pre`,
          ),
          b.element(
            "span",
            [b.text("e  f")],
            `white-space:${" ".repeat(size)}`,
          ),
        ]),
      ]),
  ],
  [
    "긴 style 속성을 가진 div",
    (b, size) =>
      b.root([
        b.element("div", [b.text("a  b")], "x".repeat(size * 16)),
        b.element(
          "div",
          [b.text("c  d")],
          `${"color:red;".repeat(size)}white-space:pre`,
        ),
        b.element("div", [b.text("e  f")], `white-space:${" ".repeat(size)}`),
      ]),
  ],
  [
    "pre-line 긴 텍스트",
    (b, size) =>
      b.root([
        b.element("p", [
          b.element(
            "span",
            [b.text("word   \t more \n  line ".repeat(size))],
            "white-space:pre-line",
          ),
        ]),
      ]),
  ],
  [
    "pre-line 긴 공백·개행 run",
    (b, size) =>
      b.root([
        b.element("p", [
          b.element(
            "span",
            [
              b.text(
                ` ${" \t\n".repeat(size * 4)}x${" \r\f\n".repeat(size * 4)}`,
              ),
            ],
            "white-space:pre-line",
          ),
        ]),
      ]),
  ],
  [
    "white-space style을 가진 깊은 div 중첩",
    (b, size) => {
      const styles = [
        "white-space:pre",
        "white-space:normal",
        "white-space:pre-line",
        "color:red",
      ];
      let node = b.text(" x \n ");
      for (let depth = 0; depth < size; depth += 1) {
        node = b.element(
          depth % 2 === 0 ? "div" : "span",
          [b.text(" a  "), node, b.text(" \n b ")],
          styles[depth % styles.length],
        );
      }
      return b.root([node]);
    },
  ],
];

/**
 * 트리를 만든 뒤 두 함수가 만드는 작업량만 센다. 트리를 만드는 동안의
 * 접근은 버린다.
 */
const measureWorkload = (build: (b: Builder) => HtmlRoot): Workload => {
  const b = builder();
  const root = build(b);
  // 트리를 만드는 동안 센 접근은 버린다. 두 함수가 만드는 접근만 센다.
  b.counter.accesses = 0;
  const strings = measureStringWorkload(() => {
    hasGeulIdentityAttribute(root);
    collapseSourceWhitespace(root);
  });
  return { nodeAccesses: b.counter.accesses, ...strings };
};

afterEach(restoreStringMethods);

describe("collapseSourceWhitespace의 선형 시간", () => {
  it.each(inputShapes)(
    "%s은 크기가 2배가 되면 노드 접근·문자열 호출·처리 문자 수가 2배 이하로 는다",
    (_name, build) => {
      const small = measureWorkload((b) => build(b, BASE_SIZE));
      const large = measureWorkload((b) => build(b, BASE_SIZE * 2));

      // 계측이 실제로 일을 셌는지 확인한다. 0이면 아래 비율 단언이 공허하다.
      expect(small.nodeAccesses).toBeGreaterThan(0);
      expect(small.calls).toBeGreaterThan(0);
      expect(small.chars).toBeGreaterThanOrEqual(BASE_SIZE);

      expect(
        large.nodeAccesses / small.nodeAccesses,
        "노드 접근 증가율",
      ).toBeLessThanOrEqual(2);
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
    const before = String.prototype.replace;
    measureWorkload((b) => b.root([b.element("p", [b.text("a  b")])]));
    expect(String.prototype.replace).toBe(before);
  });
});
