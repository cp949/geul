// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClampAnchor } from "../src/use-clamped-menu-position.js";
import { useClampedMenuPosition } from "../src/use-clamped-menu-position.js";

type ProbeProps = {
  left: number;
  top: number;
  anchor?: ClampAnchor;
};

const Probe = ({ left, top, anchor }: ProbeProps) => {
  const { menuRef, style } = useClampedMenuPosition(left, top, anchor);
  const renders = useRef(0);
  renders.current += 1;
  return (
    <div
      data-left={style.left}
      data-renders={renders.current}
      data-testid="probe"
      data-top={style.top}
      ref={menuRef}
    />
  );
};

const stubMenuRect = (width: number, height: number) => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect);
};

const stubViewport = (width: number, height: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
};

type ResizeObserverStub = {
  callbacks: ResizeObserverCallback[];
  disconnected: number;
  observed: Element[];
};

/**
 * jsdom에는 ResizeObserver가 없다. 훅이 박스 크기 변화에 반응하는지 보려면
 * 콜백을 직접 붙잡아 수동으로 호출할 수 있는 가짜를 심어야 한다.
 */
const stubResizeObserver = (): ResizeObserverStub => {
  const state: ResizeObserverStub = {
    callbacks: [],
    disconnected: 0,
    observed: [],
  };
  class FakeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      state.callbacks.push(callback);
    }
    disconnect() {
      state.disconnected += 1;
    }
    observe(target: Element) {
      state.observed.push(target);
    }
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  return state;
};

const notifyResize = (stub: ResizeObserverStub) => {
  act(() => {
    for (const callback of stub.callbacks) {
      callback([], null as unknown as ResizeObserver);
    }
  });
};

type VisualViewportListeners = Record<string, Array<() => void>>;

type VisualViewportStub = {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
  listeners: VisualViewportListeners;
  addEventListener: (type: string, callback: () => void) => void;
  removeEventListener: (type: string, callback: () => void) => void;
};

/**
 * jsdom에는 visualViewport가 없다. 가상 키보드는 innerWidth/innerHeight를
 * 거의 바꾸지 않고 visualViewport만 줄이므로(레이아웃 뷰포트와 분리), 훅이
 * 그 축소를 실제로 참조하는지 보려면 최소 EventTarget 계약을 흉내 낸
 * 가짜가 필요하다.
 */
const stubVisualViewport = (bounds: {
  offsetLeft?: number;
  offsetTop?: number;
  width: number;
  height: number;
}): VisualViewportStub => {
  const listeners: VisualViewportListeners = { resize: [], scroll: [] };
  const stub: VisualViewportStub = {
    offsetLeft: bounds.offsetLeft ?? 0,
    offsetTop: bounds.offsetTop ?? 0,
    width: bounds.width,
    height: bounds.height,
    listeners,
    addEventListener: (type, callback) => {
      (listeners[type] ??= []).push(callback);
    },
    removeEventListener: (type, callback) => {
      listeners[type] = (listeners[type] ?? []).filter(
        (registered) => registered !== callback,
      );
    },
  };
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: stub,
  });
  return stub;
};

const notifyVisualViewport = (
  stub: VisualViewportStub,
  type: "resize" | "scroll",
) => {
  act(() => {
    for (const callback of stub.listeners[type] ?? []) callback();
  });
};

beforeEach(() => {
  stubViewport(1000, 800);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "visualViewport");
});

