/**
 * BLOCK_TYPE_OPTIONS(슬래시 메뉴·Turn into·툴바 select 공급원)와
 * blockTypeToOptionId 변환의 단위 테스트. DOM 마운트가 필요 없는 순수
 * 배열/함수 검증이다 — mount-editor.tsx의 실제 편집기 마운트는 여기서
 * 쓰지 않는다.
 */

import { describe, expect, it } from "vitest";

import {
  BLOCK_TYPE_OPTIONS,
  blockTypeToOptionId,
  getBlockTypeOptionsForSource,
} from "../src/block-type-options.js";

describe("BLOCK_TYPE_OPTIONS(Turn into·툴바 select 공급원)", () => {
  it("heading-4·heading-5·heading-6·quote 옵션이 있고 divider 옵션은 없다", () => {
    const ids = BLOCK_TYPE_OPTIONS.map((option) => option.id);

    expect(ids).toEqual(
      expect.arrayContaining(["heading-4", "heading-5", "heading-6", "quote"]),
    );
    // divider는 setBlockType으로 표현할 수 없는 삽입 전용 동작이라(D2) Turn
    // into·툴바 select에는 노출하지 않는다 — slash-menu.tsx가 별도 kind로
    // 다룬다.
    expect(ids).not.toContain("divider");
  });

  it("모든 옵션 id가 유일하다", () => {
    const ids = BLOCK_TYPE_OPTIONS.map((option) => option.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("blockTypeToOptionId가 quote와 heading level 4-6 블록을 해당 옵션 id로 해석한다", () => {
    expect(blockTypeToOptionId({ type: "quote" })).toBe("quote");
    expect(blockTypeToOptionId({ type: "heading", level: 4 })).toBe(
      "heading-4",
    );
    expect(blockTypeToOptionId({ type: "heading", level: 5 })).toBe(
      "heading-5",
    );
    expect(blockTypeToOptionId({ type: "heading", level: 6 })).toBe(
      "heading-6",
    );
  });

  it("Code 옵션이 세 소비 표면의 공용 목록에 필요한 descriptor와 검색어를 제공한다", () => {
    const option = BLOCK_TYPE_OPTIONS.find(({ id }) => id === "code");

    expect(option).toEqual({
      id: "code",
      label: "Code",
      description: "Write plain code",
      keywords: expect.arrayContaining(["code"]),
      blockType: { type: "codeBlock" },
    });
    expect(
      blockTypeToOptionId({ type: "codeBlock", language: "javascript" }),
    ).toBe("code");
  });

  it("목록 옵션이 공용 id·label·검색어·command descriptor를 제공한다", () => {
    expect(BLOCK_TYPE_OPTIONS.find(({ id }) => id === "bullet-list")).toEqual({
      id: "bullet-list",
      label: "Bulleted List",
      description: "Create a bulleted list",
      keywords: ["bullet", "list", "unordered", "ul"],
      blockType: { type: "bulletListItem" },
    });
    expect(BLOCK_TYPE_OPTIONS.find(({ id }) => id === "numbered-list")).toEqual(
      {
        id: "numbered-list",
        label: "Numbered List",
        description: "Create a numbered list",
        keywords: ["number", "list", "ordered", "ol"],
        blockType: { type: "numberedListItem" },
      },
    );
  });

  it("blockTypeToOptionId는 bullet과 startNumber 미지정·0·명시 numbered를 공용 option id로 해석한다", () => {
    expect(blockTypeToOptionId({ type: "bulletListItem" })).toBe("bullet-list");
    expect(blockTypeToOptionId({ type: "numberedListItem" })).toBe(
      "numbered-list",
    );
    expect(
      blockTypeToOptionId({ type: "numberedListItem", startNumber: 0 }),
    ).toBe("numbered-list");
    expect(
      blockTypeToOptionId({ type: "numberedListItem", startNumber: 42 }),
    ).toBe("numbered-list");
  });

  it("옵션마다 blockTypeToOptionId(option.blockType) === option.id다", () => {
    for (const option of BLOCK_TYPE_OPTIONS) {
      expect(blockTypeToOptionId(option.blockType)).toBe(option.id);
    }
  });

  it("CodeBlock source에서는 두 목록 옵션을 제외한다", () => {
    const ids = getBlockTypeOptionsForSource({ type: "codeBlock" }).map(
      ({ id }) => id,
    );

    expect(ids).toEqual([
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "heading-4",
      "heading-5",
      "heading-6",
      "quote",
      "code",
    ]);
  });

  it.each([
    { type: "bulletListItem" as const },
    { type: "numberedListItem" as const },
  ])("$type source에서는 Code 옵션만 제외한다", (source) => {
    const ids = getBlockTypeOptionsForSource(source).map(({ id }) => id);

    expect(ids).toEqual([
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "heading-4",
      "heading-5",
      "heading-6",
      "quote",
      "bullet-list",
      "numbered-list",
    ]);
  });

  it.each([
    { type: "paragraph" as const },
    { type: "heading" as const, level: 3 as const },
    { type: "quote" as const },
  ])("$type source에서는 Code와 두 목록 옵션을 모두 유지한다", (source) => {
    const ids = getBlockTypeOptionsForSource(source).map(({ id }) => id);

    expect(ids).toEqual([
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "heading-4",
      "heading-5",
      "heading-6",
      "quote",
      "code",
      "bullet-list",
      "numbered-list",
    ]);
  });
});
