import {
  isSupportedLinkHref,
  MAX_NESTING_DEPTH,
  sanitizeCodeBlockSource,
  sanitizeInlineText,
} from "@cp949/geul-model";

import {
  isTransparentListTag,
  NESTED_BOUNDARY_TAG_NAMES,
} from "./block-segmenter.js";
import {
  findBlockBearingColorTags,
  type HtmlElementContent,
  type HtmlElementNode,
  type HtmlNode,
  type HtmlRoot,
} from "./inline-content.js";
import { readLegacyAttributeColor } from "../clipboard/css-color.js";
import { INLINE_PRESENTATION_TAG_NAMES } from "./element-presentation.js";
import {
  splitListItemChildren,
  splitQuoteChildren,
} from "./import-html-wrappers.js";
import { htmlImportSanitizeSchema } from "./import-html-sanitize-schema.js";
import { mediaPreviewWidthStyle } from "./media-preview-width-style.js";
import { MAX_HTML_TREE_DEPTH } from "./parse-html.js";
import {
  htmlAllowedAttributes,
  htmlStrippedTagNames,
} from "./sanitize-schema.js";
import { tableColumnWidthStyle } from "./table-column-width-style.js";
import { textBlockPropsStyle } from "./text-block-props-style.js";

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
  // details는 toggleListItem의 HTML 표현이다(RD-005-DELTA-01, 로드맵 D4).
  // table과 같은 이유로 자식(summary/children
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

// data-geul-media-type 값 검사만으로 own-format File 앵커를 판정한다 — 정확한
// 4종 판정(isMediaNode/mediaTypeFromNode)은 import-html.ts가 단독 소유하고
// (sanitizer 결합 회피 원칙, 위 파일 헤더 주석), 이 파일은 독립적으로
// 마커 유효성만 다시 확인한다. 마커 없는 임의 <a>는 여전히 top-level
// downgrade 경고 대상이다(기존 동작 불변).
const isOwnMediaAnchorElement = (node: HtmlElementNode): boolean => {
  if (node.tagName !== "a") return false;
  const mediaType = node.properties.dataGeulMediaType;
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
//
// 변환기가 마크로 보존하는 인라인 태그 목록(INLINE_PRESENTATION_TAG_NAMES)에
// 줄바꿈 br을 더해 만든다. 목록을 따로 두면 변환기에 span이 생겼을 때 경고만
// 남았다(Issue #337). 루트 인라인은 기존대로 경고한다.
const supportedInlineNames: ReadonlySet<string> = new Set([
  ...INLINE_PRESENTATION_TAG_NAMES,
  "br",
]);

// TextBlockProps(RD-001)를 가진 7개 블록 타입이 own-export에서 style을
// 받는 5개 태그(Issue #179, export-html.ts의 textBlockPropsAttributes 호출부
// p/h1-h6/blockquote/li/summary와 정확히 같은 집합). 아래 style 경고 정확도
// 판정이 이 태그에서만 raw data-geul-* 3종과 raw style을 대조한다 — 그
// 밖의 태그(표 셀 td/th 등)의 style은 이 판정 대상이 아니다.
const TEXT_BLOCK_PROPS_OWN_TAG_NAMES = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "li",
  "summary",
]);

// export-html.ts의 previewWidthStyleAttrs가 style을 내는 3개 태그(2026-09-16
// media caption 폭 맞춤 그릴링 Q7) — image/video 자신(bare 또는 figure 안
// 시각 태그)과 caption이 있을 때 그 둘을 감싸는 figure. TEXT_BLOCK_PROPS_
// OWN_TAG_NAMES와 같은 이유로 별도 집합을 둔다 — 두 규칙(text 색상·정렬,
// media 폭)이 서로 다른 데이터에서 style을 재구성하므로 판정 함수도
// isOwnEchoStyle 안에서 분기한다.
const MEDIA_PREVIEW_WIDTH_OWN_TAG_NAMES = new Set(["img", "video", "figure"]);

// export-html.ts의 tableNode가 <col>에 항상 내는 width style(2026-09-19,
// showcase 미리보기에 표 컬럼 폭이 반영되지 않는 버그 수정 — 라이브 에디터의
// col style width와 짝을 맞춘다). previewWidth와 달리 TableColumn.width는
// model 필수 필드라 "값이 있을 때만" 분기가 없다 — data-geul-width가 항상
// 함께 나오므로 그 값으로 기대 style을 재구성해 비교한다.
const TABLE_COLUMN_WIDTH_OWN_TAG_NAMES = new Set(["col"]);

