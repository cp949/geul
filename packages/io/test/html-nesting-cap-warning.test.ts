/**
 * HTML import의 깊이 상한(MAX_NESTING_DEPTH) 평탄화 경고를 다룬다.
 *
 * - 상한 깊이의 wrapper·details는 children 컨테이너를 만들 수 없어 평탄화된다.
 * - 컨테이너에 공백뿐이면 잃는 구조가 없으므로 NESTED_CHILDREN_FLATTENED를 내지 않는다.
 * - 요소나 실질 텍스트가 있으면 경고한다.
 * - blockquote·목록은 평탄화 결과 기준으로 판정하며 html-blockquote·html-list-import가 맡는다.
 */
import { MAX_NESTING_DEPTH } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

const wrapperChain = (levels: number, innerHtml: string): string => {
  let html = innerHtml;
  for (let level = levels; level >= 1; level -= 1) {
    html = `<div data-geul-block-id="b${level}"><p data-geul-block-id="p${level}">t${level}</p><div data-geul-children="1">${html}</div></div>`;
  }
  return html;
};

const detailsChain = (levels: number, innerHtml: string): string => {
  let html = innerHtml;
  for (let level = levels; level >= 1; level -= 1) {
    html = `<details data-geul-toggleable="true"><summary>s${level}</summary><div data-geul-children="1">${html}</div></details>`;
  }
  return html;
};

// 다른 경고(상한에서 인식 못 한 details 속성 등)와 섞이지 않게 이 경고만 센다.
const flattenedWarningCount = (html: string): number => {
  const result = importHtml(html);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.warnings.filter(
    (warning) => warning.kind === "NESTED_CHILDREN_FLATTENED",
  ).length;
};

const chains = [
  ["wrapper", wrapperChain],
  ["details", detailsChain],
] as const;

describe.each(chains)("상한 깊이 %s의 평탄화 경고", (_name, build) => {
  it.each([
    ["개행과 들여쓰기", "\n  "],
    ["NBSP", "&nbsp;"],
    ["zero-width space", "\u200b"],
  ])("children 컨테이너에 공백뿐이면(%s) 경고하지 않는다", (_label, inner) => {
    expect(flattenedWarningCount(build(MAX_NESTING_DEPTH, inner))).toBe(0);
  });

  it("children 컨테이너가 비어 있으면 경고하지 않는다", () => {
    expect(flattenedWarningCount(build(MAX_NESTING_DEPTH, ""))).toBe(0);
  });

  it.each([
    ["실질 텍스트", "x"],
    ["문단 요소", "<p>x</p>"],
  ])("children 컨테이너에 %s가 있으면 경고한다", (_label, inner) => {
    expect(flattenedWarningCount(build(MAX_NESTING_DEPTH, inner))).toBe(1);
  });

  it("상한 아래 깊이에서는 공백뿐인 컨테이너도 경고하지 않는다", () => {
    expect(flattenedWarningCount(build(MAX_NESTING_DEPTH - 1, "\n  "))).toBe(0);
  });
});
