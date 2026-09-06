import {
  isNestableBlockType,
  type Block,
  type NestableBlockType,
} from "@cp949/geul-model";

// children은 7개 nestable 타입(paragraph/heading/quote/목록 4종)에만 있고
// table/divider/codeBlock/media 4종에는 필드 자체가 없다 — Block 유니온
// 전체에서 직접 접근할 수 없다(schema.ts의 동일 좁히기 패턴 재사용, RD-001
// "## 결정"은 여기 없음, 기존 model 계약 그대로).
const childrenOf = (block: Block): Block[] | undefined => {
  if (!isNestableBlockType(block.type)) return undefined;
  return (block as Extract<Block, { type: NestableBlockType }>).children;
};

// 문서 순서(pre-order DFS: 블록 자신 → 자식 → 다음 형제)로 Block 트리를
// 순회하는 공용 프리미티브다. EditorController의 forEachBlock(DOC-004)뿐
// 아니라 findBlockInTree/findParentInTree/findAdjacentInTree도 각자 다른
// 종료 조건으로 이 순회 하나를 재사용한다 — 트리 재귀를 네 곳에 복제하지
// 않는다(block-position.ts가 PM 노드 트리에 대해 쓰는 것과 같은 이유,
// 대상만 저장 Block 트리로 다르다).
//
// visit이 false를 반환하면 순회 전체를 즉시 중단한다 — 중첩 재귀 내부에서
// 멈춰도 그 사실이 모든 상위 호출로 전파돼 형제 루프와 조상 재귀 전부가
// 멈춘다(RD-001-DELTA-01 완료 조건 4의 두 번째 변이).
export const walkBlockTree = (
  blocks: readonly Block[],
  parent: Block | null,
  visit: (block: Block, parent: Block | null) => boolean | void,
  reverse: boolean,
): boolean => {
  const siblings = reverse ? [...blocks].reverse() : blocks;
  for (const block of siblings) {
    const children = childrenOf(block);
    const hasChildren = children !== undefined && children.length > 0;
    if (!reverse) {
      if (visit(block, parent) === false) return false;
      if (hasChildren && !walkBlockTree(children, block, visit, false)) {
        return false;
      }
    } else {
      if (hasChildren && !walkBlockTree(children, block, visit, true)) {
        return false;
      }
      if (visit(block, parent) === false) return false;
    }
  }
  return true;
};

// blockId로 단일 블록을 찾는다(DOC-004). blockId 유일성은 model 계층
// 불변식이라 첫 일치를 최종값으로 삼는다(block-position.ts의
// findBlockPosition과 동일 전제).
export const findBlockInTree = (
  blocks: readonly Block[],
  blockId: string,
): Block | undefined => {
  let found: Block | undefined;
  walkBlockTree(
    blocks,
    null,
    (block) => {
      if (block.id !== blockId) return;
      found = block;
      return false;
    },
    false,
  );
  return found;
};

// blockId의 부모 블록을 찾는다. 최상위 블록의 부모는 Block이 아니므로
// undefined다 — "찾지 못함"과 "최상위라 부모가 없음"을 구분하지 않는다
// (spec §3.2 시그니처가 Block | undefined 하나뿐, RD-001-DELTA-01
// "## 계획"의 설계 결정).
export const findParentInTree = (
  blocks: readonly Block[],
  blockId: string,
): Block | undefined => {
  let found: Block | undefined;
  walkBlockTree(
    blocks,
    null,
    (block, parent) => {
      if (block.id !== blockId) return;
      found = parent ?? undefined;
      return false;
    },
    false,
  );
  return found;
};

// blockId가 속한 형제 배열(참조)과 그 안에서의 인덱스를 찾는다(DOC-006,
// moveBlocksUp/moveBlocksDown 전용, RD-002-DELTA-04). "같은 부모 형제인가"
// 판정은 이 함수가 반환한 siblings 참조를 `===`로 비교해서 한다 —
// generic-block-commands.ts의 동일 모양 module-local 헬퍼(findBlockInTree)와
// 목적이 같지만, 그 파일을 이 DELTA 범위에서 건드리지 않으므로 독립적으로
// 둔다.
export const findSiblingContext = (
  blocks: readonly Block[],
  blockId: string,
): { siblings: readonly Block[]; index: number } | undefined => {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index !== -1) return { siblings: blocks, index };
  for (const block of blocks) {
    const children = childrenOf(block);
    if (children === undefined || children.length === 0) continue;
    const found = findSiblingContext(children, blockId);
    if (found !== undefined) return found;
  }
  return undefined;
};

// forEachBlock과 동일한 문서 순서에서 blockId 바로 앞/뒤 블록을 찾는다.
// 형제 범위로 좁히지 않고 트리 전체를 하나의 순서로 다룬다 — forEachBlock과
// "다음/이전"의 의미가 갈리지 않게 한다(RD-001-DELTA-01 "## 계획"의 설계
// 결정).
export const findAdjacentInTree = (
  blocks: readonly Block[],
  blockId: string,
  direction: "prev" | "next",
): Block | undefined => {
  let previous: Block | undefined;
  let result: Block | undefined;
  let armed = false;
  walkBlockTree(
    blocks,
    null,
    (block) => {
      if (direction === "prev") {
        if (block.id === blockId) {
          result = previous;
          return false;
        }
        previous = block;
        return;
      }
      if (armed) {
        result = block;
        return false;
      }
      if (block.id === blockId) armed = true;
    },
    false,
  );
  return result;
};
