/**
 * ImageBlock의 선택 `alt` 필드 계약을 확인한다(Issue #424, RD-002-DELTA-01).
 *
 * - alt는 image만 갖는다. 빈 문자열도 유효값이다("장식 이미지" 의미를 보존한다).
 * - video/audio/file/iframe은 zod `.strict()`가 alt를 거절한다.
 * - 값 검증은 타입(string)뿐이다. name·caption과 같은 관례다.
 */
import { describe, expect, it } from "vitest";

import {
  mediaBlockHasField,
  mediaBlockTypeHasField,
  parseDocument,
} from "../src/index.js";

const documentOf = (block: unknown) => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

describe("ImageBlock alt", () => {
  it.each(["설명", "", 'a "quote" & <tag>', " 앞뒤 공백 "])(
    "alt %j를 보존한다",
    (alt) => {
      const input = documentOf({ id: "i1", type: "image", alt });
      expect(parseDocument(input)).toEqual({ ok: true, value: input });
    },
  );

  it("alt와 name·caption이 서로 다른 값으로 함께 보존된다", () => {
    const input = documentOf({
      id: "i1",
      type: "image",
      url: "https://example.com/a.png",
      name: "파일명.png",
      caption: "캡션",
      alt: "대체 텍스트",
    });
    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });

  it("alt가 없으면 키를 만들지 않는다", () => {
    const input = documentOf({ id: "i1", type: "image", name: "n" });
    const result = parseDocument(input);
    expect(result).toEqual({ ok: true, value: input });
    expect(JSON.stringify(result)).not.toContain("alt");
  });

  it.each([1, null, true, {}, ["a"]])(
    "문자열이 아닌 alt %j를 거절한다",
    (alt) => {
      expect(
        parseDocument(documentOf({ id: "i1", type: "image", alt })).ok,
      ).toBe(false);
    },
  );

  it.each(["video", "audio", "file", "iframe"])(
    "%s의 alt를 strict 스키마가 거절한다",
    (type) => {
      expect(parseDocument(documentOf({ id: "b1", type, alt: "x" })).ok).toBe(
        false,
      );
    },
  );

  it("필드 소유 표가 alt를 image만 소유한다고 답한다", () => {
    expect(mediaBlockTypeHasField("image", "alt")).toBe(true);
    for (const type of ["video", "audio", "file", "iframe"]) {
      expect(mediaBlockTypeHasField(type, "alt")).toBe(false);
    }
    expect(mediaBlockHasField({ type: "image" }, "alt")).toBe(true);
    expect(mediaBlockHasField({ type: "video" }, "alt")).toBe(false);
  });
});