// node.properties에서 문자열 값만 읽는다(hast Properties는 string 외에
// number/boolean/array도 허용하지만, HTML 파싱이 만드는 data-geul-*·style
// 값은 항상 순수 문자열이다 — 다른 타입이면 own-export가 낸 값이 아니므로
// 아래 exactOwnStyleMatch가 안전하게 "다르다"로 처리한다).
const propertyStringOrUndefined = (
  node: HtmlElementNode,
  key: string,
): string | undefined => {
  const value = node.properties[key];
  return typeof value === "string" ? value : undefined;
};

// raw HAST의 style 제거 warning이 export-html.ts 자신이 낸 값의 정확한
// 왕복인지 판정한다(Issue #179 리뷰 수정 — MAJOR). sanitize는 style을
// TEXT_BLOCK_PROPS_OWN_TAG_NAMES 5개 태그 어디에도 허용하지 않으므로
// (sanitize-schema.ts) 값이 있으면 항상 제거되는데, 그 raw "제거됨"
// 경고를 data-geul-* 존재만으로 억제하면(이전 구현) data-geul-*가 설명하지
// 못하는 추가 선언(예: font-weight)이 조용히 사라지거나, 서로 다른 두
// 노드의 warning이 findIndex/splice로 뒤바뀔 수 있었다(리뷰에서 재현
// 확인). textBlockPropsStyle이 같은 raw 노드의 data-geul-* 3종에서
// 재구성한 값과 raw style 문자열이 "완전히 같을 때만" own-echo로 인정해
// 경고를 생략한다 — 한 글자라도 다르면(추가 선언, 다른 값, 다른 순서
// 전부 포함) 보수적으로 경고를 그대로 낸다. 이 판정은 같은 raw 노드
// 하나만 보고 끝나 서로 다른 노드의 warning을 섞을 위험이 없다(fix 전
// consumePreservedAttributeWarning 기반 억제와의 핵심 차이).
const expectedMediaPreviewWidthStyle = (
  node: HtmlElementNode,
): string | undefined => {
  const rawWidth = propertyStringOrUndefined(node, "dataGeulPreviewWidth");
  const width = rawWidth === undefined ? Number.NaN : Number(rawWidth);
  return Number.isNaN(width) ? undefined : mediaPreviewWidthStyle(width);
};

// caption이 있으면 export-html.ts가 data-geul-preview-width를 감싸는
// figure에만 싣는다(시각 태그 자신은 안 가짐, "설계" 참고) — 그런데 style은
// figure와 안쪽 시각 태그(img/video) 둘 다에 낸다(에디터 리사이즈와 대칭
// 렌더). 그래서 시각 태그 자신에게 data-geul-preview-width가 없을 때는
// 부모 figure가 넘겨준 기대값(parentFigurePreviewWidthStyle)으로 대신
// 판정한다 — collectFromNodes가 figure로 내려갈 때만 이 값을 계산해
// 넘기고, 그 밖의 모든 부모는 undefined를 넘겨(한 단계만 유효, 조부모까지
// 새지 않음) 다른 media와 뒤섞이지 않는다.
const isOwnEchoStyle = (
  node: HtmlElementNode,
  rawStyle: string,
  parentFigurePreviewWidthStyle: string | undefined,
): boolean => {
  // callout(Issue #209 RD-003 DELTA-01) — div가 own-export에서 style을 받는
  // 첫 케이스라 TEXT_BLOCK_PROPS_OWN_TAG_NAMES(고정 태그명 집합)에 그냥
  // "div"를 추가하지 않는다 — children wrapper·목록류 등 TextBlockProps가
  // 없는 다른 div까지 이 판정을 타게 하는 대신, dataGeulCallout 마커가
  // 있는 div만 좁혀서 인정한다.
  if (
    TEXT_BLOCK_PROPS_OWN_TAG_NAMES.has(node.tagName) ||
    (node.tagName === "div" &&
      propertyStringOrUndefined(node, "dataGeulCallout") === "true")
  ) {
    const expected = textBlockPropsStyle({
      textColor: propertyStringOrUndefined(node, "dataGeulTextColor"),
      backgroundColor: propertyStringOrUndefined(
        node,
        "dataGeulBackgroundColor",
      ),
      textAlignment: propertyStringOrUndefined(node, "dataGeulTextAlignment"),
    });
    return expected !== undefined && expected === rawStyle;
  }
  if (MEDIA_PREVIEW_WIDTH_OWN_TAG_NAMES.has(node.tagName)) {
    const ownExpected = expectedMediaPreviewWidthStyle(node);
    if (ownExpected !== undefined && ownExpected === rawStyle) return true;
    return (
      parentFigurePreviewWidthStyle !== undefined &&
      parentFigurePreviewWidthStyle === rawStyle
    );
  }
  if (TABLE_COLUMN_WIDTH_OWN_TAG_NAMES.has(node.tagName)) {
    const rawWidth = propertyStringOrUndefined(node, "dataGeulWidth");
    const width = rawWidth === undefined ? Number.NaN : Number(rawWidth);
    return !Number.isNaN(width) && tableColumnWidthStyle(width) === rawStyle;
  }
  return false;
};

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

