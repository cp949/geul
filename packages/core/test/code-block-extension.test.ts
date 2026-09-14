/**
 * codeBlock PM 내용 노드의 독립 스키마 계약을 고정한다.
 * production 등록 전 node 형상, language 보존, 내부 DOM과 그룹 귀속을 검증한다.
 */
import { getSchema, Mark, Node } from "@tiptap/core";
import { DOMSerializer, type NodeType } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { CodeBlockExtension } from "../src/code-block-extension.js";

const DocExtension = Node.create({
  name: "doc",
  topNode: true,
  content: "leafBlockContent+",
});

const TextExtension = Node.create({ name: "text", group: "inline" });

const TestMarkExtension = Mark.create({
  name: "testMark",
  renderHTML() {
    return ["strong", 0];
  },
});

/** 독립 extension만으로 codeBlock 계약을 관찰할 최소 스키마를 만든다. */
function codeBlockSchema() {
  return getSchema([
    DocExtension,
    TextExtension,
    TestMarkExtension,
    CodeBlockExtension,
  ]);
}

/**
 * 공개 NodeSpec.group 문자열을 ProseMirror의 공백 구분 group 목록으로 읽는다.
 * 런타임 내부 필드에 기대지 않고 정확한 귀속과 특정 group 비참여를 단언한다.
 */
function nodeGroups(node: NodeType): string[] {
  return node.spec.group?.split(/\s+/).filter(Boolean) ?? [];
}

