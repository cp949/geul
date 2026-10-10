// importHtml 변환기가 공유하는 경고 context다. 변환기가 글자를 실제로 정제하는
// 지점에서 UNSAFE_CODE_POINT_REMOVED를 낸다(RD-001).
// - 수집기(import-warnings.ts)는 raw 트리에서 sanitize 손실만 모은다.
// - 글자를 지우는 쪽은 변환기의 sanitizeInlineText·sanitizeCodeBlockSource다.
//   그래서 변환기가 읽는 자리에서 같은 함수로 판정한다. 예측 로직이 없다.
// - 판정 값은 공백 접기 뒤의 텍스트 노드 값이다.
// - 같은 텍스트 노드는 한 번만 검사한다.
// - 경고 순서는 수집기 경고 다음에 변환기 경고다.
import { sanitizeCodeBlockSource, sanitizeInlineText } from "@cp949/geul-model";

import type { HtmlImportWarning } from "./import-warnings.js";
import type { HtmlNode, HtmlRoot, HtmlTextNode } from "./inline-content.js";

const CODE_POINT_REMOVED_MESSAGE =
  "Unsafe code point (C0 control, DEL, or unpaired surrogate) was removed from text";

// 최상위 loose 텍스트에는 감싸는 태그가 없으므로 "text"를 element로 쓴다.
const TOP_LEVEL_TEXT_ELEMENT = "text";

export type CodePointReporter = {
  // 인라인 글자로 읽는 텍스트 노드 하나를 검사한다.
  inlineText: (node: HtmlTextNode) => void;
  // 노드 목록 안 텍스트 노드를 모두 인라인 글자로 검사한다(caption).
  inlineTextIn: (nodes: readonly HtmlNode[]) => void;
  // 노드 목록 안 텍스트 노드를 모두 codeBlock 소스로 검사한다(pre).
  codeTextIn: (nodes: readonly HtmlNode[]) => void;
};

export type HtmlImportContext = {
  warnings: HtmlImportWarning[];
  codePoints: CodePointReporter;
};

// root는 sanitize와 공백 접기를 마친 트리다. 텍스트 노드의 부모 태그를 이 트리에서
// 읽으므로 sanitize가 벗긴 요소(caption 등)는 부모로 나오지 않는다.
export const createImportContext = (
  root: HtmlRoot,
  warnings: HtmlImportWarning[],
): HtmlImportContext => {
  const parentTags = new WeakMap<HtmlNode, string>();
  const indexParents = (nodes: readonly HtmlNode[], tagName: string): void => {
    for (const node of nodes) {
      parentTags.set(node, tagName);
      if (node.type === "element") indexParents(node.children, node.tagName);
    }
  };
  indexParents(root.children, TOP_LEVEL_TEXT_ELEMENT);

  const checked = new WeakSet<HtmlTextNode>();
  const check = (
    node: HtmlTextNode,
    sanitizeText: (value: string) => string,
  ): void => {
    if (checked.has(node)) return;
    checked.add(node);
    if (sanitizeText(node.value) === node.value) return;
    warnings.push({
      kind: "UNSAFE_CODE_POINT_REMOVED",
      element: parentTags.get(node) ?? TOP_LEVEL_TEXT_ELEMENT,
      message: CODE_POINT_REMOVED_MESSAGE,
    });
  };
  const checkIn = (
    nodes: readonly HtmlNode[],
    sanitizeText: (value: string) => string,
  ): void => {
    for (const node of nodes) {
      if (node.type === "text") check(node, sanitizeText);
      else if (node.type === "element") checkIn(node.children, sanitizeText);
    }
  };

  return {
    warnings,
    codePoints: {
      inlineText: (node) => check(node, sanitizeInlineText),
      inlineTextIn: (nodes) => checkIn(nodes, sanitizeInlineText),
      codeTextIn: (nodes) => checkIn(nodes, sanitizeCodeBlockSource),
    },
  };
};
