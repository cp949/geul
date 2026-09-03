/**
 * `TextBlockProps`(`textColor`/`backgroundColor`/`textAlignment`)가
 * `blockContainer` PM 노드 attrs를 거쳐 model→PM→model 왕복에서 그대로
 * 보존되는지 검증한다(RD-001 DELTA-02). 대상은 `TextBlockProps`가 붙는 7개
 * nestable 타입(paragraph/heading/quote/목록 4종) 전부다. `codeBlock`은
 * `blockContainer`를 공유하지만 이 attrs를 쓰지 않는다는 계약도 인코드
 * 단계에서 직접 고정한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import { modelToTiptap } from "../src/model-to-tiptap.js";
import {
  documentOf,
  paragraphDocument,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

describe("TextBlockProps 왕복(createEditor → getDocument)", () => {
  it("7개 nestable 타입 각각의 textColor/backgroundColor/textAlignment 조합이 그대로 보존된다", () => {
    const initialDocument = documentOf(
      {
        id: "p-1",
        type: "paragraph",
        content: [{ text: "colored" }],
        textColor: "#AABBCC",
      },
      {
        id: "h-1",
        type: "heading",
        level: 2,
        content: [{ text: "shaded" }],
        backgroundColor: "#112233",
      },
      {
        id: "q-1",
        type: "quote",
        content: [{ text: "aligned" }],
        textAlignment: "center",
      },
      {
        id: "bl-1",
        type: "bulletListItem",
        content: [{ text: "all three" }],
        textColor: "#FF00FF",
        backgroundColor: "#00FF00",
        textAlignment: "left",
      },
      {
        id: "nl-1",
        type: "numberedListItem",
        content: [{ text: "none" }],
      },
      {
        id: "cl-1",
        type: "checkListItem",
        content: [{ text: "checked props" }],
        checked: false,
        textColor: "#123456",
      },
      {
        id: "tl-1",
        type: "toggleListItem",
        content: [{ text: "right aligned" }],
        textAlignment: "right",
      },
      tailParagraphBlock,
    );

    const editor = createEditor({
      initialDocument,
      createId: sequentialIds("gen"),
    });

    expect(editor.getDocument().blocks).toEqual(initialDocument.blocks);
  });

  it("props 없는 문서는 attrs가 null로 인코드되고 디코드에서도 필드가 생기지 않는다", () => {
    const initialDocument = paragraphDocument("plain");

    const result = modelToTiptap(initialDocument);
    if (!result.ok) throw new Error("modelToTiptap 실패");

    expect(result.value.content?.[0]?.attrs).toEqual({
      blockId: "block-1",
      textColor: null,
      backgroundColor: null,
      textAlignment: null,
    });

    const editor = createEditor({
      initialDocument,
      createId: sequentialIds("gen"),
    });
    expect(editor.getDocument().blocks).toEqual(initialDocument.blocks);
  });

  it("modelToTiptap이 codeBlock의 blockContainer attrs에는 TextBlockProps 필드를 추가하지 않는다", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "code-1",
          type: "codeBlock",
          content: [{ text: "const x = 1;" }],
        },
        { id: "tail-1", type: "paragraph", content: [{ text: "tail" }] },
      ],
    };

    const result = modelToTiptap(initialDocument);
    if (!result.ok) throw new Error("modelToTiptap 실패");

    expect(result.value.content?.[0]?.attrs).toEqual({ blockId: "code-1" });
  });

  it("replaceDocument로 TextBlockProps 있는 문서를 교체 로드해도 같은 왕복이 성립한다", () => {
    const coloredDocument = documentOf(
      {
        id: "p-1",
        type: "paragraph",
        content: [{ text: "replaced" }],
        textColor: "#AABBCC",
        backgroundColor: "#112233",
        textAlignment: "center",
      },
      tailParagraphBlock,
    );

    const editor = createEditor({ initialDocument: paragraphDocument("kept") });

    expect(editor.replaceDocument(coloredDocument)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks).toEqual(coloredDocument.blocks);
  });
});
