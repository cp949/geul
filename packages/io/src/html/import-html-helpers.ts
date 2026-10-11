// importHtml 전반이 공유하는 leaf 유틸리티를 모은다: 텍스트 평탄화(textValue),
// 코드 언어 메타데이터 추출(classLanguages/firstDirectCode), id 발급
// (createDefaultIdFactory), TextBlockProps·인라인 콘텐츠 정규화, HAST 노드
// 판별(isElementNode/isListElement), document-import 전용 에러 타입까지 —
// 다른 신규 파일이 순환 없이 기대는 최하단 의존이다.
import {
  appendOrMergeInlineItem,
  type IdFactory,
  type InlineContent,
  isCanonicalCellAlign,
  isCanonicalCellColor,
  isValidCodeBlockLanguage,
  sanitizeInlineText,
  type TextBlockProps,
  type TextMark,
} from "@cp949/geul-model";

import { blockPresentation, type TextFormat } from "./element-presentation.js";
import { propertyInteger, propertyString } from "./hast-properties.js";
import type { HtmlImportContext } from "./import-context.js";
import { unsafeAttributeRemovedWarning } from "./import-warnings.js";
import {
  type HtmlElementNode,
  type HtmlNode,
  type HtmlRoot,
  inlineContentFromNodes,
} from "./inline-content.js";

// hast 속성 이름(dataGeulTextColor)을 HTML 속성 이름(data-geul-text-color)으로
// 바꾼다. 경고의 attribute는 HTML 이름이다.
const htmlAttributeName = (property: string): string =>
  property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

// 선택 표시 속성 값 하나를 model 판정(isValid)으로 거른다(Issue #358). 유효하면
// 값을, 무효하면 undefined를 돌려주고 UNSAFE_ATTRIBUTE_REMOVED를 낸다.
// - 판정 규칙은 호출자가 model export로 넘긴다. 여기서 복제하지 않는다.
// - 값이 없으면(undefined) 경고 없이 undefined다.
// - 버린 속성도 읽은 것으로 표시한다. 변환 뒤 감사가 같은 속성을 한 번 더
//   경고하지 않는다.
export const validOptionalValue = <T extends string | number>(
  context: HtmlImportContext,
  element: HtmlElementNode,
  property: string,
  value: T | undefined,
  isValid: (value: T) => boolean,
): T | undefined => {
  if (value === undefined || isValid(value)) return value;
  context.preserved.mark(element, property);
  context.warnOnce(
    element,
    property,
    unsafeAttributeRemovedWarning(element.tagName, htmlAttributeName(property)),
  );
  return undefined;
};

// TextBlockProps(RD-001) 3필드를 data-geul-*에서 읽는다. 표 셀 import의
// textColor/backgroundColor/align 읽기(import-html-table.ts의 modelRows
// 구성부)와 같은 전략이다. 값은 model 판정(isCanonicalCellColor,
// isCanonicalCellAlign)으로 거른다(G-CNV-001). 무효 값은 그 필드만 버리고
// 경고한다(Issue #358). 버린 필드는 style로 되살리지 않는다.
// data-geul-*가 없는 textColor/backgroundColor는 style의 color·
// background-color에서 채운다(Issue #334 단계 B, 외부 HTML). 필드별로 따진다 —
// data-geul-*가 있는 필드는 style을 보지 않고, 없는 필드만 style이 채운다. style
// 값은 canonical #RRGGBB 대문자로만 낸다(반투명·무효는 값 없음).
// textAlignment는 data-geul-*만 읽는다.
// styleOnly는 평범한 문단 div용이다 — data-geul-*는 p·h1~h6·blockquote·li·
// callout의 계약이라 div에서는 읽지 않고(정렬 포함) style만 읽는다(Issue #334
// 리뷰 MINOR-2).
export const textBlockPropsFromElement = (
  element: HtmlElementNode,
  context: HtmlImportContext,
  options?: {
    styleOnly?: boolean;
    promoted?: HtmlElementNode | undefined;
  },
): Partial<
  Pick<TextBlockProps, "textColor" | "backgroundColor" | "textAlignment">
