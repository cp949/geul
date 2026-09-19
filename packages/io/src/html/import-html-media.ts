// 5종 미디어 블록(file/image/video/audio, spec §3.1/§7.1 + iframe, spec
// §4/CUS-001~004)의 document-import 판별과 디코드를 담당한다: 노드가
// media인지 판정하고(isMediaNode, block-segmenter.ts에 넘기는 predicate),
// figure/div/bare 시각 태그 세 형태를 모두 MediaBlock으로 변환한다
// (mediaBlockFromNode).
import {
  type Document,
  type IdFactory,
  type IframeEmbedConfig,
  resolveIframeEmbedDecision,
  sanitizeInlineText,
} from "@cp949/geul-model";

import { propertyInteger, propertyString } from "./hast-properties.js";
import { isElementNode, textValue } from "./import-html-helpers.js";
import { consumePreservedAttributeWarning } from "./import-html-list.js";
import type { HtmlImportWarning } from "./import-warnings.js";
import type { HtmlElementNode } from "./inline-content.js";

// 5종 미디어 블록 판별 타입(export-html.ts의 MediaBlock과 동형, spec §3.1,
// iframe은 CUS-001~004).
type MediaBlock = Extract<
  Document["blocks"][number],
  { type: "file" | "image" | "video" | "audio" | "iframe" }
>;

// img/video/audio는 own-format 여부와 무관하게 태그명만으로 판정해도
// 안전하다(RD-001.md "결정" — 다른 의미로 쓰이지 않는다, showPreview:false로
// 강등돼도 <a>가 되므로 이 세 태그 자체가 나오는 경우는 항상 media다).
// a/div/figure는 일반 링크·children wrapper를 겸하는 태그라 태그명만으로는
// 판정할 수 없다 — data-geul-media-type 마커 값이 5종 중 하나일 때만 그
// 태그를 media로 본다(iframe은 own export가 <a>를 쓰지 않으므로 실제로는
// div/figure에서만 관찰된다, showPreview 필드가 없어 강등 경로 자체가
// 없다). img/video/audio에 데이터가 모순되게 실려도(예:
// <video data-geul-media-type="image">) 태그명이 이긴다 — own export가
// 만들 수 없는 조합이고, 방어적으로 태그명을 신뢰하는 편이 안전하다.
const mediaTypeFromNode = (
  node: HtmlElementNode,
): MediaBlock["type"] | undefined => {
  if (node.tagName === "img") return "image";
  if (node.tagName === "video") return "video";
  if (node.tagName === "audio") return "audio";
  const raw = propertyString(node, "dataGeulMediaType");
  return raw === "file" ||
    raw === "image" ||
    raw === "video" ||
    raw === "audio" ||
    raw === "iframe"
    ? raw
    : undefined;
};

// block-segmenter.ts에 넘기는 노드-레벨 predicate(RD-001.md "결정" —
// isTableNode류 시그니처를 재사용한다, isDividerTag류 태그명-only로는
// own-format <a>/<div>와 일반 <a>/<div>를 구분할 수 없다). a/div/figure는
// mediaTypeFromNode가 유효값을 돌려줄 때만 media로 승격한다 — 그 외(마커
// 없는 임의 <a>, children wrapper div 등)는 기존 처리 경로에 그대로 남는다.
export const isMediaNode = (node: HtmlElementNode): boolean => {
  if (
    node.tagName === "img" ||
    node.tagName === "video" ||
    node.tagName === "audio"
  ) {
    return true;
  }
  if (
    node.tagName === "a" ||
    node.tagName === "div" ||
    node.tagName === "figure"
  ) {
    return mediaTypeFromNode(node) !== undefined;
  }
  return false;
};

// consumePreservedAttributeWarning은 li/ol/details/summary(import-html-
// blocks.ts)와 동일 패턴이다 — htmlImportSanitizeSchema(import-html-
// sanitize-schema.ts)의 로컬 override가 실제 허용하는 속성이라도
// import-warnings.ts의 경고 판정은 공유 htmlAllowedAttributes만 보므로
// (sanitizer 결합 회피 원칙) raw "제거됨" 오탐이 남는다 — media가 실제로
// 보존한 속성만 여기서 지운다(G-CNV-002). data-geul-*는 segment.node 자신이
// 갖고(bare 태그·div·figure 공통), src/alt/controls는 visualNode가 갖는다 —
// figure에서는 이 둘이 다른 노드라 mediaBlockFromNode가 각각 따로 호출한다.
const consumeMediaDataAttributeWarnings = (
  warnings: HtmlImportWarning[],
  node: HtmlElementNode,
): void => {
  for (const attribute of [
    "dataGeulBlockId",
    "dataGeulMediaType",
    "dataGeulName",
    "dataGeulBackgroundColor",
    "dataGeulShowPreview",
    "dataGeulPreviewWidth",
    "dataGeulTextAlignment",
    // iframe(CUS-001~004)만 쓰는 2개(DELTA-01이 sanitize allowlist에 추가) —
    // 다른 4종은 이 값을 절대 싣지 않으므로 무차별 추가해도 안전하다(sanitize-
    // schema.ts의 mediaDataAttributeNames와 동일하게 공통 목록 하나로 관리).
    "dataGeulSrc",
    "dataGeulAspectRatio",
  ]) {
    consumePreservedAttributeWarning(warnings, node.tagName, attribute);
  }
};

