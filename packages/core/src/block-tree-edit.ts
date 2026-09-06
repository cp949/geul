import {
  isNestableBlockType,
  type Block,
  type NestableBlockType,
} from "@cp949/geul-model";

// children은 7개 nestable 타입에만 있다 — block-tree.ts의 동일 좁히기
// 재사용(export되지 않은 module-local 헬퍼라 그대로 복제, 두 파일이 각자
// 다른 이유로 Block 유니온을 좁힌다: block-tree.ts는 읽기 순회, 이 파일은
// 형제 배열 스플라이스).
const childrenOf = (block: Block): Block[] | undefined => {
  if (!isNestableBlockType(block.type)) return undefined;
  return (block as Extract<Block, { type: NestableBlockType }>).children;
};

// blockId 노드의 `children` 필드만 교체한 새 블록을 반환한다(나머지 필드는
// 그대로). nestable 타입 좁히기가 필요해 스프레드 결과를 그 타입으로
// 캐스트한다 — childrenOf와 동일 전제(그 타입만 children을 가진다).
const withChildren = (block: Block, children: Block[]): Block =>
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
  blocks: readonly Block[],
  targetId: string,
  newBlocks: readonly Block[],
  placement: "before" | "after",
): Block[] | null => {
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
    return [
      ...blocks.slice(0, i),
      withChildren(block, spliced),
      ...blocks.slice(i + 1),
    ];
  }
  return null;
};
