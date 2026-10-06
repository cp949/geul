// @vitest-environment jsdom

/**
 * scroll-clip: 중첩 스크롤 컨테이너(overflow auto/scroll/hidden/clip)의 clip
 * 영역을 읽고, 대상 rect가 그 영역과 겹치는지 판정한다. 오버레이가 에디터
 * 바깥(스크롤 컨테이너 바깥)에 그려져도 스크롤로 밀려난 블록의 오버레이가
 * 컨테이너 밖에 떠 있지 않게 하는 공용 판정이다.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  clipSpanToBoxes,
  isPointInClipBoxes,
  isRectInClipBoxes,
  readScrollClipBoxes,
  readViewportBox,
  syncAnchorClipVisibility,
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

describe("readViewportBox", () => {
  // jsdom의 innerWidth·innerHeight는 쓰기 가능한 값 속성이다. 원래 값을 되돌린다.
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  afterEach(() => {
    window.innerWidth = originalWidth;
    window.innerHeight = originalHeight;
  });

  it("owner window의 레이아웃 뷰포트 (0, 0, innerWidth, innerHeight)를 돌려준다", () => {
    window.innerWidth = 800;
    window.innerHeight = 500;
    const element = document.createElement("div");
    document.body.appendChild(element);

    const viewport = readViewportBox(element);

    expect(viewport?.left).toBe(0);
    expect(viewport?.top).toBe(0);
    expect(viewport?.right).toBe(800);
    expect(viewport?.bottom).toBe(500);
  });

  it("스크롤 컨테이너 조상과 무관하게 뷰포트 하나만 돌려준다", () => {
    const { container, inner } = nest("auto");
    stubRect(container, { left: 10, top: 20, width: 100, height: 50 });

    expect(readViewportBox(inner)?.bottom).toBe(window.innerHeight);
  });

  it("owner window가 없는 문서의 요소는 null이다", () => {
    const detached = document.implementation.createHTMLDocument("");
    const element = detached.createElement("div");

    expect(readViewportBox(element)).toBeNull();
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

describe("clipSpanToBoxes", () => {
  const boxes = [box(0, 0, 100, 100)];

  it("clip 영역이 없으면 구간을 그대로 돌려준다", () => {
    const span = { top: -50, bottom: 500 };

    expect(clipSpanToBoxes(span, [])).toBe(span);
  });

  it("영역 안에 완전히 들어오면 그대로다", () => {
    expect(clipSpanToBoxes({ top: 10, bottom: 90 }, boxes)).toEqual({
      top: 10,
      bottom: 90,
    });
  });

  it("일부만 겹치면 영역과의 교집합으로 자른다", () => {
    expect(clipSpanToBoxes({ top: -30, bottom: 50 }, boxes)).toEqual({
      top: 0,
      bottom: 50,
    });
    expect(clipSpanToBoxes({ top: 50, bottom: 150 }, boxes)).toEqual({
      top: 50,
      bottom: 100,
    });
    expect(clipSpanToBoxes({ top: -30, bottom: 150 }, boxes)).toEqual({
      top: 0,
      bottom: 100,
    });
  });

  it("겹치지 않으면 null이다(경계에 닿기만 해도 null)", () => {
    expect(clipSpanToBoxes({ top: 120, bottom: 150 }, boxes)).toBeNull();
    expect(clipSpanToBoxes({ top: -60, bottom: -30 }, boxes)).toBeNull();
    expect(clipSpanToBoxes({ top: 100, bottom: 130 }, boxes)).toBeNull();
  });

  it("중첩된 영역 전부와의 교집합으로 자른다", () => {
    const nested = [box(0, 0, 100, 100), box(0, 40, 100, 100)];

    expect(clipSpanToBoxes({ top: -30, bottom: 150 }, nested)).toEqual({
      top: 40,
      bottom: 100,
    });
    expect(
      clipSpanToBoxes({ top: 0, bottom: 30 }, nested),
      "한 영역과만 겹친다",
    ).toBeNull();
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

describe("isPointInClipBoxes", () => {
  const boxes = [box(0, 0, 100, 100)];

  it("clip 영역이 없으면 항상 보인다", () => {
    expect(isPointInClipBoxes(500, 500, [])).toBe(true);
  });

  it("영역 안의 점은 보이고 경계 위의 점도 보인다", () => {
    expect(isPointInClipBoxes(50, 50, boxes)).toBe(true);
    expect(isPointInClipBoxes(0, 100, boxes)).toBe(true);
  });

  it("영역 밖의 점은 가려진다", () => {
    expect(isPointInClipBoxes(50, 101, boxes)).toBe(false);
    expect(isPointInClipBoxes(50, -1, boxes)).toBe(false);
    expect(isPointInClipBoxes(101, 50, boxes)).toBe(false);
    expect(isPointInClipBoxes(-1, 50, boxes)).toBe(false);
  });

  it("중첩된 영역 전부 안이어야 보인다", () => {
    expect(
      isPointInClipBoxes(10, 10, [box(0, 0, 100, 100), box(50, 50, 100, 100)]),
    ).toBe(false);
  });
});

describe("syncAnchorClipVisibility", () => {
  const boxes = [box(0, 0, 100, 100)];

  it("앵커 점이 영역 안이면 보이고 밖이면 숨긴다(박스가 경계 밖으로 삐져도 보인다)", () => {
    const node = document.createElement("div");
    // 앵커 위쪽에 붙는 popover는 박스가 영역 위로 삐져나올 수 있다.
    stubRect(node, { left: 0, top: -30, width: 50, height: 37 });

    syncAnchorClipVisibility(node, 10, 7, boxes);
    expect(node.style.visibility).toBe("");

    syncAnchorClipVisibility(node, 10, 400, boxes);
    expect(node.style.visibility).toBe("hidden");

    syncAnchorClipVisibility(node, 10, 7, boxes);
    expect(node.style.visibility).toBe("");
  });
});
