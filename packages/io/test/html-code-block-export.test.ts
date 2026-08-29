/**
 * CodeBlock의 HTML export/import 계약을 검증한다.
 * export는 source·language metadata 정규형을 내고, import는 sanitized pre의
 * block 경계·plain-text source·language 우선순위와 오류를 복원한다.
 * document import에만 적용되고 table cell·clipboard 의미를 넓히지 않음도
 * public parser 결과로 고정한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml, parseClipboardTable } from "../src/index.js";

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

describe("CodeBlock HTML 가져오기", () => {
  it("pre·direct code의 sanitized text를 하나의 CodeBlock source로 가져온다", () => {
    expect(
      importHtml(
        '<pre data-be-block-id="code-1"><code>one<strong>two</strong><br>three</code><em>four</em></pre><pre></pre>',
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "code-1",
              type: "codeBlock",
              content: [{ text: "onetwo\nthreefour" }],
            },
            { id: "html-1", type: "codeBlock", content: [] },
          ],
        },
        warnings: [],
      },
    });
  });

  it("wrapper와 quote 안 pre를 인접 문단과 분리된 CodeBlock 경계로 보존한다", () => {
    const result = importHtml(
      "<div>before<pre><code>nested</code></pre>after</div><blockquote><p>quote</p><pre>child</pre></blockquote>",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "before" }],
      },
      {
        id: "html-2",
        type: "codeBlock",
        content: [{ text: "nested" }],
      },
      {
        id: "html-3",
        type: "paragraph",
        content: [{ text: "after" }],
      },
      {
        id: "html-4",
        type: "quote",
        content: [{ text: "quote" }],
        children: [
          {
            id: "html-5",
            type: "codeBlock",
            content: [{ text: "child" }],
          },
        ],
      },
    ]);
  });

  it("direct code·pre의 data-language와 첫 language class token 순서로 language를 선택한다", () => {
    const result = importHtml(
      [
        '<pre data-language="pre-data" class="language-pre-first language-pre-second"><strong><code data-language="descendant-data" class="language-descendant">ignored metadata</code></strong><code data-language="code-data" class="language-code-first language-code-second">A</code></pre>',
        '<pre data-language="pre-data" class="language-pre-class"><code data-language="" class="language-code-class">B</code></pre>',
        '<pre class="plain language-pre-first language-pre-second"><code class="plain language-code-first language-code-second">C</code></pre>',
        '<pre class="plain language-pre-first language-pre-second">D</pre>',
      ].join(""),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "codeBlock",
        language: "code-data",
        content: [{ text: "ignored metadataA" }],
      },
      {
        id: "html-2",
        type: "codeBlock",
        language: "pre-data",
        content: [{ text: "B" }],
      },
      {
        id: "html-3",
        type: "codeBlock",
        language: "code-first",
        content: [{ text: "C" }],
      },
      {
        id: "html-4",
        type: "codeBlock",
        language: "pre-first",
        content: [{ text: "D" }],
      },
    ]);
  });

  it("선택되지 않은 exact metadata가 충돌할 때만 최종 blockId로 경고한다", () => {
    const conflict = importHtml(
      '<pre data-be-block-id="code-conflict" data-language="typescript" class="language-ts"><code data-language="ts" class="language-ts">source</code></pre>',
    );
    expect(conflict).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "code-conflict",
              type: "codeBlock",
              language: "typescript",
              content: [{ text: "source" }],
            },
          ],
        },
        warnings: [
          {
            kind: "CODE_BLOCK_LANGUAGE_METADATA_IGNORED",
            blockId: "code-conflict",
            message:
              "Conflicting CodeBlock language metadata was ignored for block code-conflict",
          },
        ],
      },
    });

    const duplicate = importHtml(
      '<pre data-language="Same" class="language-Same"><code data-language="Same" class="language-Same">source</code></pre>',
    );
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) throw new Error(duplicate.error.message);
    expect(duplicate.value.warnings).toEqual([]);
  });

  it("direct code의 두 번째 language class가 첫 선택값과 충돌하면 최종 blockId로 한 번 경고한다", () => {
    expect(
      importHtml(
        '<pre data-be-block-id="direct-class-conflict"><code class="language-js language-ts">source</code></pre>',
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "direct-class-conflict",
              type: "codeBlock",
              language: "javascript",
              content: [{ text: "source" }],
            },
          ],
        },
        warnings: [
          {
            kind: "CODE_BLOCK_LANGUAGE_METADATA_IGNORED",
            blockId: "direct-class-conflict",
            message:
              "Conflicting CodeBlock language metadata was ignored for block direct-class-conflict",
          },
        ],
      },
    });
  });

  it("pre의 두 번째 language class가 첫 선택값과 충돌하면 최종 blockId로 한 번 경고한다", () => {
    expect(
      importHtml(
        '<pre data-be-block-id="pre-class-conflict" class="language-js language-ts">source</pre>',
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "pre-class-conflict",
              type: "codeBlock",
              language: "javascript",
              content: [{ text: "source" }],
            },
          ],
        },
        warnings: [
          {
            kind: "CODE_BLOCK_LANGUAGE_METADATA_IGNORED",
            blockId: "pre-class-conflict",
            message:
              "Conflicting CodeBlock language metadata was ignored for block pre-class-conflict",
          },
        ],
      },
    });
  });

  it("같은 language class suffix가 중복되면 경고하지 않는다", () => {
    const result = importHtml(
      '<pre data-be-block-id="same-class"><code class="language-js language-js">source</code></pre>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toEqual([
      {
        id: "same-class",
        type: "codeBlock",
        language: "javascript",
        content: [{ text: "source" }],
      },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it("우선 선택된 language나 source의 금지 문자를 fallback·보정 없이 거절한다", () => {
    expect(
      importHtml(
        '<pre data-language="valid"><code data-language="bad&#x7f;">source</code></pre>',
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
    expect(importHtml("<pre>one\u0001two</pre>")).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  it("제거된 raw descendant·주석을 source로 부활시키지 않는다", () => {
    const result = importHtml(
      '<pre><script data-language="raw-language">unsafe()</script><code>safe</code><!--hidden--></pre>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "codeBlock",
        content: [{ text: "safe" }],
      },
    ]);
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_ELEMENT_REMOVED",
          element: "script",
        }),
      ]),
    );
  });

  it("table cell의 pre는 document CodeBlock으로 승격하지 않는다", () => {
    const result = importHtml(
      "<table><tr><td><pre><code>cell</code></pre></td></tr></table>",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toHaveLength(1);
    expect(result.value.document.blocks[0]).toMatchObject({
      type: "table",
      rows: [
        {
          cells: [
            {
              content: [{ text: "cell", marks: [{ type: "code" }] }],
            },
          ],
        },
      ],
    });
  });

  it("parser가 변형하는 NUL CodeBlock source를 HTML_DOCUMENT_INVALID로 거절한다", () => {
    expect(importHtml("<pre><code>before\u0000after</code></pre>")).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "HTML_DOCUMENT_INVALID" }),
    });
  });

  it("clipboard의 pre는 문단 콘텐츠로 남고 CodeBlock segment를 opt-in하지 않는다", () => {
    const result = parseClipboardTable({
      html: "<pre><code>before</code></pre><table><tr><td>A</td></tr></table>",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value[0]).toEqual({
      type: "paragraph",
      content: [{ text: "before", marks: [{ type: "code" }] }],
    });
    expect(result.value[1]).toMatchObject({ type: "table" });
  });
});
