// @vitest-environment jsdom

/**
 * scroll-clip: 중첩 스크롤 컨테이너(overflow auto/scroll/hidden/clip)의 clip
 * 영역을 읽고, 대상 rect가 그 영역과 겹치는지 판정한다. 오버레이가 에디터
 * 바깥(스크롤 컨테이너 바깥)에 그려져도 스크롤로 밀려난 블록의 오버레이가
 * 컨테이너 밖에 떠 있지 않게 하는 공용 판정이다.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  isRectInClipBoxes,
  readScrollClipBoxes,
  syncClipVisibility,
} from "../src/scroll-clip.js";
import { stubRect } from "./mount-editor.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const box = (left: number, top: number, width: number, height: number) =>
  new DOMRect(left, top, width, height);

// jsdom은 `overflow` 단축 속성을 overflowX/overflowY로 펼치지 않는다 —
// 브라우저가 계산하는 값과 같도록 두 축을 직접 지정한다.
const setOverflow = (element: HTMLElement, overflow: string) => {
  element.style.overflowX = overflow;
  element.style.overflowY = overflow;
};

const nest = (overflow: string) => {
  const container = document.createElement("div");
  setOverflow(container, overflow);
  const inner = document.createElement("div");
  container.appendChild(inner);
  document.body.appendChild(container);
  return { container, inner };
};

describe("readScrollClipBoxes", () => {
  it.each(["auto", "scroll", "hidden", "clip"])(
    "overflow: %s 조상의 rect를 돌려준다",
    (overflow) => {
      const { container, inner } = nest(overflow);
      stubRect(container, { left: 10, top: 20, width: 100, height: 50 });

      const boxes = readScrollClipBoxes(inner);

      expect(boxes).toHaveLength(1);
      expect(boxes[0]?.top).toBe(20);
      expect(boxes[0]?.bottom).toBe(70);
    },
  );

  it("overflow: visible 조상은 건너뛴다", () => {
    const { inner } = nest("visible");

    expect(readScrollClipBoxes(inner)).toEqual([]);
  });

  it("시작 요소 자신이 스크롤 컨테이너면 그 rect도 포함한다", () => {
    const { container } = nest("auto");
    stubRect(container, { left: 0, top: 0, width: 100, height: 50 });

    expect(readScrollClipBoxes(container)).toHaveLength(1);
  });

  it("body와 html은 건너뛴다(창 스크롤은 page-relative 좌표가 이미 따라간다)", () => {
    setOverflow(document.documentElement, "auto");
    setOverflow(document.body, "auto");
    const { inner } = nest("visible");

    try {
      expect(readScrollClipBoxes(inner)).toEqual([]);
    } finally {
      setOverflow(document.documentElement, "");
      setOverflow(document.body, "");
    }
  });
});

describe("isRectInClipBoxes", () => {
  const boxes = [box(0, 0, 100, 100)];

  it("clip 영역이 없으면 항상 보인다", () => {
    expect(isRectInClipBoxes(box(500, 500, 10, 10), [])).toBe(true);
  });

  it("영역 안에 완전히 들어오면 보인다", () => {
    expect(isRectInClipBoxes(box(10, 10, 20, 20), boxes)).toBe(true);
  });

  it("경계에 딱 맞게 들어와도 보인다", () => {
    expect(isRectInClipBoxes(box(0, 80, 20, 20), boxes)).toBe(true);
  });

  it("세로로 일부라도 벗어나면 가려진다(경계에 걸쳐 잘린 채 떠 있지 않는다)", () => {
    expect(isRectInClipBoxes(box(0, 90, 20, 20), boxes)).toBe(false);
    expect(isRectInClipBoxes(box(0, -10, 20, 20), boxes)).toBe(false);
  });

  it("영역 아래·위로 완전히 벗어나면 가려진다", () => {
    expect(isRectInClipBoxes(box(0, 100, 20, 20), boxes)).toBe(false);
    expect(isRectInClipBoxes(box(0, -30, 20, 20), boxes)).toBe(false);
  });

  it("가로는 겹치기만 하면 보인다(핸들·툴바가 모서리에 걸친다)", () => {
    expect(isRectInClipBoxes(box(90, 10, 20, 20), boxes)).toBe(true);
    expect(isRectInClipBoxes(box(-10, 10, 20, 20), boxes)).toBe(true);
  });

  it("가로로 완전히 벗어나면 가려진다", () => {
    expect(isRectInClipBoxes(box(100, 10, 20, 20), boxes)).toBe(false);
    expect(isRectInClipBoxes(box(-20, 10, 20, 20), boxes)).toBe(false);
  });

  it("중첩된 영역 전부를 만족해야 보인다", () => {
    expect(
      isRectInClipBoxes(box(0, 0, 20, 20), [
        box(0, 0, 100, 100),
        box(50, 50, 100, 100),
      ]),
    ).toBe(false);
  });
});

describe("syncClipVisibility", () => {
  const boxes = [box(0, 0, 100, 100)];
  const nodeAt = (top: number) => {
    const node = document.createElement("div");
    stubRect(node, { left: 0, top, width: 20, height: 20 });
    return node;
  };

  it("영역 안이면 visibility를 비우고 밖이면 hidden으로 만든다", () => {
    const node = nodeAt(10);

    syncClipVisibility(node, boxes, false);
    expect(node.style.visibility).toBe("");

    stubRect(node, { left: 0, top: 300, width: 20, height: 20 });
    syncClipVisibility(node, boxes, false);
    expect(node.style.visibility).toBe("hidden");

    stubRect(node, { left: 0, top: 10, width: 20, height: 20 });
    syncClipVisibility(node, boxes, false);
    expect(node.style.visibility).toBe("");
  });

  it("exempt면 영역 밖이어도 보인다(편집 중 입력을 유지한다)", () => {
    const node = nodeAt(300);

    syncClipVisibility(node, boxes, true);

    expect(node.style.visibility).toBe("");
  });
});
