import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

// blockId를 가진 블록 노드의 문서 내 위치를 임의 깊이에서 찾는다(D19 —
// 컨테이너 도입으로 블록이 blockGroup 안에 중첩될 수 있다). table-commands.ts와
// editor-controller.ts가 각자 표/일반 블록 조회에 똑같이 필요로 하는 범용
// 프리미티브라 어느 한쪽 도메인 파일에 두지 않고 여기서 공유한다.
//
// descendants는 문서 전체를 재귀로 훑는다 — table-commands.ts의
// findCellOffset과 같은 "찾으면 즉시 하위 순회를 끊는다" 관례를 따른다.
// blockId 유일성은 상위 계층(model)이 보장하는 불변식이라 첫 일치를
// 최종값으로 삼는다.
export const findBlockPosition = (
  document: ProseMirrorNode,
  blockId: string,
): number | null => {
  let blockPosition: number | null = null;
  document.descendants((node, position) => {
    if (blockPosition !== null) return false;
    if (node.attrs.blockId === blockId) {
      blockPosition = position;
      return false;
    }
    return true;
  });
  return blockPosition;
};
