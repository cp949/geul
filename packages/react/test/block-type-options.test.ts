/**
 * BLOCK_TYPE_OPTIONS(슬래시 메뉴·Turn into·툴바 select 공급원),
 * blockTypeToOptionId 변환, getBlockTypeChoices(core 거절 사유를 옵션에
 * 붙이는 유일한 곳)의 단위 테스트. DOM 마운트는 필요 없다. getBlockTypeChoices는
 * 실제 core 편집기에 질의해 소스 타입별 변환 가능 목록을 검증한다.
 */

import { createEditor, type Block } from "@cp949/geul-core";
import { describe, expect, it } from "vitest";

import {
  BLOCK_TYPE_OPTIONS,
  blockTypeToOptionId,
  getBlockTypeChoices,
} from "../src/block-type-options.js";
import {
  fakeBlockTypeBlocker,
  fakeBlockTypesBlocker,
} from "./block-type-blocker-fake.js";

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

  it("callout 옵션이 공용 id·검색어·command descriptor를 제공하고 blockTypeToOptionId가 이를 역해석한다(Issue #209)", () => {
    const option = BLOCK_TYPE_OPTIONS.find(({ id }) => id === "callout");

    expect(option).toEqual({
      id: "callout",
      label: "Callout",
      description: "Highlight important information",
      keywords: expect.arrayContaining(["callout", "notice"]),
      blockType: { type: "callout" },
    });
    expect(blockTypeToOptionId({ type: "callout" })).toBe("callout");
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
});

/** 소스 블록 하나만 든 실제 core 편집기를 만든다. */
const editorWith = (
  block: Block,
  enabledBlockTypes?: Parameters<typeof createEditor>[0]["enabledBlockTypes"],
) =>
  createEditor({
    initialDocument: { formatVersion: 1, revision: 0, blocks: [block] },
    ...(enabledBlockTypes === undefined ? {} : { enabledBlockTypes }),
  });

/** 막히지 않은 옵션 id만 모은다. */
const allowedIds = (
  choices: ReturnType<typeof getBlockTypeChoices>,
): string[] =>
  choices
    .filter(({ blocker }) => blocker === null)
    .map(({ option }) => option.id);

