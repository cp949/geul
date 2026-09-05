import {
  isSupportedLinkHref,
  MAX_NESTING_DEPTH,
  sanitizeInlineText,
} from "@cp949/geul-model";

import {
  isTransparentListTag,
  NESTED_BOUNDARY_TAG_NAMES,
} from "./block-segmenter.js";
import type { HtmlElementNode, HtmlNode, HtmlRoot } from "./inline-content.js";
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
    }
  | {
      // sanitized pre/code metadata 우선순위에서 선택되지 않은 exact
      // 값이 선택값과 충돌했다. blockId는 warning 생성 전에 확정한
      // 최종 CodeBlock id이다.
      kind: "CODE_BLOCK_LANGUAGE_METADATA_IGNORED";
      blockId: string;
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

export const codeBlockLanguageMetadataIgnoredWarning = (
  blockId: string,
): HtmlImportWarning => ({
  kind: "CODE_BLOCK_LANGUAGE_METADATA_IGNORED",
  blockId,
  message: `Conflicting CodeBlock language metadata was ignored for block ${blockId}`,
});

const unsafeElementNames = new Set([
  ...htmlStrippedTagNames,
  // img/audio/video는 RD-001-DELTA-02부터 document import 전용 allowlist
  // (import-html.ts의 htmlImportSanitizeSchema)에 있어 더 이상 실제로
  // 제거되지 않는다 — 이 집합에 남기면 "제거됨" 경고가 거짓이 된다
  // (G-CNV-002). source는 own export가 <source> 자식을 내지 않아(항상
  // src 속성만 쓴다) 계속 실제로 제거되므로 남긴다.
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
  "pre",
  "div",
  "li",
  "blockquote",
  "ul",
  "ol",
  "table",
  // details는 isToggleable heading·toggleListItem의 HTML 표현이다
  // (RD-005-DELTA-01, 로드맵 D4). table과 같은 이유로 자식(summary/children
  // div/내부 hN)은 별도 등록이 필요 없다 — details는 isBlockBoundaryTag에
  // 없어 자식으로 내려가면 topLevel이 자동으로 꺼진다(150행 부근 주석).
  "details",
  // 4종 미디어 블록(file/image/video/audio, spec §7.1)의 bare 시각
  // 태그·wrapper다(RD-001-DELTA-02). figure와 같은 이유로 자식(img/a/
  // figcaption)은 별도 등록이 필요 없다 — figure/img/video/audio 모두
  // isBlockBoundaryTag에 없어 자식으로 내려가면 topLevel이 꺼진다. own-format
  // File <a>(마커 있는 <a>)는 태그명 집합이 아니라 isOwnMediaAnchorElement
  // 노드 판정으로 별도 처리한다(아래) — <a>는 일반 링크의 보편적 캐리어라 이
  // 집합에 통째로 넣으면 마커 없는 임의 링크까지 downgrade 경고가 사라진다.
  "img",
  "video",
  "audio",
  "figure",
  "figcaption",
]);

// data-be-media-type 값 검사만으로 own-format File 앵커를 판정한다 — 정확한
// 4종 판정(isMediaNode/mediaTypeFromNode)은 import-html.ts가 단독 소유하고
// (sanitizer 결합 회피 원칙, 위 파일 헤더 주석), 이 파일은 독립적으로
// 마커 유효성만 다시 확인한다. 마커 없는 임의 <a>는 여전히 top-level
// downgrade 경고 대상이다(기존 동작 불변).
const isOwnMediaAnchorElement = (node: HtmlElementNode): boolean => {
  if (node.tagName !== "a") return false;
  const mediaType = node.properties.dataBeMediaType;
  return (
    mediaType === "file" ||
    mediaType === "image" ||
    mediaType === "video" ||
    mediaType === "audio"
  );
};

// 이 집합은 warning 판정만 소유한다. sanitizer 허용 목록과 공유하면 raw
// warning fact 수집기가 sanitize 구현에 결합된다(ADR-0003). 이 요소들은
// 지원 경계 컨테이너 안에서 mark·link·줄바꿈 의미로 보존되므로 블록
// 강등 경고 대상이 아니다. 루트 인라인은 기존 강등 경고 계약을 유지한다.
const supportedInlineNames = new Set([
  "strong",
  "em",
  "u",
  "s",
  "code",
  "a",
  "br",
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
  insideSupportedBoundary: boolean,
  parentElement: string,
  insideCodeBlockPre: boolean,
  insideTable: boolean,
): void => {
  for (const node of nodes) {
    if (node.type === "text") {
      // raw HAST 텍스트 노드 기준으로 sanitize 전후를 비교한다(G-CNV-002 —
      // warning fact는 raw HAST에서 수집한다). 정책은 model의
      // sanitizeInlineText가 단독 소유한다(G-CNV-001).
      if (
        !insideCodeBlockPre &&
        sanitizeInlineText(node.value) !== node.value
      ) {
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
    } else if (
      topLevel &&
      !supportedBlockNames.has(node.tagName) &&
      !(insideSupportedBoundary && supportedInlineNames.has(node.tagName)) &&
      !isOwnMediaAnchorElement(node)
    ) {
      warnings.push({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: node.tagName,
        message: `Unsupported ${node.tagName} block was downgraded to paragraph content`,
      });
    }

    const allowedAttributes = new Set(
      htmlAllowedAttributes[node.tagName] ?? htmlAllowedAttributes["*"] ?? [],
    );
    // code의 language/class metadata는 CodeBlock의 pre 안에서만 의미가 있다.
    // sanitizer schema는 semantic importer의 입력 보존을 위해 이를 남기지만,
    // raw warning은 현재 문맥에서 실제로 지원되는 속성만 보고한다.
    if (!insideCodeBlockPre && node.tagName === "code") {
      allowedAttributes.delete("dataLanguage");
      allowedAttributes.delete("className");
    }
    // table cell의 pre는 TableCell.content 인라인 경로로 변환돼 CodeBlock
    // id/language/class 의미를 갖지 않는다. sanitizer가 semantic importer
    // 입력 보존을 위해 남긴 속성이라도 이 문맥에서는 실제로 버려진다.
    if (insideTable && node.tagName === "pre") {
      allowedAttributes.delete("dataBeBlockId");
      allowedAttributes.delete("dataLanguage");
      allowedAttributes.delete("className");
    }
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
      topLevel &&
        (isBlockBoundaryTag(node.tagName) ||
          (insideSupportedBoundary && supportedInlineNames.has(node.tagName))),
      insideSupportedBoundary || isBlockBoundaryTag(node.tagName),
      node.tagName,
      insideCodeBlockPre || (node.tagName === "pre" && !insideTable),
      insideTable || node.tagName === "table",
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
  collectFromNodes(root.children, warnings, true, false, "text", false, false);
  return warnings;
};
