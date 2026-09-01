/**
 * 목록 항목·중첩 가능·콘텐츠 보유 판정이 포함 관계(목록 항목 ⊂ 중첩 가능
 * ⊂ 콘텐츠 보유)를 지키는지 모든 Block 판별자에 대해 고정한다.
 */
import { describe, expect, it } from "vitest";

import {
  isInlineContentBlockType,
  isListItemBlockType,
  isNestableBlockType,
} from "../src/index.js";

const ALL_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "quote",
  "bulletListItem",
  "numberedListItem",
  "toggleListItem",
  "codeBlock",
  "divider",
  "table",
] as const;

describe("isListItemBlockType", () => {
  it.each([
    ["bulletListItem", true],
    ["numberedListItem", true],
    // toggleListItem은 로드맵 D2 정정에 따라 ListItemBlockType에 넣지
    // 않는다 — bulletListItem/numberedListItem처럼 <ul>/<ol> 직렬화(io)
    // 대상이 아니다.
    ["toggleListItem", false],
    ["paragraph", false],
    ["heading", false],
    ["quote", false],
    ["codeBlock", false],
    ["divider", false],
    ["table", false],
    ["", false],
  ])("%s는 목록 항목 여부를 %s로 판정한다", (type, expected) => {
    expect(isListItemBlockType(type)).toBe(expected);
  });
});

describe("isNestableBlockType", () => {
  it.each([
    ["paragraph", true],
    ["heading", true],
    ["quote", true],
    ["bulletListItem", true],
    ["numberedListItem", true],
    // toggleListItem은 ListItemBlockType을 거치지 않고 NestableBlockType에
    // 직접 추가된다(로드맵 D2 정정) — isListItemBlockType이 false여도
    // 중첩 가능은 true다.
    ["toggleListItem", true],
    ["codeBlock", false],
    ["divider", false],
    ["table", false],
  ])("%s는 중첩 가능 여부를 %s로 판정한다", (type, expected) => {
    expect(isNestableBlockType(type)).toBe(expected);
  });

  it("목록 항목은 항상 중첩 가능의 부분집합이다", () => {
    for (const type of ALL_BLOCK_TYPES) {
      if (isListItemBlockType(type))
        expect(isNestableBlockType(type)).toBe(true);
    }
  });
});

describe("isInlineContentBlockType", () => {
  it.each([
    ["paragraph", true],
    ["heading", true],
    ["quote", true],
    ["bulletListItem", true],
    ["numberedListItem", true],
    ["toggleListItem", true],
    ["codeBlock", true],
    ["divider", false],
    ["table", false],
  ])("%s는 콘텐츠 보유 여부를 %s로 판정한다", (type, expected) => {
    expect(isInlineContentBlockType(type)).toBe(expected);
  });

  it("중첩 가능은 항상 콘텐츠 보유의 부분집합이다", () => {
    for (const type of ALL_BLOCK_TYPES) {
      if (isNestableBlockType(type)) {
        expect(isInlineContentBlockType(type)).toBe(true);
      }
    }
  });
});
