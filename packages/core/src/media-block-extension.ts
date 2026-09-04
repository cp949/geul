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
// 여기 attrs는 구조만 담는다. DOM 렌더은 아직 슬라이스2+ 편집 UI·슬라이스6
// HTML round-trip 몫이라 blockId 외 attr은 DOM에 투영하지 않는다
// (CodeBlockExtension.language와 같은 관례 — io 왕복은 PM DOM이 아니라
// 저장 Document를 직접 읽고 쓴다).
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

export const FileBlockExtension = Node.create({
  name: "file",
  group: "block",
  atom: true,
  priority: 100,

  addAttributes: mediaBlockCommonAttributes,

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes)];
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

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes)];
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

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes)];
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

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes)];
  },
});
