import type { DOMOutputSpec } from "@tiptap/pm/model";
import { Extension, mergeAttributes, Node } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { DEFAULT_DICTIONARY, type Dictionary } from "./dictionary.js";

// 4종 leaf 미디어 블록(file/image/video/audio, spec §3.1)은 divider·table과
// 같은 "group: block 직접 멤버, atom, blockId 자체 소유" 패턴을 쓴다(RD-002
// "## 결정" — CodeBlock형 content-node+blockContainer 래핑이 아니다). 4종
// 모두 content: InlineContent가 없고 attrs만으로 표현 가능한 scalar prop뿐
// 이라 PM 텍스트 자식을 둘 이유가 없다. content expression을 아예
// 선언하지 않으면(atom·leaf) "children을 가질 수 없다"(spec §3.1 leaf
// 블록)가 스키마 자체로 강제된다 — 별도 검증 코드가 필요 없다.
//
// parseHTML을 선언하지 않는다: BlockIdExtension은 blockContainer에만 id를
// 사후 배정하므로(block-id-extension.ts) 외부 HTML 붙여넣기가 id 없는/
// 중복 id 미디어 블록을 만들면 model 변환 검증이 영구 desync된다
// (divider-extension.ts와 같은 근거, G-EDT-003). 붙여넣은 원시 HTML은
// 무시된다 — 실제 HTML round-trip은 io.importHtml → modelToTiptap 경로가
// 슬라이스6에서 담당한다.
//
// priority 100(Node.create 기본값, 명시 유지, divider-extension.ts와 동일
// 근거): blockContainer(1000)보다 낮아야 doc·blockGroup의 "block+" 채움에서
// ContentMatch.defaultType 경쟁에 지지 않는다(G-EDT-003) — 채움 기본
// 노드는 항상 blockContainer여야 한다.
//
// url/name/caption/backgroundColor는 4종 공통(spec §3.1 MediaBlockCommon).
// showPreview/previewWidth/textAlignment는 image/video만, showPreview만
// audio도 갖는다(file은 공통 attrs뿐 — BlockNote 실측과 정확히 대응).
// 값 검증(previewWidth 양수 등)은 model parseDocument 권위다(G-CNV-001) —
// 여기 attrs는 구조만 담는다.
//
// renderHTML은 kind별 실제 콘텐츠(url/name/caption)만 DOM에 투영한다
// (RD-002 DELTA-01) — react가 selection·toolbar·File Panel을 붙일 대상을
// 얻는다(spec §6.1~§6.3). image/video의 previewWidth는 슬라이스5 RD-001
// DELTA-01이 인라인 width 스타일로 투영을 완성했다(아래
// previewWidthStyleAttrs). image/video/audio의 showPreview:false는
// 슬라이스5 RD-002 DELTA-01이 미디어 태그 대신 <a> 링크로 투영을
// 완성했다(아래 mediaAnchorChildren, FileBlock과 동일 패턴 재사용).
// textAlignment/backgroundColor는 아직 DOM에 투영하지 않는다(textAlignment는
// roadmap.md "결과 경계" 제외 범위 — pending-issue로 이월).
// io HTML export/import의 <figure> 계약(packages/io, 슬라이스6)과는
// 별개다 — 여기 DOM 모양이 그 계약을 구속하지 않는다(ADR-0002 — io는 PM
// DOM이 아니라 저장 Document를 직접 읽고 쓴다).
const blockIdAttribute = () => ({
  blockId: {
    default: null,
    renderHTML: (attributes: Record<string, unknown>) =>
      typeof attributes.blockId === "string" && attributes.blockId.length > 0
        ? { "data-geul-block-id": attributes.blockId }
        : {},
  },
});

const mediaBlockCommonAttributes = () => ({
  ...blockIdAttribute(),
  url: { default: null, renderHTML: () => ({}) },
  name: { default: null, renderHTML: () => ({}) },
  caption: { default: null, renderHTML: () => ({}) },
  backgroundColor: { default: null, renderHTML: () => ({}) },
  ...localPreviewAttributes(),
});