const consumeMediaVisualAttributeWarnings = (
  warnings: HtmlImportWarning[],
  visualNode: HtmlElementNode,
): void => {
  if (visualNode.tagName === "img") {
    consumePreservedAttributeWarning(warnings, "img", "src");
    consumePreservedAttributeWarning(warnings, "img", "alt");
    return;
  }
  if (visualNode.tagName === "video" || visualNode.tagName === "audio") {
    consumePreservedAttributeWarning(warnings, visualNode.tagName, "src");
    consumePreservedAttributeWarning(warnings, visualNode.tagName, "controls");
  }
  // <a>의 href는 공유 htmlAllowedAttributes.a에 이미 있어 오탐이 나지
  // 않는다 — 소비할 것이 없다.
};

// wrapper의 data-geul-src를 resolveIframeEmbedDecision으로 재검증한다
// (Issue #215) — 거부되면 조용히 undefined로 강등한다(위 mediaBlockFromNode
// 주석의 대칭 정책 참고).
const resolvedIframeUrl = (
  rawSrc: string | undefined,
  iframeEmbedConfig: IframeEmbedConfig,
): string | undefined =>
  rawSrc !== undefined &&
  resolveIframeEmbedDecision(rawSrc, iframeEmbedConfig).allowed
    ? rawSrc
    : undefined;

