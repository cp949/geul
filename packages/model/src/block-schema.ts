import { z } from "zod";

import { inlineContentSchema } from "./inline-content-schema.js";
import { jsonPrimitivePropSchema } from "./json-primitive-prop-schema.js";
import type { Block, CustomBlock } from "./types.js";

// .strict() — TableBlock은 children을 허용하지 않는다(spec 2.2, D15). 스키마가
// children 키를 선언하지 않은 채 기본 z.object()로 두면 미선언 키를 조용히
// 제거해 하위 블록이 무음 유실된다 — strict()로 미선언 키를 파싱 실패로
// 승격시켜 완료 조건 5의 DOCUMENT_INVALID 거절을 zod 파싱 단계에서 확보한다.
const tableBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("table"),
    columns: z.array(z.object({ id: z.string(), width: z.number() })),
    rows: z.array(
      z.object({
        id: z.string(),
        cells: z.array(
          z.object({
            id: z.string(),
            columnId: z.string(),
            rowSpan: z.number(),
            columnSpan: z.number(),
            content: inlineContentSchema,
            textColor: z.string().optional(),
            backgroundColor: z.string().optional(),
            align: z.string().optional(),
          }),
        ),
      }),
    ),
    headerRows: z.union([z.literal(0), z.literal(1)]),
    headerColumns: z.union([z.literal(0), z.literal(1)]),
  })
  .strict();

// .strict() — DividerBlock은 콘텐츠도 children도 없는 리프다(spec §4.2). 기본
// z.object()는 미선언 키(content·children)를 에러 없이 조용히 제거해 구분선에
// 실려 온 하위 블록·텍스트가 무음 유실된다 — strict()로 미선언 키를 파싱
// 실패로 승격시켜 DOCUMENT_INVALID 거절을 zod 파싱 단계에서 확보한다.
const dividerBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("divider"),
  })
  .strict();

const codeBlockContentSchema = z
  .array(
    z
      .object({
        text: z.string(),
      })
      .strict(),
  )
  .max(1);

const codeBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("codeBlock"),
    language: z.string().optional(),
    content: codeBlockContentSchema,
  })
  .strict();

// 4종 leaf 미디어 블록(file/image/video/audio) 공통 shape다(spec §3.1).
// url/backgroundColor는 여기서 타입만 확인하고, 정규 계약 판정
// (isSupportedLinkHref/isCanonicalCellColor)은 divider/codeBlock과 같은
// 자리(document-structure-validation.ts)에서 단독 수행한다(G-CNV-001).
// previewWidth도 같은 이유로 여기서는 느슨한 z.number()만 쓴다 — 표 열
// 너비와 달리 정수·상한을 강제하지 않는다(media-block.ts, spec §5.3).
const mediaBlockCommonShape = {
  url: z.string().optional(),
  name: z.string().optional(),
  caption: z.string().optional(),
  backgroundColor: z.string().optional(),
};

// .strict() — FileBlock은 showPreview/previewWidth/textAlignment를 갖지
// 않는다(spec §3.1, BlockNote 실측). 기본 z.object()는 미선언 키를 조용히
// 제거해 shape 위반이 무음 유실되므로, divider/codeBlock과 같은 이유로
// strict()가 DOCUMENT_INVALID 거절을 zod 파싱 단계에서 확보한다.
const fileBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("file"),
    ...mediaBlockCommonShape,
  })
  .strict();

// .strict() — ImageBlock/VideoBlock은 showPreview/previewWidth/textAlignment를
// 갖는다(spec §3.1). audio/file과 필드 집합이 달라 별도 스키마로 둔다 —
// 하나로 합치면 audio에 previewWidth가 섞여도 조용히 통과한다(완료 조건 5).
const imageBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("image"),
    showPreview: z.boolean().optional(),
    previewWidth: z.number().optional(),
    textAlignment: z.string().optional(),
    ...mediaBlockCommonShape,
  })
  .strict();

const videoBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("video"),
    showPreview: z.boolean().optional(),
    previewWidth: z.number().optional(),
    textAlignment: z.string().optional(),
    ...mediaBlockCommonShape,
  })
  .strict();

// .strict() — AudioBlock은 showPreview만 갖고 previewWidth/textAlignment는
// 갖지 않는다(spec §3.1, BlockNote 실측 — audio는 previewWidth가 없다).
const audioBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("audio"),
    showPreview: z.boolean().optional(),
    ...mediaBlockCommonShape,
  })
  .strict();

