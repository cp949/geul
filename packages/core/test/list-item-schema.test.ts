/**
 * 글머리·번호 목록 content node의 독립 ProseMirror 스키마 계약을 검증한다.
 * 그룹 귀속, inline content, 번호 속성과 기존 blockContainer 중첩 구조를 다룬다.
 */
import { getSchema, Node } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import {
  BlockContainerExtension,
  BlockGroupExtension,
} from "../src/block-container-extension.js";
import {
  BulletListItemExtension,
  NumberedListItemExtension,
} from "../src/list-item-extension.js";

const DocExtension = Node.create({
  name: "doc",
  topNode: true,
  content: "nestableBlockContent+",
});

const TextExtension = Node.create({ name: "text", group: "inline" });

const ParagraphExtension = Node.create({
  name: "paragraph",
  group: "nestableBlockContent",
  content: "inline*",
});

const LeafContentExtension = Node.create({
  name: "leafContent",
  group: "leafBlockContent",
});

const BlockDocExtension = Node.create({
  name: "doc",
  topNode: true,
  content: "block+",
});

/** 목록 content node만 조립해 자체 그룹·속성 계약을 관찰할 스키마를 만든다. */
function listContentSchema() {
  return getSchema([
    DocExtension,
    TextExtension,
    BulletListItemExtension,
    NumberedListItemExtension,
  ]);
}

/** 기존 blockContainer·blockGroup과 목록 content node를 함께 조립한다. */
function listBlockSchema() {
  return getSchema([
    BlockDocExtension,
    TextExtension,
    BulletListItemExtension,
    NumberedListItemExtension,
    ParagraphExtension,
    LeafContentExtension,
    BlockContainerExtension,
    BlockGroupExtension,
  ]);
}

describe("목록 content node 스키마 계약", () => {
  it("목록 content node는 nestableBlockContent에서 inline content를 담는다", () => {
    const schema = listContentSchema();
    const bullet = schema.nodes.bulletListItem;
    const numbered = schema.nodes.numberedListItem;

    expect(bullet?.spec.group).toBe("nestableBlockContent");
    expect(numbered?.spec.group).toBe("nestableBlockContent");
    expect(bullet?.spec.content).toBe("inline*");
    expect(numbered?.spec.content).toBe("inline*");
  });

  it("번호 목록만 null 기본값의 startNumber 속성을 가진다", () => {
    const schema = listContentSchema();
    const bullet = schema.nodes.bulletListItem;
    const numbered = schema.nodes.numberedListItem;
    if (bullet === undefined || numbered === undefined) {
      throw new Error("목록 content node가 없다");
    }

    expect(Object.keys(bullet.spec.attrs ?? {})).toEqual([]);
    expect(numbered.create().attrs).toEqual({ startNumber: null });
    expect(numbered.create({ startNumber: 0 }).attrs).toEqual({
      startNumber: 0,
    });
    expect(numbered.create({ startNumber: 999_999_999 }).attrs).toEqual({
      startNumber: 999_999_999,
    });
  });

  it("목록의 안정 ID와 임의 자식 블록은 blockContainer와 blockGroup이 소유한다", () => {
    const schema = listBlockSchema();
    const bullet = schema.nodes.bulletListItem;
    const numbered = schema.nodes.numberedListItem;
    const paragraph = schema.nodes.paragraph;
    const blockContainer = schema.nodes.blockContainer;
    const blockGroup = schema.nodes.blockGroup;
    if (
      bullet === undefined ||
      numbered === undefined ||
      paragraph === undefined ||
      blockContainer === undefined ||
      blockGroup === undefined
    ) {
      throw new Error("목록 block schema가 불완전하다");
    }

    expect(Object.keys(bullet.spec.attrs ?? {})).toEqual([]);
    expect(Object.keys(numbered.spec.attrs ?? {})).toEqual(["startNumber"]);
    expect(bullet.contentMatch.matchType(blockGroup)).toBeNull();
    expect(numbered.contentMatch.matchType(blockGroup)).toBeNull();

    const child = blockContainer.createChecked(
      { blockId: "child" },
      paragraph.create(),
    );
    const children = blockGroup.createChecked(null, [child]);
    expect(() =>
      blockContainer.createChecked({ blockId: "parent" }, [
        bullet.create(),
        children,
      ]),
    ).not.toThrow();
  });

  it("목록 추가 뒤에도 그룹 기본 채움은 blockContainer와 paragraph다", () => {
    const schema = listBlockSchema();

    expect(schema.nodes.doc?.contentMatch.defaultType?.name).toBe(
      "blockContainer",
    );
    expect(schema.nodes.blockGroup?.contentMatch.defaultType?.name).toBe(
      "blockContainer",
    );
    expect(schema.nodes.blockContainer?.contentMatch.defaultType?.name).toBe(
      "paragraph",
    );
  });
});