// pre가 codeBlock이 아닌 인라인 글자로 평탄화되는 자리를 raw HAST에서 찾는다
// (Issue #354). 평탄화 경로는 sanitizeInlineText로 Tab도 지운다. 수집기가 모든
// pre를 codeBlock 소스로 보면 그 Tab 삭제를 놓친다.
//
// 변환기는 목록 항목(splitListItemChildren)과 인용·callout(splitQuoteChildren)의
// 본문 구간을 paragraphContentFromNodes로 평탄화한다. 그 구간 안의 pre는
// 인라인 래퍼를 지나든 블록 안이든 글자가 된다. 본문 구간 밖(children)과 그 밖의
// 문맥은 segmentBlocks를 거쳐 pre가 codeBlock이 된다. 표 셀은 insideTable이
// 따로 다룬다.
//
// 이 판정은 변환기를 거울처럼 따라간다. 변환이 바뀌면 어긋날 수 있고, 행렬
// 테스트가 현재 판정을 고정해 어긋남을 드러낸다. raw 트리와 변환기가 보는
// sanitize 뒤 트리는 노드가 달라 변환기가 평탄화 사실을 넘겨 줄 수 없다.
// - 분할은 변환기가 쓰는 두 함수를 그대로 부른다. 입력만 sanitize 뒤 모양에
//   맞춘다. 허용 목록에 없는 태그와 블록을 품은 font·mark는 sanitize가 벗겨
//   자식이 부모 자리로 올라온다.
// - ul·ol은 blocksFromNodes가 직접 읽는 자리(최상위, 목록 항목·인용·callout의
//   children)에서만 목록 항목이 된다. div 안 ul처럼 segmentBlocks가 걷는 자리의
//   li는 문단 경계라 평탄화하지 않는다.
// - 제목 안은 따라가지 않는다. 제목 안 인용은 segmentBlocks가 본문 텍스트를
//   조상 복제로 감싸 본문 구간의 모양이 바뀐다. 이 자리의 pre는 이전처럼
//   codeBlock으로 본다.
// - 토글 summary와 children wrapper(own-format) 안은 따라가지 않는다. 그 자리의
//   pre는 이전처럼 codeBlock으로 본다.
type ConversionPositions = {
  // 평탄화되는 본문 구간의 뿌리 노드다.
  flattenedContent: Set<HtmlNode>;
  // blocksFromNodes가 블록 목록으로 읽는 구간의 뿌리 노드다.
  blockLevel: Set<HtmlNode>;
};

// 부모에서 자식으로 내려가며 요소마다 새로 만드는 상태다.
type ConversionState = {
  positions: ConversionPositions;
  // 이 노드 목록을 blocksFromNodes가 블록 목록으로 읽는다.
  atBlockLevel: boolean;
  // 평탄화되는 본문 구간 안이다.
  insideFlattenedContent: boolean;
  // h1~h6 아래다.
  insideHeading: boolean;
};

const headingTagNames: ReadonlySet<string> = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

const importAllowedTagNames: ReadonlySet<string> = new Set(
  htmlImportSanitizeSchema.tagNames ?? [],
);

// 조상 제약(ancestors)이 있는 태그다. td·tr 등이며 table 밖이면 벗겨진다.
// Object.hasOwn은 Chrome 75 목표에서 금지라 키 집합으로 판정한다.
const ancestorRequiredTagNames: ReadonlySet<string> = new Set(
  Object.keys(htmlImportSanitizeSchema.ancestors ?? {}),
);

// sanitize가 태그만 벗기고 자식을 부모 자리에 올리는 요소다. 분할 입력은 컨테이너
// 직계 쪽만 훑으므로 table 조상이 없다.
const isUnwrappedBySanitize = (
  node: HtmlElementNode,
  unwrappedColorTags: ReadonlySet<HtmlNode>,
  insideTable = false,
): boolean =>
  unwrappedColorTags.has(node) ||
  (!importAllowedTagNames.has(node.tagName) &&
    !htmlStrippedTagNames.includes(node.tagName)) ||
  (!insideTable && ancestorRequiredTagNames.has(node.tagName));

