import { z } from "zod";

import { jsonPrimitivePropSchema } from "./json-primitive-prop-schema.js";
import { PLAIN_TEXT_MARK_TYPES } from "./mark-canonicalization.js";
import type { CustomTextMark, TextMark } from "./types.js";

const textMarkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(PLAIN_TEXT_MARK_TYPES) }),
  z.object({ type: z.literal("link"), href: z.string() }),
  z.object({ type: z.literal("textColor"), color: z.string() }),
  z.object({ type: z.literal("backgroundColor"), color: z.string() }),
]);

// CustomTextMark(EXT-003)의 envelope 검증이다 — CustomBlock과 같은 이유로
// 구조만 본다. TextMark는 id가 없다(마크는 개별 식별되지 않는다).
const customTextMarkSchema = z
  .object({
    type: z.string(),
    props: z.record(z.string(), jsonPrimitivePropSchema).optional(),
  })
  .strict();

// 알려진 8종(5개 plain 유형 + link/textColor/backgroundColor) mark
// 판별자다. PLAIN_TEXT_MARK_TYPES(기존 canonical 목록)를 그대로 재사용해
// KNOWN_BLOCK_TYPES처럼 별도 하드코딩 목록을 늘리지 않는다.
const KNOWN_TEXT_MARK_TYPES: ReadonlySet<string> = new Set<string>([
  ...PLAIN_TEXT_MARK_TYPES,
  "link",
  "textColor",
  "backgroundColor",
]);

// core/io(DELTA-14+)와 model 내부(document-structure-validation.ts의
// validateContent, RD-002-DELTA-13)가 TextMark와 CustomTextMark를 구분할 때
// 재사용하는 predicate다 — isKnownBlockType(DELTA-01)과 같은 이유로
// `type is TextMark["type"]`만 좁힌다.
export const isKnownTextMarkType = (type: string): type is TextMark["type"] =>
  KNOWN_TEXT_MARK_TYPES.has(type);

// blockOrCustomBlockSchema(block-schema.ts)와 동일한 라우팅 패턴이다(spec
// §4.3). 알려진 8종이면 기존 textMarkSchema로, 아니면 customTextMarkSchema로
// 위임한다.
export const textMarkOrCustomSchema = z
  .custom<unknown>()
  .transform((raw, ctx): TextMark | CustomTextMark => {
    const type =
      typeof raw === "object" && raw !== null && "type" in raw
        ? (raw as { type?: unknown }).type
        : undefined;

    const forwardIssues = (issues: readonly unknown[]): void => {
      for (const issue of issues)
        ctx.addIssue(issue as unknown as Parameters<typeof ctx.addIssue>[0]);
    };

    if (typeof type === "string" && KNOWN_TEXT_MARK_TYPES.has(type)) {
      const result = textMarkSchema.safeParse(raw);
      if (!result.success) {
        forwardIssues(result.error.issues);
        return z.NEVER;
      }
      return result.data as TextMark;
    }

    const result = customTextMarkSchema.safeParse(raw);
    if (!result.success) {
      forwardIssues(result.error.issues);
      return z.NEVER;
    }
    return result.data as CustomTextMark;
  });
