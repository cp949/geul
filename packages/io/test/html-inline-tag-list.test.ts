/**
 * 변환기가 마크로 보존하는 인라인 태그 목록과 경고 수집기의 지원 인라인 집합이
 * 같은 목록에서 나오는지 고정한다(Issue #337, #342).
 *
 * - `INLINE_PRESENTATION_TAG_NAMES`의 모든 태그를 `inlineElementPresentation`이
 *   처리한다. 목록 밖 태그는 처리하지 않는다. 목록과 `case`가 갈라지지 않는다.
 * - 경고 수집기는 raw HAST를 읽고 목록의 태그 이름만 공유한다(ADR-0003).
 *   `div`·`li`·`blockquote` 바로 아래 목록 태그는 `SAFE_BLOCK_DOWNGRADED`를
 *   내지 않는다. `span`이 이 목록에 없어 오경고가 났다(#337).
 * - 루트 인라인은 기존 강등 경고 계약을 유지한다.
 * - 목록 밖 인라인 태그는 지원 경계 안에서도 계속 경고한다.
 */
import { describe, expect, it } from "vitest";

import {
  INLINE_PRESENTATION_TAG_NAMES,
  inlineElementPresentation,
} from "../src/html/element-presentation.js";
import type { HtmlElementNode } from "../src/html/inline-content.js";
import { importHtml } from "../src/index.js";

/** 태그마다 `inlineElementPresentation`이 값을 내는 대표 속성이다. */
const representative: Record<string, HtmlElementNode["properties"]> = {
  a: { href: "https://example.com/" },
  strong: {},
  b: {},
  em: {},
  i: {},
  u: {},
  s: {},
  del: {},
  strike: {},
  code: {},
  span: { style: "color:#ff0000" },
  font: { color: "red" },
  mark: {},
};

const element = (
  tagName: string,
  properties: HtmlElementNode["properties"],
): HtmlElementNode => ({ type: "element", tagName, properties, children: [] });

const isEmpty = (
  tagName: string,
  properties: HtmlElementNode["properties"],
) => {
  const { presentation, marks } = inlineElementPresentation(
    element(tagName, properties),
  );
  return Object.keys(presentation).length === 0 && marks.length === 0;
};

const warningsOf = (html: string) => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.warnings.map(
    (warning) =>
      `${warning.kind}:${"element" in warning ? warning.element : ""}`,
  );
};

describe("인라인 태그 목록과 변환기", () => {
  it("대표 속성 표가 목록과 같은 태그를 가진다", () => {
    expect(Object.keys(representative).sort()).toEqual(
      [...INLINE_PRESENTATION_TAG_NAMES].sort(),
    );
  });

  it.each([...INLINE_PRESENTATION_TAG_NAMES])(
    "%s는 변환기가 처리한다",
    (tagName) => {
      expect(isEmpty(tagName, representative[tagName] ?? {})).toBe(false);
    },
  );

  it.each(["sup", "sub", "ins", "small", "label", "abbr", "br", "div", "p"])(
    "목록 밖 %s는 변환기가 처리하지 않는다",
    (tagName) => {
      expect(
        isEmpty(tagName, {
          style: "color:#ff0000;font-weight:bold",
          href: "x",
        }),
      ).toBe(true);
    },
  );

  it("br은 목록에 없다", () => {
    expect(INLINE_PRESENTATION_TAG_NAMES.has("br")).toBe(false);
  });
});

describe("지원 경계 안의 인라인 태그는 경고하지 않는다", () => {
  it.each([
    ["div", "<div><span>x</span></div>"],
    ["li", "<ul><li><span>x</span></li></ul>"],
    ["blockquote", "<blockquote><span>x</span></blockquote>"],
  ])("#337: %s 바로 아래 span", (_boundary, html) => {
    expect(warningsOf(html)).toEqual([]);
  });

  it("div 안의 중첩 span도 경고하지 않는다", () => {
    expect(warningsOf("<div><span><em>x</em></span></div>")).toEqual([]);
  });

  it.each([...INLINE_PRESENTATION_TAG_NAMES])(
    "div 바로 아래 %s는 SAFE_BLOCK_DOWNGRADED를 내지 않는다",
    (tagName) => {
      const attributes = tagName === "a" ? ' href="https://example.com/"' : "";
      expect(
        warningsOf(`<div><${tagName}${attributes}>x</${tagName}></div>`),
      ).not.toContain(`SAFE_BLOCK_DOWNGRADED:${tagName}`);
    },
  );

  it("span 안의 미지원 블록은 em·a와 같이 그 블록 이름으로 경고한다", () => {
    // 이전에는 span이 미지원이라 span 하나로 경고하고 안쪽을 보지 않았다.
    expect(
      warningsOf("<div><span><section>text</section></span></div>"),
    ).toEqual(warningsOf("<div><em><section>text</section></em></div>"));
    expect(
      warningsOf("<div><span><section>text</section></span></div>"),
    ).toEqual(["SAFE_BLOCK_DOWNGRADED:section"]);
  });

  it("br도 경고하지 않는다", () => {
    expect(warningsOf("<ul><li>a<br>b</li></ul>")).toEqual([]);
  });
});

describe("경고를 유지하는 경우", () => {
  it("루트 인라인은 기존대로 강등 경고한다", () => {
    expect(warningsOf("<span>x</span>")).toEqual([
      "SAFE_BLOCK_DOWNGRADED:span",
    ]);
    expect(warningsOf("<em>x</em>")).toContain("SAFE_BLOCK_DOWNGRADED:em");
  });

  it("목록 밖 인라인 태그는 지원 경계 안에서도 경고한다", () => {
    expect(warningsOf("<div><sup>x</sup></div>")).toContain(
      "SAFE_BLOCK_DOWNGRADED:sup",
    );
  });

  it("span의 style 제거 경고는 이전과 같다", () => {
    expect(warningsOf('<div><span onclick="x">x</span></div>')).toEqual(
      expect.arrayContaining(["UNSAFE_ATTRIBUTE_REMOVED:span"]),
    );
  });
});
