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
 *
 * computeDragGuide·computeRangeMoveDragGuide는 접힌 toggle이 가린 블록(rect 0x0,
 * `data-geul-collapsed-hidden` 그룹의 자손)을 드롭 후보에서 뺀다(Issue #280).
 * 이 파일은 stub rect와 표식 속성만으로 후보 선별과 인덱스 정렬을 증명한다.
 * 실제 `display: none` 레이아웃은 e2e가 소유한다.
 */

import { afterEach, describe, expect, it } from "vitest";

import type { DragState } from "../src/block-side-menu-types.js";
import {
  computeDragGuide,
  computeGutterTopOffset,
  computeRangeMoveDragGuide,
} from "../src/block-side-menu-geometry.js";
import { stubRect } from "./mount-editor.js";

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

type BlockSpec =
  { id: string; top: number; height: number } | { id: string; hidden: true };

const mountedRoots: HTMLElement[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.remove();
});

/**
 * 블록을 문서 순서대로 담은 편집기 루트를 만든다. 보이는 블록은 폭 600짜리
 * stub rect를 갖는다. 숨은 블록은 표식 붙은 그룹 안에 두고 rect를 stub하지 않는다.
 * jsdom 기본 rect가 0x0이라 접힘 decoration이 만든 `display: none` 블록과 같다.
 */
const buildRoot = (blocks: readonly BlockSpec[]): HTMLElement => {
  const root = document.createElement("div");
  for (const spec of blocks) {
    const block = document.createElement("div");
    block.setAttribute("data-geul-block-id", spec.id);
    if ("hidden" in spec) {
      const group = document.createElement("div");
      group.setAttribute("data-geul-collapsed-hidden", "");
      group.appendChild(block);
      root.appendChild(group);
    } else {
      stubRect(block, {
        left: 0,
        top: spec.top,
        width: 600,
        height: spec.height,
      });
      root.appendChild(block);
    }
  }
  document.body.appendChild(root);
  mountedRoots.push(root);
  return root;
};

/** 위로 스크롤돼 음수 top을 가진 블록열이다. 접힌 toggle `t` 뒤에 숨은 `h`가 낀다. */
const WITH_HIDDEN: readonly BlockSpec[] = [
  { id: "a", top: -300, height: 40 },
  { id: "t", top: -260, height: 40 },
  { id: "h", hidden: true },
  { id: "b", top: -220, height: 40 },
  { id: "c", top: -20, height: 40 },
];

/** WITH_HIDDEN에서 숨은 블록만 뺀 문서다. 보이는 블록의 rect는 같다. */
const VISIBLE_ONLY: readonly BlockSpec[] = WITH_HIDDEN.filter(
  (spec) => !("hidden" in spec),
);

const dragState = (sourceBlockId: string): DragState => ({
  pointerId: 1,
  sourceBlockId,
  startX: 0,
  startY: 0,
  hasDragged: true,
  cancelled: false,
  guide: null,
  mode: "reorder",
  rangeSelectCandidateBlockId: null,
  rangeSelection: null,
});

describe("computeDragGuide: 숨은 블록은 드롭 후보가 아니다(Issue #280)", () => {
  it("clientY가 음수이고 숨은 블록(rect 0x0)이 낀 문서면 가이드가 폭 0이 아니고 보이는 블록 앞이다", () => {
    const root = buildRoot(WITH_HIDDEN);

    const guide = computeDragGuide(root, -10, dragState("a"));

    expect(guide).toEqual({
      beforeBlockId: "c",
      left: 0,
      top: -20,
      width: 600,
    });
  });

  it("숨은 블록 뒤 보이는 블록이 source여도 인덱스가 어긋나지 않아 같은 자리 드롭은 no-op이다", () => {
    const root = buildRoot(WITH_HIDDEN);

    // clientY -230: t 중앙(-240) 아래, b 중앙(-200) 위. 보이는 블록만 보면 target은 b다.
    expect(computeDragGuide(root, -230, dragState("b"))).toBeNull();
  });
});

describe("computeRangeMoveDragGuide: 숨은 블록은 드롭 후보가 아니다(Issue #280)", () => {
  it("clientY가 음수이고 숨은 블록이 낀 문서면 가이드가 폭 0이 아니고 보이는 블록 앞이다", () => {
    const root = buildRoot(WITH_HIDDEN);

    const guide = computeRangeMoveDragGuide(root, -10, "a", "a");

    expect(guide).toEqual({
      beforeBlockId: "c",
      left: 0,
      top: -20,
      width: 600,
    });
  });
});

describe("숨은 블록이 낀 문서는 보이는 블록만 있는 문서와 같은 가이드를 낸다(Issue #280)", () => {
  const CLIENT_YS = [-310, -270, -230, -190, -10, 500] as const;

  it.each(CLIENT_YS)("computeDragGuide: clientY %d", (clientY) => {
    const withHidden = computeDragGuide(
      buildRoot(WITH_HIDDEN),
      clientY,
      dragState("b"),
    );
    const visibleOnly = computeDragGuide(
      buildRoot(VISIBLE_ONLY),
      clientY,
      dragState("b"),
    );

    expect(withHidden).toEqual(visibleOnly);
  });

  const RANGES = [
    ["a", "t"],
    ["b", "c"],
  ] as const;
  const RANGE_CASES = RANGES.flatMap(([from, to]) =>
    CLIENT_YS.map((clientY) => [clientY, from, to] as const),
  );

  it.each(RANGE_CASES)(
    "computeRangeMoveDragGuide: clientY %d, 범위 %s~%s",
    (clientY, from, to) => {
      const withHidden = computeRangeMoveDragGuide(
        buildRoot(WITH_HIDDEN),
        clientY,
        from,
        to,
      );
      const visibleOnly = computeRangeMoveDragGuide(
        buildRoot(VISIBLE_ONLY),
        clientY,
        from,
        to,
      );

      expect(withHidden).toEqual(visibleOnly);
    },
  );
});
