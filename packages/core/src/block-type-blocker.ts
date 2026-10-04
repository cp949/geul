import {
  isInlineContentBlockType,
  isKnownBlockType,
  isListEntryBlockType,
  isValidInlineText,
} from "@cp949/geul-model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { findEditableBlockContent } from "./block-position.js";
import type {
  BlockTypeBlocker,
  SetBlockTypeDescriptor,
} from "./block-type-descriptor.js";
import {
  findBlockEntryInTree,
  hasChildren,
} from "./generic-block-tree-lookup.js";
import type { ProductionEditorSession } from "./production-editor-session.js";

export type BlockTypeChangeEvaluation =
  | { blocker: BlockTypeBlocker }
  | {
      blocker: null;
      target: { position: number; node: ProseMirrorNode };
    };

// setBlockType의 구조적 거절 조건을 한 곳에서 판정한다. 명령과 질의가 같은
// 함수를 써서 UI 판정이 core 거절 조건과 어긋나지 않게 한다. 싼 검사부터
// 하고, 모델 트리 조회는 비Code → Code 변환일 때만 한다(타이핑마다 옵션
// 수만큼 호출되므로).
export const evaluateBlockTypeChange = (
  session: ProductionEditorSession,
  blockId: string,
  blockType: SetBlockTypeDescriptor,
  clearContent: boolean,
): BlockTypeChangeEvaluation => {
  if (session.isDestroyed) return { blocker: "NOT_APPLICABLE" };
  const target = findEditableBlockContent(session.editor.state.doc, blockId);
  if (target === null) return { blocker: "NOT_FOUND" };
  const currentTypeName = target.node.type.name;
  // 등록된 top-level CustomBlock은 PM에는 있지만 모델 트리 조회(알려진
  // 타입만 반환)에서는 없다. 이 명령은 그 경우 BLOCK_NOT_FOUND를 돌려줬다.
  if (!isKnownBlockType(currentTypeName)) return { blocker: "NOT_FOUND" };
  if (!isInlineContentBlockType(currentTypeName)) {
    return { blocker: "NOT_APPLICABLE" };
  }
  // bulletListItem/numberedListItem/checkListItem/toggleListItem 넷 다
  // "목록"이다(spec 글머리·번호·체크·토글 목록) — isListItemBlockType(io
  // <ul>/<ol> 직렬화 축)이 아니라 isListEntryBlockType(io 축과 분리된 편집
  // UX 축, RD-003 F2)을 써서 toggleListItem도 이 가드에 포함한다. 그러지
  // 않으면 자식 없는 toggleListItem만 codeBlock 변환이 허용되는 비대칭이
  // 생긴다(RD-003 트랙-3 pending 이슈, IMPL-REVIEW-01.md "남은 위험").
  const currentIsList = isListEntryBlockType(currentTypeName);
  const targetIsList = isListEntryBlockType(blockType.type);
  if (
    (currentTypeName === "codeBlock" && targetIsList) ||
    (currentIsList && blockType.type === "codeBlock")
  ) {
    return { blocker: "LIST_CODE_MISMATCH" };
  }
  if (blockType.type === "codeBlock" && currentTypeName !== "codeBlock") {
    const modelTarget = findBlockEntryInTree(session.document.blocks, blockId);
    if (modelTarget === null) return { blocker: "NOT_FOUND" };
    if (hasChildren(modelTarget.block)) return { blocker: "HAS_CHILDREN" };
  }
  if (
    currentTypeName === "codeBlock" &&
    blockType.type !== "codeBlock" &&
    !clearContent &&
    !isValidInlineText(target.node.textContent)
  ) {
    return { blocker: "INVALID_TEXT" };
  }
  return { blocker: null, target };
};

export type BlockTypesChangeEvaluation =
  // NOT_FOUND는 처음 찾지 못한 blockId를 항상 싣는다.
  | { blocker: "NOT_FOUND"; missingBlockId: string }
  | { blocker: Exclude<BlockTypeBlocker, "NOT_FOUND"> }
  | {
      blocker: null;
      targets: { node: ProseMirrorNode; position: number }[];
    };

// setBlockTypes의 구조적 거절 조건을 한 곳에서 판정한다. 변환 대상은
// codeBlock이 아닌 텍스트 블록이다. 이미 같은 타입인 블록만 남는 경우는
// 사유가 아니다(no-op).
export const evaluateBlockTypesChange = (
  session: ProductionEditorSession,
  blockIds: readonly string[],
  blockType: SetBlockTypeDescriptor,
): BlockTypesChangeEvaluation => {
  if (session.isDestroyed) return { blocker: "NOT_APPLICABLE" };
  if (blockIds.length === 0 || blockType.type === "codeBlock") {
    return { blocker: "NOT_APPLICABLE" };
  }
  const targets: { node: ProseMirrorNode; position: number }[] = [];
  for (const blockId of blockIds) {
    const target = findEditableBlockContent(session.editor.state.doc, blockId);
    if (target === null) {
      return { blocker: "NOT_FOUND", missingBlockId: blockId };
    }
    targets.push(target);
  }
  const hasConvertible = targets.some(
    ({ node }) =>
      isInlineContentBlockType(node.type.name) &&
      node.type.name !== "codeBlock",
  );
  if (!hasConvertible) {
    return {
      blocker: targets.every(({ node }) => node.type.name === "codeBlock")
        ? "ALL_CODE_BLOCK"
        : "NOT_APPLICABLE",
    };
  }
  return { blocker: null, targets };
};
