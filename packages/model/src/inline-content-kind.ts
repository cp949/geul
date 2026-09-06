import type { InlineContentItem } from "./types.js";

// InlineContentItem(EXT-002)의 두 변형(텍스트 런 | 커스텀)을 구분하는
// predicate다. 커스텀 변형만 `type` 필드를 가진다 — 텍스트 런에는 아예
// 없다("type" in item으로 판별, block-kind.ts와 같은 이유로 discriminated
// union 자체가 아니라 원소 판별에만 쓴다). schema.ts(validateContent,
// codeBlock content 접근)와 inline-content-merge.ts(zod 미의존)가 함께
// 재사용해야 해서 schema.ts가 아닌 이 전용 파일에 둔다(block-kind.ts와
// 같은 결, RD-002-DELTA-13 "설계 결정" 2).
export const isTextRunItem = (
  item: InlineContentItem,
): item is Extract<InlineContentItem, { text: string }> => !("type" in item);
