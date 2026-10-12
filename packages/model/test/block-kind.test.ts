/**
 * 목록 항목·중첩 가능·콘텐츠 보유 판정이 포함 관계(목록 항목 ⊂ 중첩 가능
 * ⊂ 콘텐츠 보유)를 지키는지 모든 Block 판별자에 대해 고정한다. 또
 * BLOCK_FAMILY 표와 거기서 파생한 미디어·리프 판정(isMediaBlockType,
 * isLeafBlockType, isMediaBlock, isLeafBlock)과 isKnownBlockType 파생을
 * 고정한다(Issue #371).
 */
import { describe, expect, it } from "vitest";

import { BLOCK_FAMILY } from "../src/block-kind.js";
import {
  isInlineContentBlockType,
  isKnownBlockType,
  isLeafBlock,
  isLeafBlockType,
  isListItemBlockType,
  isMediaBlock,
  isMediaBlockType,
  isNestableBlockType,
  type Block,
  type CustomBlock,
  type MediaBlockType,
} from "../src/index.js";

const ALL_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "quote",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "toggleListItem",
  "callout",
  "codeBlock",
  "divider",
  "table",
  "file",
  "image",
  "video",
  "audio",
  "iframe",
] as const;

// 표 밖 문자열이다. 객체 프로퍼티 조회로 판정하면 새는 이름을 포함한다.
const NON_TABLE_STRINGS = [
  "constructor",
  "toString",
  "__proto__",
  "hasOwnProperty",
  "",
  "my-custom-block",
] as const;

describe("isListItemBlockType", () => {
  it.each([
    ["bulletListItem", true],
    ["numberedListItem", true],
    // checkListItem은 로드맵 D2에 따라 ListItemBlockType에 편입된다 —
    // bulletListItem/numberedListItem처럼 <ul>/<ol> 직렬화(io) 대상이다.
    ["checkListItem", true],
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
    ["checkListItem", true],
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
    ["checkListItem", true],
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

describe("BLOCK_FAMILY 표", () => {
  it("Block 전 종류의 가족을 고정한다", () => {
    expect(BLOCK_FAMILY).toEqual({
      paragraph: "text",
      heading: "text",
      quote: "text",
      bulletListItem: "text",
      numberedListItem: "text",
      checkListItem: "text",
      toggleListItem: "text",
      callout: "text",
      table: "table",
      divider: "divider",
      codeBlock: "code",
      file: "media",
      image: "media",
      video: "media",
      audio: "media",
      iframe: "media",
    });
  });
});

describe("isMediaBlockType", () => {
  it.each(Object.keys(BLOCK_FAMILY).map((type) => [type] as const))(
    "%s의 미디어 여부는 표의 media 가족과 같다",
    (type) => {
      expect(isMediaBlockType(type)).toBe(
        BLOCK_FAMILY[type as Block["type"]] === "media",
      );
    },
  );

  it.each(["file", "image", "video", "audio", "iframe"])(
    "%s는 미디어 블록이다",
    (type) => {
      expect(isMediaBlockType(type)).toBe(true);
    },
  );

  it.each(NON_TABLE_STRINGS)("표에 없는 문자열 %j는 false다", (type) => {
    expect(isMediaBlockType(type)).toBe(false);
  });
});

describe("isLeafBlockType", () => {
  it.each([
    "divider",
    "codeBlock",
    "file",
    "image",
    "video",
    "audio",
    "iframe",
  ])("%s는 리프 블록이다", (type) => {
    expect(isLeafBlockType(type)).toBe(true);
  });

  it.each([
    "paragraph",
    "heading",
    "quote",
    "bulletListItem",
    "numberedListItem",
    "checkListItem",
    "toggleListItem",
    "callout",
    "table",
  ])("%s는 리프 블록이 아니다", (type) => {
    expect(isLeafBlockType(type)).toBe(false);
  });

  it.each(NON_TABLE_STRINGS)("표에 없는 문자열 %j는 false다", (type) => {
    expect(isLeafBlockType(type)).toBe(false);
  });

  it("미디어 블록은 항상 리프 블록이다", () => {
    for (const type of Object.keys(BLOCK_FAMILY)) {
      if (isMediaBlockType(type)) expect(isLeafBlockType(type)).toBe(true);
    }
  });
});

describe("isKnownBlockType", () => {
  it.each(Object.keys(BLOCK_FAMILY).map((type) => [type] as const))(
    "표의 키 %s는 알려진 블록 종류다",
    (type) => {
      expect(isKnownBlockType(type)).toBe(true);
    },
  );

  it.each(NON_TABLE_STRINGS)("표에 없는 문자열 %j는 false다", (type) => {
    expect(isKnownBlockType(type)).toBe(false);
  });
});

/**
 * 대입 시점의 선언 타입 좁힘을 피해 Block 유니온 그대로 돌려준다.
 * 타입 좁힘 테스트가 predicate의 효과만 보게 한다.
 */
const widen = (block: Block): Block => block;

/** `widen`과 같되 Block | CustomBlock 유니온 그대로 돌려준다. */
const widenOrCustom = (block: Block | CustomBlock): Block | CustomBlock =>
  block;

describe("isMediaBlock", () => {
  const image: Block = { id: "m-1", type: "image", url: "https://e.com/a.png" };
  const paragraph: Block = { id: "p-1", type: "paragraph", content: [] };
  const custom: CustomBlock = {
    id: "c-1",
    type: "constructor",
    content: "none",
  };

  it("Block을 캐스트 없이 미디어 블록으로 좁힌다", () => {
    const block = widen(image);
    if (!isMediaBlock(block)) throw new Error("미디어 블록이어야 한다");
    // 컴파일 증명: 좁힌 뒤에는 모든 멤버가 공통으로 가진 url을 읽는다.
    const url: string | undefined = block.url;
    const type: MediaBlockType = block.type;
    expect(url).toBe("https://e.com/a.png");
    expect(type).toBe("image");
  });

  it("Block | CustomBlock에서도 CustomBlock을 빼고 좁힌다", () => {
    const block = widenOrCustom(image);
    if (!isMediaBlock(block)) throw new Error("미디어 블록이어야 한다");
    const url: string | undefined = block.url;
    const type: MediaBlockType = block.type;
    expect(url).toBe("https://e.com/a.png");
    expect(type).toBe("image");
  });

  it("미디어가 아닌 Block은 false다", () => {
    expect(isMediaBlock(paragraph)).toBe(false);
  });

  it("type이 constructor인 CustomBlock은 false다", () => {
    expect(isMediaBlock(custom)).toBe(false);
  });
});

describe("isLeafBlock", () => {
  const divider: Block = { id: "d-1", type: "divider" };
  const paragraph: Block = { id: "p-1", type: "paragraph", content: [] };
  const custom: CustomBlock = { id: "c-1", type: "toString", content: "none" };

  it("Block을 캐스트 없이 리프 블록으로 좁힌다", () => {
    const block = widen(divider);
    if (!isLeafBlock(block)) throw new Error("리프 블록이어야 한다");
    // 컴파일 증명: 좁힌 뒤에는 children 필드가 없는 멤버만 남는다.
    // @ts-expect-error 리프 블록은 children을 갖지 않는다.
    expect(block.children).toBeUndefined();
    expect(block.type).toBe("divider");
  });

  it("리프가 아닌 Block은 false다", () => {
    expect(isLeafBlock(paragraph)).toBe(false);
  });

  it("type이 toString인 CustomBlock은 false다", () => {
    expect(isLeafBlock(custom)).toBe(false);
  });
});
