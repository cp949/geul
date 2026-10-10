/**
 * `importHtml`이 `pre` 안 무효 문자를 문서 거절 없이 지우고 경고하는지 검증한다(Issue #352).
 *
 * - 이전에는 `pre` 안 CR(`&#13;`)·C0 제어문자·NUL이 `HTML_DOCUMENT_INVALID`로 문서 전체를 거절했다.
 * - 이제 무효 문자를 지운 `codeBlock`을 만들고 `UNSAFE_CODE_POINT_REMOVED` 경고를 낸다.
 * - 정제 규칙은 model의 `sanitizeCodeBlockSource`다. CR은 줄바꿈으로 바꾸지 않고 지운다.
 * - bare `pre`, `pre > code`, `figure` 안 `pre`, 목록 항목 안 `pre`를 모두 고정한다.
 * - 경고 `element`는 텍스트의 부모 태그다. bare `pre`는 `pre`, `pre > code`는 `code`다.
 * - Tab·LF만 든 `pre`와 무효 문자 없는 `pre`는 결과와 경고가 이전과 같다.
 * - 표 안 `pre`의 기존 경고 동작은 그대로다.
 * - `data-language`의 무효 문자는 이번 범위 밖이라 여전히 문서를 거절한다.
 */
import {
  type DocumentBlock,
  isValidCodeBlockSource,
  type InlineContent,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

/** 성공한 import 결과를 돌려준다. 실패하면 테스트를 실패시킨다. */
const imported = (html: string) => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/** content에서 글자만 이어 붙인다. */
const textOf = (content: InlineContent): string =>
  content.map((item) => ("text" in item ? item.text : "")).join("");

/** 블록 트리에서 codeBlock 글자를 문서 순서대로 모은다. */
const codeTexts = (blocks: readonly DocumentBlock[]): string[] =>
  blocks.flatMap((block) => [
    ...(block.type === "codeBlock" && Array.isArray(block.content)
      ? [textOf(block.content)]
      : []),
    ...("children" in block ? codeTexts(block.children ?? []) : []),
  ]);

const REMOVED = "UNSAFE_CODE_POINT_REMOVED";

describe("importHtml pre 안 무효 문자(Issue #352)", () => {
  it.each([
    ["CR 참조", "<pre>a&#13;b</pre>"],
    ["C0 참조", "<pre>a&#1;b</pre>"],
    ["DEL 참조", "<pre>a&#127;b</pre>"],
    ["목록 항목 안 CR 참조", "<ul><li><pre>a&#13;b</pre></li></ul>"],
    ["pre 안 code의 C0 참조", "<pre><code>a&#1;b</code></pre>"],
    [
      "figure 안 pre의 C0 참조",
      "<figure><pre>a&#1;b</pre><figcaption>c</figcaption></figure>",
    ],
    ["NUL 원문", "<pre>a\u0000b</pre>"],
    ["C0 원문", "<pre>a\u0001b</pre>"],
  ])("%s는 거절하지 않고 무효 문자를 지운다", (_name, html) => {
    const value = imported(html);

    expect(codeTexts(value.document.blocks)).toEqual(["ab"]);
    for (const text of codeTexts(value.document.blocks)) {
      expect(isValidCodeBlockSource(text)).toBe(true);
    }
  });

  it("bare pre의 CR은 줄바꿈으로 바꾸지 않고 지우며 경고 element는 pre다", () => {
    const value = imported("<pre>a&#13;b</pre>");

    expect(value.document.blocks).toEqual([
      { id: "html-1", type: "codeBlock", content: [{ text: "ab" }] },
    ]);
    expect(value.warnings).toEqual([
      expect.objectContaining({ kind: REMOVED, element: "pre" }),
    ]);
  });

  it("pre 안 code의 경고 element는 code다", () => {
    const value = imported("<pre><code>a&#1;b</code></pre>");

    expect(value.warnings).toEqual([
      expect.objectContaining({ kind: REMOVED, element: "code" }),
    ]);
  });

  it.each([
    ["목록 항목 안 pre", "<ul><li><pre>a&#13;b</pre></li></ul>"],
    [
      "figure 안 pre",
      "<figure><pre>a&#1;b</pre><figcaption>c</figcaption></figure>",
    ],
    ["NUL 원문", "<pre>a\u0000b</pre>"],
  ])("%s도 UNSAFE_CODE_POINT_REMOVED 경고를 한 번 낸다", (_name, html) => {
    const warnings = imported(html).warnings.filter(
      (warning) => warning.kind === REMOVED,
    );

    expect(warnings).toHaveLength(1);
  });

  it("정제 뒤 빈 글자가 되는 pre는 빈 codeBlock과 경고를 낸다", () => {
    const value = imported("<pre>&#1;&#13;</pre>");

    expect(value.document.blocks).toEqual([
      { id: "html-1", type: "codeBlock", content: [] },
    ]);
    expect(value.warnings).toEqual([
      expect.objectContaining({ kind: REMOVED, element: "pre" }),
    ]);
  });

  it("Tab 사이 무효 문자만 지우고 Tab과 LF를 남긴다", () => {
    const value = imported("<pre>a&#9;&#1;&#9;b\nc</pre>");

    expect(codeTexts(value.document.blocks)).toEqual(["a\t\tb\nc"]);
  });

  it("짝 없는 surrogate 참조는 파서가 U+FFFD로 바꿔 유효 입력이고 경고가 없다", () => {
    const value = imported("<pre>a&#xD800;b</pre>");

    expect(codeTexts(value.document.blocks)).toEqual(["a�b"]);
    expect(value.warnings).toEqual([]);
  });

  it.each([
    ["Tab과 LF만 든 pre", "<pre>a\tb\nc</pre>", "a\tb\nc"],
    ["무효 문자 없는 pre", "<pre>plain</pre>", "plain"],
    ["pre 안 code", "<pre><code>x\ty</code></pre>", "x\ty"],
  ])("%s는 결과가 같고 경고가 없다", (_name, html, expected) => {
    const value = imported(html);

    expect(codeTexts(value.document.blocks)).toEqual([expected]);
    expect(value.warnings).toEqual([]);
  });

  it("표 안 pre의 기존 경고 동작은 그대로다", () => {
    const value = imported(
      "<table><tbody><tr><td><pre>a&#1;b</pre></td></tr></tbody></table>",
    );

    expect(value.warnings).toEqual([
      expect.objectContaining({ kind: REMOVED, element: "pre" }),
    ]);
  });

  it("data-language의 무효 문자는 여전히 문서를 거절한다", () => {
    expect(
      importHtml('<pre data-language="bad&#x7f;">source</pre>'),
    ).toMatchObject({ ok: false, error: { code: "HTML_DOCUMENT_INVALID" } });
  });
});