// segmentBlocks가 낸 kind:"media" 세그먼트 하나를 5종 Block으로 디코드한다.
// data-geul-*는 항상 node(세그먼트 자신) 속성이고, src/href는 visualNode(시각
// 태그) 속성이다 — figure/div/bare 시각 태그 세 형태 중 figure만 이 둘이
// 다른 노드다(export-html.ts가 caption 있을 때 data-geul-*를 figure 자신에만
// 싣고 안쪽 시각 태그에는 싣지 않는다, RD-001-DELTA-01 "설계"). bare 태그는
// node 자신이 visualNode이고, div(빈 블록)는 visualNode가 없다(url undefined).
// iframe은 이 규칙을 따르지 않는다 — 안쪽 시각 태그(<iframe>)가 own export
// 결과에도 존재하지만 sanitize가 항상 제거하므로 visualNode가 잡히는 일이
// 없고, url은 별도로 node 자신의 data-geul-src에서 읽는다(RD-003 DELTA-03).
// figure의 자식을 segmentBlocks로 재귀 분할하지 않고 여기서 직접 들여다봐야
// 중복 생성 방지 가드가 성립한다(RD-001 완료 조건 2 — block-segmenter.ts의
// media 세그먼트가 안쪽으로 재귀하지 않는 이유와 대칭).
export const mediaBlockFromNode = (
  node: HtmlElementNode,
  createId: IdFactory,
  warnings: HtmlImportWarning[],
  iframeEmbedConfig: IframeEmbedConfig,
): MediaBlock => {
  const isFigure = node.tagName === "figure";
  const isEmptyPlaceholder = node.tagName === "div";
  const wrapperChildren =
    isFigure || isEmptyPlaceholder ? node.children.filter(isElementNode) : [];
  const visualNode = isFigure
    ? wrapperChildren.find(
        (child) =>
          child.tagName === "img" ||
          child.tagName === "video" ||
          child.tagName === "audio" ||
          child.tagName === "a",
      )
    : isEmptyPlaceholder
      ? undefined
      : node;
  const figcaptionNode = wrapperChildren.find(
    (child) => child.tagName === "figcaption",
  );

  consumeMediaDataAttributeWarnings(warnings, node);
  if (visualNode !== undefined) {
    consumeMediaVisualAttributeWarnings(warnings, visualNode);
  }

  const mediaType = mediaTypeFromNode(node) ?? "file";
  const id = propertyString(node, "dataGeulBlockId") ?? createId();
  const name = propertyString(node, "dataGeulName");
  const backgroundColor = propertyString(node, "dataGeulBackgroundColor");
  const showPreviewRaw = propertyString(node, "dataGeulShowPreview");
  const previewWidthRaw = propertyInteger(
    node,
    "dataGeulPreviewWidth",
    Number.NaN,
  );
  const previewWidth = Number.isNaN(previewWidthRaw)
    ? undefined
    : previewWidthRaw;
  const textAlignment = propertyString(node, "dataGeulTextAlignment") as
    "left" | "center" | "right" | undefined;
  // iframe(CUS-001~004) 전용 필드 — 다른 4종은 이 값을 싣지 않는다(model
  // IframeBlock.aspectRatio, spec §2). textAlignment와 동일하게 별도 검증
  // 없이 캐스트만 하고 최종 검증은 parseDocument에 위임한다.
  const aspectRatio = propertyString(node, "dataGeulAspectRatio") as
    "16:9" | undefined;
  // caption은 plain string이다(rich text 아님, spec §3.1) — 인라인 mark를
  // 보존할 필요가 없어 textValue로 평탄화한다. sanitizeInlineText는 raw
  // 텍스트 스캐너(import-warnings.ts)가 이 노드에 대해 이미
  // UNSAFE_CODE_POINT_REMOVED를 낼 수 있으므로 실제로도 제거해 경고와
  // 실동작을 맞춘다(G-CNV-002) — data-geul-name은 속성값이라 그 스캐너가
  // 애초에 검사하지 않으므로 대칭 처리하지 않는다(표 셀 속성값과 동일
  // 관례).
  const caption =
    figcaptionNode === undefined
      ? undefined
      : sanitizeInlineText(textValue(figcaptionNode.children));
  // iframe(CUS-001~004)은 내부 <iframe> 태그가 sanitize에서 항상 제거되므로
  // visualNode를 거치지 않고 wrapper(node) 자신의 data-geul-src를 유일한
  // src 공급원으로 읽는다 — 4종처럼 시각 태그 자신의 src/href를 읽지 않는다.
  // Issue #215 — own-export 여부와 무관하게 항상 resolveIframeEmbedDecision을
  // 재검증한다(신뢰 예외 없음, RD-001 "결정"). 정책을 통과하지 못하면 url을
  // 비운 빈 상태로 강등한다 — export-html.ts의 기존 정책(iframeEmbed 미지정
  // 시 모든 src를 정책 미허용으로 판정, 경고 없이 조용히 wrapper만 유지)과
  // 대칭이라 이쪽도 경고를 내지 않는다.
  const rawIframeSrc =
    mediaType === "iframe" ? propertyString(node, "dataGeulSrc") : undefined;
  const url =
    mediaType === "iframe"
      ? resolvedIframeUrl(rawIframeSrc, iframeEmbedConfig)
      : visualNode === undefined
        ? undefined
        : visualNode.tagName === "a"
          ? propertyString(visualNode, "href")
          : propertyString(visualNode, "src");

  const common = {
    id,
    ...(url === undefined ? {} : { url }),
    ...(name === undefined ? {} : { name }),
    ...(caption === undefined ? {} : { caption }),
    ...(backgroundColor === undefined ? {} : { backgroundColor }),
  };

  if (mediaType === "file") {
    return { ...common, type: "file" };
  }
  if (mediaType === "audio") {
    return {
      ...common,
      type: "audio",
      ...(showPreviewRaw === undefined
        ? {}
        : { showPreview: showPreviewRaw === "true" }),
    };
  }
  // iframe은 showPreview 필드가 model에 없다(spec §2) — image/video와
  // previewWidth/textAlignment는 공유하지만 aspectRatio는 iframe 전용이라
  // 아래 image/video 공용 반환에 그대로 흘리지 않고 분리한다.
  if (mediaType === "iframe") {
    return {
      ...common,
      type: "iframe",
      ...(previewWidth === undefined ? {} : { previewWidth }),
      ...(textAlignment === undefined ? {} : { textAlignment }),
      ...(aspectRatio === undefined ? {} : { aspectRatio }),
    };
  }
  return {
    ...common,
    type: mediaType,
    ...(showPreviewRaw === undefined
      ? {}
      : { showPreview: showPreviewRaw === "true" }),
    ...(previewWidth === undefined ? {} : { previewWidth }),
    ...(textAlignment === undefined ? {} : { textAlignment }),
  };
};