// 로컬 프리뷰(ADR 0015, roadmap RD-001 "결정") — url attrs와 완전히 분리된
// PM 전용 attrs다. tiptap-to-model.ts/model-to-tiptap.ts/packages/model의
// zod .strict() 스키마 어디에도 이 두 키를 배선하지 않는다(각각 읽을 attrs
// 키를 명시하는 allowlist 구조라 자동으로 제외된다, RD-001-DELTA-01.md
// readiness probe) — 저장 원본(Document/Block)에는 절대 왕복하지 않는다.
// 4종 미디어 블록 전체에 동일 적용(ADR 0015 "네 종류 모두에 동일하게
// 적용한다") — kind별로 분기할 이유가 없어 공통 attrs 헬퍼에 둔다.
//
// localPreviewUrl: 화면 표시용 Blob URL(RD-002가 렌더링에서 소비).
// localPreviewFile: pull 조회 API(`getPendingLocalPreviews()`, RD-001
// DELTA-05 예정)가 반환할 원본 File 참조. 둘 다 paste/drop 등 실제 삽입
// 경로가 배선되는 DELTA-02 이전까지는 항상 null이다(renderHTML 없음 —
// RD-002가 React NodeView에서 attrs를 직접 읽어 렌더링할 대상이라 DOM에
// 투영하지 않는다).
const localPreviewAttributes = () => ({
  localPreviewUrl: { default: null, renderHTML: () => ({}) },
  localPreviewFile: { default: null, renderHTML: () => ({}) },
});

const previewAttributes = () => ({
  showPreview: { default: null, renderHTML: () => ({}) },
  previewWidth: { default: null, renderHTML: () => ({}) },
  textAlignment: { default: null, renderHTML: () => ({}) },
});

// ---- renderHTML 공유 헬퍼(RD-002 DELTA-01) ----
//
// url 없는 빈 상태는 `data-geul-media-empty`에 kind를 담아 표식한다(완료
// 조건 3). heading/quote/code의 `data-placeholder`
// (placeholder-extension.ts, R-4·R-7)를 그대로 재사용하지 않는다 —
// `[data-placeholder]::before`(_editor.scss)는 텍스트 캐럿 오버레이용
// float 레이아웃이라 캐럿이 없는 atom 블록에 적용하면 의도치 않은 시각
// 결과가 난다. 이 attribute는 별도 표식일 뿐이라 react가 실제 빈 상태
// UI(RD-003 File Panel)를 붙이기 전까지 화면에 아무 영향이 없다. 문구
// 라벨(2026-09-12, Notion parity)은 이 renderHTML이 아니라 파일 하단
// `MediaEmptyLabelExtension`이 별도 데코레이션으로 얹는다 — atom
// renderHTML에 dictionary 텍스트를 직접 굽는 선례가 없고(당시엔 core→DOM
// dictionary 투영 경로 자체가 없어 텍스트를 뺐다), `placeholder-extension.ts`가
// 이미 쓰는 "데코레이션 + attr() CSS" 경로가 이 저장소의 유일한 선례라
// 그대로 따른다.
const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

// 렌더링 우선순위(Issue #168 roadmap RD-002 DELTA-01, spec 갱신 §4.1):
// 실제 `url`이 있으면 그것을, 없고 `localPreviewUrl`(RD-001, ADR 0015)이
// 있으면 그것을 소스로 쓴다. 둘 다 없으면 null(기존 빈 상태 placeholder).
// production 경로는 `url`과 `localPreviewUrl`을 절대 동시에 채우지 않는다
// (url 확정 트랜잭션이 항상 같은 스텝에서 localPreviewUrl을 정리한다,
// RD-001 DELTA-05 applyUploadedMediaAttrs) — 그래도 이 함수는
// previewWidthStyleAttrs와 같은 태도로 그 보장에 기대지 않고 `url`을
// 방어적으로 우선한다.
const mediaSourceUrl = (
  attrs: Record<string, unknown>,
): { url: string; isLocalPreview: boolean } | null => {
  const url = nonEmptyString(attrs.url);
  if (url !== null) {
    return { url, isLocalPreview: false };
  }
  const localPreviewUrl = nonEmptyString(attrs.localPreviewUrl);
  return localPreviewUrl === null
    ? null
    : { url: localPreviewUrl, isLocalPreview: true };
};

