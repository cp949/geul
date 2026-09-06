// mdast 인라인 노드를 model InlineContent로 옮긴다. raw HTML·이미지 등
// InlineContent가 표현할 수 없는 노드는 평문으로 다운그레이드하고 경고를
// 남긴다(G-CNV-002).
import {
  appendOrMergeInlineItem,
  type InlineContent,
  type TextMark,
} from "@cp949/geul-model";

import {
  type MarkdownNode,
  normalizeIdentifier,
} from "./import-markdown-helpers.js";
import type { ImportWarning } from "./import-markdown-warnings.js";

type InlineLocation = {
  blockId: string;
  rowId?: string;
  cellId?: string;
  inTableCell: boolean;
};

const rawHtmlText = (node: MarkdownNode, location: InlineLocation): string => {
  const value = node.value ?? "";
  if (location.inTableCell && (value === "<br>" || value === "<br />")) {
    return "\n";
  }
  return value;
};

export const readInlineNodes = (
  nodes: MarkdownNode[],
  marks: TextMark[],
  content: InlineContent,
  warnings: ImportWarning[],
  location: InlineLocation,
): void => {
  for (const node of nodes) {
    switch (node.type) {
      case "text":
      case "inlineCode":
        appendOrMergeInlineItem(
          content,
          node.value ?? "",
          node.type === "inlineCode" ? [...marks, { type: "code" }] : marks,
        );
        break;
      case "break":
        appendOrMergeInlineItem(content, "\n", marks);
        break;
      case "html": {
        const value = rawHtmlText(node, location);
        appendOrMergeInlineItem(content, value, marks);
        if (value !== "\n") {
          warnings.push({
            kind: "RAW_HTML_DOWNGRADED",
            blockId: location.blockId,
            ...(location.rowId === undefined ? {} : { rowId: location.rowId }),
            ...(location.cellId === undefined
              ? {}
              : { cellId: location.cellId }),
            message: "Raw HTML was imported as plain text",
          });
        }
        break;
      }
      case "image":
      case "imageReference": {
        const alt = node.alt ?? "";
        const destination = node.url ?? "";
        const missingIdentifier =
          node.type === "imageReference" && destination.length === 0
            ? normalizeIdentifier(node.identifier ?? "")
            : "";
        const visibleText =
          missingIdentifier.length > 0
            ? alt.length > 0
              ? `${alt} [${missingIdentifier}]`
              : `[${missingIdentifier}]`
            : alt.length > 0 && destination.length > 0
              ? `${alt} (${destination})`
              : alt || destination;
        appendOrMergeInlineItem(content, visibleText, marks);
        warnings.push({
          kind: "IMAGE_DOWNGRADED",
          blockId: location.blockId,
          ...(location.rowId === undefined ? {} : { rowId: location.rowId }),
          ...(location.cellId === undefined ? {} : { cellId: location.cellId }),
          message: "Image was imported as plain text",
        });
        break;
      }
      case "strong":
        readInlineNodes(
          node.children ?? [],
          [...marks, { type: "bold" }],
          content,
          warnings,
          location,
        );
        break;
      case "emphasis":
        readInlineNodes(
          node.children ?? [],
          [...marks, { type: "italic" }],
          content,
          warnings,
          location,
        );
        break;
      case "delete":
        readInlineNodes(
          node.children ?? [],
          [...marks, { type: "strike" }],
          content,
          warnings,
          location,
        );
        break;
      case "link":
        readInlineNodes(
          node.children ?? [],
          [...marks, { type: "link", href: node.url ?? "" }],
          content,
          warnings,
          location,
        );
        break;
      case "linkReference":
        if (node.url !== undefined && node.url.length > 0) {
          readInlineNodes(
            node.children ?? [],
            [...marks, { type: "link", href: node.url }],
            content,
            warnings,
            location,
          );
          break;
        }
        warnings.push({
          kind: "UNSUPPORTED_INLINE_DOWNGRADED",
          blockId: location.blockId,
          ...(location.rowId === undefined ? {} : { rowId: location.rowId }),
          ...(location.cellId === undefined ? {} : { cellId: location.cellId }),
          message: `Unresolved link reference ${normalizeIdentifier(node.identifier ?? "")} was imported as plain text`,
        });
        readInlineNodes(
          node.children ?? [],
          marks,
          content,
          warnings,
          location,
        );
        break;
      default:
        warnings.push({
          kind: "UNSUPPORTED_INLINE_DOWNGRADED",
          blockId: location.blockId,
          ...(location.rowId === undefined ? {} : { rowId: location.rowId }),
          ...(location.cellId === undefined ? {} : { cellId: location.cellId }),
          message: `Unsupported inline ${node.type} was imported as plain text`,
        });
        if (node.children !== undefined) {
          readInlineNodes(node.children, marks, content, warnings, location);
        } else {
          appendOrMergeInlineItem(
            content,
            node.value ?? node.alt ?? node.url ?? node.identifier ?? "",
            marks,
          );
        }
    }
  }
};

export const inlineContentFromNodes = (
  nodes: MarkdownNode[],
  warnings: ImportWarning[],
  location: InlineLocation,
): InlineContent => {
  const content: InlineContent = [];
  readInlineNodes(nodes, [], content, warnings, location);
  return content;
};
