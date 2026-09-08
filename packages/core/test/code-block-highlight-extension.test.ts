/**
 * `CreateEditorOptions.syntaxHighlighter` 배선 계약(spec §3,
 * RD-001-DELTA-01). 동기 `SyntaxHighlighter`를 연결하면 코드 블록에
 * decoration이 그려지고, 연결하지 않으면 기존 동작(plain text)이 무회귀로
 * 유지됨을 고정한다. 비동기 경로·edge case(범위 밖·겹침·거절된 Promise·
 * 미지원 language)는 DELTA-02/03이 다룬다.
 */
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  codeBlockBlock,
  documentOf,
  mountTiptapEditor,
} from "./editor-controller-support.js";

describe("syntaxHighlighter", () => {
  it("동기 함수를 연결하면 지정한 오프셋 범위에 강조 span이 렌더된다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        codeBlockBlock("cb-1", "const x = 1;", "typescript"),
      ),
      syntaxHighlighter: () => [{ from: 0, to: 5, className: "tok-keyword" }],
    });
    const { editable } = mountTiptapEditor(editor);

    const span = editable.querySelector("code span.tok-keyword");
    expect(span?.textContent).toBe("const");
  });

  it("연결하지 않으면 강조 span 없이 plain text로 렌더된다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        codeBlockBlock("cb-1", "const x = 1;", "typescript"),
      ),
    });
    const { editable } = mountTiptapEditor(editor);

    expect(editable.querySelector("code span")).toBeNull();
    expect(editable.querySelector("code")?.textContent).toBe("const x = 1;");
  });
});