// paragraph/heading/quoteBlockSchema는 children으로 blockSchema를 재귀 참조한다.
// discriminatedUnion이 멤버 스키마의 구체 ZodObject 모양(리터럴 판별 필드)을
// 직접 봐야 하므로 paragraph/heading/quoteBlockSchema 자체는 z.ZodType<T>로
// 넓히지 않는다 — 순환은 children 필드의 z.lazy 콜백 반환 타입 하나에만 명시
// 타입(BlockNode[])을 달아 끊는다. BlockNode는 zod가 실제로 추론하는 모양
// (옵셔널 필드가 항상 `T | undefined`를 명시하는 모양)을 그대로 따르는 스키마
// 전용 타입이다 — model의 손으로 쓴 Block 계열 타입(`children?: Block[]`)은
// exactOptionalPropertyTypes 아래에서 이 모양과 바로 맞지 않는다. 공개 모델
// 타입으로의 변환은 기존과 같이 parseDocument의 `as Document` 캐스트가
// 담당한다.
// TextBlockProps 3필드는 zod가 실제로 추론하는 모양(`T | undefined`)을
// 따르는 스키마 전용 shape다 — model의 손으로 쓴 TextBlockProps(`textColor?:
// string`)와 exactOptionalPropertyTypes 아래에서 바로 맞지 않는 이유는
// children과 같다(위 주석 참고). textAlignment도 표 셀 align과 같은 이유로
// 여기서는 느슨한 string으로 둔다 — enum 정규형 판정은 zod가 아니라
// validateTextBlockProps(text-block-props-validation.ts)가
// isCanonicalCellAlign으로 단독 수행한다.
type TextBlockPropsNode = {
  textColor?: string | undefined;
  backgroundColor?: string | undefined;
  textAlignment?: string | undefined;
};

type ParagraphBlockNode = {
  id: string;
  type: "paragraph";
  content: z.infer<typeof inlineContentSchema>;
  children?: BlockNode[] | undefined;
} & TextBlockPropsNode;

type HeadingBlockNode = {
  id: string;
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content: z.infer<typeof inlineContentSchema>;
  isToggleable?: boolean | undefined;
  collapsed?: boolean | undefined;
  children?: BlockNode[] | undefined;
} & TextBlockPropsNode;

type QuoteBlockNode = {
  id: string;
  type: "quote";
  content: z.infer<typeof inlineContentSchema>;
  children?: BlockNode[] | undefined;
} & TextBlockPropsNode;

type BulletListItemBlockNode = {
  id: string;
  type: "bulletListItem";
  content: z.infer<typeof inlineContentSchema>;
  children?: BlockNode[] | undefined;
} & TextBlockPropsNode;

type NumberedListItemBlockNode = {
  id: string;
  type: "numberedListItem";
  content: z.infer<typeof inlineContentSchema>;
  startNumber?: number | undefined;
  children?: BlockNode[] | undefined;
} & TextBlockPropsNode;

type CheckListItemBlockNode = {
  id: string;
  type: "checkListItem";
  content: z.infer<typeof inlineContentSchema>;
  checked: boolean;
  children?: BlockNode[] | undefined;
} & TextBlockPropsNode;

type ToggleListItemBlockNode = {
  id: string;
  type: "toggleListItem";
  content: z.infer<typeof inlineContentSchema>;
  collapsed?: boolean | undefined;
  children?: BlockNode[] | undefined;
} & TextBlockPropsNode;

type DividerBlockNode = z.infer<typeof dividerBlockSchema>;
type CodeBlockNode = z.infer<typeof codeBlockSchema>;
type FileBlockNode = z.infer<typeof fileBlockSchema>;
type ImageBlockNode = z.infer<typeof imageBlockSchema>;
type VideoBlockNode = z.infer<typeof videoBlockSchema>;
type AudioBlockNode = z.infer<typeof audioBlockSchema>;

type BlockNode =
  | ParagraphBlockNode
  | HeadingBlockNode
  | z.infer<typeof tableBlockSchema>
  | QuoteBlockNode
  | BulletListItemBlockNode
  | NumberedListItemBlockNode
  | CheckListItemBlockNode
  | ToggleListItemBlockNode
  | DividerBlockNode
  | CodeBlockNode
  | FileBlockNode
  | ImageBlockNode
  | VideoBlockNode
  | AudioBlockNode;

