import type { InlineContent } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { expect } from "vitest";

import { contentTextStart } from "./block-test-support.js";
import { documentOf, mounted } from "./list-item-block-type-support.js";

/** 편집기 PM 문서가 스키마를 통과하는지 확인한다. 위반이면 던진다. */
export const expectDocValid = (tiptap: Editor) => {
  expect(() => tiptap.state.doc.check()).not.toThrow();
};

/** 한 문단 b1(content)을 마운트하고 문자 범위 [from, to)를 선택한다. */
export const mountedParagraph = (
  content: InlineContent,
  from: number,
  to: number = from,
) => {
  const fixture = mounted(documentOf({ id: "b1", type: "paragraph", content }));
  const start = contentTextStart(fixture.tiptap, "b1");
  fixture.tiptap.commands.setTextSelection({
    from: start + from,
    to: start + to,
  });
  return fixture;
};

/** b1의 inline content를 저장 문서 형태로 읽는다. */
export const contentOfB1 = (fixture: ReturnType<typeof mountedParagraph>) => {
  const block = fixture.editor.getBlock("b1");
  return block !== undefined &&
    "content" in block &&
    Array.isArray(block.content)
    ? block.content
    : undefined;
};
