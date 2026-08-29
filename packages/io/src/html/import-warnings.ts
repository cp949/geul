import {
  isSupportedLinkHref,
  MAX_NESTING_DEPTH,
  sanitizeInlineText,
} from "@cp949/geul-model";

import {
  isTransparentListTag,
  NESTED_BOUNDARY_TAG_NAMES,
} from "./block-segmenter.js";
import type { HtmlNode, HtmlRoot } from "./inline-content.js";
import { MAX_HTML_TREE_DEPTH } from "./parse-html.js";
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
    }
  // 아래 두 kind는 특정 요소 하나에 귀속되지 않는 구조 절단이라 element
  // 필드가 없다 — 절단은 트리·중첩 깊이라는 위치 축에서 일어나고, 절단된
  // 서브트리의 보이는 텍스트는 결과에 보존된다(G-CNV-002).
  | {
      // HTML 트리 깊이가 MAX_HTML_TREE_DEPTH를 넘어 캡에서 절단됐다
      // (Issue #130). 절단 자체는 parseHtmlFragment의 깊이-캡 패스가
      // 수행하고, 이 경고는 그 반환값(truncated)을 문서 import 경로가
      // 경고로 바꾼 것이다.
      kind: "DEEP_TREE_FLATTENED";
      message: string;
    }
  | {
      // children wrapper 중첩이 model 상한(MAX_NESTING_DEPTH)에 걸려
      // 초과분이 형제 문단으로 평탄화됐다(Issue #132). 전면 거절 대신
      // 텍스트를 보존한다.
      kind: "NESTED_CHILDREN_FLATTENED";
      message: string;
    };

// 두 평탄화 경고의 메시지 문안은 이 모듈이 단독 소유한다 — 발생 지점
// (import-html.ts의 parse 직후, blocksFromNodes의 깊이 가드)이 문안을 각자
// 들고 있으면 같은 사실이 두 표현으로 갈라진다.
export const deepTreeFlattenedWarning = (): HtmlImportWarning => ({
  kind: "DEEP_TREE_FLATTENED",
  message: `HTML nested deeper than ${MAX_HTML_TREE_DEPTH} levels was flattened to text`,
});

export const nestedChildrenFlattenedWarning = (): HtmlImportWarning => ({
  kind: "NESTED_CHILDREN_FLATTENED",
  message: `Blocks nested deeper than ${MAX_NESTING_DEPTH} levels were flattened into sibling paragraphs`,
});

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
// div/li/blockquote/ul/ol은 htmlAllowedTagNames가 이제 문단 경계로 허용하고
// (아키텍처 리뷰 2차 후보 G), h4~h6·hr은 DELTA-06(Issue #38)이 heading 4~6·
// divider 매핑으로 승격했다 — sanitize가 더 이상 이 태그를 unwrap하지
// 않으므로 SAFE_BLOCK_DOWNGRADED로 강등됐다고 보고하면 사실과 어긋난다
// (G-CNV-002: 경고 목록은 실제 지원과 일치해야 한다).
// 이 집합은 raw HAST(sanitize 이전)를 검사하므로 sanitize 허용 목록과
// 별개로 직접 갱신해야 한다 — 둘을 하나로 합치면 이 파일이 sanitize-schema
// 구현 디테일에 결합된다.
const supportedBlockNames = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "div",
  "li",
  "blockquote",
  "ul",
  "ol",
  "table",
]);

// div/li/blockquote/ul/ol은 block-segmenter.ts가 "경계를 통과해 더 깊은
// 경계를 인식시키는" 투명 컨테이너로 취급한다(재귀 경계·wrapper 태그, 아키텍처
// 리뷰 2차 후보 G). 이 파일의 topLevel 판정도 같은 취급이어야 한다 — 이
// 다섯 태그를 통과해 내려가도 여전히 "블록 위치"이므로, 그 자식에서
// 미지원 태그를 만나면 topLevel 판정 그대로 SAFE_BLOCK_DOWNGRADED를
// 내야 한다. block-segmenter.ts의 태그 집합을 그대로 재사용해야
// sanitize-schema.ts/import-warnings.ts와의 3중 중복(설계 리뷰 지적)을
// 더 늘리지 않는다.
const isBlockBoundaryTag = (tagName: string): boolean =>
  NESTED_BOUNDARY_TAG_NAMES.has(tagName) || isTransparentListTag(tagName);

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

    collectFromNodes(
      node.children,
      warnings,
      topLevel && isBlockBoundaryTag(node.tagName),
      node.tagName,
    );
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
