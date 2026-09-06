// importHtml 전반이 공유하는 leaf 유틸리티를 모은다: 텍스트 평탄화(textValue),
// 코드 언어 메타데이터 추출(classLanguages/firstDirectCode), id 발급
// (createDefaultIdFactory), TextBlockProps·인라인 콘텐츠 정규화, HAST 노드
// 판별(isElementNode/isListElement), document-import 전용 에러 타입까지 —
// 다른 신규 파일이 순환 없이 기대는 최하단 의존이다.
import {
  appendOrMergeInlineItem,
  type IdFactory,
  type InlineContent,
  sanitizeInlineText,
  type TextBlockProps,
  type TextMark,
} from "@cp949/geul-model";

import { propertyInteger, propertyString } from "./hast-properties.js";
import {
  type HtmlElementNode,
  type HtmlNode,
  type HtmlRoot,
  inlineContentFromNodes,
} from "./inline-content.js";

// TextBlockProps(RD-001) 3필드를 data-be-*에서 읽는다. 표 셀 import의
// textColor/backgroundColor/align 읽기(import-html-table.ts의 modelRows
// 구성부)와 같은 전략 — 정규형 검증은 하지 않고 원시 문자열을 그대로
// 통과시킨다. 최종 검증은 importHtml 끝의 parseDocument 한 곳(G-CNV-001)이
// 한다.
export const textBlockPropsFromElement = (
  element: HtmlElementNode,
): Partial<
  Pick<TextBlockProps, "textColor" | "backgroundColor" | "textAlignment">
> => {
  const textColor = propertyString(element, "dataBeTextColor");
  const backgroundColor = propertyString(element, "dataBeBackgroundColor");
  const textAlignment = propertyString(element, "dataBeTextAlignment") as
    TextBlockProps["textAlignment"] | undefined;
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
    "dataBeBlockId",
    "dataBeColumnId",
    "dataBeRowId",
    "dataBeCellId",
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

export const paragraphContentFromNodes = (nodes: HtmlNode[]): InlineContent =>
  sanitizeInlineContentText(inlineContentFromNodes(nodes));

export const isElementNode = (node: HtmlNode): node is HtmlElementNode =>
  node.type === "element";

export const isListElement = (
  node: HtmlNode,
): node is HtmlElementNode & { tagName: "ul" | "ol" } =>
  node.type === "element" && (node.tagName === "ul" || node.tagName === "ol");
