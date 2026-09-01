// Block 판별자를 세 겹 포함 관계로 분류한다 — 목록 항목 ⊂ 중첩 가능
// ⊂ 콘텐츠 보유. 세 predicate를 합성으로 정의해, 목록 종류가 하나
// 늘어도 isListItemBlockType 한 곳만 고치면 나머지 둘이 그대로 따라간다.
// (아키텍처 리뷰 6차 L1, ADR-0002가 정한 "동일 불변식을 여러 패키지가
// 다시 구현하지 않는다"를 model 자신에게도 적용한다.)

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
  "paragraph" | "heading" | "quote" | ListItemBlockType | "toggleListItem";

export const isNestableBlockType = (type: string): type is NestableBlockType =>
  type === "paragraph" ||
  type === "heading" ||
  type === "quote" ||
  type === "toggleListItem" ||
  isListItemBlockType(type);

// content: InlineContent 필드를 가지는 블록 종류다(table·divider 제외).
export type InlineContentBlockType = NestableBlockType | "codeBlock";

export const isInlineContentBlockType = (
  type: string,
): type is InlineContentBlockType =>
  isNestableBlockType(type) || type === "codeBlock";
