/**
 * code-block-inline-text 모듈의 두 변환이 계약을 지키는지 검증한다(Issue #226).
 * inlineToCodeSource는 inline 조각을 CodeBlock source 텍스트 하나로 평탄화한다.
 * codeSourceToInline은 그 반대로 source 텍스트를 inline 조각으로 되돌린다.
 *
 * 구조 단언은 PM Fragment의 JSON으로 한다. getDocument()는 hardBreak와 리터럴
 * "\n" text를 구분하지 못하기 때문이다.
 */
import type { Fragment, Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import {
  codeSourceLeafText,
  codeSourceToInline,
  inlineToCodeSource,
} from "../src/code-block-inline-text.js";
import {
  documentOf,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";

/**
 * 실제 확장이 등록된 편집기의 schema를 꺼낸다. hardBreak·bold가 모두 있다.
 */
const editorSchema = (): Schema =>
  mounted(documentOf(paragraphBlock("only", "x"))).tiptap.schema;

/**
 * Fragment를 비교하기 쉬운 JSON 배열로 바꾼다. 빈 Fragment는 빈 배열이다.
 */
const jsonOf = (fragment: Fragment): unknown[] =>
  (fragment.toJSON() as unknown[] | null) ?? [];

describe("inlineToCodeSource", () => {
  it("text, hardBreak, text를 개행이 낀 text 하나로 합친다", () => {
    const schema = editorSchema();
    const fragment = schema.nodes.paragraph!.create(null, [
      schema.text("ab"),
      schema.nodes.hardBreak!.create(),
      schema.text("cdef"),
    ]).content;

    expect(jsonOf(inlineToCodeSource(schema, fragment))).toEqual([
      { type: "text", text: "ab\ncdef" },
    ]);
  });

  it("연속 hardBreak와 앞뒤 hardBreak를 hardBreak 개수만큼의 개행으로 옮긴다", () => {
    const schema = editorSchema();
    const hardBreak = schema.nodes.hardBreak!;
    const fragment = schema.nodes.paragraph!.create(null, [
      hardBreak.create(),
      schema.text("a"),
      hardBreak.create(),
      hardBreak.create(),
      schema.text("b"),
      hardBreak.create(),
    ]).content;

    expect(jsonOf(inlineToCodeSource(schema, fragment))).toEqual([
      { type: "text", text: "\na\n\nb\n" },
    ]);
  });

  it("mark가 붙은 text는 mark 없는 text로 평탄화한다", () => {
    const schema = editorSchema();
    const bold = schema.marks.bold!.create();
    const fragment = schema.nodes.paragraph!.create(null, [
      schema.text("ab", [bold]),
      schema.text("cd"),
    ]).content;

    expect(jsonOf(inlineToCodeSource(schema, fragment))).toEqual([
      { type: "text", text: "abcd" },
    ]);
  });

  it("빈 Fragment와 hardBreak 없는 빈 결과는 빈 Fragment다", () => {
    const schema = editorSchema();
    const empty = schema.nodes.paragraph!.create().content;

    expect(inlineToCodeSource(schema, empty).childCount).toBe(0);
  });
});

describe("codeSourceToInline", () => {
  it("개행 하나를 text, hardBreak, text로 나눈다", () => {
    const schema = editorSchema();
    const fragment = schema.nodes.codeBlock!.create(
      null,
      schema.text("x\ny"),
    ).content;

    expect(jsonOf(codeSourceToInline(schema, fragment))).toEqual([
      { type: "text", text: "x" },
      { type: "hardBreak" },
      { type: "text", text: "y" },
    ]);
  });

  it("연속 개행은 빈 text 없이 hardBreak를 개행 개수만큼 만든다", () => {
    const schema = editorSchema();
    const fragment = schema.nodes.codeBlock!.create(
      null,
      schema.text("x\n\ny"),
    ).content;

    expect(jsonOf(codeSourceToInline(schema, fragment))).toEqual([
      { type: "text", text: "x" },
      { type: "hardBreak" },
      { type: "hardBreak" },
      { type: "text", text: "y" },
    ]);
  });

  it("앞뒤 개행도 hardBreak가 된다", () => {
    const schema = editorSchema();
    const fragment = schema.nodes.codeBlock!.create(
      null,
      schema.text("\nx\n"),
    ).content;

    expect(jsonOf(codeSourceToInline(schema, fragment))).toEqual([
      { type: "hardBreak" },
      { type: "text", text: "x" },
      { type: "hardBreak" },
    ]);
  });

  it("개행이 없는 text는 text 하나로 둔다", () => {
    const schema = editorSchema();
    const fragment = schema.nodes.codeBlock!.create(
      null,
      schema.text("plain"),
    ).content;

    expect(jsonOf(codeSourceToInline(schema, fragment))).toEqual([
      { type: "text", text: "plain" },
    ]);
  });

  it("빈 Fragment는 빈 Fragment다", () => {
    const schema = editorSchema();
    const empty = schema.nodes.codeBlock!.create().content;

    expect(codeSourceToInline(schema, empty).childCount).toBe(0);
  });
});

describe("codeSourceLeafText", () => {
  it("hardBreak는 개행이고 텍스트 표현이 없는 leaf는 빈 문자열이다", () => {
    const schema = editorSchema();

    expect(codeSourceLeafText(schema.nodes.hardBreak!.create())).toBe("\n");
    // 텍스트 표현이 없는 leaf는 divider로 대신 확인한다.
    expect(codeSourceLeafText(schema.nodes.divider!.create())).toBe("");
  });
});
