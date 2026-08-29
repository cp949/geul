/**
 * CodeBlock의 HTML export 형상을 검증한다.
 * source는 plain text로 보존하고 language metadata는 안전한 token일 때만
 * class에 함께 기록한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml } from "../src/index.js";

describe("CodeBlock HTML 내보내기", () => {
  it("source와 안전한 language를 pre·code 요소에 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "code-1",
          type: "codeBlock",
          language: "typescript",
          content: [{ text: "const value = '<tag>';\n\treturn value;" }],
        },
      ],
    };

    expect(exportHtml(document)).toEqual({
      ok: true,
      value:
        '<pre data-be-block-id="code-1"><code data-language="typescript" class="language-typescript">const value = \'&#x3C;tag>\';\n\treturn value;</code></pre>',
    });
  });

  it("공백 포함 language는 data-language에만 exact 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "code-unsafe-language",
          type: "codeBlock",
          language: 'C# "Template"',
          content: [],
        },
      ],
    };

    expect(exportHtml(document)).toEqual({
      ok: true,
      value:
        '<pre data-be-block-id="code-unsafe-language"><code data-language="C# &#x22;Template&#x22;"></code></pre>',
    });
  });

  it("language가 없으면 language metadata를 생략한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "code-plain", type: "codeBlock", content: [{ text: "plain" }] },
      ],
    };

    expect(exportHtml(document)).toEqual({
      ok: true,
      value: '<pre data-be-block-id="code-plain"><code>plain</code></pre>',
    });
  });
});
