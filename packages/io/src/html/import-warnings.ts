import { isSupportedLinkHref, sanitizeInlineText } from "@cp949/geul-model";

import type { HtmlNode, HtmlRoot } from "./inline-content.js";
import {
  htmlAllowedAttributes,
  htmlStrippedTagNames,
} from "./sanitize-schema.js";

export type HtmlImportWarning =
  | {
      kind: "UNSAFE_ELEMENT_REMOVED";
      element: string;
      message: string;
    }
  | {
      kind: "UNSAFE_ATTRIBUTE_REMOVED";
      element: string;
      attribute: string;
      message: string;
    }
  | {
      kind: "UNSAFE_URL_REMOVED";
      element: "a";
      attribute: "href";
      message: string;
    }
  | {
      kind: "SAFE_BLOCK_DOWNGRADED";
      element: string;
      message: string;
    }
  | {
      kind: "UNSAFE_CODE_POINT_REMOVED";
      element: string;
      message: string;
    };

const unsafeElementNames = new Set([
  ...htmlStrippedTagNames,
  "img",
  "audio",
  "video",
  "source",
  "track",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "select",
  "textarea",
]);
const supportedBlockNames = new Set(["p", "h1", "h2", "h3", "table"]);

const collectFromNodes = (
  nodes: HtmlNode[],
  warnings: HtmlImportWarning[],
  topLevel: boolean,
  parentElement: string,
): void => {
  for (const node of nodes) {
    if (node.type === "text") {
      // raw HAST 텍스트 노드 기준으로 sanitize 전후를 비교한다(G-CNV-002 —
      // warning fact는 raw HAST에서 수집한다). 정책은 model의
      // sanitizeInlineText가 단독 소유한다(G-CNV-001).
      if (sanitizeInlineText(node.value) !== node.value) {
        warnings.push({
          kind: "UNSAFE_CODE_POINT_REMOVED",
          element: parentElement,
          message:
            "Unsafe code point (C0 control, DEL, or unpaired surrogate) was removed from text",
        });
      }
      continue;
    }
    if (node.type !== "element") continue;

    if (unsafeElementNames.has(node.tagName)) {
      warnings.push({
        kind: "UNSAFE_ELEMENT_REMOVED",
        element: node.tagName,
        message: `Unsafe ${node.tagName} element was removed`,
      });
    } else if (topLevel && !supportedBlockNames.has(node.tagName)) {
      warnings.push({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: node.tagName,
        message: `Unsupported ${node.tagName} block was downgraded to paragraph content`,
      });
    }

    const allowedAttributes = new Set(
      htmlAllowedAttributes[node.tagName] ?? htmlAllowedAttributes["*"] ?? [],
    );
    for (const [attribute, value] of Object.entries(node.properties)) {
      if (
        node.tagName === "a" &&
        attribute === "href" &&
        (typeof value !== "string" || !isSupportedLinkHref(value))
      ) {
        warnings.push({
          kind: "UNSAFE_URL_REMOVED",
          element: "a",
          attribute: "href",
          message: "Unsafe link URL was removed",
        });
        continue;
      }
      if (!allowedAttributes.has(attribute)) {
        warnings.push({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: node.tagName,
          attribute,
          message: `Unsupported ${attribute} attribute was removed from ${node.tagName}`,
        });
      }
    }

    collectFromNodes(node.children, warnings, false, node.tagName);
  }
};

export const collectHtmlImportWarnings = (
  root: HtmlRoot,
): HtmlImportWarning[] => {
  const warnings: HtmlImportWarning[] = [];
  // 최상위 loose 텍스트(문서 어떤 요소로도 감싸이지 않은 텍스트, 예:
  // documentFromRoot의 flushInlineNodes가 문단으로 승격하는 텍스트)에는
  // 감싸는 태그가 없으므로 "text" sentinel을 element로 쓴다.
  collectFromNodes(root.children, warnings, true, "text");
  return warnings;
};
