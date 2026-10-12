import { isKnownBlockType, type DocumentBlock } from "@cp949/geul-model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { childrenOf } from "./block-tree.js";
import type { BlockTreeAdapter } from "./block-tree-query.js";

const NO_CHILDREN: readonly never[] = [];

const childNodes = (parent: ProseMirrorNode): ProseMirrorNode[] => {
  const nodes: ProseMirrorNode[] = [];
  parent.forEach((child) => nodes.push(child));
  return nodes;
};

// 저장 모델 트리 어댑터. 알려진 14종 전용 계약을 따른다 — top-level
// CustomBlock(RD-002-DELTA-01)은 id가 같아도 찾지 못한 것으로 본다
// (block-tree-edit.ts의 updateBlockInTree와 같은 근거).
export const modelBlockTreeAdapter = (
  blocks: readonly DocumentBlock[],
): BlockTreeAdapter<DocumentBlock> => ({
  roots: blocks,
  idOf: (block) => block.id,
  childrenOf: (block) => childrenOf(block) ?? NO_CHILDREN,
  isAddressable: (block) => isKnownBlockType(block.type),
});

// ProseMirror doc 어댑터. 최상위는 doc의 직계 자식이다. blockContainer의 자식
// 블록은 두 번째 자식인 blockGroup 안에 있다. divider·table처럼 blockContainer로
// 감싸이지 않는 노드도 blockId를 가진 형제로 나란히 들어온다(D19). 이들은
// 자식 블록을 가질 수 없다.
export const pmBlockTreeAdapter = (
  doc: ProseMirrorNode,
): BlockTreeAdapter<ProseMirrorNode> => ({
  roots: childNodes(doc),
  idOf: (node) => {
    const blockId: unknown = node.attrs.blockId;
    return typeof blockId === "string" && blockId.length > 0
      ? blockId
      : undefined;
  },
  childrenOf: (node) =>
    node.type.name === "blockContainer" && node.childCount >= 2
      ? childNodes(node.child(1))
      : NO_CHILDREN,
});
