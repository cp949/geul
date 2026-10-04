import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";

// 접힌 toggleListItem의 숨은 자손을 판정하는 공용 헬퍼다. 선택 가드
// (toggle-collapse-selection-guard-extension.ts)와 방향키 확장
// (toggle-collapse-arrow-key-extension.ts)이 같은 기준을 쓴다.
//
// 판정 기준은 ToggleCollapseVisibilityExtension과 같다. `collapsed === true`인
// toggleListItem만 본다. 판정은 조상 체인(깊이 O(d))만 훑고 문서 전체를
// 스캔하지 않는다.

// 접힌 toggle의 라벨(blockContainer 첫 자식)인지 판정한다.
export const isCollapsedToggleContent = (
  node: ProseMirrorNode | null,
): boolean =>
  node !== null &&
  node.type.name === "toggleListItem" &&
  node.attrs.collapsed === true;

// $pos가 숨은 그룹 안이면 가장 바깥 접힌 toggle의 blockContainer 깊이를
// 돌려준다. 숨은 그룹은 blockGroup이고, 그 부모 blockContainer의 첫 자식이
// 접힌 toggle이다. 얕은 깊이부터 훑어 첫 일치를 쓰면 가장 바깥이다.
export const outermostCollapsedContainerDepth = (
  $pos: ResolvedPos,
): number | null => {
  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    if ($pos.node(depth).type.name !== "blockGroup") continue;
    const container = $pos.node(depth - 1);
    if (container.type.name !== "blockContainer") continue;
    if (isCollapsedToggleContent(container.firstChild)) return depth - 1;
  }
  return null;
};
