/**
 * 인라인 `textColor`/`backgroundColor` TextMark가 PM mark extension
 * 등록·`markFromTiptap`의 `color` 포워딩을 거쳐 model→PM→model 왕복에서
 * 그대로 보존되는지 검증한다(RD-001 DELTA-02). 인코드 방향(`markToTiptap`)은
 * DELTA-01의 `text-color-mark-to-tiptap.test.ts`가 이미 고정했다 — 여기서는
 * PM 등록·디코드까지 포함한 전체 왕복만 다룬다.
 */
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import { documentOf, sequentialIds } from "./editor-controller-support.js";

describe("인라인 textColor/backgroundColor mark 왕복(createEditor → getDocument)", () => {
  it("단독 textColor/backgroundColor mark가 있는 텍스트가 그대로 보존된다", () => {
    const initialDocument = documentOf(
      {
        id: "p-1",
        type: "paragraph",
        content: [
          {
            text: "colored",
            marks: [{ type: "textColor", color: "#AABBCC" }],
          },
          {
            text: "shaded",
            marks: [{ type: "backgroundColor", color: "#112233" }],
          },
          { text: " plain" },
        ],
      },
      { id: "tail-1", type: "paragraph", content: [{ text: "tail" }] },
    );

    const editor = createEditor({
      initialDocument,
      createId: sequentialIds("gen"),
    });

    expect(editor.getDocument().blocks).toEqual(initialDocument.blocks);
  });

  it("textColor/backgroundColor가 기존 6종 mark와 같은 run에 함께 있어도 정규 순서로 보존된다", () => {
    const initialDocument = documentOf(
      {
        id: "p-1",
        type: "paragraph",
        content: [
          {
            text: "all marks",
            marks: [
              { type: "link", href: "https://example.com" },
              { type: "bold" },
              { type: "code" },
              { type: "italic" },
              { type: "strike" },
              { type: "underline" },
              { type: "textColor", color: "#AABBCC" },
              { type: "backgroundColor", color: "#112233" },
            ],
          },
        ],
      },
      { id: "tail-1", type: "paragraph", content: [{ text: "tail" }] },
    );

    const editor = createEditor({
      initialDocument,
      createId: sequentialIds("gen"),
    });

    expect(editor.getDocument().blocks).toEqual(initialDocument.blocks);
  });
});
