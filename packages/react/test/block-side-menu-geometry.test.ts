// @vitest-environment jsdom

/**
 * block-side-menu-geometry.ts의 순수 판독 함수를 직접 겨냥한 스위트
 * (table-handle-geometry.test.ts와 같은 층위 분리, ADR-0007).
 *
 * computeGutterTopOffset의 입력인 getComputedStyle(heading).lineHeight는
 * 실제로는 CSS 캐스케이드(`.geul-editor h1 { font-size: 2rem }` + 상속된
 * `line-height: 1.6`)가 계산한 값이다 — 이 파일의 unit test는 jsdom이
 * inline style을 그대로 반영하는 경로(실측 확인)로 "이미 계산된
 * line-height 문자열이 주어졌을 때 오프셋 산출이 맞는가"만 증명한다.
 * "실제 브라우저에서 h1의 line-height가 51.2px로 계산되고, 그 결과
 * 거터가 실제로 첫 줄 중앙에 온다"는 사실은 이 계층이 증명할 수 없다
 * (ADR-0007의 "CSS 캐스케이드와 계산 스타일" 범주) —
 * e2e/heading-quote-divider.spec.ts의 회귀 테스트가 소유한다.
 */

import { describe, expect, it } from "vitest";

import { computeGutterTopOffset } from "../src/block-side-menu-geometry.js";

/** heading은 blockContainer(wrapper div)의 첫 자식이다(D19, block-container-extension.ts). */
const buildWrapper = (contentTag: string, lineHeight?: string): HTMLElement => {
  const wrapper = document.createElement("div");
  const content = document.createElement(contentTag);
  if (lineHeight !== undefined) content.style.lineHeight = lineHeight;
  wrapper.appendChild(content);
  return wrapper;
};

describe("computeGutterTopOffset", () => {
  it("h1처럼 line-height가 버튼(24px)보다 큰 heading은 그 차이의 절반만큼 내린다(사용자 스크린샷 재현)", () => {
    const wrapper = buildWrapper("h1", "51.2px");
    expect(computeGutterTopOffset(wrapper)).toBeCloseTo(13.6, 5);
  });

  it("h6처럼 line-height가 버튼보다 작은 heading은 음수 대신 0으로 클램프한다", () => {
    const wrapper = buildWrapper("h6", "20px");
    expect(computeGutterTopOffset(wrapper)).toBe(0);
  });

  it("heading이 아닌 첫 자식(p)은 line-height가 커도 오프셋 0을 유지한다(이 DELTA 범위는 heading뿐)", () => {
    const wrapper = buildWrapper("p", "51.2px");
    expect(computeGutterTopOffset(wrapper)).toBe(0);
  });

  it("첫 자식이 없으면(atom 블록 등) 오프셋 0을 돌려준다", () => {
    const wrapper = document.createElement("div");
    expect(computeGutterTopOffset(wrapper)).toBe(0);
  });

  it("line-height를 숫자로 못 읽으면(계산 스타일 부재) 오프셋 0을 돌려준다", () => {
    const wrapper = buildWrapper("h1");
    expect(computeGutterTopOffset(wrapper)).toBe(0);
  });
});