// 로컬 프리뷰 소스일 때만 붙는 배지 DOM 마커(RD-002 DELTA-01) — react
// 뒤 DELTA(CSS 시각화)가 소비할 seam이다. `data-geul-media-caption`과 같은
// 빈 문자열 값 컨벤션을 쓴다. `url`이 있으면(로컬 프리뷰 동시 존재 여부와
// 무관) 붙지 않는다 — RD-002.md 완료 조건 4 "url 확정/업로드 대기 상태에서는
// 안 보임"이 이 부재로 성립한다.
const localPreviewBadgeAttrs = (
  source: ReturnType<typeof mediaSourceUrl>,
): Record<string, string> =>
  source !== null && source.isLocalPreview
    ? { "data-geul-media-local-preview": "" }
    : {};

// previewWidth 인라인 width 스타일 투영(슬라이스5 RD-001 DELTA-01, spec
// §5.1 MED-007). 실제 clamp(64px~content 폭)는 react 리사이즈 핸들이
// 담당하고(§6.3) 여기는 model이 이미 검증한 값을 그대로 옮기기만 한다 —
// 방어적으로 양의 유한수가 아니면 스타일을 내지 않는다(로드 경로가 항상
// isValidMediaPreviewWidth를 통과한 값만 주지만, 이 렌더 함수 자체는 그
// 보장에 기대지 않는다). image/video만 호출한다 — file/audio는 attrs
// 자체에 previewWidth가 없다.
const previewWidthStyleAttrs = (
  attrs: Record<string, unknown>,
): Record<string, string> => {
  const width = attrs.previewWidth;
  return typeof width === "number" && Number.isFinite(width) && width > 0
    ? { style: `width: ${width}px` }
    : {};
};

// caption은 4종 공통이라 헬퍼 하나로 공유한다. 없으면 DOM에 아무 것도
// 남기지 않는다(완료 조건 2) — 조건부로 배열에 넣지 않는 방식이지 빈
// 문자열 캡션 요소를 렌더한 뒤 CSS로 숨기는 방식이 아니다.
const captionChildren = (attrs: Record<string, unknown>): DOMOutputSpec[] => {
  const caption = nonEmptyString(attrs.caption);
  return caption === null
    ? []
    : [["div", { "data-geul-media-caption": "" }, caption]];
};

// file의 항상-링크 표시와 image/video/audio의 showPreview:false(슬라이스5
// RD-002 DELTA-01, spec §5.1 MED-008)가 공유하는 <a> 출력. name이 없으면
// url 자체를 링크 텍스트로 쓴다 — 신규 DOM shape을 설계하지 않고 이미
// 존재하는 FileBlock 패턴을 그대로 재사용한다(RD-002.md "결정").
const mediaAnchorChildren = (
  url: string,
  name: string | null,
): DOMOutputSpec[] => [["a", { href: url }, name ?? url]];

// showPreview attrs는 기본값 null이 "미설정"을 뜻하고 spec §3.1상 기본
// 동작은 preview 표시다 — 명시적 false만 링크로 전환한다(previewWidth의
// "양의 유한수만 스타일을 낸다"는 방어적 가드와 같은 태도, 로드 경로가
// 항상 boolean|null만 주지만 이 판정 자체는 그 보장에 기대지 않는다).
const isPreviewSuppressed = (attrs: Record<string, unknown>): boolean =>
  attrs.showPreview === false;

