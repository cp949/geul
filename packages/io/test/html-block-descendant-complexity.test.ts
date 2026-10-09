/**
 * 블록 자손 판정이 중첩 깊이에 선형임을 시간이 아니라 노드 접근 횟수로
 * 고정한다(Issue #334 리뷰, G-TST-004).
 *
 * 대상은 둘이다.
 * - `inlineContentFromNodes`: 표 셀 평탄화에서 `div`마다 "블록 자손이 있는가"를
 *   본다. 판정은 첫 블록 자손에서 멈춘다. 블록 태그만 멈춤 지점이라 `div`
 *   조상의 스캔 구간이 서로 겹치지 않아 선형이다. 멈춤을 없애 자손 전체를
 *   훑게 하면 중첩 `div` 깊이에 이차가 된다(변이로 RED 확인). 이 묶음은
 *   그 가드다.
 * - `unwrapBlockBearingColorTags`: `font`·`mark`마다 같은 판정을 한다. 중첩한
 *   `font`·`mark`에서 같은 이차가 날 수 있다.
 *
 * 노드를 Proxy로 감싸 속성 읽기와 쓰기를 센다. 깊이 N과 2N 입력의 접근 증가율이
 * 2 이하여야 한다(이차면 4에 가깝다). 기계 속도와 동시 실행 부하에 의존하지
 * 않는다. 실제 입력은 파서의 깊이 캡(MAX_HTML_TREE_DEPTH, 256)으로 깊이가
 * 제한되지만, 함수는 캡 이전 트리에서도 선형이어야 해서 캡 밖 깊이로 잰다.
 *
 * 한계: 배열 `splice`의 이동 비용은 노드 접근으로 잡히지 않는다.
 */
import { describe, expect, it } from "vitest";

import {
  type HtmlNode,
  inlineContentFromNodes,
  unwrapBlockBearingColorTags,
} from "../src/html/inline-content.js";

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
  };
};

/** 바깥에서 안쪽으로 tagName 목록대로 중첩한 사슬을 만든다. */
const chain = (
  b: Builder,
  tagNames: readonly string[],
  depth: number,
  leaf: () => HtmlNode,
  style?: string,
): HtmlNode => {
  let node = leaf();
  for (let level = 0; level < depth; level += 1) {
    const tagName = tagNames[level % tagNames.length] as string;
    node = b.element(tagName, [node], style);
  }
  return node;
};

const BASE_DEPTH = 600;

const BLOCK_TAGS = new Set(["div", "p", "ul", "li", "table"]);

/** 입력 깊이 -> 작업량(노드 접근 수)을 재는 함수 모양이다. */
type Measure = (depth: number) => number;

const cellFlatten =
  (make: (b: Builder, depth: number) => HtmlNode): Measure =>
  (depth) => {
    const b = builder();
    const root = make(b, depth);
    // 트리를 만드는 동안의 접근은 세지 않는다.
    b.counter.accesses = 0;
    inlineContentFromNodes([root], { blockBreakTagNames: BLOCK_TAGS });
    return b.counter.accesses;
  };

const unwrap =
  (make: (b: Builder, depth: number) => HtmlNode): Measure =>
  (depth) => {
    const b = builder();
    const root = make(b, depth);
    b.counter.accesses = 0;
    unwrapBlockBearingColorTags([root]);
    return b.counter.accesses;
  };

const shapes: Array<[string, Measure]> = [
  [
    "셀 평탄화: 인라인 자식만 든 div가 깊이 중첩",
    cellFlatten((b, depth) =>
      chain(b, ["div"], depth, () => b.text("x"), "color:red"),
    ),
  ],
  [
    "셀 평탄화: 맨 안쪽에 p가 있는 div 사슬",
    cellFlatten((b, depth) =>
      chain(
        b,
        ["div"],
        depth,
        () => b.element("p", [b.text("x")]),
        "color:red",
      ),
    ),
  ],
  [
    "셀 평탄화: div와 span이 번갈아 중첩",
    cellFlatten((b, depth) =>
      chain(b, ["div", "span"], depth, () => b.text("x"), "color:red"),
    ),
  ],
  [
    "셀 평탄화: 각 div가 블록 없는 span 사슬을 먼저 품고 그 뒤에 안쪽 div가 이어짐",
    cellFlatten((b, depth) => {
      let node: HtmlNode = b.text("x");
      for (let level = 0; level < depth; level += 1) {
        const spans = chain(b, ["span"], 10, () => b.text("s"));
        node = b.element("div", [spans, node], "color:red");
      }
      return node;
    }),
  ],
  [
    "font·mark unwrap: 블록 없는 font > mark 중첩",
    unwrap((b, depth) => chain(b, ["font", "mark"], depth, () => b.text("x"))),
  ],
  [
    "font·mark unwrap: 맨 안쪽에 ul이 있는 font > mark 중첩",
    unwrap((b, depth) =>
      chain(b, ["font", "mark"], depth, () =>
        b.element("ul", [b.element("li", [b.text("x")])]),
      ),
    ),
  ],
  [
    "font·mark unwrap: font와 span이 번갈아 중첩",
    unwrap((b, depth) => chain(b, ["font", "span"], depth, () => b.text("x"))),
  ],
];

describe("블록 자손 판정은 중첩 깊이에 선형이다", () => {
  it.each(shapes)("%s", (_name, measure) => {
    const small = measure(BASE_DEPTH);
    const large = measure(BASE_DEPTH * 2);
    expect(small).toBeGreaterThan(0);
    expect(large / small, "노드 접근 증가율").toBeLessThanOrEqual(2.2);
  });
});
