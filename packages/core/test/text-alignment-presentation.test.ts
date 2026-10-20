/**
 * 텍스트 블록 `textAlignment`의 편집 화면 렌더를 고정한다(Issue #424 RD-003, D1).
 *
 * - `textAlignment`는 blockContainer attrs에 저장된다. 화면에는 blockContent
 *   노드(container의 첫 자식)에 인라인 `text-align`을 얹는다. container에 주면
 *   자식 블록 group이 정렬을 상속하므로 container에는 주지 않는다.
 * - 정렬은 decoration으로만 나오는 파생 표시다. 저장 JSON에 흔적이 없다.
 * - computed 상속은 jsdom이 아니라 Chromium e2e(`e2e/text-alignment.spec.ts`)가 확인한다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
  tailParagraphBlock,
} from "./editor-controller-support.js";

/** blockId의 container DOM이다. 없으면 던진다. */
const containerOf = (editable: HTMLElement, blockId: string): HTMLElement => {
  const container = editable.querySelector<HTMLElement>(
    `[data-geul-block-id="${blockId}"]`,
  );
  if (container === null) throw new Error(`container가 없다: ${blockId}`);
  return container;
};

/** container의 첫 자식, 곧 blockContent DOM이다. */
const contentOf = (editable: HTMLElement, blockId: string): HTMLElement => {
  const content = containerOf(editable, blockId).firstElementChild;
  if (!(content instanceof HTMLElement)) {
    throw new Error(`blockContent가 없다: ${blockId}`);
  }
  return content;
};

const mountedWith = (...blocks: Block[]) => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks, tailParagraphBlock),
  });
  return { editor, ...mountTiptapEditor(editor) };
};

const textBlocks = (textAlignment: "left" | "center" | "right" | "justify") =>
  [
    {
      id: "b-paragraph",
      type: "paragraph",
      content: [{ text: "a" }],
      textAlignment,
    },
    {
      id: "b-heading",
      type: "heading",
      level: 2,
      content: [{ text: "a" }],
      textAlignment,
    },
    { id: "b-quote", type: "quote", content: [{ text: "a" }], textAlignment },
    {
      id: "b-bullet",
      type: "bulletListItem",
      content: [{ text: "a" }],
      textAlignment,
    },
    {
      id: "b-numbered",
      type: "numberedListItem",
      content: [{ text: "a" }],
      textAlignment,
    },
    {
      id: "b-check",
      type: "checkListItem",
      content: [{ text: "a" }],
      checked: false,
      textAlignment,
    },
    {
      id: "b-toggle",
      type: "toggleListItem",
      content: [{ text: "a" }],
      textAlignment,
    },
    {
      id: "b-callout",
      type: "callout",
      icon: "💡",
      content: [{ text: "a" }],
      textAlignment,
    },
  ] satisfies Block[];

describe("텍스트 블록 textAlignment 편집 화면 렌더", () => {
  describe.each(["left", "center", "right", "justify"] as const)(
    "%s",
    (alignment) => {
      it.each(
        textBlocks(alignment).map((block) => [block.type, block] as const),
      )("%s: blockContent에 인라인 text-align을 렌더한다", (_type, block) => {
        const { editable } = mountedWith(block);
        expect(contentOf(editable, block.id).style.textAlign).toBe(alignment);
      });
    },
  );

  it("container에는 text-align을 주지 않아 자식 블록 group이 상속하지 않는다", () => {
    const { editable } = mountedWith({
      id: "parent",
      type: "paragraph",
      content: [{ text: "부모" }],
      textAlignment: "center",
      children: [paragraphBlock("child", "자식")],
    });

    expect(containerOf(editable, "parent").style.textAlign).toBe("");
    expect(contentOf(editable, "parent").style.textAlign).toBe("center");
    expect(contentOf(editable, "child").style.textAlign).toBe("");
  });

  it("textAlignment가 없는 블록은 인라인 text-align이 없다", () => {
    const { editable } = mountedWith(paragraphBlock("p-1", "본문"));
    expect(contentOf(editable, "p-1").style.textAlign).toBe("");
  });

  it("setBlockTextAlignment가 화면에 즉시 반영되고 null과 undo로 되돌아간다", () => {
    const { editor, editable } = mountedWith(paragraphBlock("p-1", "본문"));

    expect(editor.commands.setBlockTextAlignment("p-1", "justify").ok).toBe(
      true,
    );
    expect(contentOf(editable, "p-1").style.textAlign).toBe("justify");

    expect(editor.commands.setBlockTextAlignment("p-1", "right").ok).toBe(true);
    expect(contentOf(editable, "p-1").style.textAlign).toBe("right");

    expect(editor.commands.setBlockTextAlignment("p-1", null).ok).toBe(true);
    expect(contentOf(editable, "p-1").style.textAlign).toBe("");

    expect(editor.commands.undo().ok).toBe(true);
    expect(contentOf(editable, "p-1").style.textAlign).toBe("right");
  });

  it("정렬은 화면 표시일 뿐이라 getDocument 결과를 바꾸지 않는다", () => {
    const block: Block = {
      id: "p-1",
      type: "paragraph",
      content: [{ text: "본문" }],
      textAlignment: "justify",
    };
    const { editor } = mountedWith(block);
    expect(editor.getDocument().blocks[0]).toEqual(block);
  });
});
