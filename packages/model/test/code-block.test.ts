/**
 * CodeBlock language 정규화와 HTML class token 판정을 검증한다.
 * model 공개 helper가 core와 io가 공유할 단일 정책 경계임을 고정한다.
 */
import { describe, expect, it } from "vitest";

import type { CodeBlock } from "../src/index.js";
import {
  canonicalizeCodeBlockLanguage,
  isSafeCodeBlockLanguageClassToken,
  isValidCodeBlockLanguage,
  isValidCodeBlockSource,
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

    expect(isValidCodeBlockSource(block.content[0]?.text ?? "")).toBe(true);
    expect(isValidCodeBlockSource("bad\u0000source")).toBe(false);
    expect(isValidCodeBlockLanguage(block.language ?? "")).toBe(true);
    expect(isValidCodeBlockLanguage("")).toBe(false);
    expect(isValidCodeBlockLanguage("bad\nlanguage")).toBe(false);
  });
});
