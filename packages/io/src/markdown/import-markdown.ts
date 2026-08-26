import {
  appendOrMergeInlineItem,
  type Document,
  type IdFactory,
  type InlineContent,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_LOGICAL_CELLS,
  parseDocument,
  type TextMark,
  validateTableSize,
} from "@cp949/geul-model";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { ImportError } from "../errors.js";
import type { Result } from "../result.js";

const DEFAULT_COLUMN_WIDTH = 160;
const parseProcessor = unified().use(remarkParse).use(remarkGfm);

type MarkdownNode = {
  type: string;
  value?: string;
  depth?: number;
  url?: string;
  alt?: string;
  identifier?: string;
  align?: Array<"left" | "right" | "center" | null>;
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
  children?: MarkdownNode[];
};

type MarkdownRoot = MarkdownNode & { type: "root"; children: MarkdownNode[] };

const normalizeIdentifier = (identifier: string): string =>
  identifier.trim().replace(/\s+/g, " ").toLowerCase();

const definitionLookup = (root: MarkdownRoot): Map<string, string> => {
  const definitions = new Map<string, string>();
  for (const node of root.children) {
    if (
      node.type !== "definition" ||
      node.identifier === undefined ||
      node.url === undefined
    ) {
      continue;
    }
    const identifier = normalizeIdentifier(node.identifier);
    if (!definitions.has(identifier)) definitions.set(identifier, node.url);
  }
  return definitions;
};

