/**
 * importHtml이 무효 language 후보를 없는 것으로 보고 경고하는지 다룬다(Issue #353).
 * 무효 후보는 제어문자·짝 없는 surrogate가 든 `data-language`와 `language-*` class다.
 *
 * - 무효 후보는 선택에서 빠지고 나머지 후보에서 고른다. 문서를 거절하지 않는다.
 * - 빠진 후보마다 `UNSAFE_ATTRIBUTE_REMOVED`를 낸다. 같은 노드의 같은 속성은 한 번이다.
 * - 경고 attribute는 hast 속성 이름(`dataLanguage`, `className`)이다.
 * - 무효 후보는 `CODE_BLOCK_LANGUAGE_METADATA_IGNORED` 판정에 들지 않는다.
 * - 입력의 제어문자는 `&#1;`·`&#x7f;` 엔티티로 쓴다.
 */
import type { DocumentBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

const imported = (html: string) => {
  const result = importHtml(html);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/** 블록 트리에서 codeBlock을 문서 순서대로 모은다. */
const codeBlocksOf = (blocks: readonly DocumentBlock[]): DocumentBlock[] =>
  blocks.flatMap((block) => [
    ...(block.type === "codeBlock" ? [block] : []),
    ...("children" in block ? codeBlocksOf(block.children ?? []) : []),
  ]);

const attributeWarning = (element: string, attribute: string) => ({
  kind: "UNSAFE_ATTRIBUTE_REMOVED",
  element,
  attribute,
  message: `Unsupported ${attribute} attribute was removed from ${element}`,
});

describe("importHtml 무효 language 후보", () => {
  it.each([
    [
      "bare pre의 data-language",
      '<pre data-language="bad&#x7f;">x</pre>',
      "pre",
      "dataLanguage",
    ],
    [
      "pre > code의 data-language",
      '<pre><code data-language="a&#1;b">x</code></pre>',
      "code",
      "dataLanguage",
    ],
    [
      "pre의 language class",
      '<pre class="language-a&#1;b">x</pre>',
      "pre",
      "className",
    ],
    [
      "li 안 pre의 data-language",
      '<ul><li><pre data-language="a&#1;b">x</pre></li></ul>',
      "pre",
      "dataLanguage",
    ],
    [
      "figure 안 pre의 data-language",
      '<figure><pre data-language="a&#1;b">x</pre></figure>',
      "pre",
      "dataLanguage",
    ],
  ])(
    "%s는 거절하지 않고 language 없는 codeBlock과 경고 1건을 낸다",
    (_name, html, element, attribute) => {
      const { document, warnings } = imported(html);

      const codeBlocks = codeBlocksOf(document.blocks);
      expect(codeBlocks).toEqual([
        expect.objectContaining({
          type: "codeBlock",
          content: [{ text: "x" }],
        }),
      ]);
      expect(codeBlocks[0]).not.toHaveProperty("language");
      expect(warnings).toEqual([attributeWarning(element, attribute)]);
    },
  );

  it("무효 data-language와 유효 class가 함께면 class를 쓰고 data-language만 경고한다", () => {
    const { document, warnings } = imported(
      '<pre data-language="a&#1;b" class="language-js">x</pre>',
    );

    expect(document.blocks).toEqual([
      {
        id: "html-1",
        type: "codeBlock",
        language: "javascript",
        content: [{ text: "x" }],
      },
    ]);
    expect(warnings).toEqual([attributeWarning("pre", "dataLanguage")]);
  });

  it("우선 선택된 code의 무효 data-language를 건너뛰고 pre의 유효 값을 쓴다", () => {
    const { document, warnings } = imported(
      '<pre data-language="valid"><code data-language="bad&#x7f;">source</code></pre>',
    );

    expect(document.blocks).toEqual([
      {
        id: "html-1",
        type: "codeBlock",
        language: "valid",
        content: [{ text: "source" }],
      },
    ]);
    expect(warnings).toEqual([attributeWarning("code", "dataLanguage")]);
  });

  it("한 class의 무효 토큰이 둘이어도 경고는 한 건이다", () => {
    const { document, warnings } = imported(
      '<pre class="language-a&#1; language-b&#2;">x</pre>',
    );

    expect(document.blocks).toEqual([
      { id: "html-1", type: "codeBlock", content: [{ text: "x" }] },
    ]);
    expect(warnings).toEqual([attributeWarning("pre", "className")]);
  });

  it("무효 class 토큰 뒤의 유효 토큰을 language로 쓴다", () => {
    const { document, warnings } = imported(
      '<pre class="language-a&#1; language-js">x</pre>',
    );

    expect(document.blocks).toEqual([
      {
        id: "html-1",
        type: "codeBlock",
        language: "javascript",
        content: [{ text: "x" }],
      },
    ]);
    expect(warnings).toEqual([attributeWarning("pre", "className")]);
  });

  it("무효 후보는 CODE_BLOCK_LANGUAGE_METADATA_IGNORED를 더하지 않는다", () => {
    const { warnings } = imported(
      '<pre data-language="ts" class="language-js&#1;"><code data-language="ts" class="language-ts">x</code></pre>',
    );

    expect(warnings).toEqual([attributeWarning("pre", "className")]);
  });

  it("유효 후보끼리 어긋나면 무효 후보 경고와 함께 충돌 경고를 낸다", () => {
    const { warnings } = imported(
      '<pre data-geul-block-id="c1" data-language="a&#1;b" class="language-ts"><code class="language-js">x</code></pre>',
    );

    expect(warnings.map((warning) => warning.kind)).toEqual([
      "UNSAFE_ATTRIBUTE_REMOVED",
      "CODE_BLOCK_LANGUAGE_METADATA_IGNORED",
    ]);
  });

  it("같은 pre 안에서 소스 글자 경고, 무효 language 경고, 충돌 경고 순으로 낸다", () => {
    const { warnings } = imported(
      '<pre data-geul-block-id="c2" data-language="a&#1;b" class="language-ts"><code class="language-js">one&#1;two</code></pre>',
    );

    expect(warnings.map((warning) => warning.kind)).toEqual([
      "UNSAFE_CODE_POINT_REMOVED",
      "UNSAFE_ATTRIBUTE_REMOVED",
      "CODE_BLOCK_LANGUAGE_METADATA_IGNORED",
    ]);
  });
});