describe("useClampedMenuPosition", () => {
  it("메뉴가 뷰포트 여백 안에 들어가면 좌표를 그대로 쓴다", () => {
    stubMenuRect(200, 100);

    const { getByTestId } = render(<Probe left={100} top={100} />);
    const probe = getByTestId("probe");

    expect(probe.dataset.left).toBe("100");
    expect(probe.dataset.top).toBe("100");
  });

  it("뷰포트 오른쪽/아래로 넘치면 여백(8px) 안으로 접는다", () => {
    stubMenuRect(300, 400);

    const { getByTestId } = render(<Probe left={900} top={700} />);
    const probe = getByTestId("probe");

    // maxLeft = 1000 - 300 - 8 = 692, maxTop = 800 - 400 - 8 = 392
    expect(probe.dataset.left).toBe("692");
    expect(probe.dataset.top).toBe("392");
  });

  it("좌표가 음수면 최소 여백(8px)까지 끌어올린다", () => {
    stubMenuRect(50, 50);

    const { getByTestId } = render(<Probe left={-20} top={-20} />);
    const probe = getByTestId("probe");

    expect(probe.dataset.left).toBe("8");
    expect(probe.dataset.top).toBe("8");
  });

  it("메뉴가 뷰포트보다 크면 여백(8px)까지만 허용한다", () => {
    stubMenuRect(1200, 900);

    const { getByTestId } = render(<Probe left={50} top={50} />);
    const probe = getByTestId("probe");

    expect(probe.dataset.left).toBe("8");
    expect(probe.dataset.top).toBe("8");
  });

  it("마운트 후 left/top이 바뀌면 새 좌표 기준으로 다시 클램프한다", () => {
    stubMenuRect(300, 400);

    const { getByTestId, rerender } = render(<Probe left={100} top={100} />);
    const probe = getByTestId("probe");

    expect(probe.dataset.left).toBe("100");
    expect(probe.dataset.top).toBe("100");

    rerender(<Probe left={900} top={700} />);

    // maxLeft = 1000 - 300 - 8 = 692, maxTop = 800 - 400 - 8 = 392
    expect(probe.dataset.left).toBe("692");
    expect(probe.dataset.top).toBe("392");
  });

  it("centerAbove: 앵커 위에 중앙 정렬된 박스가 뷰포트 위로 넘치면 최소 여백까지 내린다", () => {
    stubMenuRect(200, 100);
    // 뷰포트 1000x800, 박스 200x100 → dx=-100, dy=-108(=-height-8).
    // minLeft = 8+100=108, minTop = 8+108=116.
    const { getByTestId } = render(
      <Probe anchor="centerAbove" left={50} top={50} />,
    );
    const probe = getByTestId("probe");

    expect(probe.dataset.left).toBe("108");
    expect(probe.dataset.top).toBe("116");
  });

  it("centerAbove: 뷰포트 여백 안에 들어가면 좌표를 그대로 쓴다", () => {
    stubMenuRect(200, 100);
    const { getByTestId } = render(
      <Probe anchor="centerAbove" left={500} top={400} />,
    );
    const probe = getByTestId("probe");

    expect(probe.dataset.left).toBe("500");
    expect(probe.dataset.top).toBe("400");
  });

  it("centerBelow: 앵커 아래 중앙 정렬된 박스가 뷰포트 아래로 넘치면 최대치까지 올린다", () => {
    stubMenuRect(200, 100);
    // 뷰포트 1000x800, 박스 200x100 → dx=-100, dy=8.
    // maxTop = max(8-8, 800-100-8-8) = 684.
    const { getByTestId } = render(
      <Probe anchor="centerBelow" left={500} top={900} />,
    );
    const probe = getByTestId("probe");

    expect(probe.dataset.left).toBe("500");
    expect(probe.dataset.top).toBe("684");
  });

  it("leftOfAnchor: 고정 -56px 이동한 박스가 뷰포트 왼쪽으로 넘치면 최소 여백까지 오른쪽으로 민다", () => {
    stubMenuRect(60, 24);
    // dx=-56, dy=0 → minLeft = 8+56=64.
    const { getByTestId } = render(
      <Probe anchor="leftOfAnchor" left={20} top={100} />,
    );
    const probe = getByTestId("probe");

    expect(probe.dataset.left).toBe("64");
    expect(probe.dataset.top).toBe("100");
  });

  it("앵커 좌표가 그대로여도 박스가 커지면 다시 클램프한다", () => {
    const observer = stubResizeObserver();
    stubMenuRect(80, 40);

    const { getByTestId } = render(
      <Probe anchor="centerBelow" left={860} top={100} />,
    );
    const probe = getByTestId("probe");

    // 박스 80x40 → dx=-40 → maxLeft = 1000-80-8+40 = 952. 860은 그대로.
    expect(probe.dataset.left).toBe("860");
    expect(observer.observed).toContain(probe);

    // LinkToolbar의 view -> editing처럼 폭만 커진다.
    // 박스 350x40 → dx=-175 → maxLeft = 1000-350-8+175 = 817.
    stubMenuRect(350, 40);
    notifyResize(observer);

    expect(probe.dataset.left).toBe("817");
    expect(probe.dataset.top).toBe("100");
  });

  it("크기가 그대로면 ResizeObserver 알림에도 좌표 객체를 유지한다", () => {
    const observer = stubResizeObserver();
    stubMenuRect(200, 100);

    const { getByTestId } = render(<Probe left={100} top={100} />);
    const probe = getByTestId("probe");
    const renderCount = Number(probe.dataset.renders);

    notifyResize(observer);

    expect(probe.dataset.left).toBe("100");
    expect(probe.dataset.top).toBe("100");
    expect(Number(probe.dataset.renders)).toBe(renderCount);
  });

  it("언마운트하면 ResizeObserver를 해제한다", () => {
    const observer = stubResizeObserver();
    stubMenuRect(200, 100);

    const { unmount } = render(<Probe left={100} top={100} />);
    unmount();

    expect(observer.disconnected).toBe(1);
  });

  it("visualViewport가 뷰포트보다 작으면(가상 키보드) 그 경계 기준으로 클램프한다", () => {
    stubMenuRect(200, 100);
    stubVisualViewport({ offsetLeft: 20, offsetTop: 50, width: 600, height: 300 });

    const { getByTestId } = render(<Probe left={1000} top={1000} />);
    const probe = getByTestId("probe");

    // visualViewport 기준: maxLeft = 20+600-200-8=412, maxTop = 50+300-100-8=242.
    // innerWidth/innerHeight(1000x800, beforeEach 스텁) 기준이었다면 692/692가 나왔을 것이다.
    expect(probe.dataset.left).toBe("412");
    expect(probe.dataset.top).toBe("242");
  });

  it("visualViewport의 resize 이벤트가 오면 그 크기를 다시 읽어 재클램프한다", () => {
    stubMenuRect(200, 100);
    const stub = stubVisualViewport({ width: 1000, height: 800 });

    const { getByTestId } = render(<Probe left={100} top={700} />);
    const probe = getByTestId("probe");

    // 초기: visualViewport 800 기준 maxTop = 800-100-8=692, top=700 -> 692.
    expect(probe.dataset.top).toBe("692");

    // 가상 키보드가 올라와 visualViewport.height만 줄어든다(innerHeight는 그대로).
    stub.height = 300;
    notifyVisualViewport(stub, "resize");

    // maxTop = 300-100-8=192.
    expect(probe.dataset.top).toBe("192");
  });

  it("언마운트하면 visualViewport 리스너를 해제한다", () => {
    stubMenuRect(200, 100);
    const stub = stubVisualViewport({ width: 1000, height: 800 });

    const { unmount } = render(<Probe left={100} top={100} />);
    // 해제를 증명하려면 먼저 등록됐음을 확인해야 한다 — 그래야 아래
    // toHaveLength(0)이 "애초에 등록 안 함"으로 공허하게 참이 되지 않는다.
    expect((stub.listeners.resize ?? []).length).toBeGreaterThan(0);

    unmount();

    expect(stub.listeners.resize).toHaveLength(0);
    expect(stub.listeners.scroll).toHaveLength(0);
  });
});
