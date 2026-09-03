import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

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

// blockId로 편집 대상 콘텐츠 노드를 찾는다. blockId는 blockContainer(중첩
// 가능 블록)나 table 같은 비-container 노드 어느 쪽에도 붙을 수 있다 —
// blockContainer면 실제 콘텐츠는 그 자식(position + 1)에 있고, 아니면 그
// 노드 자신이 콘텐츠다. generic-block-commands.ts(setText·setBlockType 등)와
// check-list-item-commands.ts 둘 다 필요로 해 findBlockPosition과 같은 이유로
// 공유 프리미티브로 둔다(RD-001 DELTA-03).
export const findEditableBlockContent = (
  document: ProseMirrorNode,
  blockId: string,
): { position: number; node: ProseMirrorNode } | null => {
  const matchPosition = findBlockPosition(document, blockId);
  if (matchPosition === null) return null;
  const matchNode = document.nodeAt(matchPosition);
  if (matchNode === null) return null;
  if (matchNode.type.name !== "blockContainer") {
    return { position: matchPosition, node: matchNode };
  }
  const contentPosition = matchPosition + 1;
  const contentNode = document.nodeAt(contentPosition);
  return contentNode === null
    ? null
    : { position: contentPosition, node: contentNode };
};

// 캐럿(state.selection.$from)에서 가장 가까운 blockContainer 조상의
// blockId를 찾는다. depth 역순으로 올라가며 첫 blockContainer를 찾으면 그
// attrs.blockId를 반환한다 — 스키마상 blockContainer는 항상 유효한
// blockId를 갖지만 방어적으로 없으면 null이다. indent-keyboard-extension.ts와
// block-type-keyboard-extension.ts 둘 다 필요로 해(RD-001 DELTA-01)
// findBlockPosition·findEditableBlockContent와 같은 이유로 여기서 공유한다.
export const nearestBlockContainerId = (state: EditorState): string | null => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "blockContainer") {
      const blockId = node.attrs.blockId;
      return typeof blockId === "string" && blockId.length > 0 ? blockId : null;
    }
  }
  return null;
};
