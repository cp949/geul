/**
 * customInlineContent registry(spec §4.4 EXT-002, RD-002-DELTA-18)의 등록·
 * 렌더·삽입·JSON round-trip을 검증한다. fixture 확장(myTag)은 render()에서
 * <span>을 만들어 customType을 표시하고, 호출마다 받은 item·editor 참조를
 * 기록한다. custom-block-registry.test.ts(customBlocks)와 동형 구조 —
 * 이 파일은 inline atom(Node, group:"inline")과 afterBlockId 없는 caret
 * 삽입이라는 차이만 다룬다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  createEditor,
  type CustomInlineContentDefinition,
  type EditorController,
} from "../src/index.js";
import {
  caretAt,
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

const renderCalls: {
  item: { type: "custom"; customType: string; props?: unknown };
  editor: EditorController;
}[] = [];

const tagDefinition: CustomInlineContentDefinition = {
  render: ({ item, editor }) => {
    renderCalls.push({ item, editor });
    const element = document.createElement("span");
    element.dataset.tag = "true";
    element.textContent = `tag:${item.customType}`;
    return element;
  },
};

describe("customInlineContent registry(RD-002-DELTA-18)", () => {
  it("등록된 타입이 initialDocument의 문단 content 안에 있으면 로드되고 render()가 만든 element가 DOM에 붙는다 — 인접 동일 마크 텍스트 런 사이에 있어도 DOCUMENT_INVALID로 오판되지 않는다", () => {
    renderCalls.length = 0;
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "block-1",
          type: "paragraph",
          content: [
            { text: "a", marks: [{ type: "bold" }] },
            { type: "custom", customType: "myTag", props: { label: "x" } },
            { text: "b", marks: [{ type: "bold" }] },
          ],
        },
      ],
    };
    const editor = createEditor({
      initialDocument,
      customInlineContent: { myTag: tagDefinition },
    });
    const { editable } = mountTiptapEditor(editor);

    const rendered = editable.querySelector('[data-tag="true"]');
    expect(rendered).not.toBeNull();
    expect(rendered?.textContent).toBe("tag:myTag");
    expect(renderCalls.at(-1)?.item).toEqual({
      type: "custom",
      customType: "myTag",
      props: { label: "x" },
    });
  });

  it("commands.insertCustomInlineContent로 현재 caret에 삽입한 원소가 렌더되고 getDocument()가 customType/props를 정확히 보존한다(JSON round-trip)", () => {
    renderCalls.length = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
      customInlineContent: { myTag: tagDefinition },
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(caretAt(tiptap, "block-1").anchor);

    const result = editor.commands.insertCustomInlineContent("myTag", {
      count: 5,
      label: "hi",
      flag: true,
      note: null,
    });
    expect(result).toEqual({ ok: true, value: undefined });

    const rendered = editable.querySelector('[data-tag="true"]');
    expect(rendered).not.toBeNull();

    const paragraph = editor
      .getDocument()
      .blocks.find((block) => block.id === "block-1");
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") return;
    expect(paragraph.content).toContainEqual({
      type: "custom",
      customType: "myTag",
      props: { count: 5, label: "hi", flag: true, note: null },
    });
  });

  it("props 없이 삽입하면 저장 문서에 props 필드 자체가 없다(model의 생략 가능 필드 관례)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
      customInlineContent: { myTag: tagDefinition },
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(caretAt(tiptap, "block-1").anchor);

    const result = editor.commands.insertCustomInlineContent("myTag");
    expect(result).toEqual({ ok: true, value: undefined });

    const paragraph = editor
      .getDocument()
      .blocks.find((block) => block.id === "block-1");
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") return;
    expect(paragraph.content).toContainEqual({
      type: "custom",
      customType: "myTag",
    });
  });

  it("등록되지 않은 type으로 insertCustomInlineContent를 호출하면 CUSTOM_INLINE_CONTENT_TYPE_NOT_REGISTERED로 거절되고 문서가 바뀌지 않는다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      customInlineContent: { myTag: tagDefinition },
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(caretAt(tiptap, "block-1").anchor);
    const before = editor.getDocument();

    const result = editor.commands.insertCustomInlineContent(
      "unregisteredTag",
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CUSTOM_INLINE_CONTENT_TYPE_NOT_REGISTERED",
        type: "unregisteredTag",
      },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("다른 타입이 등록돼 있어도 미등록 커스텀 inline 타입을 가진 문서는 여전히 EDITOR_FEATURE_UNAVAILABLE로 거절된다(회귀 없음, 타입별 정확한 스코프)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      customInlineContent: { myTag: tagDefinition },
    });
    mountTiptapEditor(editor);

    const result = editor.replaceDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "block-1",
          type: "paragraph",
          content: [{ type: "custom", customType: "otherTag" }],
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message:
          'Block block-1 contains an unregistered custom inline type "otherTag"',
      },
    });
  });
});
