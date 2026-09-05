import type { DOMOutputSpec } from "@tiptap/pm/model";
import { mergeAttributes, Node } from "@tiptap/core";

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
// previewWidthStyleAttrs). showPreview/textAlignment/backgroundColor는
// 아직 DOM에 투영하지 않는다(showPreview는 슬라이스5 RD-002 몫,
// textAlignment는 roadmap.md "결과 경계" 제외 범위 — pending-issue로 이월).
// io HTML export/import의 <figure> 계약(packages/io, 슬라이스6)과는
// 별개다 — 여기 DOM 모양이 그 계약을 구속하지 않는다(ADR-0002 — io는 PM
// DOM이 아니라 저장 Document를 직접 읽고 쓴다).
const blockIdAttribute = () => ({
  blockId: {
    default: null,
    renderHTML: (attributes: Record<string, unknown>) =>
      typeof attributes.blockId === "string" && attributes.blockId.length > 0
        ? { "data-be-block-id": attributes.blockId }
        : {},
  },
});

const mediaBlockCommonAttributes = () => ({
  ...blockIdAttribute(),
  url: { default: null, renderHTML: () => ({}) },
  name: { default: null, renderHTML: () => ({}) },
  caption: { default: null, renderHTML: () => ({}) },
  backgroundColor: { default: null, renderHTML: () => ({}) },
});

const previewAttributes = () => ({
  showPreview: { default: null, renderHTML: () => ({}) },
  previewWidth: { default: null, renderHTML: () => ({}) },
  textAlignment: { default: null, renderHTML: () => ({}) },
});

// ---- renderHTML 공유 헬퍼(RD-002 DELTA-01) ----
//
// url 없는 빈 상태는 `data-be-media-empty`에 kind를 담아 표식한다(완료
// 조건 3). heading/quote/code의 `data-placeholder`
// (placeholder-extension.ts, R-4·R-7)를 그대로 재사용하지 않는다 —
// `[data-placeholder]::before`(_editor.scss)는 텍스트 캐럿 오버레이용
// float 레이아웃이라 캐럿이 없는 atom 블록에 적용하면 의도치 않은 시각
// 결과가 난다. 이 attribute는 별도 표식일 뿐이라 react가 실제 빈 상태
// UI(RD-003 File Panel)를 붙이기 전까지 화면에 아무 영향이 없다.
const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

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
    : [["div", { "data-be-media-caption": "" }, caption]];
};

export const FileBlockExtension = Node.create({
  name: "file",
  group: "block",
  atom: true,
  priority: 100,

  addAttributes: mediaBlockCommonAttributes,

  renderHTML({ HTMLAttributes, node }) {
    const url = nonEmptyString(node.attrs.url);
    const name = nonEmptyString(node.attrs.name);
    // file은 <a href="url">name 또는 url</a>로 매핑한다(RD-002.md 포함
    // 범위) — name이 없으면 url 자체를 링크 텍스트로 쓴다.
    const children: DOMOutputSpec[] =
      url === null ? [] : [["a", { href: url }, name ?? url]];
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        url === null ? { "data-be-media-empty": "file" } : {},
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
    const url = nonEmptyString(node.attrs.url);
    const name = nonEmptyString(node.attrs.name);
    const caption = nonEmptyString(node.attrs.caption);
    // alt는 caption이 있으면 caption, 없으면 name을 재사용한다(spec §6.3,
    // 별도 alt prop 신설 없음 — 2026-09-04 사용자 확정).
    const children: DOMOutputSpec[] =
      url === null
        ? []
        : [
            [
              "img",
              {
                src: url,
                alt: caption ?? name ?? "",
                ...previewWidthStyleAttrs(node.attrs),
              },
            ],
          ];
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        url === null ? { "data-be-media-empty": "image" } : {},
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
    const url = nonEmptyString(node.attrs.url);
    // 재생·일시정지·탐색·음량 이상의 신규 UI를 만들지 않는다(spec §2 제외
    // 범위) — 네이티브 <video controls>만 낸다.
    const children: DOMOutputSpec[] =
      url === null
        ? []
        : [
            [
              "video",
              {
                controls: "",
                src: url,
                ...previewWidthStyleAttrs(node.attrs),
              },
            ],
          ];
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        url === null ? { "data-be-media-empty": "video" } : {},
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
    const url = nonEmptyString(node.attrs.url);
    const children: DOMOutputSpec[] =
      url === null ? [] : [["audio", { controls: "", src: url }]];
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        url === null ? { "data-be-media-empty": "audio" } : {},
      ),
      ...children,
      ...captionChildren(node.attrs),
    ];
  },
});
