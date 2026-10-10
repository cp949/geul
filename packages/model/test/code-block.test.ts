/**
 * CodeBlock language 정규화와 HTML class token 판정을 검증한다.
 * model 공개 helper가 core와 io가 공유할 단일 정책 경계임을 고정한다.
 * source 정제(sanitizeCodeBlockSource)는 Tab·LF를 남기고 나머지 무효 문자만 지우며,
 * 출력이 항상 isValidCodeBlockSource를 통과하고 멱등임을 고정한다(Issue #352).
 */
import { describe, expect, it } from "vitest";

import type { CodeBlock } from "../src/index.js";
import {
  canonicalizeCodeBlockLanguage,
  isSafeCodeBlockLanguageClassToken,
  isValidCodeBlockLanguage,
  isValidCodeBlockSource,
  sanitizeCodeBlockSource,
} from "../src/index.js";

describe("CodeBlock language 정규화", () => {
  it.each([
    [" plain text ", "text"],
    ["NONE", "text"],
    [" JS ", "javascript"],
    [" TS ", "typescript"],
    [" SH ", "bash"],
    ["shell", "bash"],
    [" PY ", "python"],
    [" MD ", "markdown"],
  ])("알려진 language %s를 canonical ID %s로 정규화한다", (input, expected) => {
    const canonical = canonicalizeCodeBlockLanguage(input);

    expect(canonical).toBe(expected);
    expect(canonicalizeCodeBlockLanguage(canonical)).toBe(canonical);
  });

  it.each([
    " HTML ",
    " JavaScript ",
    "TypeScript",
    "C++",
    "Objective C",
    "JaVa",
    " unknown-language ",
  ])(
    "알 수 없는 language %s의 공백과 대소문자를 그대로 보존한다",
    (language) => {
      expect(canonicalizeCodeBlockLanguage(language)).toBe(language);
    },
  );
});

describe("CodeBlock HTML language class", () => {
  it.each(["a", "JavaScript", "c99", "tsx-react", "lang_name", "0-start"])(
    "안전한 token %s를 허용한다",
    (token) => {
      expect(isSafeCodeBlockLanguageClassToken(token)).toBe(true);
    },
  );

  it.each([
    "",
    "two words",
    'quote"',
    "-leading-hyphen",
    "_leading-underscore",
    "line\nbreak",
    "nul\u0000byte",
    "한글",
  ])("안전하지 않은 token %s를 거절한다", (token) => {
    expect(isSafeCodeBlockLanguageClassToken(token)).toBe(false);
  });
});

describe("CodeBlock 공개 계약", () => {
  it("barrel이 CodeBlock type과 source·language predicate를 공개한다", () => {
    const block: CodeBlock = {
      id: "code-public-export",
      type: "codeBlock",
      language: "😀",
      content: [{ text: "line 1\n\tline 2 😀" }],
    };

    // content 원소도 텍스트 런뿐이다(InlineContentItem 위젠,
    // RD-002-DELTA-13) — codeBlock은 커스텀 원소를 허용하지 않으므로 as로
    // 좁혀도 안전하다.
    const item = block.content[0] as { text: string } | undefined;
    expect(isValidCodeBlockSource(item?.text ?? "")).toBe(true);
    expect(isValidCodeBlockSource("bad\u0000source")).toBe(false);
    expect(isValidCodeBlockLanguage(block.language ?? "")).toBe(true);
    expect(isValidCodeBlockLanguage("")).toBe(false);
    expect(isValidCodeBlockLanguage("bad\nlanguage")).toBe(false);
  });
});

describe("CodeBlock source 정제(Issue #352)", () => {
  it.each([
    ["빈 문자열", "", ""],
    ["무효 문자 없는 입력", "a b\tc\nd", "a b\tc\nd"],
    ["Tab과 LF만", "\t\t\n\t", "\t\t\n\t"],
    ["CR을 지운다", "a\rb", "ab"],
    ["CRLF의 CR만 지우고 LF를 남긴다", "a\r\nb", "a\nb"],
    ["C0 제어문자를 지운다", "a\u0001b\u001fc", "abc"],
    ["NUL을 지운다", "a\u0000b", "ab"],
    ["DEL을 지운다", "a\u007fb", "ab"],
    ["Tab 사이 제어문자를 지우고 Tab을 남긴다", "a\t\u0001\tb", "a\t\tb"],
    ["짝 없는 high surrogate를 지운다", "a\ud800b", "ab"],
    ["짝 없는 low surrogate를 지운다", "a\udc00b", "ab"],
    ["짝 있는 surrogate는 남긴다", "a\u{1F600}b", "a\u{1F600}b"],
    [
      "U+2028·U+FEFF·U+0085는 남긴다",
      "a\u2028\ufeff\u0085b",
      "a\u2028\ufeff\u0085b",
    ],
  ])("%s", (_name, input, expected) => {
    const output = sanitizeCodeBlockSource(input);

    expect(output).toBe(expected);
    expect(isValidCodeBlockSource(output)).toBe(true);
    expect(sanitizeCodeBlockSource(output)).toBe(output);
  });

  it("모든 C0·DEL·surrogate 단독 입력의 출력이 유효하고 멱등이다", () => {
    const codePoints = [
      ...Array.from({ length: 0x20 }, (_, index) => index),
      0x7f,
      0xd800,
      0xdbff,
      0xdc00,
      0xdfff,
    ];
    for (const codePoint of codePoints) {
      const input = `a${String.fromCharCode(codePoint)}b\tc`;
      const output = sanitizeCodeBlockSource(input);

      expect(isValidCodeBlockSource(output)).toBe(true);
      expect(sanitizeCodeBlockSource(output)).toBe(output);
    }
  });
});
