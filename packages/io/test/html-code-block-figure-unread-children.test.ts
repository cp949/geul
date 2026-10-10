/**
 * figure가 codeBlock으로 승격되는 조건을 검증한다(Issue #355).
 * 정규형은 요소 자식이 pre 정확히 1개 + figcaption 0–1개인 figure다.
 * 정규형이 아닌 figure는 승격하지 않고 div처럼 자식을 재귀한다.
 * 글자는 문서 순서대로 형제 블록에 남고 경고는 새로 생기지 않는다.
 * pre 자식이 있는 data-geul-media-type figure는 media로 읽지 않는다.
 * 이때 마커 속성 제거 경고는 남는다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

type BlockShape = {
  type: string;
  text: string;
  caption?: string;
  children?: BlockShape[];
};

/**
 * 블록을 type·평문 text(·caption)로 투영한다.
 * id와 마크는 이 테스트의 관심사가 아니다.
 */
const shapeOf = (block: Document["blocks"][number]): BlockShape => {
  const text =
    "content" in block && Array.isArray(block.content)
      ? block.content.map((run) => ("text" in run ? run.text : "")).join("")
      : "";
  const shape: BlockShape = { type: block.type, text };
  if ("caption" in block && typeof block.caption === "string") {
    shape.caption = block.caption;
  }
  if ("children" in block && Array.isArray(block.children)) {
    shape.children = block.children.map(shapeOf);
  }
  return shape;
};

/**
 * html을 가져와 최상위 블록 투영과 경고를 돌려준다.
 */
const importShapes = (html: string) => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return {
    shapes: result.value.document.blocks.map(shapeOf),
    warnings: result.value.warnings,
  };
};

describe("정규형이 아닌 codeBlock figure", () => {
  const cases: ReadonlyArray<{
    title: string;
    html: string;
    expected: BlockShape[];
  }> = [
    {
      title: "pre 뒤 형제 문단을 버리지 않고 문서 순서대로 남긴다",
      html: "<figure><pre>abc</pre><p>LOST?</p></figure>",
      expected: [
        { type: "codeBlock", text: "abc" },
        { type: "paragraph", text: "LOST?" },
      ],
    },
    {
      title:
        "figcaption과 형제 문단이 함께 있으면 caption은 문단이 되고 형제도 남긴다",
      html: "<figure><pre>abc</pre><figcaption>c</figcaption><p>LOST?</p></figure>",
      expected: [
        { type: "codeBlock", text: "abc" },
        { type: "paragraph", text: "c" },
        { type: "paragraph", text: "LOST?" },
      ],
    },
    {
      title: "목록 안 pre 글자를 버리지 않고 목록 뒤 pre와 순서를 지킨다",
      html: "<figure><ul><li><pre>XX</pre></li></ul><pre>abc</pre></figure>",
      expected: [
        {
          type: "bulletListItem",
          text: "",
          children: [{ type: "codeBlock", text: "XX" }],
        },
        { type: "codeBlock", text: "abc" },
      ],
    },
    {
      title: "pre 앞 형제 문단을 버리지 않는다",
      html: "<figure><p>before</p><pre>abc</pre></figure>",
      expected: [
        { type: "paragraph", text: "before" },
        { type: "codeBlock", text: "abc" },
      ],
    },
    {
      title: "pre가 둘이면 각각 codeBlock으로 남긴다",
      html: "<figure><pre>a</pre><pre>b</pre></figure>",
      expected: [
        { type: "codeBlock", text: "a" },
        { type: "codeBlock", text: "b" },
      ],
    },
    {
      title: "pre 뒤 텍스트 노드를 버리지 않고 문단으로 남긴다",
      html: "<figure><pre>a</pre>tail text</figure>",
      expected: [
        { type: "codeBlock", text: "a" },
        { type: "paragraph", text: "tail text" },
      ],
    },
    {
      title: "figcaption이 둘이면 둘 다 문단으로 남긴다",
      html: "<figure><pre>abc</pre><figcaption>c</figcaption><figcaption>d</figcaption></figure>",
      expected: [
        { type: "codeBlock", text: "abc" },
        { type: "paragraph", text: "c" },
        { type: "paragraph", text: "d" },
      ],
    },
  ];

  it.each(cases)("$title", ({ html, expected }) => {
    const { shapes, warnings } = importShapes(html);
    expect(shapes).toEqual(expected);
    expect(warnings).toEqual([]);
  });
});

describe("pre 자식이 있는 media 마커 figure", () => {
  it("img와 pre가 함께 있으면 pre 글자를 버리지 않고 codeBlock으로 남긴다", () => {
    const { shapes, warnings } = importShapes(
      '<figure data-geul-media-type="image"><img src="https://x.test/a.png"><pre>LOST?</pre></figure>',
    );
    expect(shapes.map((shape) => shape.type)).toContain("image");
    expect(shapes).toContainEqual({ type: "codeBlock", text: "LOST?" });
    // 마커는 media로 읽지 않아 쓰이지 않는다. 그 사실을 경고가 알린다.
    expect(warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "figure",
        attribute: "dataGeulMediaType",
      }),
    ]);
  });
});

describe("정규형 codeBlock figure", () => {
  const cases: ReadonlyArray<{
    title: string;
    html: string;
    expected: BlockShape;
  }> = [
    {
      title: "pre 뒤 figcaption은 caption이 된다",
      html: "<figure><pre>abc</pre><figcaption>c</figcaption></figure>",
      expected: { type: "codeBlock", text: "abc", caption: "c" },
    },
    {
      title: "figcaption이 pre보다 앞서도 caption이 된다",
      html: "<figure><figcaption>c</figcaption><pre>abc</pre></figure>",
      expected: { type: "codeBlock", text: "abc", caption: "c" },
    },
    {
      title: "요소 사이 공백 텍스트는 무시한다",
      html: "<figure>\n  <pre>abc</pre>\n  <figcaption>c</figcaption>\n</figure>",
      expected: { type: "codeBlock", text: "abc", caption: "c" },
    },
    {
      // 소스 공백 접기가 지우지 못하는 공백이다. 판정이 직접 무시해야 한다.
      title: "요소 사이 nbsp 텍스트는 무시한다",
      html: "<figure>&nbsp;<pre>abc</pre>&nbsp;<figcaption>c</figcaption></figure>",
      expected: { type: "codeBlock", text: "abc", caption: "c" },
    },
    {
      // data-geul-*가 있으면 소스 공백을 접지 않는다.
      title: "data-geul-* 있는 pre 사이 줄바꿈 텍스트는 무시한다",
      html: '<figure>\n  <pre data-geul-block-id="b1">abc</pre>\n  <figcaption>c</figcaption>\n</figure>',
      expected: { type: "codeBlock", text: "abc", caption: "c" },
    },
    {
      title: "빈 figcaption은 빈 caption으로 남긴다",
      html: "<figure><pre>abc</pre><figcaption></figcaption></figure>",
      expected: { type: "codeBlock", text: "abc", caption: "" },
    },
    {
      title: "figcaption 없는 figure는 caption 없는 codeBlock이다",
      html: "<figure><pre>abc</pre></figure>",
      expected: { type: "codeBlock", text: "abc" },
    },
  ];

  it.each(cases)("$title", ({ html, expected }) => {
    const { shapes, warnings } = importShapes(html);
    expect(shapes).toEqual([expected]);
    expect(warnings).toEqual([]);
  });
});
