/**
 * 공용 모듈 `nested-chain-support.ts`가 단독 소유하는 체인 fixture의 주장을
 * 고정한다(G-TST-002). 깊이 경계 테스트(document-nesting.test.ts,
 * document-heading-quote-divider.test.ts)는 "chain-1이 최상위, chain-<depth>가
 * 잎", "type이 모든 단계에 적용"을 전제로 path·타입 단언을 쓰는데, 그 전제가
 * 어긋나도 지는 것이 없었다.
 *
 * 덮는 것: 체인 길이가 depth와 같다는 것, id가 최상위 chain-1에서 잎
 * chain-<depth>로 증가한다는 것, 잎에는 children 키 자체가 없다는 것, 기본
 * 타입이 paragraph라는 것, 넘긴 타입이 잎까지 모든 단계에 적용된다는 것.
 *
 * 덮지 않는 것: parseDocument가 이 문서를 어떻게 판정하는지 — 그것은 각
 * 소비 테스트가 진다.
 */
import { describe, expect, it } from "vitest";

import {
  buildNestedChainDocument,
  type NestedFixtureBlock,
} from "./nested-chain-support.js";

/**
 * 체인을 최상위에서 잎까지 내려가며 방문 순서대로 블록을 모은다. 각 단계가
 * 자식을 하나만 갖는다는 fixture 형태를 함께 단언해, 형제가 생기는 회귀가
 * 조용히 통과하지 않게 한다.
 */
const collectChain = (root: NestedFixtureBlock): NestedFixtureBlock[] => {
  const chain: NestedFixtureBlock[] = [];
  let current: NestedFixtureBlock | undefined = root;
  while (current !== undefined) {
    chain.push(current);
    if (current.children !== undefined) {
      expect(current.children).toHaveLength(1);
    }
    current = current.children?.[0];
  }
  return chain;
};

describe("buildNestedChainDocument 계약", () => {
  it("depth단 체인을 블록 하나로 시작해 chain-1(최상위)부터 chain-<depth>(잎)까지 만든다", () => {
    const document = buildNestedChainDocument(4);

    expect(document.blocks).toHaveLength(1);
    const chain = collectChain(document.blocks[0] as NestedFixtureBlock);
    expect(chain.map((block) => block.id)).toEqual([
      "chain-1",
      "chain-2",
      "chain-3",
      "chain-4",
    ]);
  });

  it("잎 블록에는 children 키가 없다", () => {
    const chain = collectChain(
      buildNestedChainDocument(3).blocks[0] as NestedFixtureBlock,
    );

    expect("children" in (chain[2] as NestedFixtureBlock)).toBe(false);
  });

  it("depth 1이면 children 없는 블록 하나다", () => {
    expect(buildNestedChainDocument(1)).toEqual({
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "chain-1", type: "paragraph", content: [] }],
    });
  });

  it("타입을 생략하면 모든 단계가 paragraph다", () => {
    const chain = collectChain(
      buildNestedChainDocument(3).blocks[0] as NestedFixtureBlock,
    );

    expect(chain.map((block) => block.type)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
  });

  it("quote를 넘기면 최상위부터 잎까지 모든 단계가 quote다", () => {
    const chain = collectChain(
      buildNestedChainDocument(3, "quote").blocks[0] as NestedFixtureBlock,
    );

    expect(chain.map((block) => block.type)).toEqual([
      "quote",
      "quote",
      "quote",
    ]);
  });
});
