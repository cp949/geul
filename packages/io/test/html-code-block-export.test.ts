/**
 * CodeBlock의 HTML export/import 계약을 검증한다.
 * export는 source·language metadata 정규형을 내고, import는 sanitized pre의
 * block 경계·plain-text source·language 우선순위와 오류를 복원한다.
 * document import에만 적용되고 table cell·clipboard 의미를 넓히지 않음도
 * public parser 결과로 고정한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it, vi } from "vitest";

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
        '<pre data-geul-block-id="code-1"><code data-language="typescript" class="language-typescript">const value = \'&#x3C;tag>\';\n\treturn value;</code></pre>',
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
        '<pre data-geul-block-id="code-unsafe-language"><code data-language="C# &#x22;Template&#x22;"></code></pre>',
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
      value: '<pre data-geul-block-id="code-plain"><code>plain</code></pre>',
    });
  });

  it("syntaxHighlighter로 강조 span을 포함해 export한다(Issue #172, spec §10)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "code-hl",
          type: "codeBlock",
          language: "typescript",
          content: [{ text: "let x = 1;" }],
        },
      ],
    };

    expect(
      exportHtml(document, {
        syntaxHighlighter: () => [{ from: 0, to: 3, className: "keyword" }],
      }),
    ).toEqual({
      ok: true,
      value:
        '<pre data-geul-block-id="code-hl"><code data-language="typescript" class="language-typescript"><span class="keyword">let</span> x = 1;</code></pre>',
    });
  });

  it("syntaxHighlighter가 빈 배열을 반환하면(미지원 언어) plain과 동일하게 export한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "code-empty", type: "codeBlock", content: [{ text: "plain" }] },
      ],
    };

    expect(exportHtml(document, { syntaxHighlighter: () => [] })).toEqual({
      ok: true,
      value: '<pre data-geul-block-id="code-empty"><code>plain</code></pre>',
    });
  });

  it("syntaxHighlighter가 Promise를 반환하면 해당 블록만 plain으로 export하고 console.warn을 낸다(ADR-0016)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "code-async",
          type: "codeBlock",
          content: [{ text: "async source" }],
        },
      ],
    };

    const result = exportHtml(document, {
      syntaxHighlighter: () =>
        Promise.resolve([{ from: 0, to: 5, className: "keyword" }]),
    });

    expect(result).toEqual({
      ok: true,
      value:
        '<pre data-geul-block-id="code-async"><code>async source</code></pre>',
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("겹치는 token은 먼저 온 token이 구간을 차지하고 크래시하지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "code-overlap",
          type: "codeBlock",
          content: [{ text: "abcdef" }],
        },
      ],
    };

    expect(
      exportHtml(document, {
        syntaxHighlighter: () => [
          { from: 0, to: 4, className: "first" },
          { from: 2, to: 6, className: "second" },
        ],
      }),
    ).toEqual({
      ok: true,
      value:
        '<pre data-geul-block-id="code-overlap"><code><span class="first">abcd</span><span class="second">ef</span></code></pre>',
    });
  });

  it("quote children 안에 중첩된 codeBlock도 강조한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "quote-1",
          type: "quote",
          content: [],
          children: [
            {
              id: "code-nested",
              type: "codeBlock",
              content: [{ text: "nested" }],
            },
          ],
        },
      ],
    };

    const result = exportHtml(document, {
      syntaxHighlighter: () => [{ from: 0, to: 6, className: "tok" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value).toContain(
      '<pre data-geul-block-id="code-nested"><code><span class="tok">nested</span></code></pre>',
    );
  });
});

describe("CodeBlock HTML 강조 export → import round-trip", () => {
  it("강조 span이 포함된 export 결과를 다시 가져오면 원본 source·language·id가 복원된다(Issue #172)", () => {
    // codeBlock 모델(content: text*, marks: "")은 문자 단위 스타일을 저장하지
    // 않으므로 span의 class는 import sanitizer가 제거한다 — span 자체는
    // 허용 태그라 텍스트는 그대로 보존된다. 이 제거는 일반 sanitize 경고
    // 채널(UNSAFE_ATTRIBUTE_REMOVED)을 그대로 타므로, 강조 span 개수만큼
    // 경고가 난다(spec §10 "import 쪽" — 조용하지 않다, 사용자 확정 결정).
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "code-roundtrip",
          type: "codeBlock",
          language: "typescript",
          content: [{ text: "let x = 1;\nconst y = 2;" }],
        },
      ],
    };

    const exported = exportHtml(document, {
      syntaxHighlighter: () => [
        { from: 0, to: 3, className: "keyword" },
        { from: 12, to: 17, className: "keyword" },
      ],
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain('<span class="keyword">');

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: {
        document,
        warnings: [
          {
            kind: "UNSAFE_ATTRIBUTE_REMOVED",
            element: "span",
            attribute: "className",
            message: "Unsupported className attribute was removed from span",
          },
          {
            kind: "UNSAFE_ATTRIBUTE_REMOVED",
            element: "span",
            attribute: "className",
            message: "Unsupported className attribute was removed from span",
          },
        ],
      },
    });
  });
});

describe("CodeBlock HTML 가져오기", () => {
  it("pre·direct code의 sanitized text를 하나의 CodeBlock source로 가져온다", () => {
    expect(
      importHtml(
        '<pre data-geul-block-id="code-1"><code>one<strong>two</strong><br>three</code><em>four</em></pre><pre></pre>',
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
      '<pre data-geul-block-id="code-conflict" data-language="typescript" class="language-ts"><code data-language="ts" class="language-ts">source</code></pre>',
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
        '<pre data-geul-block-id="direct-class-conflict"><code class="language-js language-ts">source</code></pre>',
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
        '<pre data-geul-block-id="pre-class-conflict" class="language-js language-ts">source</pre>',
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
      '<pre data-geul-block-id="same-class"><code class="language-js language-js">source</code></pre>',
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
