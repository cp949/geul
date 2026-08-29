/**
 * HTML/GFM importer 결과를 production core에 무보정으로 load·replace하고,
 * 저장 문서를 다시 HTML/GFM으로 export·re-import하는 통합 경계를 검증한다.
 * importer의 structured Result 실패가 core 호출보다 먼저 처리되는지도 확인한다.
 */
import { describe, expect, it } from "vitest";

import {
  exportHtml,
  exportMarkdown,
  importHtml,
  importMarkdown,
} from "@cp949/geul-io";
import { createEditor } from "../src/index.js";
import {
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
} from "./editor-controller-support.js";

/**
 * importer 성공 결과를 반환한다. 실패한 결과를 core에 넘기는 호출 경로를
 * 만들지 않아 Result 경계가 production assembly 앞에서 유지되는지 보장한다.
 */
const importedDocument = (
  result: ReturnType<typeof importHtml> | ReturnType<typeof importMarkdown>,
) => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.document;
};

describe("CodeBlock importer와 production core 왕복", () => {
  it("HTML import 결과를 createEditor와 replaceDocument가 보정 없이 보존하고 HTML로 왕복한다", () => {
    const imported = importedDocument(
      importHtml(
        '<pre data-be-block-id="html-code"><code data-language="unknown">line 1\n\tline 2</code></pre>',
      ),
    );
    const expected = {
      ...imported,
      blocks: [...imported.blocks, paragraphBlock("html-trailing", "")],
    };
    const editor = createEditor({
      initialDocument: documentOf(paragraphBlock("before", "before")),
      createId: () => "html-trailing",
    });
    mountTiptapEditor(editor);

    expect(editor.replaceDocument(imported)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toEqual({ ...expected, revision: 1 });

    const exported = exportHtml(editor.getDocument());
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);
    expect(importedDocument(importHtml(exported.value)).blocks).toEqual(
      editor.getDocument().blocks,
    );
  });

  it("GFM import 결과를 production core에서 저장하고 strict GFM으로 source·language·LF를 왕복한다", () => {
    const imported = importedDocument(
      importMarkdown("```unknown\nline 1\n\tline 2\n```\n", {
        createId: () => "gfm-code",
      }),
    );
    const editor = createEditor({
      initialDocument: imported,
      createId: () => "gfm-trailing",
    });
    mountTiptapEditor(editor);
    const saved = editor.getDocument();

    expect(saved).toEqual({
      ...imported,
      blocks: [...imported.blocks, paragraphBlock("gfm-trailing", "")],
    });
    const exported = exportMarkdown(saved, { mode: "strict" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);
    expect(
      importedDocument(importMarkdown(exported.value)).blocks[0],
    ).toMatchObject({
      type: "codeBlock",
      language: "unknown",
      content: [{ text: "line 1\n\tline 2" }],
    });
  });

  it("HTML/GFM invalid import는 structured Result 실패로 끝나 core를 호출하지 않는다", () => {
    const invalidHtml = importHtml("<pre>one\u0001two</pre>");
    const invalidMarkdown = importMarkdown("```\n\ud800\n```\n");

    expect(invalidHtml).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
    expect(invalidMarkdown).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_DOCUMENT_INVALID" },
    });
  });
});
