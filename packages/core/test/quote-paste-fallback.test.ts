/**
 * 외부 <blockquote>가 03a 시점의 임시 결함(변환 거절→TypeError→에디터
 * desync) 없이 quote 블록으로 반영되는지 검증한다(DELTA-04 붙여넣기 회귀
 * 이월). 이 시나리오는 RD-004(Issue #38 슬라이스 10)부터 PM 기본 붙여넣기
 * 폴백이 아니라 `ClipboardPasteExtension`이 가로챈다 — `io.importHtml`이
 * 클립보드 HTML 전체를 독립 document로 파싱해 삽입하므로, 캐럿이 있던
 * "seed" 문단에 첫 문단("a")이 병합되지 않고 별도 블록으로 삽입된다(RD-004
 * "## 결정" — 정확히 같은 id 문자열·블록 구조를 요구하지 않는다, "quote
 * 블록 1개·content 보존·에러 없음"이라는 의미만 유지하면 된다). id
 * 시퀀스가 늘어난 이유도 이 구조 변화 때문이다(id-1="a", id-2=quote,
 * id-3="b").
 */
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  pasteHtml,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

describe("ClipboardPasteExtension이 가로챈 외부 blockquote", () => {
  it("문단 사이 blockquote가 섞인 외부 HTML을 붙여넣으면 throw 없이 quote 블록이 문서에 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, "<p>a</p><blockquote>q</blockquote><p>b</p>");

      const blocks = editor.getDocument().blocks;
      const quote = blocks.find((block) => block.type === "quote");
      expect(quote).toBeDefined();
      expect(quote?.content).toEqual([{ text: "q" }]);
      expect(blocks.map((block) => block.id)).toEqual([
        "block-1",
        "id-1",
        "id-2",
        "id-3",
      ]);

      expect(errors).toEqual([]);
    });
  });
});