// 벗겨지는 요소를 그 자식으로 바꾼 sanitize 뒤 자식 목록이다.
const childrenAfterSanitize = (
  nodes: readonly HtmlElementContent[],
  unwrappedColorTags: ReadonlySet<HtmlNode>,
): HtmlElementContent[] =>
  nodes.flatMap((node) =>
    node.type === "element" && isUnwrappedBySanitize(node, unwrappedColorTags)
      ? childrenAfterSanitize(node.children, unwrappedColorTags)
      : [node],
  );

const registerSplitPositions = (
  container: HtmlElementNode,
  split: typeof splitListItemChildren,
  positions: ConversionPositions,
  unwrappedColorTags: ReadonlySet<HtmlNode>,
): void => {
  const { contentNodes, childrenNodes } = split({
    ...container,
    children: childrenAfterSanitize(container.children, unwrappedColorTags),
  });
  for (const node of contentNodes) positions.flattenedContent.add(node);
  for (const node of childrenNodes) positions.blockLevel.add(node);
};

// 본문 구간을 가진 컨테이너라면 자식 위치를 positions에 적는다. 자식은 이
// 요소를 지난 뒤에 훑으므로 미리 적어 두면 된다.
const registerConversionPositions = (
  node: HtmlElementNode,
  atBlockLevel: boolean,
  positions: ConversionPositions,
  unwrappedColorTags: ReadonlySet<HtmlNode>,
): void => {
  if (
    node.tagName === "blockquote" ||
    (node.tagName === "div" &&
      propertyStringOrUndefined(node, "dataGeulCallout") === "true")
  ) {
    registerSplitPositions(
      node,
      splitQuoteChildren,
      positions,
      unwrappedColorTags,
    );
    return;
  }
  if ((node.tagName === "ul" || node.tagName === "ol") && atBlockLevel) {
    for (const child of childrenAfterSanitize(
      node.children,
      unwrappedColorTags,
    )) {
      if (child.type !== "element") continue;
      if (child.tagName === "li") {
        registerSplitPositions(
          child,
          splitListItemChildren,
          positions,
          unwrappedColorTags,
        );
      } else {
        // 목록 항목이 아닌 자식은 형제 블록으로 읽힌다.
        positions.blockLevel.add(child);
      }
    }
  }
};

