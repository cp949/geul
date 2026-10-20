/**
 * link mark의 선택 `target` 필드 계약을 확인한다(Issue #424, RD-001-DELTA-01).
 *
 * - 저장형은 정규형(`_blank`/`_self`/`_parent`/`_top`)만 허용한다. 정규화(ASCII 소문자)는
 *   입력 경로(io HTML import, core PM 디코드)가 `normalizeLinkTarget`으로 한다.
 * - 같은 href라도 target이 다르면 다른 링크다. 인접 병합과 정규 순서 판정이 target을 본다.
 * - `decodeTextMark`는 core 두 경로(PM 노드, Tiptap JSON)의 유일한 권위다. 허용 밖 target은
 *   거절하지 않고 버린다(붙여넣기로 들어온 임의 속성이 문서 전체를 거절시키지 않는다).
 */
import { describe, expect, it } from "vitest";

import type { InlineContent, TextMark } from "../src/index.js";
import {
  appendOrMergeInlineItem,
  canonicalizeTextMarks,
  decodeTextMark,
  isCanonicalLinkTarget,
  isCanonicalTextMarks,
  normalizeLinkTarget,
  parseDocument,
  sameMarks,
} from "../src/index.js";

const documentWithMarks = (marks: unknown[]) => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "p1",
      type: "paragraph",
      content: [{ text: "link", marks }],
    },
  ],
});

const link = (target?: string): TextMark => ({
  type: "link",
  href: "https://example.com",
  ...(target === undefined ? {} : { target }),
});

describe("link target 정규형 판정", () => {
  it.each(["_blank", "_self", "_parent", "_top"])(
    "%s는 정규형이다",
    (target) => {
      expect(isCanonicalLinkTarget(target)).toBe(true);
    },
  );

  it.each(["_BLANK", "blank", "foo", "", " _blank", "_blank ", "_Self"])(
    "%j는 정규형이 아니다",
    (target) => {
      expect(isCanonicalLinkTarget(target)).toBe(false);
    },
  );
});

describe("normalizeLinkTarget", () => {
  it.each([
    ["_blank", "_blank"],
    ["_BLANK", "_blank"],
    ["_Self", "_self"],
    ["_PARENT", "_parent"],
    ["_tOp", "_top"],
  ])("%j는 %j로 정규화한다", (input, expected) => {
    expect(normalizeLinkTarget(input)).toBe(expected);
  });

  it.each([
    "",
    " ",
    "blank",
    "foo",
    " _blank",
    "_blank ",
    "_blank\n",
    "frame1",
    // 켈빈 기호(U+212A)는 toLowerCase()가 ASCII k로 바꾼다. ASCII만 접어야 걸러진다.
    "_blanK",
    "_BLANK",
    // 터키어 대문자 İ(U+0130)는 toLowerCase()가 i + 결합점으로 바꾼다.
    "_İself",
  ])("허용 밖 %j는 undefined다", (input) => {
    expect(normalizeLinkTarget(input)).toBeUndefined();
  });
});

describe("parseDocument link target", () => {
  it.each(["_blank", "_self", "_parent", "_top"])(
    "target %s를 보존한다",
    (target) => {
      const result = parseDocument(
        documentWithMarks([
          { type: "link", href: "https://example.com", target },
        ]),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.blocks[0]).toMatchObject({
        content: [{ marks: [{ type: "link", target }] }],
      });
    },
  );

  it("target이 없는 링크는 그대로이고 키가 생기지 않는다", () => {
    const result = parseDocument(
      documentWithMarks([{ type: "link", href: "https://example.com" }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.value.blocks[0])).toContain(
      '"marks":[{"type":"link","href":"https://example.com"}]',
    );
  });

  it.each(["_BLANK", "foo", "", " _blank", 1, null])(
    "정규형이 아닌 target %j는 marks[0].target 경로로 거절한다",
    (target) => {
      const result = parseDocument(
        documentWithMarks([
          { type: "link", href: "https://example.com", target },
        ]),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(JSON.stringify(result.error)).toContain("target");
    },
  );

  it("링크가 아닌 mark의 target 키는 무시한다(기존 스키마 동작)", () => {
    const result = parseDocument(
      documentWithMarks([{ type: "bold", target: "_blank" }]),
    );
    expect(result.ok).toBe(true);
  });
});

describe("같은 종류 판정과 병합", () => {
  it("같은 href라도 target이 다르면 같은 mark가 아니다", () => {
    expect(sameMarks([link()], [link("_blank")])).toBe(false);
    expect(sameMarks([link("_blank")], [link("_self")])).toBe(false);
    expect(sameMarks([link("_blank")], [link("_blank")])).toBe(true);
    expect(sameMarks([link()], [link()])).toBe(true);
  });

  it("같은 href·다른 target 인접 run은 병합하지 않는다", () => {
    const content: InlineContent = [];
    appendOrMergeInlineItem(content, "a", [link()]);
    appendOrMergeInlineItem(content, "b", [link("_blank")]);
    appendOrMergeInlineItem(content, "c", [link("_blank")]);
    expect(content).toEqual([
      { text: "a", marks: [link()] },
      { text: "bc", marks: [link("_blank")] },
    ]);
  });

  it("target이 있는 링크는 정규 순서 판정에서 값까지 보존된다", () => {
    const marks = canonicalizeTextMarks([{ type: "bold" }, link("_self")]);
    expect(marks).toEqual([link("_self"), { type: "bold" }]);
    expect(isCanonicalTextMarks(marks)).toBe(true);
  });

  it("한 run에 link mark 둘은 target이 달라도 거절한다", () => {
    const result = parseDocument(
      documentWithMarks([
        { type: "link", href: "https://example.com", target: "_blank" },
        { type: "link", href: "https://example.com", target: "_self" },
      ]),
    );
    expect(result.ok).toBe(false);
  });
});

describe("decodeTextMark link target", () => {
  it("target을 정규화해 담는다", () => {
    expect(
      decodeTextMark({
        type: "link",
        href: "https://example.com",
        target: "_BLANK",
      }),
    ).toEqual({
      ok: true,
      value: { type: "link", href: "https://example.com", target: "_blank" },
    });
  });

  it.each([undefined, null, "", "foo", " _blank", 1, true, {}])(
    "target %j는 거절하지 않고 버리며 키를 만들지 않는다",
    (target) => {
      const result = decodeTextMark({
        type: "link",
        href: "https://example.com",
        target,
      });
      expect(result).toEqual({
        ok: true,
        value: { type: "link", href: "https://example.com" },
      });
      expect(
        result.ok && "target" in result.value ? "키 있음" : "키 없음",
      ).toBe("키 없음");
    },
  );

  it("link가 아닌 mark의 target은 읽지 않는다", () => {
    expect(decodeTextMark({ type: "bold", target: "_blank" })).toEqual({
      ok: true,
      value: { type: "bold" },
    });
  });
});
