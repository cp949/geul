import { isSupportedLinkHref } from "@cp949/geul-model";

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
): void => {
  for (const node of nodes) {
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

    collectFromNodes(node.children, warnings, false);
  }
};

export const collectHtmlImportWarnings = (
  root: HtmlRoot,
): HtmlImportWarning[] => {
  const warnings: HtmlImportWarning[] = [];
  collectFromNodes(root.children, warnings, true);
  return warnings;
};
