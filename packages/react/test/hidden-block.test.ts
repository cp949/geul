// @vitest-environment jsdom

/**
 * isHiddenBlockElement: 접힌 toggle이 가린 블록을 DOM 표식으로 판정한다(Issue #280).
 *
 * 접힘 decoration은 숨은 blockGroup에 `data-geul-collapsed-hidden`을 붙인다.
 * 이 파일은 표식 유무와 조상 관계만 겨냥한다. 실제 `display: none` 레이아웃은
 * jsdom이 증명하지 못한다 — e2e가 소유한다.
 */

import { afterEach, describe, expect, it } from "vitest";

import { isHiddenBlockElement } from "../src/hidden-block.js";

const mounted: HTMLElement[] = [];

afterEach(() => {
  for (const node of mounted.splice(0)) node.remove();
});

/** html을 body에 붙이고 루트를 돌려준다. afterEach가 제거한다. */
const mountHtml = (html: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  mounted.push(host);
  return host;
};

const byId = (host: HTMLElement, id: string): Element => {
  const found = host.querySelector(`[data-geul-block-id="${id}"]`);
  if (found === null) throw new Error(`블록 ${id}이 없다`);
  return found;
};

describe("isHiddenBlockElement", () => {
  it("표식이 없는 블록은 숨은 블록이 아니다", () => {
    const host = mountHtml(
      '<div data-geul-block-id="a"><p>a</p></div><div data-geul-block-id="b"><p>b</p></div>',
    );

    expect(isHiddenBlockElement(byId(host, "a"))).toBe(false);
    expect(isHiddenBlockElement(byId(host, "b"))).toBe(false);
  });

  it("표식 붙은 blockGroup의 자손 블록은 숨은 블록이다(중첩 깊이 무관)", () => {
    const host = mountHtml(
      '<div data-geul-block-id="toggle"><p>t</p>' +
        '<div data-geul-collapsed-hidden="" style="display: none">' +
        '<div data-geul-block-id="child"><p>c</p>' +
        '<div data-geul-block-id="grandchild"><p>g</p></div></div></div></div>',
    );

    expect(isHiddenBlockElement(byId(host, "child"))).toBe(true);
    expect(isHiddenBlockElement(byId(host, "grandchild"))).toBe(true);
  });

  it("표식 붙은 blockGroup을 가진 toggle의 라벨 블록은 숨은 블록이 아니다(그룹의 조상)", () => {
    const host = mountHtml(
      '<div data-geul-block-id="toggle"><p>t</p>' +
        '<div data-geul-collapsed-hidden=""><div data-geul-block-id="child"><p>c</p></div></div></div>',
    );

    expect(isHiddenBlockElement(byId(host, "toggle"))).toBe(false);
  });

  it("표식 붙은 요소 자신도 숨은 것으로 본다(closest는 자기 자신을 포함)", () => {
    const host = mountHtml(
      '<div data-geul-block-id="x" data-geul-collapsed-hidden=""><p>x</p></div>',
    );

    expect(isHiddenBlockElement(byId(host, "x"))).toBe(true);
  });
});
