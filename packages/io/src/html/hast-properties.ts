import { isSupportedLinkHref } from "@cp949/geul-model";

import type { HtmlElementNode, HtmlNode } from "./inline-content.js";

// sanitize schema의 protocol allowlist는 상대 URL을 검사하지 않는다 —
// `//evil.com` 같은 프로토콜 상대 URL이 그대로 통과한다. model의 링크 정책을
// 통과하지 못하는 href를 여기서 제거해야 문서 import 경로와 클립보드 경로가
// 같은 계약을 갖는다(제거된 href는 링크 mark 없이 텍스트만 남는다).
export const sanitizeLinks = (nodes: HtmlNode[]): void => {
  for (const node of nodes) {
    if (node.type !== "element") continue;

    if (node.tagName === "a") {
      const href = node.properties.href;
      if (typeof href !== "string" || !isSupportedLinkHref(href)) {
        delete node.properties.href;
      }
    }
    sanitizeLinks(node.children);
  }
};

export const childElements = (
  element: HtmlElementNode,
  tagName?: string,
): HtmlElementNode[] =>
  element.children.filter(
    (child): child is HtmlElementNode =>
      child.type === "element" &&
      (tagName === undefined || child.tagName === tagName),
  );

export const propertyString = (
  element: HtmlElementNode,
  name: string,
): string | undefined => {
  const value = element.properties[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const propertyInteger = (
  element: HtmlElementNode,
  name: string,
  fallback: number,
): number => {
  const value = element.properties[name];
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
};
