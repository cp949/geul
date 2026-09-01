/**
 * checkListItem content node의 독립 ProseMirror 스키마 계약을 검증한다.
 * 그룹 귀속, inline content, checked 속성과 기존 blockContainer 중첩 구조를
 * 다룬다(Issue #38 슬라이스 6 RD-001 DELTA-02). bulletListItem/
 * numberedListItem의 대응 계약은 list-item-schema.test.ts가 소유한다 — 이
 * 파일은 checkListItem 전용 필드(checked)만 다룬다.
 */
import { getSchema, Node } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import {
  BlockContainerExtension,
  BlockGroupExtension,
} from "../src/block-container-extension.js";
import { CheckListItemExtension } from "../src/list-item-extension.js";

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

/** checkListItem content node만 조립해 자체 그룹·속성 계약을 관찰할 스키마를 만든다. */
function checkContentSchema() {
  return getSchema([DocExtension, TextExtension, CheckListItemExtension]);
}

/** 기존 blockContainer·blockGroup과 checkListItem content node를 함께 조립한다. */
function checkBlockSchema() {
  return getSchema([
    BlockDocExtension,
    TextExtension,
    CheckListItemExtension,
    ParagraphExtension,
    LeafContentExtension,
    BlockContainerExtension,
    BlockGroupExtension,
  ]);
}

describe("checkListItem content node 스키마 계약", () => {
  it("checkListItem은 nestableBlockContent에서 inline content를 담는다", () => {
    const schema = checkContentSchema();
    const check = schema.nodes.checkListItem;

    expect(check?.spec.group).toBe("nestableBlockContent");
    expect(check?.spec.content).toBe("inline*");
  });

  it("checked 속성은 기본값 false이고 boolean 값을 그대로 보존한다(model 필수 필드라 null 기본값이 아니다)", () => {
    const schema = checkContentSchema();
    const check = schema.nodes.checkListItem;
    if (check === undefined) throw new Error("checkListItem node가 없다");

    expect(check.create().attrs).toEqual({ checked: false });
    expect(check.create({ checked: true }).attrs).toEqual({ checked: true });
    expect(check.create({ checked: false }).attrs).toEqual({
      checked: false,
    });
  });

  it("checkListItem의 안정 ID와 임의 자식 블록은 blockContainer와 blockGroup이 소유한다", () => {
    const schema = checkBlockSchema();
    const check = schema.nodes.checkListItem;
    const paragraph = schema.nodes.paragraph;
    const blockContainer = schema.nodes.blockContainer;
    const blockGroup = schema.nodes.blockGroup;
    if (
      check === undefined ||
      paragraph === undefined ||
      blockContainer === undefined ||
      blockGroup === undefined
    ) {
      throw new Error("checkListItem block schema가 불완전하다");
    }

    expect(Object.keys(check.spec.attrs ?? {})).toEqual(["checked"]);
    expect(check.contentMatch.matchType(blockGroup)).toBeNull();

    const child = blockContainer.createChecked(
      { blockId: "child" },
      paragraph.create(),
    );
    const children = blockGroup.createChecked(null, [child]);
    expect(() =>
      blockContainer.createChecked({ blockId: "parent" }, [
        check.create({ checked: true }),
        children,
      ]),
    ).not.toThrow();
  });

  it("checkListItem 추가 뒤에도 그룹 기본 채움은 blockContainer와 paragraph다", () => {
    const schema = checkBlockSchema();

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
