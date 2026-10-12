// 블록 트리 질의 규칙 — 위치 찾기와 형제 범위 판정을 한 벌로 둔다.
//
// 트리 표현이 둘이다. 저장 모델(Block 트리)과 ProseMirror doc이다. 두 표현이
// 모두 남는 이유는 ADR-0001이 소유한다. 질의 규칙은 어댑터 인터페이스 하나로
// 받아 두 트리에 같은 코드를 돌린다. 어댑터 구현은 block-tree-adapters.ts다.
//
// 이 파일은 session·PM·model 타입 어느 쪽에도 의존하지 않는 순수 규칙이다.
// 실패 이유만 돌려주고, 에러 코드 변환은 호출하는 래퍼가 맡는다.

export type BlockTreeAdapter<N> = {
  // 최상위 형제 목록. 모델은 Document.blocks, PM은 doc의 직계 자식이다.
  roots: readonly N[];
  // 노드의 blockId. id가 없는 노드는 undefined다.
  idOf: (node: N) => string | undefined;
  // 노드의 자식 블록 목록. 자식이 없거나 가질 수 없는 노드는 빈 배열이다.
  childrenOf: (node: N) => readonly N[];
  // false면 id가 같아도 찾지 못한 것으로 본다. 생략하면 모두 찾을 수 있다.
  isAddressable?: (node: N) => boolean;
};

export type BlockLocation<N> = {
  node: N;
  // 최상위 블록이면 null.
  parent: N | null;
  siblings: readonly N[];
  index: number;
  // 최상위 = 1 (model/schema.ts의 중첩 깊이 정의).
  depth: number;
};

// blockId의 위치를 문서 순서(pre-order)로 찾는다. 없거나 찾을 수 없는
// 노드면 null이다.
export const locateBlock = <N>(
  adapter: BlockTreeAdapter<N>,
  blockId: string,
): BlockLocation<N> | null => {
  const search = (
    siblings: readonly N[],
    parent: N | null,
    depth: number,
  ): BlockLocation<N> | null => {
    for (let index = 0; index < siblings.length; index += 1) {
      const node = siblings[index] as N;
      if (
        adapter.idOf(node) === blockId &&
        adapter.isAddressable?.(node) !== false
      ) {
        return { node, parent, siblings, index, depth };
      }
      const found = search(adapter.childrenOf(node), node, depth + 1);
      if (found !== null) return found;
    }
    return null;
  };
  return search(adapter.roots, null, 1);
};

export type SiblingRange<N> = {
  parent: N | null;
  siblings: readonly N[];
  startIndex: number;
  endIndex: number;
  // startIndex..endIndex를 문서 순서로 담는다. 선택 방향과 무관하다.
  nodes: readonly N[];
  // 범위 안 블록이 공유하는 깊이.
  depth: number;
};

export type SiblingRangeResult<N> =
  | { ok: true; value: SiblingRange<N> }
  | { ok: false; reason: "not-found"; blockId: string }
  | { ok: false; reason: "different-parents" };

// fromId·toId가 같은 부모의 형제일 때 그 사이 범위(양끝 포함)를 확정한다.
// 없는 id는 from을 먼저 본다. 부모가 다르면 different-parents다.
export const resolveSiblingRange = <N>(
  adapter: BlockTreeAdapter<N>,
  fromId: string,
  toId: string,
): SiblingRangeResult<N> => {
  const from = locateBlock(adapter, fromId);
  if (from === null) return { ok: false, reason: "not-found", blockId: fromId };
  const to = locateBlock(adapter, toId);
  if (to === null) return { ok: false, reason: "not-found", blockId: toId };
  if (from.parent !== to.parent) {
    return { ok: false, reason: "different-parents" };
  }
  const startIndex = Math.min(from.index, to.index);
  const endIndex = Math.max(from.index, to.index);
  return {
    ok: true,
    value: {
      parent: from.parent,
      siblings: from.siblings,
      startIndex,
      endIndex,
      nodes: from.siblings.slice(startIndex, endIndex + 1),
      depth: from.depth,
    },
  };
};