const fullImageReferenceTextPattern = /^!\[([^\]\n]*)\]\[([^\]\n]+)\]/;
const collapsedImageReferenceTextPattern = /^!\[([^\]\n]*)\]\[\]/;
const shortcutImageReferenceTextPattern = /^!\[([^\]\n]*)\](?!\[)/;

type ImageReferenceTextMatch = {
  matchedText: string;
  alt: string;
  identifier: string;
};

const matchImageReferenceText = (
  source: string,
): ImageReferenceTextMatch | undefined => {
  const full = fullImageReferenceTextPattern.exec(source);
  if (full !== null) {
    return {
      matchedText: full[0],
      alt: full[1] ?? "",
      identifier: normalizeIdentifier(full[2] ?? ""),
    };
  }

  const collapsed = collapsedImageReferenceTextPattern.exec(source);
  if (collapsed !== null) {
    const alt = collapsed[1] ?? "";
    return {
      matchedText: collapsed[0],
      alt,
      identifier: normalizeIdentifier(alt),
    };
  }

  const shortcut = shortcutImageReferenceTextPattern.exec(source);
  if (shortcut === null) return undefined;
  const alt = shortcut[1] ?? "";
  return {
    matchedText: shortcut[0],
    alt,
    identifier: normalizeIdentifier(alt),
  };
};

const expandImageReferencesFromText = (
  node: MarkdownNode,
  source: string,
): void => {
  if (node.children === undefined) return;

  node.children = node.children.flatMap((child) => {
    expandImageReferencesFromText(child, source);
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;
    if (
      child.type !== "text" ||
      child.value === undefined ||
      start === undefined ||
      end === undefined
    ) {
      return [child];
    }

    const raw = source.slice(start, end);
    if (raw !== child.value) return [child];

    const replacements: MarkdownNode[] = [];
    let cursor = 0;
    for (const prefix of raw.matchAll(/!\[/g)) {
      const matchIndex = prefix.index;
      if (matchIndex < cursor) continue;
      const match = matchImageReferenceText(raw.slice(matchIndex));
      if (match === undefined) continue;
      if (matchIndex > cursor) {
        replacements.push({
          type: "text",
          value: raw.slice(cursor, matchIndex),
        });
      }
      replacements.push({
        type: "imageReference",
        alt: match.alt,
        identifier: match.identifier,
      });
      cursor = matchIndex + match.matchedText.length;
    }
    if (replacements.length === 0) return [child];
    if (cursor < raw.length) {
      replacements.push({ type: "text", value: raw.slice(cursor) });
    }
    return replacements;
  });
};

const resolveReferences = (
  node: MarkdownNode,
  definitions: ReadonlyMap<string, string>,
): void => {
  if (
    (node.type === "imageReference" || node.type === "linkReference") &&
    node.identifier !== undefined
  ) {
    const destination = definitions.get(normalizeIdentifier(node.identifier));
    if (destination !== undefined) node.url = destination;
  }
  for (const child of node.children ?? []) {
    resolveReferences(child, definitions);
  }
};

export type ImportWarning = {
  kind:
    | "HEADING_DEPTH_DOWNGRADED"
    | "RAW_HTML_DOWNGRADED"
    | "LIST_DOWNGRADED"
    | "IMAGE_DOWNGRADED"
    | "UNSUPPORTED_BLOCK_DOWNGRADED"
    | "UNSUPPORTED_INLINE_DOWNGRADED";
  blockId: string;
  rowId?: string;
  cellId?: string;
  message: string;
};

export type ImportSuccess = {
  document: Document;
  warnings: ImportWarning[];
};

class MarkdownDocumentInvalidError extends Error {}

const createDefaultIdFactory = (): IdFactory => {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `markdown-${sequence}`;
  };
};

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

const readInlineNodes = (
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

const inlineContentFromNodes = (
  nodes: MarkdownNode[],
  warnings: ImportWarning[],
  location: InlineLocation,
): InlineContent => {
  const content: InlineContent = [];
  readInlineNodes(nodes, [], content, warnings, location);
  return content;
};

const tableFromNode = (
  node: MarkdownNode,
  createId: IdFactory,
  warnings: ImportWarning[],
): Document["blocks"][number] => {
  const tableId = createId();
  const sourceRows = node.children ?? [];
  const columnCount = sourceRows.reduce(
    (maximum, row) => Math.max(maximum, row.children?.length ?? 0),
    0,
  );
  const sizeViolation = validateTableSize({
    columnCount,
    rowCount: sourceRows.length,
  });
  if (sizeViolation !== undefined) {
    throw new MarkdownDocumentInvalidError(
      sizeViolation === "TOO_MANY_COLUMNS"
        ? `Table column count exceeds ${MAX_TABLE_COLUMNS}`
        : `Table logical cell count exceeds ${MAX_TABLE_LOGICAL_CELLS}`,
    );
  }

  const columns = Array.from({ length: columnCount }, () => ({
    id: createId(),
    width: DEFAULT_COLUMN_WIDTH,
  }));
  const rows = sourceRows.map((sourceRow) => {
    const rowId = createId();
    return {
      id: rowId,
      cells: columns.map((column, columnIndex) => {
        const cellId = createId();
        const sourceCell = sourceRow.children?.[columnIndex];
        const align = node.align?.[columnIndex] ?? null;
        return {
          id: cellId,
          columnId: column.id,
          rowSpan: 1,
          columnSpan: 1,
          content: inlineContentFromNodes(
            sourceCell?.children ?? [],
            warnings,
            {
              blockId: tableId,
              rowId,
              cellId,
              inTableCell: true,
            },
          ),
          ...(align === null ? {} : { align }),
        };
      }),
    };
  });

  return {
    id: tableId,
    type: "table",
    columns,
    rows,
    headerRows: rows.length === 0 ? 0 : 1,
    headerColumns: 0,
  };
};

const blockNodeTypes = new Set([
  "paragraph",
  "heading",
  "table",
  "list",
  "blockquote",
  "code",
  "html",
  "thematicBreak",
  "definition",
  "footnoteDefinition",
]);

const paragraphFromNodes = (
  nodes: MarkdownNode[],
  createId: IdFactory,
  warnings: ImportWarning[],
): Document["blocks"][number] => {
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

const paragraphFromText = (
  text: string,
  createId: IdFactory,
): Document["blocks"][number] => ({
  id: createId(),
  type: "paragraph",
  content: text.length === 0 ? [] : [{ text }],
});

const addListWarning = (blockId: string, warnings: ImportWarning[]): void => {
  warnings.push({
    kind: "LIST_DOWNGRADED",
    blockId,
    message: "List item was imported as one or more paragraphs",
  });
};

function listBlocksFromNode(
  node: MarkdownNode,
  createId: IdFactory,
  warnings: ImportWarning[],
): Document["blocks"] {
  const blocks: Document["blocks"] = [];

  for (const item of node.children ?? []) {
    if (item.type !== "listItem") {
      blocks.push(...blocksFromNode(item, createId, warnings));
      continue;
    }

    let itemParagraphId: string | undefined;
    for (const child of item.children ?? []) {
      if (child.type === "list") {
        if (itemParagraphId === undefined) {
          const paragraph = paragraphFromNodes([], createId, warnings);
          blocks.push(paragraph);
          itemParagraphId = paragraph.id;
          addListWarning(itemParagraphId, warnings);
        }
        blocks.push(...listBlocksFromNode(child, createId, warnings));
        continue;
      }

      const childBlocks = blocksFromNode(child, createId, warnings);
      blocks.push(...childBlocks);
      if (itemParagraphId === undefined) {
        const paragraph = childBlocks.find(
          (block) => block.type === "paragraph",
        );
        if (paragraph !== undefined) {
          itemParagraphId = paragraph.id;
          addListWarning(itemParagraphId, warnings);
        }
      }
    }

    if (itemParagraphId === undefined) {
      const paragraph = paragraphFromNodes([], createId, warnings);
      blocks.push(paragraph);
      addListWarning(paragraph.id, warnings);
    }
  }

  return blocks;
}

const unsupportedBlockText = (node: MarkdownNode): string =>
  node.value ?? node.alt ?? node.url ?? node.identifier ?? "";

function unsupportedBlocksFromNode(
  node: MarkdownNode,
  createId: IdFactory,
  warnings: ImportWarning[],
): Document["blocks"] {
  const hasBlockChildren =
    node.children?.some((child) => blockNodeTypes.has(child.type)) === true;
  const blocks = hasBlockChildren
    ? (node.children ?? []).flatMap((child) =>
        blocksFromNode(child, createId, warnings),
      )
    : [
        node.children !== undefined && node.children.length > 0
          ? paragraphFromNodes(node.children, createId, warnings)
          : paragraphFromText(unsupportedBlockText(node), createId),
      ];
  if (blocks.length === 0) {
    blocks.push(paragraphFromNodes([], createId, warnings));
  }
  const firstBlock = blocks[0];
  if (firstBlock !== undefined) {
    warnings.push({
      kind: "UNSUPPORTED_BLOCK_DOWNGRADED",
      blockId: firstBlock.id,
      message: `Unsupported block ${node.type} was imported as paragraphs`,
    });
  }
  return blocks;
}

function blocksFromNode(
  node: MarkdownNode,
  createId: IdFactory,
  warnings: ImportWarning[],
): Document["blocks"] {
  if (node.type === "definition") return [];
  if (node.type === "table") {
    return [tableFromNode(node, createId, warnings)];
  }
  if (node.type === "list") {
    return listBlocksFromNode(node, createId, warnings);
  }
  if (node.type === "paragraph") {
    return [paragraphFromNodes(node.children ?? [], createId, warnings)];
  }

  if (node.type === "heading") {
    const id = createId();
    const content = inlineContentFromNodes(node.children ?? [], warnings, {
      blockId: id,
      inTableCell: false,
    });
    const depth = node.depth ?? 0;
    if (depth >= 1 && depth <= 3) {
      return [
        {
          id,
          type: "heading",
          level: depth as 1 | 2 | 3,
          content,
        },
      ];
    }
    warnings.push({
      kind: "HEADING_DEPTH_DOWNGRADED",
      blockId: id,
      message: `Heading depth ${node.depth ?? "unknown"} was imported as a paragraph`,
    });
    return [{ id, type: "paragraph", content }];
  }

  if (node.type === "html") {
    return [paragraphFromNodes([node], createId, warnings)];
  }
  return unsupportedBlocksFromNode(node, createId, warnings);
}

const documentFromRoot = (
  root: MarkdownRoot,
  createId: IdFactory,
  warnings: ImportWarning[],
): Document => {
  const blocks = root.children.flatMap((node) =>
    blocksFromNode(node, createId, warnings),
  );

  return { formatVersion: 1, revision: 0, blocks };
};

const asMarkdownRoot = (node: unknown): MarkdownRoot | undefined => {
  if (
    typeof node !== "object" ||
    node === null ||
    !("type" in node) ||
    node.type !== "root" ||
    !("children" in node) ||
    !Array.isArray(node.children)
  ) {
    return undefined;
  }
  return node as MarkdownRoot;
};

export const importMarkdown = (
  source: string,
  options?: { createId?: IdFactory },
): Result<ImportSuccess, ImportError> => {
  try {
    const root = asMarkdownRoot(parseProcessor.parse(source));
    if (root === undefined) {
      return {
        ok: false,
        error: {
          code: "MARKDOWN_PARSE_FAILED",
          message: "Markdown parser did not produce a root node",
        },
      };
    }

    const warnings: ImportWarning[] = [];
    const definitions = definitionLookup(root);
    expandImageReferencesFromText(root, source);
    resolveReferences(root, definitions);
    const document = documentFromRoot(
      root,
      options?.createId ?? createDefaultIdFactory(),
      warnings,
    );
    const parsed = parseDocument(document);
    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          code: "MARKDOWN_DOCUMENT_INVALID",
          message: `Imported Markdown produced an invalid document: ${parsed.error.message}`,
        },
      };
    }
    return { ok: true, value: { document: parsed.value, warnings } };
  } catch (error) {
    if (error instanceof MarkdownDocumentInvalidError) {
      return {
        ok: false,
        error: {
          code: "MARKDOWN_DOCUMENT_INVALID",
          message: `Imported Markdown produced an invalid document: ${error.message}`,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "MARKDOWN_PARSE_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to parse Markdown",
      },
    };
  }
};
