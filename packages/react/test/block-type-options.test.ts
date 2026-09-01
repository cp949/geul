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

  // isToggleable(RD-004 DELTA-04)은 heading option id를 heading-N과
  // toggle-heading-N 두 갈래로 나누는 축이다 — level만으로는 구분되지 않는다.
  it("blockTypeToOptionId가 isToggleable heading을 toggle-heading-N으로, 아니면 heading-N으로 해석한다", () => {
    expect(
      blockTypeToOptionId({ type: "heading", level: 1, isToggleable: true }),
    ).toBe("toggle-heading-1");
    expect(
      blockTypeToOptionId({ type: "heading", level: 6, isToggleable: true }),
    ).toBe("toggle-heading-6");
    expect(
      blockTypeToOptionId({ type: "heading", level: 3, isToggleable: false }),
    ).toBe("heading-3");
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
    expect(BLOCK_TYPE_OPTIONS.find(({ id }) => id === "check-list")).toEqual({
      id: "check-list",
      label: "Check List",
      description: "Track tasks with a checklist",
      keywords: ["check", "checkbox", "checklist", "todo", "task"],
      blockType: { type: "checkListItem" },
    });
    expect(BLOCK_TYPE_OPTIONS.find(({ id }) => id === "toggle-list")).toEqual({
      id: "toggle-list",
      label: "Toggle List",
      description: "Create a collapsible toggle list",
      keywords: expect.arrayContaining(["toggle", "list", "collapsible"]),
      blockType: { type: "toggleListItem" },
    });
  });

  it("toggle-heading-1~6 옵션이 레벨별로 isToggleable:true descriptor를 제공한다", () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      const option = BLOCK_TYPE_OPTIONS.find(
        ({ id }) => id === `toggle-heading-${level}`,
      );
      expect(option).toBeDefined();
      expect(option?.blockType).toEqual({
        type: "heading",
        level,
        isToggleable: true,
      });
      expect(option?.label).toBe(`Toggle Heading ${level}`);
    }
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

  it("blockTypeToOptionId가 checkListItem을 check-list로, toggleListItem을 toggle-list로 해석한다", () => {
    expect(blockTypeToOptionId({ type: "checkListItem" })).toBe("check-list");
    expect(blockTypeToOptionId({ type: "toggleListItem" })).toBe("toggle-list");
  });

  it("옵션마다 blockTypeToOptionId(option.blockType) === option.id다", () => {
    for (const option of BLOCK_TYPE_OPTIONS) {
      expect(blockTypeToOptionId(option.blockType)).toBe(option.id);
    }
  });

  // codeBlock↔heading 전환은 isToggleable 값과 무관하게 항상 허용되므로
  // (DELTA-02 changesCodeBlockBoundary), toggle-heading-N은 제외하지 않는다
  // — codeBlock↔목록류(toggle-list 포함)만 command guard(isListEntryBlockType)가
  // 거절한다.
  it("CodeBlock source에서는 네 목록 옵션(toggle-list 포함)을 제외하고 toggle-heading은 유지한다", () => {
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
      "toggle-heading-1",
      "toggle-heading-2",
      "toggle-heading-3",
      "toggle-heading-4",
      "toggle-heading-5",
      "toggle-heading-6",
      "quote",
      "code",
    ]);
  });

  it.each([
    { type: "bulletListItem" as const },
    { type: "numberedListItem" as const },
    { type: "checkListItem" as const },
    { type: "toggleListItem" as const },
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
      "toggle-heading-1",
      "toggle-heading-2",
      "toggle-heading-3",
      "toggle-heading-4",
      "toggle-heading-5",
      "toggle-heading-6",
      "quote",
      "bullet-list",
      "numbered-list",
      "check-list",
      "toggle-list",
    ]);
  });

  it.each([
    { type: "paragraph" as const },
    { type: "heading" as const, level: 3 as const },
    {
      type: "heading" as const,
      level: 2 as const,
      isToggleable: true as const,
    },
    { type: "quote" as const },
  ])("$type source에서는 Code와 목록 옵션을 모두 유지한다", (source) => {
    const ids = getBlockTypeOptionsForSource(source).map(({ id }) => id);

    expect(ids).toEqual([
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "heading-4",
      "heading-5",
      "heading-6",
      "toggle-heading-1",
      "toggle-heading-2",
      "toggle-heading-3",
      "toggle-heading-4",
      "toggle-heading-5",
      "toggle-heading-6",
      "quote",
      "code",
      "bullet-list",
      "numbered-list",
      "check-list",
      "toggle-list",
    ]);
  });
});
