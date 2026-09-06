/**
 * customStyles registry(spec §4.4 EXT-003, RD-002-DELTA-19)의 등록·렌더·
 * 적용(toggle)·JSON round-trip을 검증한다. fixture 확장(myHighlight)은
 * render()에서 {className, style}을 반환한다 — custom-block-registry.test.ts/
 * custom-inline-content-registry.test.ts와 동형 구조지만, 이 파일은 Mark
 * (텍스트 런에 적용)라는 차이와 알려진 마크·다른 커스텀 마크와 섞였을 때의
 * canonical 순서·인접 판정을 함께 다룬다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  createEditor,
  type CustomStyleDefinition,
} from "../src/index.js";
import {
  caretAt,
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

const highlightDefinition: CustomStyleDefinition = {
  render: (value) => ({
    className: "highlight",
    style: { backgroundColor: (value.props?.color as string | undefined) ?? "yellow" },
  }),
};

describe("customStyles registry(RD-002-DELTA-19)", () => {
  it("등록된 타입이 initialDocument의 텍스트 런 마크에 있으면 로드되고 render()가 반환한 className/style이 반영된다 — 알려진 마크(bold)와 섞여도 canonical 순서 위반으로 오판되지 않는다", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "block-1",
          type: "paragraph",
          content: [
            {
              text: "hi",
              marks: [
                { type: "bold" },
                { type: "myHighlight", props: { color: "pink" } },
              ],
            },
          ],
        },
      ],
    };
    const editor = createEditor({
      initialDocument,
      customStyles: { myHighlight: highlightDefinition },
    });
    const { editable } = mountTiptapEditor(editor);

    const rendered = editable.querySelector(".highlight");
    expect(rendered).not.toBeNull();
    expect((rendered as HTMLElement).style.backgroundColor).toBe("pink");
    expect(rendered?.textContent).toBe("hi");
  });

  it("커스텀 마크의 props가 다른 두 인접 텍스트 런은 인접 동일 마크로 오판되지 않는다", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "block-1",
          type: "paragraph",
          content: [
            { text: "a", marks: [{ type: "myHighlight", props: { color: "pink" } }] },
            { text: "b", marks: [{ type: "myHighlight", props: { color: "blue" } }] },
          ],
        },
      ],
    };

    expect(() =>
      createEditor({
        initialDocument,
        customStyles: { myHighlight: highlightDefinition },
      }),
    ).not.toThrow();
  });

  it("commands.toggleCustomStyle로 selection에 적용한 마크가 렌더되고 getDocument()가 type/props를 정확히 보존한다(JSON round-trip). 같은 값으로 다시 호출하면 해제된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
      customStyles: { myHighlight: highlightDefinition },
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const start = caretAt(tiptap, "block-1").anchor;
    tiptap.commands.setTextSelection({ from: start, to: start + 4 });

    const applied = editor.commands.toggleCustomStyle("myHighlight", {
      color: "pink",
    });
    expect(applied).toEqual({ ok: true, value: undefined });

    expect(editable.querySelector(".highlight")).not.toBeNull();
    const paragraph = editor
      .getDocument()
      .blocks.find((block) => block.id === "block-1");
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") return;
    expect(paragraph.content).toContainEqual({
      text: "seed",
      marks: [{ type: "myHighlight", props: { color: "pink" } }],
    });

    tiptap.commands.setTextSelection({ from: start, to: start + 4 });
    const removed = editor.commands.toggleCustomStyle("myHighlight", {
      color: "pink",
    });
    expect(removed).toEqual({ ok: true, value: undefined });
    expect(editable.querySelector(".highlight")).toBeNull();
  });

  it("등록되지 않은 type으로 toggleCustomStyle을 호출하면 CUSTOM_STYLE_TYPE_NOT_REGISTERED로 거절되고 문서가 바뀌지 않는다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      customStyles: { myHighlight: highlightDefinition },
    });
    const { tiptap } = mountTiptapEditor(editor);
    const start = caretAt(tiptap, "block-1").anchor;
    tiptap.commands.setTextSelection({ from: start, to: start + 4 });
    const before = editor.getDocument();

    const result = editor.commands.toggleCustomStyle("unregisteredStyle");

    expect(result).toEqual({
      ok: false,
      error: { code: "CUSTOM_STYLE_TYPE_NOT_REGISTERED", type: "unregisteredStyle" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("다른 스타일이 등록돼 있어도 미등록 커스텀 마크를 가진 문서는 여전히 EDITOR_FEATURE_UNAVAILABLE로 거절된다(회귀 없음, 타입별 정확한 스코프)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      customStyles: { myHighlight: highlightDefinition },
    });
    mountTiptapEditor(editor);

    const result = editor.replaceDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "block-1",
          type: "paragraph",
          content: [{ text: "hi", marks: [{ type: "otherStyle" }] }],
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message:
          'Block block-1 contains an unregistered custom mark type "otherStyle"',
      },
    });
  });
});
