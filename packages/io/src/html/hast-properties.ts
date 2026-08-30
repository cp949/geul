import { isSupportedLinkHref } from "@cp949/geul-model";

import type { HtmlElementNode, HtmlNode } from "./inline-content.js";

type HtmlElementWithIntegerData = HtmlElementNode & {
  data?: { rawIntegerProperties?: Record<string, string> };
};

// parse-html.ts가 parse5 raw lexeme를 HAST의 sanitizer-preserved data에
// 기록하는 단일 쓰기 seam이다. HtmlElementNode의 공용 구조에는 import 전용
// metadata를 노출하지 않는다.
export const setRawIntegerProperties = (
  element: HtmlElementNode,
  properties: Record<string, string>,
): void => {
  const target = element as HtmlElementWithIntegerData;
  target.data = { ...target.data, rawIntegerProperties: properties };
};

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
  // Number()는 공백을 0, 0x10을 16으로 받아 HTML decimal integer 속성의
  // 문법보다 넓다. parseHtmlFragment가 보존한 raw lexeme를 우선 검사하고,
  // metadata 없는 수동 HAST 문자열에도 같은 문법을 적용한다.
  const rawValue = (element as HtmlElementWithIntegerData).data
    ?.rawIntegerProperties?.[name];
  if (rawValue !== undefined && !/^[+-]?\d+$/.test(rawValue)) {
    return Number.NaN;
  }
  if (
    rawValue === undefined &&
    typeof value !== "number" &&
    (typeof value !== "string" || !/^[+-]?\d+$/.test(value))
  ) {
    return Number.NaN;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
};
