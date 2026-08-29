/**
 * PM 기본 붙여넣기 폴백으로 들어오는 외부 <blockquote>가 03a 시점의 임시
 * 결함(변환 거절→TypeError→에디터 desync) 없이 quote 블록으로 반영되는지
 * 검증한다(DELTA-04 붙여넣기 회귀 이월).
 */
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import { pasteHtml } from "./clipboard-test-support.js";
import {
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

describe("PM 기본 붙여넣기 폴백의 외부 blockquote", () => {
  it("문단 사이 blockquote가 섞인 외부 HTML을 붙여넣으면 throw 없이 quote 블록이 문서에 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    // jsdom dispatchEvent는 리스너 예외를 재던지지 않는다 —
    // expect(() => ...).not.toThrow()는 공허하게 통과한다. window의 전역
    // error 이벤트로 실제 미처리 예외 유무를 잡는다.
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener("error", onError);
    try {
      pasteHtml(editable, "<p>a</p><blockquote>q</blockquote><p>b</p>");

      const blocks = editor.getDocument().blocks;
      const quote = blocks.find((block) => block.type === "quote");
      expect(quote).toBeDefined();
      expect(quote?.content).toEqual([{ text: "q" }]);
      expect(blocks.map((block) => block.id)).toEqual([
        "block-1",
        "id-1",
        "id-2",
      ]);

      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener("error", onError);
    }
  });
});
