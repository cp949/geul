import type {
  CustomBlock,
  CustomTextMark,
  InlineContentItem,
} from "@cp949/geul-model";

import type { EditorController } from "./editor-controller-types.js";

// spec §4.4(EXT-001), RD-002-DELTA-11 — registry 등록 계약 그대로(비제네릭,
// §4.1 "결정"). render()는 raw HTMLElement만 다뤄 ADR-0002(공개 표면에
// Tiptap/PM 타입 비노출)를 그대로 만족한다. contentRef는 이번 DELTA에서
// core가 쓰지 않는 예약 필드다(custom-block-extension.ts 주석,
// DELTA-11.md "결정" 1 — content: "inline" 인스턴스의 실제 PM 콘텐츠
// 표현은 model에 저장 필드가 없어 범위 밖).
export type CustomBlockDefinition = {
  render: (context: { block: CustomBlock; editor: EditorController }) => {
    element: HTMLElement;
    contentRef?: HTMLElement;
  };
  // 미등록 시 io HTML/GFM 손실 정책(spec §4.5, RD-003)이 적용된다 —
  // 이번 DELTA는 이 두 필드를 저장만 하고 io로 연결하지 않는다(범위 밖).
  toHtml?: (block: CustomBlock) => string;
  toMarkdown?: (block: CustomBlock) => string;
};

// spec §4.4(EXT-002), RD-002-DELTA-18 — CustomBlockDefinition과 같은
// registry 계약이지만 render()는 {element}로 감싸지 않고 HTMLElement를
// 직접 반환한다(spec §4.4 원문 그대로) — inline 원소는 contentRef 예약
// 필드에 대응하는 개념이 없다(atom, 항상 leaf). toMarkdown이 없다 —
// InlineContentItem의 커스텀 변형은 spec §4.5가 markdown 손실 정책을
// block 단위(CUSTOM_BLOCK_LOST)로만 정의해 두어 별도 markdown 렌더러가
// 아직 없다(io 연결 자체가 이번 DELTA 범위 밖, RD-002-DELTA-18.md "범위 밖").
export type CustomInlineContentDefinition = {
  render: (context: {
    item: Extract<InlineContentItem, { type: "custom" }>;
    editor: EditorController;
  }) => HTMLElement;
  // 미등록 시 io HTML 손실 정책(spec §4.5, 범위 밖)이 적용된다 — 이번
  // DELTA는 이 필드를 저장만 하고 io로 연결하지 않는다.
  toHtml?: (item: Extract<InlineContentItem, { type: "custom" }>) => string;
};

// spec §4.4(EXT-003), RD-002-DELTA-19 — CustomBlockDefinition/
// CustomInlineContentDefinition과 달리 render()가 `editor`를 받지 않는다
// (spec §4.4 원문 — 스타일은 값만으로 렌더가 결정된다, 지연 바인딩 Proxy
// 불필요). PM Mark의 배열 기반 DOMOutputSpec으로의 변환은
// custom-style-mark-extension.ts가 전담한다(HTMLElement를 반환하면 태그·
// 속성만 추출하고 자식은 버린다 — Mark는 PM이 감싼 콘텐츠를 관리해야 해
// NodeView처럼 완성된 서브트리를 그대로 못 쓴다).
export type CustomStyleDefinition = {
  render: (
    value: CustomTextMark,
  ) =>
    HTMLElement | { className?: string; style?: Partial<CSSStyleDeclaration> };
  // 미등록 시 io HTML 손실 정책(spec §4.5, 범위 밖)이 적용된다 — 이번
  // DELTA는 이 필드를 저장만 하고 io로 연결하지 않는다.
  toHtml?: (value: CustomTextMark) => string;
};