// TextBlockProps 3필드(model 손글씨 타입과 동일 optional shape) — 콘텐츠를
// 갖는 nestable 블록 7종 스키마가 공통으로 spread한다. 정규형(색상
// #RRGGBB 대문자, 정렬 enum) 판정은 여기서 하지 않는다 — zod는 타입만
// 확인하고, validateTextBlockProps(text-block-props-validation.ts)가
// parseDocument 조립 시점에 isCanonicalCellColor/isCanonicalCellAlign으로
// 단독 판정한다(G-CNV-001).
const textBlockPropsShape = {
  textColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  textAlignment: z.string().optional(),
};

const paragraphBlockSchema = z.object({
  id: z.string(),
  type: z.literal("paragraph"),
  content: inlineContentSchema,
  children: z
    .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
    .optional(),
  ...textBlockPropsShape,
});

const headingBlockSchema = z.object({
  id: z.string(),
  type: z.literal("heading"),
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  content: inlineContentSchema,
  isToggleable: z.boolean().optional(),
  collapsed: z.boolean().optional(),
  children: z
    .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
    .optional(),
  ...textBlockPropsShape,
});

const quoteBlockSchema = z.object({
  id: z.string(),
  type: z.literal("quote"),
  content: inlineContentSchema,
  children: z
    .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
    .optional(),
  ...textBlockPropsShape,
});

// 목록 항목은 text block과 같은 재귀 children을 가지지만 type별 저장 필드를
// 정확히 구분한다. strict()가 bullet의 startNumber와 임의 필드의 무음 유실을
// DOCUMENT_INVALID로 바꾼다.
const bulletListItemBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("bulletListItem"),
    content: inlineContentSchema,
    children: z
      .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
      .optional(),
    ...textBlockPropsShape,
  })
  .strict();

const numberedListItemBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("numberedListItem"),
    content: inlineContentSchema,
    startNumber: z.number().int().min(0).max(999_999_999).optional(),
    children: z
      .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
      .optional(),
    ...textBlockPropsShape,
  })
  .strict();

// checkListItem은 bulletListItem과 같은 목록 항목 shape(content + 재귀
// children) 위에 checked 하나만 얹는다. toggleListItem의 collapsed와 달리
// checked는 optional이 아니다 — 누락·오타입 문서를 이 스키마 한 곳에서
// DOCUMENT_INVALID로 거절한다(G-CNV-001).
const checkListItemBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("checkListItem"),
    content: inlineContentSchema,
    checked: z.boolean(),
    children: z
      .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
      .optional(),
    ...textBlockPropsShape,
  })
  .strict();

// toggleListItem은 bulletListItem/numberedListItem과 같은 목록 항목 shape
// (content + 재귀 children) 위에 collapsed 하나만 얹는다. collapsed 값 자체는
// heading의 isToggleable 같은 선행 조건이 없다 — 타입 자체가 토글 여부를
// 뜻한다(spec §4.4).
const toggleListItemBlockSchema = z
  .object({
    id: z.string(),
    type: z.literal("toggleListItem"),
    content: inlineContentSchema,
    collapsed: z.boolean().optional(),
    children: z
      .lazy((): z.ZodType<BlockNode[]> => z.array(blockSchema))
      .optional(),
    ...textBlockPropsShape,
  })
  .strict();

const blockSchema = z.discriminatedUnion("type", [
  paragraphBlockSchema,
  headingBlockSchema,
  tableBlockSchema,
  quoteBlockSchema,
  bulletListItemBlockSchema,
  numberedListItemBlockSchema,
  checkListItemBlockSchema,
  toggleListItemBlockSchema,
  dividerBlockSchema,
  codeBlockSchema,
  fileBlockSchema,
  imageBlockSchema,
  videoBlockSchema,
  audioBlockSchema,
]);

// CustomBlock(EXT-001)의 envelope(구조) 검증이다. 타입별 props 의미는
// 소비자 registry를 아는 react 계층의 책임이다 — model은 구조만 안다(spec
// §4.2, ADR-0002 순수성 유지, 그릴링 Q3 2026-09-06 채택). .strict() —
// 다른 block 스키마와 같은 이유로 미선언 키를 파싱 실패로 승격시킨다.
const customBlockSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    content: z.union([z.literal("none"), z.literal("inline")]),
    props: z.record(z.string(), jsonPrimitivePropSchema).optional(),
  })
  .strict();