describe("codeBlock 노드 스키마 계약", () => {
  it("codeBlock은 표시 없는 text만 담는 defining code textblock이다", () => {
    const schema = codeBlockSchema();
    const codeBlock = schema.nodes.codeBlock;
    const testMark = schema.marks.testMark;
    if (codeBlock === undefined || testMark === undefined) {
      throw new Error("codeBlock test schema is incomplete");
    }

    expect(codeBlock.name).toBe("codeBlock");
    expect(codeBlock.spec.content).toBe("text*");
    expect(codeBlock.spec.marks).toBe("");
    expect(codeBlock.spec.code).toBe(true);
    expect(codeBlock.spec.defining).toBe(true);
    expect(() =>
      codeBlock.createChecked(null, schema.text("source", [testMark.create()])),
    ).toThrow();
  });

  it("language 기본값은 null이고 null과 문자열을 PM attrs에 그대로 보존한다", () => {
    const codeBlock = codeBlockSchema().nodes.codeBlock;
    if (codeBlock === undefined) throw new Error("codeBlock node is missing");

    expect(codeBlock.create().toJSON()).toEqual({
      type: "codeBlock",
      attrs: { language: null, wrap: null, caption: null },
    });
    expect(codeBlock.create({ language: null }).attrs).toEqual({
      language: null,
      wrap: null,
      caption: null,
    });
    expect(codeBlock.create({ language: "TypeScript" }).attrs).toEqual({
      language: "TypeScript",
      wrap: null,
      caption: null,
    });
    expect(Object.keys(codeBlock.spec.attrs ?? {})).toEqual([
      "language",
      "wrap",
      "caption",
    ]);
  });

  it("wrap 기본값은 null이고 null과 boolean을 PM attrs에 그대로 보존한다", () => {
    const codeBlock = codeBlockSchema().nodes.codeBlock;
    if (codeBlock === undefined) throw new Error("codeBlock node is missing");

    expect(codeBlock.create().attrs.wrap).toBeNull();
    expect(codeBlock.create({ wrap: null }).attrs.wrap).toBeNull();
    expect(codeBlock.create({ wrap: true }).attrs.wrap).toBe(true);
    expect(codeBlock.create({ wrap: false }).attrs.wrap).toBe(false);
  });

  it("caption 기본값은 null이고 null과 문자열을 PM attrs에 그대로 보존한다", () => {
    const codeBlock = codeBlockSchema().nodes.codeBlock;
    if (codeBlock === undefined) throw new Error("codeBlock node is missing");

    expect(codeBlock.create().attrs.caption).toBeNull();
    expect(codeBlock.create({ caption: null }).attrs.caption).toBeNull();
    expect(codeBlock.create({ caption: "" }).attrs.caption).toBe("");
    expect(codeBlock.create({ caption: "설명" }).attrs.caption).toBe("설명");
  });

  it("codeBlock은 language metadata 없이 정확한 내부 DOM으로 렌더된다", () => {
    const schema = codeBlockSchema();
    const codeBlock = schema.nodes.codeBlock;
    if (codeBlock === undefined) throw new Error("codeBlock node is missing");

    const dom = DOMSerializer.fromSchema(schema).serializeNode(
      codeBlock.create({ language: "typescript" }, schema.text("const x = 1;")),
    ) as HTMLElement;

    expect(dom.outerHTML).toBe(
      '<pre data-geul-code-block=""><code>const x = 1;</code></pre>',
    );
    expect(dom.querySelector("[data-language]")).toBeNull();
    expect(dom.querySelector('[class*="language-"]')).toBeNull();
  });

  it("wrap:true인 codeBlock만 data-geul-code-wrap DOM attribute를 갖는다", () => {
    const schema = codeBlockSchema();
    const codeBlock = schema.nodes.codeBlock;
    if (codeBlock === undefined) throw new Error("codeBlock node is missing");
    const serializer = DOMSerializer.fromSchema(schema);

    const wrapped = serializer.serializeNode(
      codeBlock.create({ wrap: true }, schema.text("x")),
    ) as HTMLElement;
    const unwrapped = serializer.serializeNode(
      codeBlock.create({ wrap: false }, schema.text("x")),
    ) as HTMLElement;
    const unset = serializer.serializeNode(
      codeBlock.create({ wrap: null }, schema.text("x")),
    ) as HTMLElement;

    expect(wrapped.outerHTML).toBe(
      '<pre data-geul-code-wrap="" data-geul-code-block=""><code>x</code></pre>',
    );
    expect(unwrapped.hasAttribute("data-geul-code-wrap")).toBe(false);
    expect(unset.hasAttribute("data-geul-code-wrap")).toBe(false);
  });

  it("caption이 비어 있지 않을 때만 data-geul-media-caption 자식 DOM을 갖는다", () => {
    const schema = codeBlockSchema();
    const codeBlock = schema.nodes.codeBlock;
    if (codeBlock === undefined) throw new Error("codeBlock node is missing");
    const serializer = DOMSerializer.fromSchema(schema);

    const captioned = serializer.serializeNode(
      codeBlock.create({ caption: "설명", wrap: true }, schema.text("x")),
    ) as HTMLElement;
    const emptyCaption = serializer.serializeNode(
      codeBlock.create({ caption: "" }, schema.text("x")),
    ) as HTMLElement;
    const unsetCaption = serializer.serializeNode(
      codeBlock.create({ caption: null }, schema.text("x")),
    ) as HTMLElement;

    expect(captioned.outerHTML).toBe(
      '<pre data-geul-code-wrap="" data-geul-code-block=""><code>x</code><div data-geul-media-caption="">설명</div></pre>',
    );
    expect(emptyCaption.querySelector("[data-geul-media-caption]")).toBeNull();
    expect(unsetCaption.querySelector("[data-geul-media-caption]")).toBeNull();
  });

  it("codeBlock은 leafBlockContent에만 속하고 DOM parse 규칙이 없다", () => {
    const codeBlock = codeBlockSchema().nodes.codeBlock;
    if (codeBlock === undefined) throw new Error("codeBlock node is missing");

    expect(codeBlock.spec.group).toBe("leafBlockContent");
    expect(nodeGroups(codeBlock)).toEqual(["leafBlockContent"]);
    expect(nodeGroups(codeBlock)).not.toContain("block");
    expect(codeBlock.spec.parseDOM).toBeUndefined();
  });
});
