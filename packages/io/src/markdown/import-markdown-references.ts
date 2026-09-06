// GFM 참조 정의(`[id]: url`)와 참조 이미지/링크를 해석한다: definitionLookup이
// 정의 테이블을 모으고, expandImageReferencesFromText가 remark-parse가
// 텍스트로 남긴 참조 이미지 표기를 imageReference 노드로 재구성하고,
// resolveReferences가 정의 테이블로 실제 url을 채운다.
import {
  type MarkdownNode,
  type MarkdownRoot,
  normalizeIdentifier,
} from "./import-markdown-helpers.js";

export const definitionLookup = (root: MarkdownRoot): Map<string, string> => {
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

export const expandImageReferencesFromText = (
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

export const resolveReferences = (
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
