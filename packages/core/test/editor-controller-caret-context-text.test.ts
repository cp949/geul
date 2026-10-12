/**
 * `getCaretBlockContext().text`가 hardBreak와 인라인 원소를 구분하는지
 * 고정한다(Issue #385).
 *
 * 이전 값은 `node.textContent`였다. `textContent`는 hardBreak와 인라인
 * custom 원소를 빈 문자열로 센다. `"/\na"`가 `"/a"`로 읽혀 트리거 popup이
 * 줄바꿈 뒤 글자를 질의로 이어 붙였다.
 *
 * 규칙: hardBreak는 `\n`, 그 밖의 인라인 원소는 U+FFFC로 읽는다.
 *
 * 다루는 축:
 * - hardBreak·인라인 원소는 텍스트 사이 위치가 그대로 드러난다.
 * - 인라인 원소만 든 문단도 빈 문자열이 아니다.
 * - 일반 텍스트·마크 텍스트·codeBlock(리터럴 `\n`)은 이전 값과 같다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { CustomInlineContentDefinition } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";

const tag: CustomInlineContentDefinition = {
  render: () => document.createElement("span"),
};

const OBJECT_REPLACEMENT = "\uFFFC";

/** 문서를 마운트하고 `p` 블록의 텍스트 시작에 캐럿을 둔 뒤 컨텍스트를 읽는다. */
const caretContextOf = (initialDocument: Document) => {
  const { editor, tiptap } = mounted(initialDocument, {
    customInlineContent: { myTag: tag },
  });
  tiptap.commands.setTextSelection(contentTextStart(tiptap, "p"));
  return editor.getCaretBlockContext();
};

describe("getCaretBlockContext text — hardBreak·인라인 원소(Issue #385)", () => {
  it("hardBreak는 줄바꿈 문자로 읽는다", () => {
    const context = caretContextOf(
      documentOf(paragraphBlock("p", "a\nb"), paragraphBlock("tail", "t")),
    );

    expect(context?.text).toBe("a\nb");
  });

  it("끝에 hardBreak만 붙은 문단은 끝 줄바꿈을 남긴다", () => {
    const context = caretContextOf(
      documentOf(paragraphBlock("p", "/\n"), paragraphBlock("tail", "t")),
    );

    expect(context?.text).toBe("/\n");
  });

  it("텍스트 사이의 custom 인라인 원소는 U+FFFC로 읽는다", () => {
    const context = caretContextOf(
      documentOf(
        {
          id: "p",
          type: "paragraph",
          content: [
            { text: "a" },
            { type: "custom", customType: "myTag" },
            { text: "b" },
          ],
        },
        paragraphBlock("tail", "t"),
      ),
    );

    expect(context?.text).toBe(`a${OBJECT_REPLACEMENT}b`);
  });

  it("인라인 원소만 든 문단은 빈 문자열이 아니라 U+FFFC 하나다", () => {
    const context = caretContextOf(
      documentOf(
        {
          id: "p",
          type: "paragraph",
          content: [{ type: "custom", customType: "myTag" }],
        },
        paragraphBlock("tail", "t"),
      ),
    );

    expect(context?.text).toBe(OBJECT_REPLACEMENT);
  });

  it("일반 텍스트는 이전 값 그대로다", () => {
    const context = caretContextOf(
      documentOf(paragraphBlock("p", "hello"), paragraphBlock("tail", "t")),
    );

    expect(context).toEqual({
      blockId: "p",
      blockType: { type: "paragraph" },
      text: "hello",
    });
  });

  it("마크가 붙은 텍스트는 마크와 무관하게 이전 값 그대로다", () => {
    const context = caretContextOf(
      documentOf(
        {
          id: "p",
          type: "paragraph",
          content: [
            { text: "he", marks: [{ type: "bold" }] },
            { text: "llo", marks: [{ type: "italic" }] },
          ],
        },
        paragraphBlock("tail", "t"),
      ),
    );

    expect(context?.text).toBe("hello");
  });

  it("codeBlock의 리터럴 줄바꿈은 이전 값 그대로다", () => {
    const context = caretContextOf(
      documentOf(codeBlockBlock("p", "a\nb"), paragraphBlock("tail", "t")),
    );

    expect(context).toEqual({
      blockId: "p",
      blockType: { type: "codeBlock" },
      text: "a\nb",
    });
  });
});
