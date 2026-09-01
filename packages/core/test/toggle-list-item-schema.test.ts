/**
 * toggleListItem content node의 독립 ProseMirror 스키마 계약을 검증한다.
 * 그룹 귀속, inline content, collapsed 속성과 기존 blockContainer 중첩
 * 구조를 다룬다(Issue #38 슬라이스 6 RD-003). bulletListItem/
 * numberedListItem의 대응 계약은 list-item-schema.test.ts가 소유한다 — 이
 * 파일은 toggleListItem 전용 필드(collapsed)만 다룬다.
 */
import { getSchema, Node } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import {
  BlockContainerExtension,
  BlockGroupExtension,
} from "../src/block-container-extension.js";
import { ToggleListItemExtension } from "../src/list-item-extension.js";

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

/** toggleListItem content node만 조립해 자체 그룹·속성 계약을 관찰할 스키마를 만든다. */
function toggleContentSchema() {
  return getSchema([DocExtension, TextExtension, ToggleListItemExtension]);
}

/** 기존 blockContainer·blockGroup과 toggleListItem content node를 함께 조립한다. */
function toggleBlockSchema() {
  return getSchema([
    BlockDocExtension,
    TextExtension,
    ToggleListItemExtension,
    ParagraphExtension,
    LeafContentExtension,
    BlockContainerExtension,
    BlockGroupExtension,
  ]);
}

describe("toggleListItem content node 스키마 계약", () => {
  it("toggleListItem은 nestableBlockContent에서 inline content를 담는다", () => {
    const schema = toggleContentSchema();
    const toggle = schema.nodes.toggleListItem;

    expect(toggle?.spec.group).toBe("nestableBlockContent");
    expect(toggle?.spec.content).toBe("inline*");
  });

  it("collapsed 속성은 기본값 null이고 boolean 값을 그대로 보존한다", () => {
    const schema = toggleContentSchema();
    const toggle = schema.nodes.toggleListItem;
    if (toggle === undefined) throw new Error("toggleListItem node가 없다");

    expect(toggle.create().attrs).toEqual({ collapsed: null });
    expect(toggle.create({ collapsed: true }).attrs).toEqual({
      collapsed: true,
    });
    expect(toggle.create({ collapsed: false }).attrs).toEqual({
      collapsed: false,
    });
  });

  it("toggleListItem의 안정 ID와 임의 자식 블록은 blockContainer와 blockGroup이 소유한다", () => {
    const schema = toggleBlockSchema();
    const toggle = schema.nodes.toggleListItem;
    const paragraph = schema.nodes.paragraph;
    const blockContainer = schema.nodes.blockContainer;
    const blockGroup = schema.nodes.blockGroup;
    if (
      toggle === undefined ||
      paragraph === undefined ||
      blockContainer === undefined ||
      blockGroup === undefined
    ) {
      throw new Error("toggleListItem block schema가 불완전하다");
    }

    expect(Object.keys(toggle.spec.attrs ?? {})).toEqual(["collapsed"]);
    expect(toggle.contentMatch.matchType(blockGroup)).toBeNull();

    const child = blockContainer.createChecked(
      { blockId: "child" },
      paragraph.create(),
    );
    const children = blockGroup.createChecked(null, [child]);
    expect(() =>
      blockContainer.createChecked({ blockId: "parent" }, [
        toggle.create({ collapsed: true }),
        children,
      ]),
    ).not.toThrow();
  });

  it("toggleListItem 추가 뒤에도 그룹 기본 채움은 blockContainer와 paragraph다", () => {
    const schema = toggleBlockSchema();

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