describe("getBlockTypeChoices(core 거절 사유를 옵션에 붙인다)", () => {
  // codeBlock↔heading 전환은 항상 허용되므로(DELTA-02
  // changesCodeBlockBoundary) heading은 제외하지 않는다 —
  // codeBlock↔목록류(toggle-list 포함)만 command guard(isListEntryBlockType)가
  // 거절한다.
  it("CodeBlock source에서는 네 목록 옵션(toggle-list 포함)을 제외한다", () => {
    const editor = editorWith({
      id: "src",
      type: "codeBlock",
      language: "text",
      content: [{ text: "return 1;" }],
    });

    expect(allowedIds(getBlockTypeChoices(editor, { blockId: "src" }))).toEqual(
      [
        "paragraph",
        "heading-1",
        "heading-2",
        "heading-3",
        "heading-4",
        "heading-5",
        "heading-6",
        "quote",
        "callout",
        "code",
      ],
    );
  });

  it.each([
    {
      block: {
        id: "src",
        type: "bulletListItem",
        content: [{ text: "x" }],
      } satisfies Block,
    },
    {
      block: {
        id: "src",
        type: "numberedListItem",
        content: [{ text: "x" }],
      } satisfies Block,
    },
    {
      block: {
        id: "src",
        type: "checkListItem",
        checked: false,
        content: [{ text: "x" }],
      } satisfies Block,
    },
    {
      block: {
        id: "src",
        type: "toggleListItem",
        content: [{ text: "x" }],
      } satisfies Block,
    },
  ])("$block.type source에서는 Code 옵션만 제외한다", ({ block }) => {
    const editor = editorWith(block);

    expect(allowedIds(getBlockTypeChoices(editor, { blockId: "src" }))).toEqual(
      [
        "paragraph",
        "heading-1",
        "heading-2",
        "heading-3",
        "heading-4",
        "heading-5",
        "heading-6",
        "quote",
        "callout",
        "bullet-list",
        "numbered-list",
        "check-list",
        "toggle-list",
      ],
    );
  });

  it.each([
    {
      block: {
        id: "src",
        type: "paragraph",
        content: [{ text: "x" }],
      } satisfies Block,
    },
    {
      block: {
        id: "src",
        type: "heading",
        level: 3,
        content: [{ text: "x" }],
      } satisfies Block,
    },
    {
      block: {
        id: "src",
        type: "quote",
        content: [{ text: "x" }],
      } satisfies Block,
    },
  ])(
    "$block.type source에서는 Code와 목록 옵션을 모두 유지한다",
    ({ block }) => {
      const editor = editorWith(block);

      expect(
        allowedIds(getBlockTypeChoices(editor, { blockId: "src" })),
      ).toEqual(BLOCK_TYPE_OPTIONS.map(({ id }) => id));
    },
  );

  it("막힌 옵션은 목록에서 빼지 않고 core 사유를 붙여 돌려준다", () => {
    const editor = editorWith({
      id: "src",
      type: "codeBlock",
      language: "text",
      content: [{ text: "x" }],
    });

    const choices = getBlockTypeChoices(editor, { blockId: "src" });

    expect(choices.map(({ option }) => option.id)).toEqual(
      BLOCK_TYPE_OPTIONS.map(({ id }) => id),
    );
    expect(
      choices.find(({ option }) => option.id === "bullet-list")?.blocker,
    ).toBe("LIST_CODE_MISMATCH");
  });

  it("자식이 있는 블록의 Code는 HAS_CHILDREN 사유가 붙는다", () => {
    const editor = editorWith({
      id: "parent",
      type: "paragraph",
      content: [{ text: "x" }],
      children: [{ id: "kid", type: "paragraph", content: [{ text: "y" }] }],
    });

    const choices = getBlockTypeChoices(editor, { blockId: "parent" });

    expect(choices.find(({ option }) => option.id === "code")?.blocker).toBe(
      "HAS_CHILDREN",
    );
  });

  it("clearContent가 없으면 탭이 든 codeBlock의 일반 블록 변환이 INVALID_TEXT이고, 있으면 허용한다", () => {
    const editor = editorWith({
      id: "src",
      type: "codeBlock",
      language: "text",
      content: [{ text: "if (x) {\n\treturn 1;\n}" }],
    });

    const kept = getBlockTypeChoices(editor, { blockId: "src" });
    const cleared = getBlockTypeChoices(
      editor,
      { blockId: "src" },
      { clearContent: true },
    );

    expect(kept.find(({ option }) => option.id === "quote")?.blocker).toBe(
      "INVALID_TEXT",
    );
    expect(cleared.find(({ option }) => option.id === "quote")?.blocker).toBe(
      null,
    );
  });

  it("enabledBlockTypes로 끈 타입은 목록에서 숨긴다(Issue #190)", () => {
    const editor = editorWith(
      { id: "src", type: "paragraph", content: [{ text: "x" }] },
      { mode: "deny", types: ["quote", "toggleListItem"] },
    );

    const ids = getBlockTypeChoices(editor, { blockId: "src" }).map(
      ({ option }) => option.id,
    );

    expect(ids).not.toContain("quote");
    expect(ids).not.toContain("toggle-list");
    expect(ids).toContain("paragraph");
  });

  // 여러 블록 선택은 여러 블록을 한 codeBlock으로 합치지 않아 Code만 막힌다
  // (core setBlockTypes가 codeBlock 대상을 거절). 선택 안의 codeBlock은 command가
  // 건너뛰므로 source 쪽 제한은 없다.
  it("여러 블록 선택에서는 Code만 막고 나머지는 허용한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "a", type: "paragraph", content: [{ text: "a" }] },
          {
            id: "b",
            type: "codeBlock",
            language: "text",
            content: [{ text: "b" }],
          },
        ],
      },
    });

    const choices = getBlockTypeChoices(editor, { blockIds: ["a", "b"] });

    expect(allowedIds(choices)).toEqual(
      BLOCK_TYPE_OPTIONS.map(({ id }) => id).filter((id) => id !== "code"),
    );
  });

  it("대상이 없으면 켜진 옵션 전부를 NOT_FOUND로 막아 돌려준다", () => {
    const editor = editorWith(
      { id: "src", type: "paragraph", content: [{ text: "x" }] },
      { mode: "deny", types: ["quote"] },
    );

    const choices = getBlockTypeChoices(editor, null);

    expect(choices.map(({ option }) => option.id)).toEqual(
      BLOCK_TYPE_OPTIONS.map(({ id }) => id).filter((id) => id !== "quote"),
    );
    expect(choices.every(({ blocker }) => blocker === "NOT_FOUND")).toBe(true);
  });
});

// 툴바 fake controller의 기본 거절 규칙(block-type-blocker-fake.ts)이 실제 core와
// 같은지 소스 9종×대상 옵션 전수로 확인한다. fake가 어긋나면 표면 테스트가
// 거짓으로 통과한다.
describe("툴바 fake 거절 규칙이 실제 core와 같다", () => {
  const SOURCES: readonly Block[] = [
    { id: "src", type: "paragraph", content: [{ text: "x" }] },
    { id: "src", type: "heading", level: 2, content: [{ text: "x" }] },
    { id: "src", type: "quote", content: [{ text: "x" }] },
    { id: "src", type: "callout", content: [{ text: "x" }] },
    {
      id: "src",
      type: "codeBlock",
      language: "text",
      content: [{ text: "x" }],
    },
    { id: "src", type: "bulletListItem", content: [{ text: "x" }] },
    { id: "src", type: "numberedListItem", content: [{ text: "x" }] },
    {
      id: "src",
      type: "checkListItem",
      checked: false,
      content: [{ text: "x" }],
    },
    { id: "src", type: "toggleListItem", content: [{ text: "x" }] },
  ];

  it.each(SOURCES.map((block) => ({ block })))(
    "$block.type source의 한 블록 질의가 옵션 전부에서 일치한다",
    ({ block }) => {
      const editor = editorWith(block);

      for (const { option, blocker } of getBlockTypeChoices(editor, {
        blockId: "src",
      })) {
        expect(blocker, option.id).toBe(
          fakeBlockTypeBlocker(block.type, option.blockType.type),
        );
      }
    },
  );

  it("여러 블록 선택의 질의가 옵션 전부에서 일치한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "a", type: "paragraph", content: [{ text: "a" }] },
          { id: "b", type: "quote", content: [{ text: "b" }] },
        ],
      },
    });

    for (const { option, blocker } of getBlockTypeChoices(editor, {
      blockIds: ["a", "b"],
    })) {
      expect(blocker, option.id).toBe(
        fakeBlockTypesBlocker(option.blockType.type),
      );
    }
  });
});
