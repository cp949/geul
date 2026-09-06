import { z } from "zod";

import { jsonPrimitivePropSchema } from "./json-primitive-prop-schema.js";
import { textMarkOrCustomSchema } from "./text-mark-schema.js";
import type { InlineContentItem } from "./types.js";

// InlineContentItem(EXT-002/EXT-003이 이미 추가)로 위젠한다(RD-002-DELTA-13).
// inlineContentItemSchema는 이 정의보다 아래(라우팅 스키마 절)에 있어
// z.lazy로 순방향 참조한다 — 재귀 children 필드가 뒤에 오는 blockSchema를
// 참조하는 block-schema.ts의 동일 패턴
// (`z.lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))`)과 같은
// 해법이다.
export const inlineContentSchema = z.lazy((): z.ZodType<InlineContentItem[]> =>
  z.array(inlineContentItemSchema),
);

// EXT-002 커스텀 inline 원소(leaf)의 envelope 검증이다. text 런과 달리
// `type: "custom"` 리터럴로 스스로를 식별한다(spec §4.2).
const customInlineContentItemSchema = z
  .object({
    type: z.literal("custom"),
    customType: z.string(),
    props: z.record(z.string(), jsonPrimitivePropSchema).optional(),
  })
  .strict();

// 기존 inlineContentSchema 원소({text, marks?})와 같은 shape이지만 marks가
// textMarkOrCustomSchema로 CustomTextMark(EXT-003)도 받는다는 점만 다르다.
// .strict() — 기존 inlineContentSchema는 strict가 아니지만(레거시 유지),
// 이 신규 병행 타입은 다른 신규 스키마와 같은 강도로 미선언 키를 거절한다.
const textRunItemSchema = z
  .object({
    text: z.string(),
    marks: z.array(textMarkOrCustomSchema).optional(),
  })
  .strict();

// InlineContentItem(EXT-002) 라우팅이다. text 런과 달리 두 변형은 리터럴
// type 값("custom" 존재 여부)으로만 구분되므로 판별 로직이 blockOrCustom과
// 다르다 — "알려진 타입 목록 대조"가 아니라 "type === 'custom'인가"로 나눈다.
export const inlineContentItemSchema = z
  .custom<unknown>()
  .transform((raw, ctx): InlineContentItem => {
    const isCustomVariant =
      typeof raw === "object" &&
      raw !== null &&
      (raw as { type?: unknown }).type === "custom";

    const forwardIssues = (issues: readonly unknown[]): void => {
      for (const issue of issues)
        ctx.addIssue(issue as unknown as Parameters<typeof ctx.addIssue>[0]);
    };

    if (isCustomVariant) {
      const result = customInlineContentItemSchema.safeParse(raw);
      if (!result.success) {
        forwardIssues(result.error.issues);
        return z.NEVER;
      }
      return result.data as InlineContentItem;
    }

    const result = textRunItemSchema.safeParse(raw);
    if (!result.success) {
      forwardIssues(result.error.issues);
      return z.NEVER;
    }
    return result.data as InlineContentItem;
  });