> => {
  const styleOnly = options?.styleOnly === true;
  const rawTextColor = styleOnly
    ? undefined
    : propertyString(element, "dataGeulTextColor");
  const rawBackgroundColor = styleOnly
    ? undefined
    : propertyString(element, "dataGeulBackgroundColor");
  const dataTextColor = validOptionalValue(
    context,
    element,
    "dataGeulTextColor",
    rawTextColor,
    isCanonicalCellColor,
  );
  const dataBackgroundColor = validOptionalValue(
    context,
    element,
    "dataGeulBackgroundColor",
    rawBackgroundColor,
    isCanonicalCellColor,
  );
  // 두 필드가 모두 data-geul-*로 정해졌으면 style을 읽지 않는다(자기 export
  // 에코가 이 경우다). 무효라 버린 필드도 정해진 것으로 본다. 덤프가 붙은
  // style은 표식 뒤 text-decoration* 선언 뒤의 작성자 선언만 색으로 읽는다
  // (blockPresentation).
  const styled =
    rawTextColor !== undefined && rawBackgroundColor !== undefined
      ? undefined
      : blockPresentation(element).colors;
  // li·blockquote가 content로 승격한 p는 element 안쪽이라 element의 style 색을
  // 이긴다. data-geul-*는 여전히 먼저다(Issue #342).
  const promoted =
    styled === undefined || options?.promoted === undefined
      ? undefined
      : blockPresentation(options.promoted).colors;
  const textColor =
    rawTextColor === undefined
      ? (promoted?.textColor ?? styled?.textColor)
      : dataTextColor;
  const backgroundColor =
    rawBackgroundColor === undefined
      ? (promoted?.backgroundColor ?? styled?.backgroundColor)
      : dataBackgroundColor;
  const textAlignment = styleOnly
    ? undefined
    : (validOptionalValue(
        context,
        element,
        "dataGeulTextAlignment",
        propertyString(element, "dataGeulTextAlignment"),
        isCanonicalCellAlign,
      ) as TextBlockProps["textAlignment"] | undefined);
  return {
    ...(textColor === undefined ? {} : { textColor }),
    ...(backgroundColor === undefined ? {} : { backgroundColor }),
    ...(textAlignment === undefined ? {} : { textAlignment }),
  };
};

export class HtmlDocumentInvalidError extends Error {}

// inlineContentFromNodes가 만든 각 텍스트 조각에서 model이 거절하는
// 코드포인트(LF 제외 C0 제어문자, DEL, 짝 없는 surrogate)를 제거한다.
// 정책은 model의 sanitizeInlineText가 단독 소유하고(G-CNV-001) 여기서는
// 문단/헤딩/표 직속 비섹션 자식 문단/표 셀 생성 지점 네 곳이 재사용만 한다.
// whitespace collapsing은 도입하지 않는다(범위 밖) — 코드포인트 제거만
// 한다. 코드포인트 제거로 조각이 통째로 비면 버리고, 그 결과 같은 mark
// 조합을 가진 이웃 조각이 생기면 병합한다(빈 조각 제거만 하고 병합을
// 생략하면 같은 mark가 쪼개진 채 남아 export가 불필요하게 태그를 나눈다) —
// 이 스킵/병합 제어 흐름은 model의 appendOrMergeInlineItem이 소유하고
// inline-content.ts·cell-text.ts·import-markdown.ts·core의
// table-commands.ts도 같은 계약을 쓴다.
export const sanitizeInlineContentText = (
  content: InlineContent,
): InlineContent => {
  const sanitized: InlineContent = [];
  for (const rawItem of content) {
    // false widening: HTML 파서(inlineContentFromNodes)는 텍스트 런만
    // 만든다 — 커스텀 inline 원소를 생성하는 경로가 없다(DELTA-06과
    // 동일 근거).
    const item = rawItem as { text: string; marks?: TextMark[] };
    appendOrMergeInlineItem(
      sanitized,
      sanitizeInlineText(item.text),
      item.marks,
    );
  }
  return sanitized;
};

export const propertyHeaderFlag = (
  element: HtmlElementNode,
  name: string,
): 0 | 1 | undefined => {
  const value = propertyInteger(element, name, Number.NaN);
  return value === 0 || value === 1 ? value : undefined;
};

