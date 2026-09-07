/**
 * 이모지 grid suggestion(RD-004)의 `:` 트리거 감지(`parseEmojiQuery`)와 keyword
 * 필터링(`filterEmojiOptions`) 단위 테스트. DOM 마운트가 필요 없는 순수 함수
 * 검증이다 — block-type-options.test.ts와 같은 자리.
 */

import { describe, expect, it } from "vitest";

import { filterEmojiOptions, parseEmojiQuery } from "../src/emoji-picker.js";
import type { EmojiOption } from "../src/emoji-picker-options.js";

describe("parseEmojiQuery(`:` 트리거 감지)", () => {
  it("텍스트 전체가 `:쿼리` 형태면 쿼리를 반환한다", () => {
    expect(parseEmojiQuery(":smile")).toBe("smile");
  });

  it("`:` 단독이면 빈 문자열을 반환한다", () => {
    expect(parseEmojiQuery(":")).toBe("");
  });

  it("`:`로 시작하지 않으면 null을 반환한다", () => {
    expect(parseEmojiQuery("hello")).toBeNull();
    expect(parseEmojiQuery("/table")).toBeNull();
  });

  it("`:` 앞에 다른 텍스트가 있으면 null을 반환한다(SlashMenu와 동일하게 블록 텍스트 전체 매치만 인정)", () => {
    expect(parseEmojiQuery("hello :smile")).toBeNull();
  });

  it("쿼리에 공백이 섞이면 null을 반환한다", () => {
    expect(parseEmojiQuery(": smile")).toBeNull();
    expect(parseEmojiQuery(":smile face")).toBeNull();
  });
});

const FIXTURE_OPTIONS: readonly EmojiOption[] = [
  {
    id: "grin",
    char: "😀",
    label: "Grinning Face",
    keywords: ["happy", "joy"],
  },
  { id: "heart", char: "❤️", label: "Red Heart", keywords: ["love", "like"] },
  { id: "fire", char: "🔥", label: "Fire", keywords: ["hot", "flame"] },
];

describe("filterEmojiOptions(keyword 필터링)", () => {
  it("빈 쿼리는 모든 옵션을 그대로 반환한다", () => {
    expect(filterEmojiOptions(FIXTURE_OPTIONS, "")).toEqual(FIXTURE_OPTIONS);
  });

  it("label 부분 일치를 대소문자 구분 없이 찾는다", () => {
    expect(filterEmojiOptions(FIXTURE_OPTIONS, "HEART")).toEqual([
      FIXTURE_OPTIONS[1],
    ]);
  });

  it("keywords 접두 일치로 찾는다", () => {
    expect(filterEmojiOptions(FIXTURE_OPTIONS, "lo")).toEqual([
      FIXTURE_OPTIONS[1],
    ]);
  });

  it("매치하는 옵션이 없으면 빈 배열을 반환한다", () => {
    expect(filterEmojiOptions(FIXTURE_OPTIONS, "xyz")).toEqual([]);
  });
});
