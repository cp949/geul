// document-import 경로가 block-segmenter.ts에 넘기는 BlockSegmentPolicy를
// 담당한다: 문단/헤딩/구분선/표/인용/코드블록/미디어 경계를 판정하는
// importBlockSegmentPolicy 정책 객체(RD-001~RD-005의 판정을 한곳에 모은다).
// 판정이 읽는 태그 이름 표(headingLevelByTagName 등)는 block-tag-names.ts가
// 소유한다(Issue #369).
import type { HeadingBlock } from "@cp949/geul-model";

import {
  type BlockSegmentPolicy,
  isParagraphTag,
  isTransparentListTag,
  NESTED_BOUNDARY_TAG_NAMES,
} from "./block-segmenter.js";
import {
  CAPTION_WRAPPER_TAG_NAME,
  CODE_BLOCK_TAG_NAME,
  DIVIDER_TAG_NAME,
  headingLevelByTagName,
  MEDIA_WRAPPER_TAG_NAME,
  TABLE_TAG_NAME,
  TOGGLE_TAG_NAME,
} from "./block-tag-names.js";
import { propertyString } from "./hast-properties.js";
import { isElementNode } from "./import-html-helpers.js";
import { isMediaNode } from "./import-html-media.js";
import type { HtmlElementNode } from "./inline-content.js";

// 소비처(import-html-wrappers.ts 등)가 이 module에서 읽도록 다시 export한다.
export { headingLevelByTagName };

// 코드블록 caption(RD-002-DELTA-03)의 <figure><pre>…</pre>
// <figcaption>…</figcaption></figure> 래핑 판별. isMediaNode(import-html-
// media.ts)와 마찬가지로 figure가 media caption과 codeBlock caption 두 의미를
// 겸하는 태그라 태그명만으로는 판정할 수 없다.
// 정규형만 codeBlock figure로 승격한다(Issue #355).
// - 요소 자식이 pre 정확히 1개 + figcaption 0–1개다. 순서는 무관하다.
// - 그 밖의 요소 자식은 없다.
// - 공백만 있는 텍스트 노드는 무시한다. 공백이 아닌 텍스트가 있으면 비정규다.
// 변환기는 pre와 figcaption만 읽는다. 정규형이 아니면 읽지 않는 자식이
// 경고 없이 사라진다. 승격하지 않으면 figure는 div처럼 문단 경계가 되어
// 자식 글자가 문서 순서대로 형제 블록에 남는다.
const isCodeBlockFigureNode = (node: HtmlElementNode): boolean => {
  if (node.tagName !== MEDIA_WRAPPER_TAG_NAME) return false;
  let preCount = 0;
  let figcaptionCount = 0;
  for (const child of node.children) {
    if (isElementNode(child)) {
      if (child.tagName === CODE_BLOCK_TAG_NAME) preCount += 1;
      else if (child.tagName === CAPTION_WRAPPER_TAG_NAME) figcaptionCount += 1;
      else return false;
    } else if (child.type === "text" && child.value.trim() !== "") {
      return false;
    }
  }
  return preCount === 1 && figcaptionCount <= 1;
};

// callout(Issue #209 RD-003 DELTA-01) — div가 own-content 블록(quote의
// blockquote와 동형)을 겸하는 첫 사례라 isMediaNode/isCodeBlockFigureNode와
// 같은 이유로 태그명만으로는 판정할 수 없다. dataGeulCallout 마커가 있는
// div만 승격하고, 마커 없는 일반 div는 그대로 isNestedBoundary(문단 경계)로
// 남는다.
const isCalloutNode = (node: HtmlElementNode): boolean =>
  node.tagName === "div" && propertyString(node, "dataGeulCallout") === "true";

// figure·figcaption·details·summary는 importHtml 전용 sanitize만 살린다
// (import-html-sanitize-schema.ts). 미디어·codeBlock figure, toggle details로
// 읽히지 않으면 div처럼 문단 경계다. 브라우저도 이 경계에서 줄을 바꾼다.
// 경계가 아니면 바깥 문단에 구분자 없이 이어 붙고, 소스 공백 접기가 경계의
// 공백을 지워 단어가 붙는다(Issue #323).
const importOnlyNestedBoundaryTagNames = new Set([
  TOGGLE_TAG_NAME,
  CAPTION_WRAPPER_TAG_NAME,
  MEDIA_WRAPPER_TAG_NAME,
  "summary",
]);

// documentFromRoot의 재귀 경계 판정(문단/헤딩/구분선/표 시퀀스로 쪼개기)은
// block-segmenter.ts가 한다(아키텍처 리뷰 2차 후보 G) — p/h1~h3/table만 보던
// 예전 documentFromRoot는 최상위 노드만 훑는 평면 루프라 div/li/blockquote/
// ul/ol처럼 중첩 가능한 경계를 인식하지 못했다(Issue #113과 같은 종류의
// 병합). h1~h6 전부 heading이다(DELTA-08, Issue #38 슬라이스 3).
// hr은 콘텐츠 없는 세그먼트로 받아 divider 블록으로 옮긴다(spec §7.1).
// blockquote도 같은 방식으로 세그먼트로 받아 quote 블록으로 옮긴다
// (DELTA-06a, D6 분할 규칙은 splitQuoteChildren).
// 클립보드 표 붙여넣기도 표 옆 블록을 이 정책으로 읽는다. 표 판정만
// importBlockSegmentPolicyWith로 바꾼다(Issue #356 RD-005).
export const importBlockSegmentPolicy: BlockSegmentPolicy<
  HeadingBlock["level"],
  true
> = {
  isSimpleBoundary: isParagraphTag,
  headingLevelFromTagName: (tagName) => headingLevelByTagName.get(tagName),
  isNestedBoundary: (tagName) =>
    NESTED_BOUNDARY_TAG_NAMES.has(tagName) ||
    importOnlyNestedBoundaryTagNames.has(tagName),
  isTransparent: isTransparentListTag,
  // 래퍼(div·span·b·a 등) 안의 ul/ol도 목록 세그먼트로 받는다(Issue #336,
  // Issue #356 RD-005 DELTA-04). 노드 목록 직속 ul/ol은 blocksFromNodes가 먼저
  // 읽어 이 판정에 오지 않는다. isTransparent보다 먼저 판정된다.
  isListTag: isTransparentListTag,
  omitStructuralAncestors: true,
  isTableNode: (node) => node.tagName === TABLE_TAG_NAME,
  isDividerTag: (tagName) => tagName === DIVIDER_TAG_NAME,
  isQuoteTag: (tagName) => tagName === "blockquote",
  isCodeBlockTag: (tagName) => tagName === CODE_BLOCK_TAG_NAME,
  isCodeBlockFigureNode,
  isMediaNode,
  isCalloutNode,
};

// 표 판정만 바꾼 정책. 판정이 기본 판정이면 모듈 상수를 그대로 돌려준다.
// 표 seam을 주입받는 변환기가 세그먼트 분할에 쓴다.
export const importBlockSegmentPolicyWith = (
  isTableNode: (node: HtmlElementNode) => boolean,
): typeof importBlockSegmentPolicy =>
  isTableNode === importBlockSegmentPolicy.isTableNode
    ? importBlockSegmentPolicy
    : { ...importBlockSegmentPolicy, isTableNode };
