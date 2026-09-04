/**
 * `detectMarkdownPaste`가 클립보드 `text/plain`을 GFM Markdown 구조로
 * 해석해야 하는지 판정하는 계약을 검증한다. 판정 기준은 `importMarkdown`
 * 결과의 구조 복잡도다 — 단일 plain paragraph보다 복잡하면(블록 2개 이상,
 * 또는 GFM 전용 타입 1개) 감지된 것으로 본다(Issue #38 슬라이스 10 RD-001,
 * 별도 정규식 사전 휴리스틱은 쓰지 않는다). package root export, 빈/실패
 * 입력의 안전한 처리, 재파싱 금지도 함께 다룬다.
 */
import { describe, expect, it } from "vitest";

import { detectMarkdownPaste } from "../src/index.js";

describe("detectMarkdownPaste", () => {
  it("단일 plain paragraph는 감지하지 않는다", () => {
    const result = detectMarkdownPaste("hello world");

    expect(result).toEqual({ detected: false });
  });

  it.each([
    ["heading", "# heading text", "heading"],
    ["quote", "> quoted text", "quote"],
    ["bulletListItem", "- item", "bulletListItem"],
    ["numberedListItem", "1. item", "numberedListItem"],
    ["checkListItem", "- [ ] item", "checkListItem"],
    ["codeBlock", "```js\ncode\n```", "codeBlock"],
    ["divider", "---", "divider"],
  ])(
    "GFM 전용 타입 %s 1블록 입력은 감지한다",
    (_label, source, expectedType) => {
      const result = detectMarkdownPaste(source);

      expect(result.detected).toBe(true);
      if (!result.detected) return;
      expect(result.document.blocks).toHaveLength(1);
      expect(result.document.blocks[0]?.type).toBe(expectedType);
    },
  );

  // RD-004 core ClipboardPasteExtension 통합 중 실측 회귀 — "- " 하나만
  // 붙여넣으면(뒤에 아무 내용도 없는 목록 마커) 문장 중간에 흔히 타이핑되는
  // 순수 텍스트와 구분할 수 없다. GFM 마커 문법과 우연히 겹치는 빈 콘텐츠는
  // 감지하지 않는다(list-input-rule-extension.test.ts "paste insertion은
  // exact shorthand를 변환하지 않는다"가 이 계약에 기댄다).
  it.each([
    ["bulletListItem", "- "],
    ["numberedListItem", "1. "],
    ["quote", "> "],
    ["heading", "# "],
  ])(
    "GFM 전용 타입 %s이어도 content가 비어 있으면 감지하지 않는다",
    (_label, source) => {
      const result = detectMarkdownPaste(source);

      expect(result).toEqual({ detected: false });
    },
  );

  // divider는 InlineContent 필드가 없어 위 예외 대상이 아니다 — 마커
  // 자체(구분선)만으로 이미 완결된 의미를 가진다.
  it("divider는 content 개념이 없어 예외 없이 그대로 감지한다", () => {
    const result = detectMarkdownPaste("---");

    expect(result.detected).toBe(true);
  });

  it("두 블록 이상이면 각 블록이 paragraph뿐이어도 감지한다", () => {
    const result = detectMarkdownPaste("first\n\nsecond");

    expect(result.detected).toBe(true);
    if (!result.detected) return;
    expect(result.document.blocks).toHaveLength(2);
  });

  it("빈 입력은 예외 없이 감지하지 않는다", () => {
    expect(detectMarkdownPaste("")).toEqual({ detected: false });
  });

  it("공백만 있는 입력은 예외 없이 감지하지 않는다", () => {
    expect(detectMarkdownPaste("   \n\t  ")).toEqual({ detected: false });
  });

  // `markdown-round-trip-limits.test.ts`와 같은 방식으로 중복 id를
  // 강제해 `importMarkdown`이 실제로 `MARKDOWN_DOCUMENT_INVALID`를
  // 반환하는 경로를 mock 없이 재현한다.
  it("importMarkdown이 실패(Result.ok === false)하면 예외 없이 감지하지 않는다", () => {
    const result = detectMarkdownPaste("first\n\nsecond", {
      createId: () => "duplicate",
    });

    expect(result).toEqual({ detected: false });
  });

  it("반환 document는 importMarkdown 1회 호출의 결과다(재파싱하지 않는다)", () => {
    let calls = 0;
    const result = detectMarkdownPaste("# heading text", {
      createId: () => `id-${++calls}`,
    });

    expect(result.detected).toBe(true);
    // heading 1블록 입력은 id 발급이 1회여야 한다 — 감지 판정을 위해
    // importMarkdown을 먼저 호출하고 다시 최종 document를 만들려고
    // 재호출하면 이 값이 2 이상으로 늘어난다.
    expect(calls).toBe(1);
  });
});
