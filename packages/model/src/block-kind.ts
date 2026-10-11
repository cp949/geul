// Block 판별자를 세 겹 포함 관계로 분류한다 — 목록 항목 ⊂ 중첩 가능
// ⊂ 콘텐츠 보유. 세 predicate를 합성으로 정의해, 목록 종류가 하나
// 늘어도 isListItemBlockType 한 곳만 고치면 나머지 둘이 그대로 따라간다.
// (아키텍처 리뷰 6차 L1, ADR-0002가 정한 "동일 불변식을 여러 패키지가
// 다시 구현하지 않는다"를 model 자신에게도 적용한다.)

import type { Block } from "./types.js";

/** bulletListItem·numberedListItem·checkListItem — 목록 항목 블록 종류. */
export type ListItemBlockType =
  "bulletListItem" | "numberedListItem" | "checkListItem";

export const isListItemBlockType = (type: string): type is ListItemBlockType =>
  type === "bulletListItem" ||
  type === "numberedListItem" ||
  type === "checkListItem";

// bulletListItem·numberedListItem·toggleListItem — 편집기 UX(빈 블록
// placeholder 문구, 빈 항목 Enter 종료, 선두 Backspace 종료)가 "목록
// 항목처럼" 동작해야 하는 블록 종류다. isListItemBlockType과 의도적으로
// 분리한다 — isListItemBlockType은 <ul>/<ol> HTML 직렬화(io) 대상만
// 판정하는 좁은 계약이고 toggleListItem은 <details>로 개별 렌더링돼(spec
// §7.1) 여기 들어가면 안 되지만(로드맵 D2), core의
// placeholder-extension.ts·block-split-extension.ts·block-join-extension.ts
// 세 곳은 원래 isListItemBlockType을 이 UX 판정에 재사용하고 있었다 —
// toggleListItem을 그 predicate에서 뺀 채로 두면 이 세 곳에서 "그냥
// 텍스트 블록"으로 취급돼 빈 토글 목록이 아무 placeholder 없이 보이고
// Enter로 빠져나올 수 없다(RD-003 트랙-3 결함 탐지 F2). io 직렬화와 core
// 편집 UX는 서로 다른 축이라 predicate를 분리해서 둘 다 정확하게
// 유지한다.
export type ListEntryBlockType = ListItemBlockType | "toggleListItem";

export const isListEntryBlockType = (
  type: string,
): type is ListEntryBlockType =>
  type === "toggleListItem" || isListItemBlockType(type);

// children 필드를 가질 수 있는 블록 종류다. Tiptap의 nestableBlockContent
// group(core/list-item-extension.ts 등)과 정확히 대응한다.
//
// toggleListItem은 ListItemBlockType에 넣지 않고 여기 직접 추가한다(RD-003
// 착수 전 로드맵 D2 정정) — isListItemBlockType은 bulletListItem/
// numberedListItem처럼 <ul>/<ol> 직렬화(io) 대상인 두 종류만 판정하는
// 계약이고, 세 겹 포함 관계(목록 항목 ⊂ 중첩 가능)상 여기 넣지 않으면
// isNestableBlockType이 toggleListItem을 표(table) 전용 분기로 잘못
// 떨어뜨린다(model/src/schema.ts의 validateBlocksAt).
export type NestableBlockType =
  | "paragraph"
  | "heading"
  | "quote"
  | ListItemBlockType
  | "toggleListItem"
  | "callout";

export const isNestableBlockType = (type: string): type is NestableBlockType =>
  type === "paragraph" ||
  type === "heading" ||
  type === "quote" ||
  type === "toggleListItem" ||
  type === "callout" ||
  isListItemBlockType(type);

// content: InlineContent 필드를 가지는 블록 종류다(table·divider 제외).
export type InlineContentBlockType = NestableBlockType | "codeBlock";

export const isInlineContentBlockType = (
  type: string,
): type is InlineContentBlockType =>
  isNestableBlockType(type) || type === "codeBlock";

// 블록 종류 분류의 정본 표다(Issue #371). Block["type"] 전 종류에 가족을
// 하나씩 배정한다.
// - Record<Block["type"], ...> 제약이라 Block에 종류가 늘면 이 표가 비어
//   tsc가 실패한다.
// - 미디어 블록·리프 블록 판정은 이 표에서만 파생한다.
// - 위 세 겹 predicate는 이 표에서 파생하지 않는다. 목록·중첩 판정은 가족이
//   아니라 포함 관계 축이다.
export type BlockFamily = "text" | "table" | "divider" | "code" | "media";

export const BLOCK_FAMILY = {
  paragraph: "text",
  heading: "text",
  quote: "text",
  bulletListItem: "text",
  numberedListItem: "text",
  checkListItem: "text",
  toggleListItem: "text",
  callout: "text",
  table: "table",
  divider: "divider",
  codeBlock: "code",
  file: "media",
  image: "media",
  video: "media",
  audio: "media",
  iframe: "media",
} as const satisfies Record<Block["type"], BlockFamily>;

type BlockTypeOfFamily<F extends BlockFamily> = {
  [K in keyof typeof BLOCK_FAMILY]: (typeof BLOCK_FAMILY)[K] extends F
    ? K
    : never;
}[keyof typeof BLOCK_FAMILY];

/** file·image·video·audio·iframe — 표에서 파생한 미디어 블록 종류. */
export type MediaBlockType = BlockTypeOfFamily<"media">;

/** divider·codeBlock·미디어 5종 — children 필드가 없는 블록 종류. */
export type LeafBlockType = BlockTypeOfFamily<"divider" | "code" | "media">;

// Set은 모듈 로드 시 표에서 만든다. 객체 프로퍼티 조회로 판정하면
// "constructor"·"toString"·"__proto__" 같은 문자열이 새므로 Set.has만 쓴다.
// (Object.hasOwn은 check:escompat이 금지한다.)
const blockTypesOfFamilies = (
  families: readonly BlockFamily[],
): ReadonlySet<string> =>
  new Set(
    Object.entries(BLOCK_FAMILY)
      .filter(([, family]) => families.includes(family))
      .map(([type]) => type),
  );

const MEDIA_BLOCK_TYPES = blockTypesOfFamilies(["media"]);
const LEAF_BLOCK_TYPES = blockTypesOfFamilies(["divider", "code", "media"]);

export const isMediaBlockType = (type: string): type is MediaBlockType =>
  MEDIA_BLOCK_TYPES.has(type);

export const isLeafBlockType = (type: string): type is LeafBlockType =>
  LEAF_BLOCK_TYPES.has(type);

// block 자체를 좁힌다. Block과 Block | CustomBlock 양쪽에서 쓰도록 제네릭으로
// 둔다. CustomBlock(type: string)은 Extract에서 빠지므로 좁혀진 결과에 들지 않는다.
export const isMediaBlock = <B extends { type: string }>(
  block: B,
): block is Extract<B, { type: MediaBlockType }> =>
  MEDIA_BLOCK_TYPES.has(block.type);

// isMediaBlock과 같은 방식으로 block 자체를 리프 블록으로 좁힌다. type 문자열만
// 받는 isLeafBlockType은 block 유니온을 좁히지 못해, 남은 분기에서 children을
// 읽는 호출부가 이 함수를 쓴다.
export const isLeafBlock = <B extends { type: string }>(
  block: B,
): block is Extract<B, { type: LeafBlockType }> =>
  LEAF_BLOCK_TYPES.has(block.type);
