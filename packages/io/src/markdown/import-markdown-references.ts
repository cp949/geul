// GFM 참조 정의(`[id]: url`)와 참조 이미지/링크를 해석한다: definitionLookup이
// 정의 테이블을 모으고, expandImageReferencesFromText가 remark-parse가
// 텍스트로 남긴 참조 이미지 표기를 imageReference 노드로 재구성하고,
// resolveReferences가 정의 테이블로 실제 url을 채운다.
// expandImageReferencesFromText는 text 값을 소스와 글자 단위로 맞춘 마스크 위에서 읽는다
// (Issue #422, import-markdown-source-alignment.ts).
// - `!`, `[`, `]`가 소스에 글자 그대로일 때만 구조다. `\![a][x]`, `&excl;[a][x]`는 평문이다.
// - alt와 식별자는 마스크 매치 구간의 `value`를 잘라 쓴다. 이스케이프·문자 참조가 풀린 글자다.
// - 식별자(collapsed·shortcut은 alt)에 이스케이프·문자 참조가 있으면 정의로 해석하지 않는다.
//   CommonMark는 라벨을 디코딩 전 원문으로 대조한다. 풀어 쓴 글자로 대조하면 안 된다.
// - 맞출 수 없으면 노드를 그대로 둔다. 일반 입력에서는 닿지 않고,
//   걸음 수 예산을 넘는 이름형 참조 연쇄 같은 극단 입력에서만 닿는다.
// - 파서가 만든 text는 모두 `position`이 있다. gfm-parse-processor.ts가 위치를 잃게 하던
//   autolink literal 변환을 끈다(Issue #423). 위치 없는 text는 안전망으로만 다룬다.
import {
  type MarkdownNode,
  type MarkdownRoot,
  normalizeIdentifier,
} from "./import-markdown-helpers.js";
import { alignTextToSource } from "./import-markdown-source-alignment.js";

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
  /** 마스크에서 매치가 차지한 길이. `value`에서도 같은 길이다. */
  length: number;
  alt: string;
  identifier: string;
  /** 식별자 구간에 이스케이프·문자 참조가 있다. 라벨 대조는 원문 기준이라 어떤 정의와도 맞지 않는다. */
  decodedIdentifier: boolean;
};

/**
 * `mask`는 `value`와 길이가 같다. 구조는 `mask`로 찾고 alt·식별자는 `value`에서 자른다.
 * 식별자 구간의 마스크가 `value`와 다르면 그 라벨에 이스케이프·문자 참조가 있다.
 */
const matchImageReferenceText = (
  mask: string,
  value: string,
  from: number,
): ImageReferenceTextMatch | undefined => {
  const source = mask.slice(from);
  const altStart = from + 2;
  const isDecoded = (start: number, length: number): boolean =>
    mask.slice(start, start + length) !== value.slice(start, start + length);

  const full = fullImageReferenceTextPattern.exec(source);
  if (full !== null) {
    const altLength = (full[1] ?? "").length;
    const identifierStart = altStart + altLength + 2;
    const identifierLength = (full[2] ?? "").length;
    return {
      length: full[0].length,
      alt: value.slice(altStart, altStart + altLength),
      identifier: normalizeIdentifier(
        value.slice(identifierStart, identifierStart + identifierLength),
      ),
      decodedIdentifier: isDecoded(identifierStart, identifierLength),
    };
  }

  const collapsed = collapsedImageReferenceTextPattern.exec(source);
  if (collapsed !== null) {
    const altLength = (collapsed[1] ?? "").length;
    const alt = value.slice(altStart, altStart + altLength);
    return {
      length: collapsed[0].length,
      alt,
      identifier: normalizeIdentifier(alt),
      decodedIdentifier: isDecoded(altStart, altLength),
    };
  }

  const shortcut = shortcutImageReferenceTextPattern.exec(source);
  if (shortcut === null) return undefined;
  const altLength = (shortcut[1] ?? "").length;
  const alt = value.slice(altStart, altStart + altLength);
  return {
    length: shortcut[0].length,
    alt,
    identifier: normalizeIdentifier(alt),
    decodedIdentifier: isDecoded(altStart, altLength),
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

    const value = child.value;
    if (!value.includes("![")) return [child];
    const mask = alignTextToSource(value, source.slice(start, end));
    if (mask === undefined) return [child];

    const replacements: MarkdownNode[] = [];
    let cursor = 0;
    for (const prefix of mask.matchAll(/!\[/g)) {
      const matchIndex = prefix.index;
      if (matchIndex < cursor) continue;
      const match = matchImageReferenceText(mask, value, matchIndex);
      if (match === undefined) continue;
      if (matchIndex > cursor) {
        replacements.push({
          type: "text",
          value: value.slice(cursor, matchIndex),
        });
      }
      replacements.push({
        type: "imageReference",
        alt: match.alt,
        identifier: match.identifier,
        ...(match.decodedIdentifier ? { skipDefinition: true } : {}),
      });
      cursor = matchIndex + match.length;
    }
    if (replacements.length === 0) return [child];
    if (cursor < value.length) {
      replacements.push({ type: "text", value: value.slice(cursor) });
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
    node.identifier !== undefined &&
    node.skipDefinition !== true
  ) {
    const destination = definitions.get(normalizeIdentifier(node.identifier));
    if (destination !== undefined) node.url = destination;
  }
  for (const child of node.children ?? []) {
    resolveReferences(child, definitions);
  }
};