export const FileBlockExtension = Node.create({
  name: "file",
  group: "block",
  atom: true,
  priority: 100,

  addAttributes: mediaBlockCommonAttributes,

  renderHTML({ HTMLAttributes, node }) {
    const source = mediaSourceUrl(node.attrs);
    const name = nonEmptyString(node.attrs.name);
    // file은 <a href="url">name 또는 url</a>로 매핑한다(RD-002.md 포함
    // 범위) — name이 없으면 소스 자체를 링크 텍스트로 쓴다. 소스는 url
    // 우선, 없으면 로컬 프리뷰(Issue #168 roadmap RD-002 DELTA-01).
    const children: DOMOutputSpec[] =
      source === null ? [] : mediaAnchorChildren(source.url, name);
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        source === null
          ? { "data-geul-media-empty": "file" }
          : localPreviewBadgeAttrs(source),
      ),
      ...children,
      ...captionChildren(node.attrs),
    ];
  },
});

export const ImageBlockExtension = Node.create({
  name: "image",
  group: "block",
  atom: true,
  priority: 100,

  addAttributes: () => ({
    ...mediaBlockCommonAttributes(),
    ...previewAttributes(),
  }),

  renderHTML({ HTMLAttributes, node }) {
    const source = mediaSourceUrl(node.attrs);
    const name = nonEmptyString(node.attrs.name);
    const caption = nonEmptyString(node.attrs.caption);
    // alt는 caption이 있으면 caption, 없으면 name을 재사용한다(spec §6.3,
    // 별도 alt prop 신설 없음 — 2026-09-04 사용자 확정). showPreview:false면
    // img 대신 <a>를 낸다(슬라이스5 RD-002 DELTA-01). 소스는 url 우선, 없으면
    // 로컬 프리뷰(Issue #168 roadmap RD-002 DELTA-01).
    const children: DOMOutputSpec[] =
      source === null
        ? []
        : isPreviewSuppressed(node.attrs)
          ? mediaAnchorChildren(source.url, name)
          : [
              [
                "img",
                {
                  src: source.url,
                  alt: caption ?? name ?? "",
                  ...previewWidthStyleAttrs(node.attrs),
                },
              ],
            ];
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        source === null
          ? { "data-geul-media-empty": "image" }
          : localPreviewBadgeAttrs(source),
      ),
      ...children,
      ...captionChildren(node.attrs),
    ];
  },
});

export const VideoBlockExtension = Node.create({
  name: "video",
  group: "block",
  atom: true,
  priority: 100,

  addAttributes: () => ({
    ...mediaBlockCommonAttributes(),
    ...previewAttributes(),
  }),

  renderHTML({ HTMLAttributes, node }) {
    const source = mediaSourceUrl(node.attrs);
    const name = nonEmptyString(node.attrs.name);
    // 재생·일시정지·탐색·음량 이상의 신규 UI를 만들지 않는다(spec §2 제외
    // 범위) — 네이티브 <video controls>만 낸다. showPreview:false면 video
    // 대신 <a>를 낸다(슬라이스5 RD-002 DELTA-01). 소스는 url 우선, 없으면
    // 로컬 프리뷰(Issue #168 roadmap RD-002 DELTA-01).
    const children: DOMOutputSpec[] =
      source === null
        ? []
        : isPreviewSuppressed(node.attrs)
          ? mediaAnchorChildren(source.url, name)
          : [
              [
                "video",
                {
                  controls: "",
                  src: source.url,
                  ...previewWidthStyleAttrs(node.attrs),
                },
              ],
            ];
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        source === null
          ? { "data-geul-media-empty": "video" }
          : localPreviewBadgeAttrs(source),
      ),
      ...children,
      ...captionChildren(node.attrs),
    ];
  },
});

