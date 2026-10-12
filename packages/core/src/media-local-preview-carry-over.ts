import { isMediaBlockType } from "@cp949/geul-model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { LocalPreviewAttrs } from "./media-local-preview.js";
import type { TiptapJsonNode } from "./model-to-tiptap.js";

export type ClearedLocalPreview = {
  blockId: string;
  attrs: LocalPreviewAttrs;
};

// oldNode 자신과 모든 후손에서 로컬 프리뷰가 남은 미디어를 blockId로 모은다.
// Node.descendants는 자신을 방문하지 않아 oldNode를 따로 확인한다.
// collectLocalPreviewBlocks(media-local-preview-lifecycle-extension.ts)는
// doc 전체 전용이라 쓰지 않는다.
const collectSubtreePreviews = (
  oldNode: ProseMirrorNode,
): Map<string, LocalPreviewAttrs> => {
  const found = new Map<string, LocalPreviewAttrs>();
  const collect = (node: ProseMirrorNode): void => {
    const blockId: unknown = node.attrs.blockId;
    if (
      isMediaBlockType(node.type.name) &&
      typeof blockId === "string" &&
      blockId.length > 0 &&
      typeof node.attrs.localPreviewUrl === "string"
    ) {
      found.set(blockId, {
        localPreviewUrl: node.attrs.localPreviewUrl,
        localPreviewFile: node.attrs.localPreviewFile as File,
      });
    }
  };
  collect(oldNode);
  oldNode.descendants((node) => {
    collect(node);
    return true;
  });
  return found;
};

// 로컬 프리뷰(ADR 0015)는 저장 모델에 없는 PM 전용 attrs다. 모델에서 PM
// 노드를 새로 만들면 null로 리셋된다(Issue #376). updateBlock처럼 모델에서
// 만든 JSON으로 노드를 교체하는 명령이 이 함수로 기존 프리뷰를 이어받는다.
//
// oldNode(서브트리)에 있던 로컬 프리뷰를 blockId로 짝지어 json에 이어받는다.
// clearWhenUrl이 true면 json의 url이 비어 있지 않은 미디어는 이어받지 않고
// cleared에 담는다(url 확정 = 프리뷰 정리, setMediaBlockUrl과 같은 판정).
// 입력 json은 바꾸지 않는다. json에 없는 노드(삭제된 자식)는 이어받지 않는다
// — 그 정리는 MediaLocalPreviewLifecycleExtension이 소유한다. 한계: 같은
// blockId가 미디어가 아닌 타입으로 바뀌어 남으면 Lifecycle이 블록이 아직
// 있다고 보고 통지하지 않는다(Issue #376 이전부터 있던 동작이다).
export const carryOverLocalPreviews = (
  oldNode: ProseMirrorNode,
  json: TiptapJsonNode,
  clearWhenUrl: boolean,
): { json: TiptapJsonNode; cleared: ClearedLocalPreview[] } => {
  const previews = collectSubtreePreviews(oldNode);
  const cleared: ClearedLocalPreview[] = [];
  if (previews.size === 0) return { json, cleared };

  const visit = (node: TiptapJsonNode): TiptapJsonNode => {
    let next = node;
    const blockId = node.attrs?.blockId;
    const preview =
      node.type !== undefined &&
      isMediaBlockType(node.type) &&
      typeof blockId === "string"
        ? previews.get(blockId)
        : undefined;
    if (preview !== undefined) {
      const url = node.attrs?.url;
      if (clearWhenUrl && typeof url === "string" && url.length > 0) {
        cleared.push({ blockId: blockId as string, attrs: preview });
      } else {
        next = {
          ...node,
          attrs: {
            ...node.attrs,
            localPreviewUrl: preview.localPreviewUrl,
            localPreviewFile: preview.localPreviewFile,
          },
        };
      }
    }
    if (node.content === undefined) return next;
    return { ...next, content: node.content.map(visit) };
  };

  return { json: visit(json), cleared };
};
