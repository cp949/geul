import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

// blockId를 가진 최상위(top-level) 블록 노드의 문서 내 위치를 찾는다. 표 여부
// 등 노드 종류와 무관하게 문서 직속 자식만 훑는다 - table-commands.ts와
// editor-controller.ts가 각자 표/일반 블록 조회에 똑같이 필요로 하는
// 범용 프리미티브라 어느 한쪽 도메인 파일에 두지 않고 여기서 공유한다.
export const findTopLevelBlockPosition = (
  document: ProseMirrorNode,
  blockId: string,
): number | null => {
  let blockPosition: number | null = null;
  document.forEach((node, offset) => {
    if (node.attrs.blockId === blockId) blockPosition = offset;
  });
  return blockPosition;
};
