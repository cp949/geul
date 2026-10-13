/**
 * 인접 평문 mdast `text` 노드 병합 함수를 단위로 검증한다(Issue #399).
 * 왕복 회귀 케이스는 `markdown-backslash-char-reference.test.ts`가 맡는다.
 * 단언은 네 가지다.
 * - 인접 `text` 둘·셋이 하나로 합쳐진다. 자식 안 인접 `text`도 합친다.
 * - `break`·`html`·`inlineCode`가 사이에 끼면 합치지 않는다.
 * - 입력 트리를 바꾸지 않는다.
 * - 적용 순서를 고정한다. `mergeAdjacentInline` 뒤에 적용해야 `strong[text a]` + `strong[text b]`가
 *   `strong[text "ab"]` 하나가 된다. 순서가 반대이면 `strong[text a, text b]`로 남는다.
 */
import { describe, expect, it } from "vitest";

import { mergeAdjacentInline } from "../src/markdown/merge-adjacent-inline.js";
import { mergeAdjacentText } from "../src/markdown/merge-adjacent-text.js";

type Node = {
  type: string;
  value?: string;
  children?: Node[];
};

const text = (value: string): Node => ({ type: "text", value });
const wrap = (type: string, children: Node[]): Node => ({ type, children });

/**
 * 객체 트리를 재귀로 얼려 변경 시도가 던지게 한다.
 */
const deepFreeze = <T extends object>(value: T): T => {
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) deepFreeze(child);
  }
  return Object.freeze(value);
};

describe("mergeAdjacentText", () => {
  it("인접한 text 둘을 하나로 합친다", () => {
    expect(mergeAdjacentText([text("a"), text("b")])).toEqual([text("ab")]);
  });

  it("인접한 text 셋을 하나로 합친다", () => {
    expect(mergeAdjacentText([text("a"), text("b"), text("c")])).toEqual([
      text("abc"),
    ]);
  });

  it("text가 하나이면 그대로 둔다", () => {
    expect(mergeAdjacentText([text("a")])).toEqual([text("a")]);
  });

  it.each([
    ["break", { type: "break" }],
    ["html", { type: "html", value: "<br>" }],
    ["inlineCode", { type: "inlineCode", value: "c" }],
  ] as const)("사이에 %s가 끼면 합치지 않는다", (_label, between) => {
    const input: Node[] = [text("a"), { ...between }, text("b")];

    expect(mergeAdjacentText(input)).toEqual(input);
  });

  it("사이에 끼는 노드 양쪽에서 각자 합친다", () => {
    const merged = mergeAdjacentText([
      text("a"),
      text("b"),
      { type: "break" },
      text("c"),
      text("d"),
    ]);

    expect(merged).toEqual([text("ab"), { type: "break" }, text("cd")]);
  });

  it("자식 안 인접 text도 합친다", () => {
    const merged = mergeAdjacentText([
      wrap("strong", [text("a"), text("b")]),
      wrap("link", [wrap("emphasis", [text("c"), text("d")])]),
    ]);

    expect(merged).toEqual([
      wrap("strong", [text("ab")]),
      wrap("link", [wrap("emphasis", [text("cd")])]),
    ]);
  });

  it("값이 없는 text는 빈 문자열로 이어 붙인다", () => {
    expect(mergeAdjacentText([{ type: "text" }, text("b")])).toEqual([
      text("b"),
    ]);
  });

  it("입력 트리를 바꾸지 않는다", () => {
    const input = deepFreeze([
      text("a"),
      text("b"),
      wrap("strong", [text("c"), text("d")]),
    ]);

    expect(() => mergeAdjacentText(input)).not.toThrow();
    expect(input).toHaveLength(3);
    expect(input[2]?.children).toHaveLength(2);
  });
});

describe("병합 순서", () => {
  const input = (): Node[] => [
    wrap("strong", [text("a")]),
    wrap("strong", [text("b")]),
  ];

  it("mergeAdjacentInline 뒤에 적용하면 strong 하나에 text 하나가 남는다", () => {
    expect(mergeAdjacentText(mergeAdjacentInline(input()))).toEqual([
      wrap("strong", [text("ab")]),
    ]);
  });

  it("순서가 반대이면 strong 하나에 text 둘이 남는다", () => {
    expect(mergeAdjacentInline(mergeAdjacentText(input()))).toEqual([
      wrap("strong", [text("a"), text("b")]),
    ]);
  });
});
