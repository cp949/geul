import { isMediaBlockType } from "@cp949/geul-model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { LocalPreviewAttrs } from "./media-local-preview.js";
import type { TiptapJsonNode } from "./model-to-tiptap.js";

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

const applyPreviews = (
  previews: ReadonlyMap<string, LocalPreviewAttrs>,
  json: TiptapJsonNode,
  clearWhenUrl: boolean,
): TiptapJsonNode => {
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
      const confirmsUrl =
        clearWhenUrl && typeof url === "string" && url.length > 0;
      if (!confirmsUrl) {
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

  return visit(json);
};

// 로컬 프리뷰(ADR 0015)는 저장 모델에 없는 PM 전용 attrs다. 모델에서 PM
// 노드를 새로 만들면 null로 리셋된다(Issue #376). updateBlock처럼 모델에서
// 만든 JSON으로 노드를 교체하는 명령이 이 함수로 기존 프리뷰를 이어받는다.
//
// oldNode(서브트리)에 있던 로컬 프리뷰를 blockId로 짝지어 json에 이어받는다.
// clearWhenUrl이 true면 json의 url이 비어 있지 않은 미디어는 이어받지 않는다
// (url 확정 = 프리뷰 정리, setMediaBlockUrl과 같은 판정). 이어받지 않은 URL의
// 통지는 이 모듈이 아니라 MediaLocalPreviewLifecycleExtension이 undo·redo로
// 못 돌아올 때 낸다(Issue #382). 입력 json은 바꾸지 않는다. json에 없는
// 노드(삭제된 자식)는 이어받지 않는다 — 그 정리도 Lifecycle이 소유한다.
// 이어받지 못한 URL(삭제된 자식, 같은 blockId가 미디어가 아닌 타입으로 바뀐
// 경우)은 Lifecycle이 URL 기준으로 통지한다(Issue #383).
export const carryOverLocalPreviews = (
  oldNode: ProseMirrorNode,
  json: TiptapJsonNode,
  clearWhenUrl: boolean,
): TiptapJsonNode => {
  const previews = collectSubtreePreviews(oldNode);
  if (previews.size === 0) return json;
  return applyPreviews(previews, json, clearWhenUrl);
};

// 제거 노드가 여럿이고 삽입 JSON도 여럿인 명령(replaceBlocks)용이다. 제거
// 서브트리의 프리뷰를 한 번만 모아 모든 JSON에 적용한다. 프리뷰가 하나도
// 없으면 JSON을 그대로 돌려줘 비용이 제거 서브트리 순회 한 번이다(Issue #383).
export const carryOverLocalPreviewsFromNodes = (
  oldNodes: readonly ProseMirrorNode[],
  jsons: readonly TiptapJsonNode[],
  clearWhenUrl: boolean,
): TiptapJsonNode[] => {
  const previews = new Map<string, LocalPreviewAttrs>();
  for (const node of oldNodes) {
    for (const [blockId, attrs] of collectSubtreePreviews(node)) {
      previews.set(blockId, attrs);
    }
  }
  if (previews.size === 0) return [...jsons];
  return jsons.map((json) => applyPreviews(previews, json, clearWhenUrl));
};
