// paragraph 노드를 model paragraph Block으로 옮긴다. paragraph가
// image/imageReference 노드 하나만 담을 때는 imageBlockFromSingleChild가
// ImageBlock으로 승격한다.
import type { Block, IdFactory } from "@cp949/geul-model";

import type { MarkdownNode } from "./import-markdown-helpers.js";
import { inlineContentFromNodes } from "./import-markdown-inline.js";
import type { ImportWarning } from "./import-markdown-warnings.js";

export const paragraphFromNodes = (
  nodes: MarkdownNode[],
  createId: IdFactory,
  warnings: ImportWarning[],
): Block => {
  const id = createId();
  return {
    id,
    type: "paragraph",
    content: inlineContentFromNodes(nodes, warnings, {
      blockId: id,
      inTableCell: false,
    }),
  };
};

export const paragraphFromText = (
  text: string,
  createId: IdFactory,
): Block => ({
  id: createId(),
  type: "paragraph",
  content: text.length === 0 ? [] : [{ text }],
});

// paragraph가 image/imageReference 노드 하나만 담을 때 ImageBlock으로
// 승격한다(Issue #152 슬라이스6, RD-002 DELTA-02, spec §7.3). image
// 타입은 url 유무와 무관하게 항상 승격한다 — `![alt]()`는 문법 자체가
// 모호함 없이 "url 없는 이미지"를 뜻한다(HTML DELTA-02가 이미 url 없는
// media 블록을 정당한 상태로 다룬 전례). imageReference는 참조가
// 해석됐을 때만(node.url !== undefined) 승격하고, 끊어진 참조(정의
// 없음)는 undefined를 반환해 호출자가 기존 다운그레이드(readInlineNodes의
// missingIdentifier 텍스트 + IMAGE_DOWNGRADED)를 그대로 쓰게 한다 — 실패
// 정보를 조용히 버리지 않는다(G-CNV-002). alt/url이 빈 문자열이면 해당
// model 필드 자체를 생략한다(paragraphFromText의 "빈 문자열은 생략"
// 관례 재사용 — export-markdown.ts가 name 없을 때 alt=""로 내므로
// 대칭을 지켜야 정확한 round-trip identity가 성립한다).
export const imageBlockFromSingleChild = (
  node: MarkdownNode,
  createId: IdFactory,
): Block | undefined => {
  if (node.type !== "image" && node.type !== "imageReference") {
    return undefined;
  }
  if (node.type === "imageReference" && node.url === undefined) {
    return undefined;
  }
  const url = node.url ?? "";
  const name = node.alt ?? "";
  return {
    id: createId(),
    type: "image",
    ...(url.length === 0 ? {} : { url }),
    ...(name.length === 0 ? {} : { name }),
  };
};
