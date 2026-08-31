// Block 판별자를 세 겹 포함 관계로 분류한다 — 목록 항목 ⊂ 중첩 가능
// ⊂ 콘텐츠 보유. 세 predicate를 합성으로 정의해, 목록 종류가 하나
// 늘어도 isListItemBlockType 한 곳만 고치면 나머지 둘이 그대로 따라간다.
// (아키텍처 리뷰 6차 L1, ADR-0002가 정한 "동일 불변식을 여러 패키지가
// 다시 구현하지 않는다"를 model 자신에게도 적용한다.)

/** bulletListItem·numberedListItem — 목록 항목 블록 종류. */
export type ListItemBlockType = "bulletListItem" | "numberedListItem";

export const isListItemBlockType = (type: string): type is ListItemBlockType =>
  type === "bulletListItem" || type === "numberedListItem";

// children 필드를 가질 수 있는 블록 종류다. Tiptap의 nestableBlockContent
// group(core/list-item-extension.ts 등)과 정확히 대응한다.
export type NestableBlockType =
  "paragraph" | "heading" | "quote" | ListItemBlockType;

export const isNestableBlockType = (type: string): type is NestableBlockType =>
  type === "paragraph" ||
  type === "heading" ||
  type === "quote" ||
  isListItemBlockType(type);

// content: InlineContent 필드를 가지는 블록 종류다(table·divider 제외).
export type InlineContentBlockType = NestableBlockType | "codeBlock";

export const isInlineContentBlockType = (
  type: string,
): type is InlineContentBlockType =>
  isNestableBlockType(type) || type === "codeBlock";
