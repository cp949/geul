/**
 * "mark 이름(+href) → TextMark" 디코드의 유일한 권위(decodeTextMark)를 확인한다.
 * core의 PM 노드 경로·tiptap JSON 경로가 이 함수 하나를 공유하므로, 여기서
 * 검증하는 계약이 두 경로 모두에 그대로 적용된다.
 */
import { describe, expect, it } from "vitest";
import { decodeTextMark, PLAIN_TEXT_MARK_TYPES } from "../src/index.js";

describe("독립 문서 모델 - decodeTextMark", () => {
  it.each(PLAIN_TEXT_MARK_TYPES)(
    "%s 이름을 href 없는 TextMark로 디코드한다",
    (type) => {
      expect(decodeTextMark({ type })).toEqual({ ok: true, value: { type } });
    },
  );

  it("link 이름은 문자열 href와 함께 있어야 TextMark로 디코드한다", () => {
    expect(
      decodeTextMark({ type: "link", href: "https://example.com" }),
    ).toEqual({
      ok: true,
      value: { type: "link", href: "https://example.com" },
    });
  });

  it("link인데 href가 없으면 거절한다", () => {
    const result = decodeTextMark({ type: "link" });
    expect(result.ok).toBe(false);
  });

  it("link인데 href가 문자열이 아니면 거절한다", () => {
    const result = decodeTextMark({ type: "link", href: 42 });
    expect(result.ok).toBe(false);
  });

  it("인식하지 못하는 mark 이름은 조용히 버리지 않고 거절한다", () => {
    const result = decodeTextMark({ type: "highlight" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("highlight");
  });

  it.each(["textColor", "backgroundColor"] as const)(
    "%s 이름을 문자열 color와 함께 있어야 TextMark로 디코드한다",
    (type) => {
      expect(decodeTextMark({ type, color: "#AABBCC" })).toEqual({
        ok: true,
        value: { type, color: "#AABBCC" },
      });
    },
  );

  it.each(["textColor", "backgroundColor"] as const)(
    "%s인데 color가 없으면 거절한다",
    (type) => {
      const result = decodeTextMark({ type });
      expect(result.ok).toBe(false);
    },
  );

  it.each(["textColor", "backgroundColor"] as const)(
    "%s인데 color가 문자열이 아니면 거절한다",
    (type) => {
      const result = decodeTextMark({ type, color: 42 });
      expect(result.ok).toBe(false);
    },
  );
});
