/**
 * 깊이 상한(MAX_NESTING_DEPTH) 경계 테스트가 쓰는 단일 체인 중첩 문서
 * fixture를 소유한다. paragraph 체인과 quote 체인 두 테스트 파일이 같은 모양의
 * 문서를 필요로 하므로 사본을 만들지 않고 이 모듈이 단독으로 갖는다
 * (G-TST-002).
 */

/** 체인의 모든 단계에 같은 값으로 적용되는 블록 타입. children을 가질 수 있는 타입만 허용한다. */
export type NestedChainBlockType = "paragraph" | "quote";

export type NestedFixtureBlock = {
  id: string;
  type: NestedChainBlockType;
  content: Array<{ text: string }>;
  children?: NestedFixtureBlock[];
};

/**
 * 각 단계가 자식 하나만 갖는 depth단 체인 문서를 만든다. 최하위 블록부터
 * 감싸 올라가므로 chain-1이 최상위, chain-<depth>가 가장 깊은 잎이다 —
 * 깊이 위반 path 단언이 이 방향에 기댄다. type은 모든 단계에 같은 값으로
 * 적용된다: 상한 검사가 블록 타입과 무관하게 children 키만 따라가는지를
 * 타입별 체인으로 확인하는 것이 이 fixture의 용도라서, 한 단계라도 다른
 * 타입이 섞이면 그 확인이 공허해진다.
 */
export const buildNestedChainDocument = (
  depth: number,
  type: NestedChainBlockType = "paragraph",
) => {
  let innermost: NestedFixtureBlock = {
    id: `chain-${depth}`,
    type,
    content: [],
  };
  for (let level = depth - 1; level >= 1; level -= 1) {
    innermost = {
      id: `chain-${level}`,
      type,
      content: [],
      children: [innermost],
    };
  }
  return { formatVersion: 1, revision: 0, blocks: [innermost] };
};