const collectFromNodes = (
  nodes: HtmlNode[],
  warnings: HtmlImportWarning[],
  topLevel: boolean,
  insideSupportedBoundary: boolean,
  parentElement: string,
  insideCodeBlockPre: boolean,
  insideTable: boolean,
  parentFigurePreviewWidthStyle: string | undefined,
  unwrappedColorTags: ReadonlySet<HtmlNode>,
  conversion: ConversionState,
): void => {
  for (const node of nodes) {
    if (node.type === "text") {
      // raw HAST 텍스트 노드 기준으로 sanitize 전후를 비교한다(G-CNV-002 —
      // warning fact는 raw HAST에서 수집한다). 정책은 model의
      // sanitizeInlineText가 단독 소유한다(G-CNV-001).
      // pre 안 텍스트는 codeBlock 소스 정제(Tab·LF 허용)와 비교한다(Issue #352).
      // 본문 구간으로 평탄화되는 pre는 인라인 글자라 Tab도 지운다(Issue #354).
      const sanitized =
        insideCodeBlockPre && !conversion.insideFlattenedContent
          ? sanitizeCodeBlockSource(node.value)
          : sanitizeInlineText(node.value);
      if (sanitized !== node.value) {
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

    // 본문 구간으로 평탄화되는 자리 안이면 아래 자손의 pre는 codeBlock이 아니다.
    const { positions } = conversion;
    const flattenedHere =
      conversion.insideFlattenedContent || positions.flattenedContent.has(node);
    const blockLevelHere =
      conversion.atBlockLevel || positions.blockLevel.has(node);
    const insideHeadingHere =
      conversion.insideHeading || headingTagNames.has(node.tagName);
    // pre 안쪽은 구조가 변환에 쓰이지 않는다. 바깥 pre가 자식 전체를 소스로 읽는다.
    if (
      !flattenedHere &&
      !insideTable &&
      !insideHeadingHere &&
      !insideCodeBlockPre
    ) {
      registerConversionPositions(
        node,
        blockLevelHere,
        positions,
        unwrappedColorTags,
      );
    }

    if (unsafeElementNames.has(node.tagName)) {
      warnings.push({
        kind: "UNSAFE_ELEMENT_REMOVED",
        element: node.tagName,
        message: `Unsafe ${node.tagName} element was removed`,
      });
    } else if (
      topLevel &&
      !supportedBlockNames.has(node.tagName) &&
      !(
        insideSupportedBoundary &&
        supportedInlineNames.has(node.tagName) &&
        !unwrappedColorTags.has(node)
      ) &&
      !isOwnMediaAnchorElement(node)
    ) {
      warnings.push({
        kind: "SAFE_BLOCK_DOWNGRADED",
        element: node.tagName,
        message: `Unsupported ${node.tagName} block was downgraded to paragraph content`,
      });
    }

    // 블록을 품어 벗겨지는 font·mark는 color·style이 사라진다. 읽는 속성이
    // 아니므로 #334 이전처럼 제거를 보고한다.
    const allowedAttributes = new Set(
      unwrappedColorTags.has(node)
        ? []
        : (htmlAllowedAttributes[node.tagName] ??
            htmlAllowedAttributes["*"] ??
            []),
    );
    // code의 language/class metadata는 CodeBlock의 pre 안에서만 의미가 있다.
    // sanitizer schema는 semantic importer의 입력 보존을 위해 이를 남기지만,
    // raw warning은 현재 문맥에서 실제로 지원되는 속성만 보고한다.
    if (!insideCodeBlockPre && node.tagName === "code") {
      allowedAttributes.delete("dataLanguage");
      allowedAttributes.delete("className");
    }
    // b·strong의 style은 font-weight:normal|400 판정에만 쓰려고 sanitizer
    // schema가 남긴다(Issue #316). 다른 선언은 의미가 없으므로 raw 경고는
    // 이전처럼 style 제거를 보고한다.
    if (node.tagName === "b" || node.tagName === "strong") {
      allowedAttributes.delete("style");
    }
    // table cell의 pre는 TableCell.content 인라인 경로로 변환돼 CodeBlock
    // id/language/class 의미를 갖지 않는다. sanitizer가 semantic importer
    // 입력 보존을 위해 남긴 속성이라도 이 문맥에서는 실제로 버려진다.
    if (insideTable && node.tagName === "pre") {
      allowedAttributes.delete("dataGeulBlockId");
      allowedAttributes.delete("dataLanguage");
      allowedAttributes.delete("className");
      allowedAttributes.delete("dataGeulCodeWrap");
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
      // Issue #179 — style은 TEXT_BLOCK_PROPS_OWN_TAG_NAMES 5개 태그의
      // sanitize 허용 목록에 없어 항상 이 분기로 들어온다. export-html.ts
      // 자신이 낸 값과 raw style이 완전히 같을 때만(isOwnEchoStyle) 경고를
      // 생략한다 — 그 외에는(추가 선언 포함 전부) 그대로 경고한다.
      if (
        attribute === "style" &&
        typeof value === "string" &&
        isOwnEchoStyle(node, value, parentFigurePreviewWidthStyle)
      ) {
        continue;
      }
      // font의 color는 허용 속성이지만 값을 읽지 못하면 색이 사라진다.
      // 읽지 못한 값은 #334 이전처럼 제거를 보고한다.
      const unreadableFontColor =
        node.tagName === "font" &&
        attribute === "color" &&
        (typeof value !== "string" ||
          readLegacyAttributeColor(value) === undefined);
      if (!allowedAttributes.has(attribute) || unreadableFontColor) {
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
          (insideSupportedBoundary &&
            supportedInlineNames.has(node.tagName) &&
            !unwrappedColorTags.has(node))),
      insideSupportedBoundary || isBlockBoundaryTag(node.tagName),
      node.tagName,
      insideCodeBlockPre || (node.tagName === "pre" && !insideTable),
      insideTable || node.tagName === "table",
      node.tagName === "figure"
        ? expectedMediaPreviewWidthStyle(node)
        : undefined,
      unwrappedColorTags,
      {
        positions,
        // 벗겨지는 요소는 자식이 부모 자리에 오르므로 블록 위치를 이어받는다.
        atBlockLevel:
          blockLevelHere &&
          isUnwrappedBySanitize(node, unwrappedColorTags, insideTable),
        insideFlattenedContent: flattenedHere,
        insideHeading: insideHeadingHere,
      },
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
  collectFromNodes(
    root.children,
    warnings,
    true,
    false,
    "text",
    false,
    false,
    undefined,
    findBlockBearingColorTags(root.children),
    {
      positions: { flattenedContent: new Set(), blockLevel: new Set() },
      atBlockLevel: true,
      insideFlattenedContent: false,
      insideHeading: false,
    },
  );
  return warnings;
};
