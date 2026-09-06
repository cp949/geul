import {
  isKnownBlockType,
  isNestableBlockType,
  type Block,
  type DocumentBlock,
  type NestableBlockType,
} from "@cp949/geul-model";

// children은 7개 nestable 타입에만 있다 — block-tree.ts의 동일 좁히기
// 재사용(export되지 않은 module-local 헬퍼라 그대로 복제, 두 파일이 각자
// 다른 이유로 Block 유니온을 좁힌다: block-tree.ts는 읽기 순회, 이 파일은
// 형제 배열 스플라이스). 파라미터를 DocumentBlock으로 넓혀도
// isNestableBlockType이 CustomBlock(top-level 전용, RD-002-DELTA-01)의
// 임의 type 문자열에 항상 false를 반환해 안전하다.
const childrenOf = (block: DocumentBlock): Block[] | undefined => {
  if (!isNestableBlockType(block.type)) return undefined;
  return (block as Extract<Block, { type: NestableBlockType }>).children;
};

// blockId 노드의 `children` 필드만 교체한 새 블록을 반환한다(나머지 필드는
// 그대로). nestable 타입 좁히기가 필요해 스프레드 결과를 그 타입으로
// 캐스트한다 — childrenOf와 동일 전제(그 타입만 children을 가진다). 이
// 함수는 childrenOf가 비어있지 않은 children을 반환한 block에만 호출되고,
// CustomBlock은 children을 절대 가지지 않으므로(리프 전용) 파라미터가
// DocumentBlock으로 넓어져도 실제로 CustomBlock이 들어올 일은 없다.
const withChildren = (block: DocumentBlock, children: Block[]): Block =>
  ({
    ...block,
    children,
  }) as Block;

// targetId를 형제 배열 어디선가 찾아 그 자리 앞/뒤에 newBlocks를 끼운 새
// 트리를 반환한다(불변 갱신 — 원본 blocks를 변형하지 않는다). targetId를
// 찾지 못하면 null(BLOCK_NOT_FOUND 판정은 호출자 몫). 재귀가 자식 배열에서
// 성공하면 그 조상 블록만 새 `children`으로 교체해 위로 전파한다 — 형제
// 배열 자체의 얕은 복사는 실제로 갈라지는 레벨에서만 일어난다.
export const insertSiblingsInTree = (
  blocks: readonly DocumentBlock[],
  targetId: string,
  newBlocks: readonly DocumentBlock[],
  placement: "before" | "after",
): DocumentBlock[] | null => {
  const index = blocks.findIndex((block) => block.id === targetId);
  if (index !== -1) {
    const insertAt = placement === "before" ? index : index + 1;
    return [
      ...blocks.slice(0, insertAt),
      ...newBlocks,
      ...blocks.slice(insertAt),
    ];
  }
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block === undefined) continue;
    const children = childrenOf(block);
    if (children === undefined || children.length === 0) continue;
    const spliced = insertSiblingsInTree(
      children,
      targetId,
      newBlocks,
      placement,
    );
    if (spliced === null) continue;
    // children은 항상 Block[](childrenOf 계약, CustomBlock은 leaf라 절대
    // children을 갖지 않는다) — 재귀는 그 자식 배열에서만 splice하므로
    // spliced도 실제로는 항상 Block[]이다. 시그니처가 DocumentBlock[]인
    // 것은 최상위 호출(top-level CustomBlock 포함) 때문일 뿐이다.
    return [
      ...blocks.slice(0, i),
      withChildren(block, spliced as Block[]),
      ...blocks.slice(i + 1),
    ];
  }
  return null;
};

// blockId 위치의 블록을 `replace`가 반환한 새 블록으로 통째로 교체한 새
// 트리를 반환한다(불변 갱신). replace는 교체 대상 블록 하나만 받는다 —
// updateBlock(spec §3.2, RD-002-DELTA-02)이 이미 병합을 끝낸 완성된 Block을
// 만들어 넘기고, 이 함수는 그 값을 트리의 올바른 위치에 스플라이스하는
// 책임만 진다. blockId를 찾지 못하면 null(BLOCK_NOT_FOUND 판정은 호출자
// 몫) — insertSiblingsInTree와 동일 탐색·전파 구조.
export const updateBlockInTree = (
  blocks: readonly DocumentBlock[],
  blockId: string,
  replace: (block: Block) => Block,
): DocumentBlock[] | null => {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index !== -1) {
    const target = blocks[index];
    // replace는 같은 타입 안에서만 필드를 병합하는 알려진 14종 전용
    // 계약이다(editor-controller.ts의 updateBlock, spec §3.2) — target이
    // CustomBlock(top-level 전용, RD-002-DELTA-01)이면 이 계약이 아직
    // 정의돼 있지 않아 not-found와 동일하게 취급한다(BLOCK_NOT_FOUND는
    // 호출자 몫, 기존 동작과 같은 판정 경로).
    if (target === undefined || !isKnownBlockType(target.type)) return null;
    // isKnownBlockType은 target.type만 좁히고 discriminated union인 target
    // 자체는 좁히지 못한다(model의 동일 제약, isNestableBlockType과 같은
    // 이유) — 위 가드가 런타임으로 이미 확인했으므로 명시적으로 캐스트한다.
    return [
      ...blocks.slice(0, index),
      replace(target as Block),
      ...blocks.slice(index + 1),
    ];
  }
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block === undefined) continue;
    const children = childrenOf(block);
    if (children === undefined || children.length === 0) continue;
    const spliced = updateBlockInTree(children, blockId, replace);
    if (spliced === null) continue;
    // insertSiblingsInTree와 동일 근거 — children 재귀 결과는 항상 Block[].
    return [
      ...blocks.slice(0, i),
      withChildren(block, spliced as Block[]),
      ...blocks.slice(i + 1),
    ];
  }
  return null;
};

// idsToRemove에 속한 블록을 트리 전 깊이에서 제거한 새 트리와, 제거된
// 블록들(자신의 children 서브트리 포함, 문서 순서)을 함께 반환한다(불변
// 갱신). replaceBlocks(spec §3.2, RD-002-DELTA-02)가 소비한다 — 제거
// 대상의 자식은 승격하지 않는다(RD-002-DELTA-02 "## 계획"의 설계 결정,
// 기존 commands.deleteBlock이 PM nodeSize 범위를 통째로 지우는 것과 같은
// 의미). 한 블록이 제거되면 그 서브트리 안에서 다시 idsToRemove를 찾지
// 않는다 — 이미 제거된 블록의 자식은 제거 사유를 물을 필요가 없다.
export const removeBlocksFromTree = (
  blocks: readonly DocumentBlock[],
  idsToRemove: ReadonlySet<string>,
): { blocks: DocumentBlock[]; removed: DocumentBlock[] } => {
  const removed: DocumentBlock[] = [];
  const nextBlocks: DocumentBlock[] = [];
  for (const block of blocks) {
    if (idsToRemove.has(block.id)) {
      removed.push(block);
      continue;
    }
    const children = childrenOf(block);
    if (children === undefined || children.length === 0) {
      nextBlocks.push(block);
      continue;
    }
    const childResult = removeBlocksFromTree(children, idsToRemove);
    removed.push(...childResult.removed);
    // insertSiblingsInTree와 동일 근거 — children 재귀 결과는 항상 Block[].
    nextBlocks.push(
      childResult.removed.length === 0
        ? block
        : withChildren(block, childResult.blocks as Block[]),
    );
  }
  return { blocks: nextBlocks, removed };
};