export const AudioBlockExtension = Node.create({
  name: "audio",
  group: "block",
  atom: true,
  priority: 100,

  addAttributes: () => ({
    ...mediaBlockCommonAttributes(),
    showPreview: { default: null, renderHTML: () => ({}) },
  }),

  renderHTML({ HTMLAttributes, node }) {
    const source = mediaSourceUrl(node.attrs);
    const name = nonEmptyString(node.attrs.name);
    // showPreview:false면 audio 대신 <a>를 낸다(슬라이스5 RD-002 DELTA-01).
    // 소스는 url 우선, 없으면 로컬 프리뷰(Issue #168 roadmap RD-002 DELTA-01).
    const children: DOMOutputSpec[] =
      source === null
        ? []
        : isPreviewSuppressed(node.attrs)
          ? mediaAnchorChildren(source.url, name)
          : [["audio", { controls: "", src: source.url }]];
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        source === null
          ? { "data-geul-media-empty": "audio" }
          : localPreviewBadgeAttrs(source),
      ),
      ...children,
      ...captionChildren(node.attrs),
    ];
  },
});

const MEDIA_EMPTY_KINDS = ["file", "image", "video", "audio"] as const;
type MediaEmptyKind = (typeof MEDIA_EMPTY_KINDS)[number];

const isMediaEmptyKind = (typeName: string): typeName is MediaEmptyKind =>
  (MEDIA_EMPTY_KINDS as readonly string[]).includes(typeName);

export type MediaEmptyLabelExtensionOptions = {
  // placeholder-extension.ts와 동일 계약 — 항상 완전한 값이다(construction
  // time에 production-editor-assembly.ts가 DEFAULT_DICTIONARY로 폴백해
  // 넘긴다).
  dictionary: Dictionary;
};

const mediaEmptyLabelDecorations = (
  state: EditorState,
  dictionary: Dictionary,
): DecorationSet => {
  const decorations: Decoration[] = [];
  state.doc.descendants((node, position) => {
    const typeName = node.type.name;
    if (!isMediaEmptyKind(typeName)) return true;
    // renderHTML의 `source === null` 판정과 정확히 같은 함수를 재사용한다
    // — url과 로컬 프리뷰(ADR 0015) 둘 다 없을 때만 "빈 블록"이다. 이
    // decoration은 항상 `data-geul-media-empty`(위 renderHTML)와 함께
    // 붙거나 함께 빠진다.
    if (mediaSourceUrl(node.attrs) !== null) return false;
    const label = dictionary.placeholder.media.replace(
      "{kind}",
      dictionary.toolbar.kindNames[typeName],
    );
    decorations.push(
      Decoration.node(position, position + node.nodeSize, {
        "data-geul-media-empty-label": label,
      }),
    );
    return false;
  });
  return DecorationSet.create(state.doc, decorations);
};

// 빈 media 블록(image/video/audio/file) placeholder 문구(2026-09-12,
// Notion UI parity). `placeholder-extension.ts`와 같은 패턴(데코레이션 +
// attr() CSS)이지만 그 확장의 `data-placeholder`는 재사용하지 않는다 —
// 위 renderHTML 주석과 같은 이유로 캐럿용 float 레이아웃이 atom 블록엔
// 안 맞아 별도 attribute(`data-geul-media-empty-label`)를 쓴다. 표시는
// react `[data-geul-media-empty]::after`(_editor.scss)가 담당한다.
// 데코레이션 전용이라 저장 문서에 흔적이 없다(placeholder-extension.ts와
// 동일).
export const MediaEmptyLabelExtension =
  Extension.create<MediaEmptyLabelExtensionOptions>({
    name: "mediaEmptyLabel",

    addOptions() {
      return { dictionary: DEFAULT_DICTIONARY };
    },

    addProseMirrorPlugins() {
      const { dictionary } = this.options;
      return [
        new Plugin({
          props: {
            decorations: (state) =>
              mediaEmptyLabelDecorations(state, dictionary),
          },
        }),
      ];
    },
  });
