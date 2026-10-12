/**
 * 미디어 블록 종류별 필드 소유 표(MEDIA_BLOCK_FIELDS)를 고정한다.
 * - 표가 손으로 쓴 Block 타입(types.ts)과 같은 필드 집합을 말한다(컴파일 타임).
 * - 표를 순회해, 소유한 필드는 parseDocument가 받고 소유하지 않은 필드는 거절한다.
 * - mediaBlockTypeHasField·mediaBlockHasField가 표와 같은 답을 낸다.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  MEDIA_BLOCK_FIELDS,
  mediaBlockHasField,
  mediaBlockTypeHasField,
  parseDocument,
  type Block,
  type MediaBlockType,
  type MediaBlockTypeWithField,
  type MediaOwnField,
} from "../src/index.js";

const MEDIA_TYPES = Object.keys(MEDIA_BLOCK_FIELDS) as MediaBlockType[];
const OWN_FIELDS: readonly MediaOwnField[] = [
  "showPreview",
  "previewWidth",
  "textAlignment",
  "aspectRatio",
];

const SAMPLE_VALUES: Record<MediaOwnField, unknown> = {
  showPreview: false,
  previewWidth: 320,
  textAlignment: "center",
  aspectRatio: "16:9",
};

const documentOf = (block: unknown) => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

type OwnFieldsOf<K extends MediaBlockType> = Extract<
  keyof Extract<Block, { type: K }>,
  MediaOwnField
>;
type TableFieldsOf<K extends MediaBlockType> =
  (typeof MEDIA_BLOCK_FIELDS)[K][number];

describe("MEDIA_BLOCK_FIELDS — types.ts와의 일치(컴파일 타임)", () => {
  it("모든 미디어 종류에서 표의 필드 집합이 Block 타입의 소유 필드와 같다", () => {
    expectTypeOf<OwnFieldsOf<"file">>().toEqualTypeOf<TableFieldsOf<"file">>();
    expectTypeOf<OwnFieldsOf<"image">>().toEqualTypeOf<
      TableFieldsOf<"image">
    >();
    expectTypeOf<OwnFieldsOf<"video">>().toEqualTypeOf<
      TableFieldsOf<"video">
    >();
    expectTypeOf<OwnFieldsOf<"audio">>().toEqualTypeOf<
      TableFieldsOf<"audio">
    >();
    expectTypeOf<OwnFieldsOf<"iframe">>().toEqualTypeOf<
      TableFieldsOf<"iframe">
    >();
  });

  it("필드별 종류 집합이 표에서 파생된다", () => {
    expectTypeOf<MediaBlockTypeWithField<"showPreview">>().toEqualTypeOf<
      "image" | "video" | "audio"
    >();
    expectTypeOf<MediaBlockTypeWithField<"previewWidth">>().toEqualTypeOf<
      "image" | "video" | "iframe"
    >();
    expectTypeOf<
      MediaBlockTypeWithField<"aspectRatio">
    >().toEqualTypeOf<"iframe">();
  });
});

describe("MEDIA_BLOCK_FIELDS — 표 순회", () => {
  it("표의 종류가 미디어 5종이다", () => {
    expect([...MEDIA_TYPES].sort()).toEqual(
      ["audio", "file", "iframe", "image", "video"].sort(),
    );
  });

  describe.each(MEDIA_TYPES)("%s", (type) => {
    const owned: readonly MediaOwnField[] = MEDIA_BLOCK_FIELDS[type];

    it.each(OWN_FIELDS.filter((field) => owned.includes(field)))(
      "소유한 필드 %s를 parseDocument가 받는다",
      (field) => {
        const input = documentOf({
          id: "b1",
          type,
          [field]: SAMPLE_VALUES[field],
        });
        expect(parseDocument(input)).toEqual({ ok: true, value: input });
      },
    );

    it.each(OWN_FIELDS.filter((field) => !owned.includes(field)))(
      "소유하지 않은 필드 %s를 parseDocument가 거절한다",
      (field) => {
        const result = parseDocument(
          documentOf({ id: "b1", type, [field]: SAMPLE_VALUES[field] }),
        );
        expect(result.ok).toBe(false);
      },
    );

    it.each(OWN_FIELDS)("mediaBlockTypeHasField(%s)가 표와 같다", (field) => {
      expect(mediaBlockTypeHasField(type, field)).toBe(owned.includes(field));
    });

    it.each(OWN_FIELDS)("mediaBlockHasField(%s)가 표와 같다", (field) => {
      expect(mediaBlockHasField({ type }, field)).toBe(owned.includes(field));
    });
  });
});

describe("mediaBlockTypeHasField — 표 밖 문자열", () => {
  it.each([
    "paragraph",
    "codeBlock",
    "constructor",
    "toString",
    "__proto__",
    "",
    "my-custom-block",
  ])("%s는 어떤 필드도 갖지 않는다", (type) => {
    for (const field of OWN_FIELDS) {
      expect(mediaBlockTypeHasField(type, field)).toBe(false);
    }
  });
});

describe("mediaBlockHasField — 좁히기", () => {
  it("previewWidth를 가진 블록으로 좁혀 필드를 읽는다", () => {
    const widthOf = (block: Block): number | undefined => {
      if (!mediaBlockHasField(block, "previewWidth")) return undefined;
      expectTypeOf(block.type).toEqualTypeOf<"image" | "video" | "iframe">();
      return block.previewWidth;
    };
    expect(widthOf({ id: "b1", type: "iframe", previewWidth: 100 })).toBe(100);
    expect(widthOf({ id: "b2", type: "audio" })).toBeUndefined();
  });
});