// 알려진 14종 block 판별자다. blockOrCustomBlockSchema가 원시 type 값을
// 이 목록과 대조해 blockSchema/customBlockSchema로 라우팅한다(spec §4.3).
// Block 유니온에 15번째 타입이 추가되면 이 목록도 함께 갱신한다 — 이미
// blockSchema 배열 자체도 수동 갱신 대상이라 같은 지점에 한 줄이 늘 뿐이다.
const KNOWN_BLOCK_TYPES: ReadonlySet<string> = new Set<Block["type"]>([
  "paragraph",
  "heading",
  "table",
  "quote",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "toggleListItem",
  "divider",
  "codeBlock",
  "file",
  "image",
  "video",
  "audio",
]);

// core/io(RD-002 DELTA-02~04)가 document.blocks 원소를 알려진 Block과
// CustomBlock으로 구분할 때 재사용하는 predicate다 — KNOWN_BLOCK_TYPES를
// 중복 정의하지 않는다(RD-002-DELTA-01 "설계 결정" 3). isNestableBlockType과
// 같은 이유로 `type is Block["type"]`만 좁힌다 — discriminated union인
// block 자체를 좁히려면 호출부에서 명시적으로 캐스트한다.
export const isKnownBlockType = (type: string): type is Block["type"] =>
  KNOWN_BLOCK_TYPES.has(type);

// discriminatedUnion 옵션 전원이 리터럴 판별자를 가져야 하는 zod 제약 때문에
// CustomBlock(임의 문자열 type)을 blockSchema 옵션에 직접 섞을 수 없다(spec
// §4.3, zod 4.4.3 2026-09-06 실측 — catch-all을 섞으면 런타임 에러, z.union
// 우회는 에러 메시지 품질 저하). 파싱 전 원시 type 값을 먼저 보고 알려진
// 타입이면 blockSchema로, 아니면 customBlockSchema로 위임한다. 실패 시
// 원본 스키마의 issue를 그대로 전달해(ctx.addIssue) 라우팅 도입 전과 동일한
// path·message 품질을 보존한다(완료 조건 6).
export const blockOrCustomBlockSchema = z
  .custom<unknown>()
  .transform((raw, ctx): Block | CustomBlock => {
    const type =
      typeof raw === "object" && raw !== null && "type" in raw
        ? (raw as { type?: unknown }).type
        : undefined;

    // ctx.addIssue의 매개변수 타입(exactOptionalPropertyTypes 아래 zod
    // 내부 $ZodSuperRefineIssue)이 safeParse가 실제로 반환하는 $ZodIssue와
    // 구조적으로 정확히 맞지 않는다(2026-09-06 tsc 실측) — 완료된 파싱의
    // issue를 그대로 전달하는 spec §4.3 패턴 자체는 zod 4.4.3에서 런타임
    // 검증됐으므로 이 캐스트로 형만 맞춘다.
    const forwardIssues = (issues: readonly unknown[]): void => {
      for (const issue of issues)
        ctx.addIssue(issue as unknown as Parameters<typeof ctx.addIssue>[0]);
    };

    if (typeof type === "string" && KNOWN_BLOCK_TYPES.has(type)) {
      const result = blockSchema.safeParse(raw);
      if (!result.success) {
        forwardIssues(result.error.issues);
        return z.NEVER;
      }
      return result.data as Block;
    }

    const result = customBlockSchema.safeParse(raw);
    if (!result.success) {
      forwardIssues(result.error.issues);
      return z.NEVER;
    }
    return result.data as CustomBlock;
  });

// blocks는 top-level만 blockOrCustomBlockSchema로 라우팅한다(RD-002-DELTA-01
// "설계 결정" 1) — CustomBlock은 leaf·top-level 전용이라 각 block의 재귀
// children 스키마(z.lazy(() => z.array(blockSchema)))는 그대로 둔다.
export const documentSchema = z.object({
  formatVersion: z.number(),
  revision: z.number(),
  blocks: z.array(blockOrCustomBlockSchema),
});
