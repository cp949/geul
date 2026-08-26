// @vitest-environment jsdom

/**
 * findElementByAttribute가 속성값으로 DOM 엘리먼트를 정확히 찾는지 확인한다.
 * table-handles.tsx·table-selection-toolbar.tsx·block-side-menu.tsx 세
 * 파일에 반복되던 탐색 로직이 이 함수 하나로 옮겨왔다 — 특히 attribute
 * selector에 값을 직접 보간하면 SyntaxError가 나는 케이스(따옴표·백슬래시가
 * 섞인 id)를 이 함수가 실제로 피하는지가 핵심이다.
 */
import { describe, expect, it } from "vitest";

import { findElementByAttribute } from "../src/find-by-attribute.js";

/**
 * 지정한 태그·속성·값으로 엘리먼트를 만들어 root에 매단다. querySelectorAll이
 * 훑을 후보를 여러 개 준비할 때 반복 호출한다.
 */
const appendElement = (
  root: HTMLElement,
  tagName: string,
  attr: string,
  value: string,
): HTMLElement => {
  const element = document.createElement(tagName);
  element.setAttribute(attr, value);
  root.appendChild(element);
  return element;
};

describe("findElementByAttribute", () => {
  it("tagName을 지정하면 그 태그이면서 값이 일치하는 엘리먼트를 찾는다", () => {
    const root = document.createElement("div");
    appendElement(root, "table", "data-be-block-id", "table-1");
    const target = appendElement(root, "table", "data-be-block-id", "table-2");

    expect(
      findElementByAttribute(root, "table", "data-be-block-id", "table-2"),
    ).toBe(target);
  });

  it("tagName이 null이면 태그와 무관하게 속성값만으로 찾는다", () => {
    const root = document.createElement("div");
    appendElement(root, "span", "data-be-cell-id", "cell-1");
    const target = appendElement(root, "td", "data-be-cell-id", "cell-2");

    expect(
      findElementByAttribute(root, null, "data-be-cell-id", "cell-2"),
    ).toBe(target);
  });

  it("일치하는 엘리먼트가 없으면 null을 반환한다", () => {
    const root = document.createElement("div");
    appendElement(root, "table", "data-be-block-id", "table-1");

    expect(
      findElementByAttribute(root, "table", "data-be-block-id", "missing"),
    ).toBeNull();
  });

  it("값에 따옴표나 백슬래시가 섞여도 SyntaxError 없이 값으로 비교해 찾는다", () => {
    const root = document.createElement("div");
    const weirdId = `id"with\\quote`;
    const target = appendElement(root, "table", "data-be-block-id", weirdId);

    expect(
      findElementByAttribute(root, "table", "data-be-block-id", weirdId),
    ).toBe(target);
  });
});
