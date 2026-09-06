import type { TextMark } from "@cp949/geul-model";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";

import {
  blockTypeDescriptorFromBlock,
  type BlockTypeDescriptor,
  type BlockTypeSource,
  type HeadingLevel,
} from "./block-type-descriptor.js";

// PM block content node를 BlockTypeSource로 좁힌 뒤 blockTypeDescriptorFromBlock에
// 위임한다. PM attrs는 unknown이라 캐스트가 이 지점에서만 필요하다 — caret과
// selection 조회가 같은 타입·attrs 규칙을 공유하고 PM node 자체는 공개하지
// 않는다.
const blockTypeSourceFromNode = (
  node: ProseMirrorNode,
): BlockTypeSource | null => {
  switch (node.type.name) {
    case "paragraph":
      return { type: "paragraph" };
    case "heading":
      return {
        type: "heading",
        level: node.attrs.level as HeadingLevel,
        // PM은 isToggleable을 true 또는 null로만 저장한다(headingIsToggleable
        // ? true : null, generic-block-commands.ts) — 이 typeof 가드가
        // 정확히 true일 때만 필드를 채운다.
        ...(typeof node.attrs.isToggleable === "boolean"
          ? { isToggleable: node.attrs.isToggleable }
          : {}),
      };
    case "quote":
      return { type: "quote" };
    case "codeBlock":
      return {
        type: "codeBlock",
        ...(typeof node.attrs.language === "string"
          ? { language: node.attrs.language }
          : {}),
      };
    case "bulletListItem":
      return { type: "bulletListItem" };
    case "numberedListItem":
      return {
        type: "numberedListItem",
        ...(typeof node.attrs.startNumber === "number"
          ? { startNumber: node.attrs.startNumber }
          : {}),
      };
    case "checkListItem":
      return { type: "checkListItem" };
    case "toggleListItem":
      return { type: "toggleListItem" };
    case "divider":
      return { type: "divider" };
    case "table":
      return { type: "table" };
    default:
      return null;
  }
};

export const blockTypeDescriptorFromNode = (
  node: ProseMirrorNode,
): BlockTypeDescriptor | null => {
  const source = blockTypeSourceFromNode(node);
  return source === null ? null : blockTypeDescriptorFromBlock(source);
};

export const toggleableMarkTypes: ReadonlyArray<TextMark["type"]> = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
];

// $pos 조상 중 가장 가까운 blockContainer의 blockId를 찾는다.
// paragraph/heading은 더 이상 blockId를 직접 갖지 않는다(D19) — 조상인
// blockContainer가 identity를 소유한다.
export const nearestBlockContainerId = (
  position: ResolvedPos,
): string | null => {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    const node = position.node(depth);
    if (node.type.name === "blockContainer") {
      const blockId = node.attrs.blockId;
      return typeof blockId === "string" && blockId.length > 0 ? blockId : null;
    }
  }
  return null;
};

// getSelectionBlockType 전용: [from, to] 범위를 완전히 포함하는 가장 깊은
// blockContainer(그 첫 자식이 paragraph/heading/quote/codeBlock인 경우)를 재귀로 찾는다.
// blockGroup?이 없는 컨테이너는 자신의 nodeSize 전체(닫는 태그 포함)까지
// 상한으로 받아들인다 — collapsed 캐럿뿐 아니라 AllSelection(전체 선택)의
// to가 컨테이너 자신의 닫는 경계까지 닿는 경우도 "그 블록 전체 선택"으로
// 인정해야 하기 때문이다. blockGroup이 있으면 상한을 blockContent 끝으로
// 좁혀 자식 쪽으로 범위가 새어 들어가는 선택은 컨테이너 자신이 아니라
// blockGroup 재귀로 넘긴다 — 부모·자식에 걸친 선택은 어느 쪽과도 매치되지
// 않아 null로 남는다(기존 "여러 최상위 블록에 걸치면 null" 계약의 재귀판).
export const findSelectionBlock = (
  node: ProseMirrorNode,
  nodeStart: number,
  from: number,
  to: number,
): { blockId: string; blockType: BlockTypeDescriptor } | null => {
  let result: { blockId: string; blockType: BlockTypeDescriptor } | null = null;
  node.forEach((child, childOffset) => {
    if (result !== null) return;
    const childStart = nodeStart + childOffset;
    const childEnd = childStart + child.nodeSize;
    if (from < childStart || to > childEnd) return;

    if (child.type.name === "blockGroup") {
      result = findSelectionBlock(child, childStart + 1, from, to);
      return;
    }
    if (child.type.name !== "blockContainer") return;

    const blockId = child.attrs.blockId;
    if (typeof blockId !== "string" || blockId.length === 0) return;
    const blockContent = child.firstChild;
    if (blockContent === null) return;
    const contentStart = childStart + 1;
    const contentEnd = contentStart + blockContent.nodeSize;
    const hasGroupChild = child.childCount > 1;

    if (to <= (hasGroupChild ? contentEnd : childEnd)) {
      const blockType = blockTypeDescriptorFromNode(blockContent);
      if (blockType !== null) {
        result = {
          blockId,
          blockType,
        };
      }
      return;
    }

    if (hasGroupChild) {
      result = findSelectionBlock(child.child(1), contentEnd + 1, from, to);
    }
  });
  return result;
};