export const createDefaultIdFactory = (root: HtmlRoot): IdFactory => {
  const usedIds = new Set<string>();
  const idProperties = new Set([
    "dataGeulBlockId",
    "dataGeulColumnId",
    "dataGeulRowId",
    "dataGeulCellId",
  ]);

  const collectIds = (nodes: HtmlNode[]): void => {
    for (const node of nodes) {
      if (node.type !== "element") continue;
      for (const [name, value] of Object.entries(node.properties)) {
        if (idProperties.has(name) && typeof value === "string") {
          usedIds.add(value);
        }
      }
      collectIds(node.children);
    }
  };
  collectIds(root.children);

  let sequence = 0;
  return () => {
    let id: string;
    do {
      sequence += 1;
      id = `html-${sequence}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };
};

export const textValue = (nodes: HtmlNode[]): string =>
  nodes
    .map((node) =>
      node.type === "text"
        ? node.value
        : node.type === "element"
          ? node.tagName === "br"
            ? "\n"
            : textValue(node.children)
          : "",
    )
    .join("");

// hast className은 parse5 변환에서 token 배열이지만 수동 생성 HAST와
// sanitizer 표면을 모두 받기 위해 문자열도 방어적으로 처리한다. 한
// 위치의 첫 language-* suffix만 선택 우선순위에 쓰지만, 나머지 suffix도
// exact metadata conflict 판정에 필요하므로 순서대로 모두 반환한다.
export const classLanguages = (element: HtmlElementNode): string[] => {
  const className = element.properties.className;
  const tokens = Array.isArray(className)
    ? className.filter((value): value is string => typeof value === "string")
    : typeof className === "string"
      ? className.split(/\s+/)
      : [];
  return tokens.flatMap((token) =>
    token.startsWith("language-") && token.length > "language-".length
      ? [token.slice("language-".length)]
      : [],
  );
};

// language metadata에 참여하는 code는 pre의 첫 direct child뿐이다.
// descendant code를 찾으면 wrapper 안 metadata가 우선순위를 탈취한다.
export const firstDirectCode = (
  element: HtmlElementNode,
): HtmlElementNode | undefined =>
  element.children.find(
    (child): child is HtmlElementNode =>
      child.type === "element" && child.tagName === "code",
  );

// language 후보 중 무효라서 빠진 속성이다. attribute는 hast 속성 이름이다.
export type RejectedLanguageCandidate = {
  node: HtmlElementNode;
  attribute: "dataLanguage" | "className";
};

// 한 요소의 data-language 후보다. 무효면 빼고 rejected에 적는다. 빈 값은
// propertyString이 이미 걸러 미지정으로 본다.
const dataLanguageCandidates = (
  node: HtmlElementNode,
  rejected: RejectedLanguageCandidate[],
): string[] => {
  const value = propertyString(node, "dataLanguage");
  if (value === undefined) return [];
  if (isValidCodeBlockLanguage(value)) return [value];
  rejected.push({ node, attribute: "dataLanguage" });
  return [];
};

// 한 요소의 language-* class 후보다. 무효 토큰은 빼고, 하나라도 빠지면
// (노드, className)을 한 번만 rejected에 적는다.
const classLanguageCandidates = (
  node: HtmlElementNode,
  rejected: RejectedLanguageCandidate[],
): string[] => {
  const all = classLanguages(node);
  const valid = all.filter(isValidCodeBlockLanguage);
  if (valid.length < all.length)
    rejected.push({ node, attribute: "className" });
  return valid;
};

// pre의 language 후보를 우선순위대로 고른다(Issue #351). 클립보드 표
// 붙여넣기도 같은 변환기로 pre를 읽어 이 규칙을 쓴다.
// - 우선순위: 첫 직계 code의 data-language, pre의 data-language, 첫 직계
//   code의 language-* class, pre의 language-* class.
// - 무효 후보(비어 있지 않고 제어문자·짝 없는 surrogate가 든 값)는 없는
//   것으로 본다. 선택 후보와 exact 후보 양쪽에서 뺀다(Issue #353).
// - 빠진 후보는 rejected에 후보 순서대로 담는다. 같은 노드의 같은 속성은
//   한 번이다. 빠진 후보가 없으면 rejected 키가 없다.
// - 유효 후보가 하나라도 고른 값과 다르면 metadataConflict가 참이다. 한
//   요소의 language-* 토큰 여럿도 후보다.
// - 경고를 낼지는 호출자가 정한다. 값 정규화(canonicalize)도 호출자 몫이다.
export const selectCodeBlockLanguage = (
  preNode: HtmlElementNode,
): {
  language: string | undefined;
  metadataConflict: boolean;
  rejected?: RejectedLanguageCandidate[];
} => {
  const rejected: RejectedLanguageCandidate[] = [];
  const directCode = firstDirectCode(preNode);
  const directCodeData =
    directCode === undefined
      ? []
      : dataLanguageCandidates(directCode, rejected);
  const preData = dataLanguageCandidates(preNode, rejected);
  const directCodeClass =
    directCode === undefined
      ? []
      : classLanguageCandidates(directCode, rejected);
  const preClass = classLanguageCandidates(preNode, rejected);
  const selectionCandidates = [
    directCodeData[0],
    preData[0],
    directCodeClass[0],
    preClass[0],
  ].filter((value): value is string => value !== undefined);
  const language = selectionCandidates[0];
  const exactMetadataCandidates = [
    ...directCodeData,
    ...preData,
    ...directCodeClass,
    ...preClass,
  ];
  return {
    language,
    metadataConflict:
      language !== undefined &&
      exactMetadataCandidates.some((candidate) => candidate !== language),
    ...(rejected.length > 0 ? { rejected } : {}),
  };
};

// baseFormat은 블록 요소 style의 서식(blockPresentation의 format)을 안쪽
// 텍스트에 싣는다(Issue #334 단계 B). 호출부가 블록 요소를 알 때만 넘긴다.
//
// 읽는 텍스트 노드마다 context가 글자 정제 경고를 검사한다(RD-001).
export const paragraphContentFromNodes = (
  nodes: HtmlNode[],
  context: HtmlImportContext,
  baseFormat?: TextFormat,
): InlineContent =>
  sanitizeInlineContentText(
    inlineContentFromNodes(nodes, {
      ...(baseFormat === undefined ? {} : { baseFormat }),
      onText: context.codePoints.inlineText,
    }),
  );

export const isElementNode = (node: HtmlNode): node is HtmlElementNode =>
  node.type === "element";

export const isListElement = (
  node: HtmlNode,
): node is HtmlElementNode & { tagName: "ul" | "ol" } =>
  node.type === "element" && (node.tagName === "ul" || node.tagName === "ol");
