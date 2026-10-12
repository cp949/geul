/**
 * isPointerWithinHoverMargins: 오버레이 hover 유지 여백 판정.
 *
 * 블록 거터·미디어 핸들·표 핸들이 "요소 밖이어도 여백 안이면 hover를 유지한다"를
 * 같은 식으로 쓴다. 이 파일은 순수 산술만 겨냥한다. 어느 요소의 rect인지,
 * 여백을 벗어나면 무엇을 지우는지는 각 오버레이 테스트가 소유한다.
 */

import { describe, expect, it } from "vitest";

import {
  isPointerWithinHoverMargins,
  type HoverMargins,
} from "../src/hover-margin.js";

const rect = {
  left: 100,
  right: 300,
  top: 50,
  bottom: 150,
  width: 200,
  height: 100,
};
const none: HoverMargins = { left: 0, right: 0, top: 0, bottom: 0 };

describe("isPointerWithinHoverMargins", () => {
  it("rect 안쪽 점은 여백 0이어도 true다", () => {
    expect(
      isPointerWithinHoverMargins(rect, { clientX: 200, clientY: 100 }, none),
    ).toBe(true);
  });

  it("경계 위의 점은 포함한다", () => {
    const edges = [
      { clientX: 100, clientY: 50 },
      { clientX: 300, clientY: 150 },
    ];
    for (const point of edges) {
      expect(isPointerWithinHoverMargins(rect, point, none)).toBe(true);
    }
  });

  it("방향마다 다른 여백을 각자 적용한다", () => {
    const margins: HoverMargins = { left: 56, right: 0, top: 10, bottom: 20 };
    expect(
      isPointerWithinHoverMargins(rect, { clientX: 44, clientY: 100 }, margins),
    ).toBe(true);
    expect(
      isPointerWithinHoverMargins(rect, { clientX: 43, clientY: 100 }, margins),
    ).toBe(false);
    expect(
      isPointerWithinHoverMargins(
        rect,
        { clientX: 301, clientY: 100 },
        margins,
      ),
    ).toBe(false);
    expect(
      isPointerWithinHoverMargins(rect, { clientX: 200, clientY: 40 }, margins),
    ).toBe(true);
    expect(
      isPointerWithinHoverMargins(rect, { clientX: 200, clientY: 39 }, margins),
    ).toBe(false);
    expect(
      isPointerWithinHoverMargins(
        rect,
        { clientX: 200, clientY: 170 },
        margins,
      ),
    ).toBe(true);
    expect(
      isPointerWithinHoverMargins(
        rect,
        { clientX: 200, clientY: 171 },
        margins,
      ),
    ).toBe(false);
  });

  it("rect가 없으면 false다", () => {
    const point = { clientX: 200, clientY: 100 };
    expect(isPointerWithinHoverMargins(undefined, point, none)).toBe(false);
    expect(isPointerWithinHoverMargins(null, point, none)).toBe(false);
  });

  it("폭이나 높이가 0인 rect는 여백이 커도 false다", () => {
    const big: HoverMargins = { left: 999, right: 999, top: 999, bottom: 999 };
    const point = { clientX: 200, clientY: 100 };
    expect(isPointerWithinHoverMargins({ ...rect, width: 0 }, point, big)).toBe(
      false,
    );
    expect(
      isPointerWithinHoverMargins({ ...rect, height: 0 }, point, big),
    ).toBe(false);
  });
});
