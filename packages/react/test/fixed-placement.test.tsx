// @vitest-environment jsdom

/**
 * useFixedPlacement의 배치 계약을 검증한다.
 * - 재측정: window scroll, 안쪽 요소 scroll(capture), resize에서 앵커를 다시 읽는다.
 * - 구독 수명: `open`인 동안만 구독하고 닫힘·unmount에서 해제한다.
 * - `readAnchor`가 `null`이면 마지막 좌표를 유지하고, 닫으면 좌표를 버린다.
 * - `readAnchor` identity가 바뀌어도 재구독하지 않고 최신 함수를 쓴다.
 * - 읽기 시점: 렌더마다 앵커를 다시 읽고, 앵커가 이벤트 뒤 한 번 더 렌더된 뒤
 *   움직여도 새 좌표로 수렴한다.
 * - `clampAnchor`가 `useClampedMenuPosition`으로 전달된다.
 * - `readAnchorBelowTrigger`: 트리거 하단 + 4 좌표와 연결 해제 시 `null`.
 */

import { act, cleanup, render } from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type FixedPlacementAnchor,
  readAnchorBelowTrigger,
  useFixedPlacement,
} from "../src/fixed-placement.js";
import type { ClampAnchor } from "../src/use-clamped-menu-position.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type ProbeProps = {
  open: boolean;
  element: HTMLElement | null;
  readAnchor: () => FixedPlacementAnchor | null;
  clampAnchor?: ClampAnchor;
};

/**
 * 훅이 돌려준 `menuRef`와 `style`을 DOM에 꽂아 보는 최소 소비처.
 * `useClampedMenuPosition`은 노드가 붙어야 좌표를 갱신하므로 항상 렌더한다.
 */
const Probe = ({ open, element, readAnchor, clampAnchor }: ProbeProps) => {
  const { menuRef, style } = useFixedPlacement({
    open,
    element,
    readAnchor,
    ...(clampAnchor === undefined ? {} : { clampAnchor }),
  });
  return <div data-testid="probe" ref={menuRef} style={style} />;
};

const readStyle = (container: HTMLElement) => {
  const node = container.querySelector<HTMLElement>('[data-testid="probe"]');
  if (node === null) throw new Error("probe 요소가 없다");
  return { left: node.style.left, top: node.style.top };
};

/**
 * `getBoundingClientRect`를 크기만 가진 박스로 고정한다.
 * 뷰포트 안이면 clamp가 좌표를 바꾸지 않는다.
 */
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

const mountHost = () => {
  const host = document.createElement("div");
  document.body.append(host);
  return host;
};

describe("useFixedPlacement", () => {
  describe("재측정", () => {
    it("열릴 때 앵커를 읽어 좌표로 쓴다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      const { container } = render(
        <Probe
          element={host}
          open
          readAnchor={() => ({ left: 120, top: 80 })}
        />,
      );
      expect(readStyle(container)).toEqual({ left: "120px", top: "80px" });
    });

    it("window scroll에서 앵커를 다시 읽는다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      let anchor = { left: 120, top: 80 };
      const { container } = render(
        <Probe element={host} open readAnchor={() => anchor} />,
      );
      anchor = { left: 120, top: 40 };
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(readStyle(container)).toEqual({ left: "120px", top: "40px" });
    });

    it("안쪽 요소의 scroll(버블링 없음)도 capture로 잡아 다시 읽는다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      const inner = document.createElement("div");
      host.append(inner);
      let anchor = { left: 120, top: 80 };
      const { container } = render(
        <Probe element={host} open readAnchor={() => anchor} />,
      );
      anchor = { left: 120, top: 20 };
      act(() => {
        inner.dispatchEvent(new Event("scroll", { bubbles: false }));
      });
      expect(readStyle(container)).toEqual({ left: "120px", top: "20px" });
    });

    it("resize에서 앵커를 다시 읽는다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      let anchor = { left: 120, top: 80 };
      const { container } = render(
        <Probe element={host} open readAnchor={() => anchor} />,
      );
      anchor = { left: 200, top: 80 };
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      expect(readStyle(container)).toEqual({ left: "200px", top: "80px" });
    });
  });

  describe("구독 수명", () => {
    it("닫혀 있는 동안은 scroll·resize를 구독하지 않는다", () => {
      const addSpy = vi.spyOn(window, "addEventListener");
      const host = mountHost();
      render(
        <Probe
          element={host}
          open={false}
          readAnchor={() => ({ left: 1, top: 1 })}
        />,
      );
      const types = addSpy.mock.calls.map(([type]) => type);
      expect(types).not.toContain("scroll");
      expect(types).not.toContain("resize");
    });

    it("닫히면 같은 callback과 capture 옵션으로 해제한다", () => {
      stubMenuRect(100, 50);
      const addSpy = vi.spyOn(window, "addEventListener");
      const removeSpy = vi.spyOn(window, "removeEventListener");
      const host = mountHost();
      const readAnchor = () => ({ left: 1, top: 1 });
      const { rerender } = render(
        <Probe element={host} open readAnchor={readAnchor} />,
      );
      const scrollAdd = addSpy.mock.calls.find(([type]) => type === "scroll");
      const resizeAdd = addSpy.mock.calls.find(([type]) => type === "resize");
      expect(scrollAdd?.[2]).toBe(true);
      rerender(<Probe element={host} open={false} readAnchor={readAnchor} />);
      expect(removeSpy).toHaveBeenCalledWith("scroll", scrollAdd?.[1], true);
      expect(removeSpy).toHaveBeenCalledWith("resize", resizeAdd?.[1]);
    });

    it("unmount에서 해제한다", () => {
      stubMenuRect(100, 50);
      const removeSpy = vi.spyOn(window, "removeEventListener");
      const host = mountHost();
      const { unmount } = render(
        <Probe element={host} open readAnchor={() => ({ left: 1, top: 1 })} />,
      );
      unmount();
      const types = removeSpy.mock.calls.map(([type]) => type);
      expect(types).toContain("scroll");
      expect(types).toContain("resize");
    });

    it("닫힌 뒤 scroll은 앵커를 읽지 않는다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      const readAnchor = vi.fn(() => ({ left: 1, top: 1 }));
      const { rerender } = render(
        <Probe element={host} open readAnchor={readAnchor} />,
      );
      rerender(<Probe element={host} open={false} readAnchor={readAnchor} />);
      readAnchor.mockClear();
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(readAnchor).not.toHaveBeenCalled();
    });

    it("element가 null이면 구독하지 않는다", () => {
      stubMenuRect(100, 50);
      const addSpy = vi.spyOn(window, "addEventListener");
      render(
        <Probe element={null} open readAnchor={() => ({ left: 1, top: 1 })} />,
      );
      expect(addSpy.mock.calls.map(([type]) => type)).not.toContain("scroll");
    });
  });

  describe("null 앵커", () => {
    it("readAnchor가 null이면 마지막 좌표를 유지한다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      let anchor: FixedPlacementAnchor | null = { left: 120, top: 80 };
      const { container } = render(
        <Probe element={host} open readAnchor={() => anchor} />,
      );
      anchor = null;
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(readStyle(container)).toEqual({ left: "120px", top: "80px" });
    });

    it("닫았다 다시 열면 이전 좌표를 첫 렌더에 쓰지 않는다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      let anchor = { left: 120, top: 80 };
      const seen: Array<{ left: string; top: string }> = [];
      const Recorder = ({ open }: { open: boolean }) => {
        const { menuRef, style } = useFixedPlacement({
          open,
          element: host,
          readAnchor: () => anchor,
        });
        // 레이아웃 effect가 좌표를 읽기 전, 렌더가 낸 style을 기록한다.
        seen.push({ left: String(style.left), top: String(style.top) });
        return <div ref={menuRef} style={style} />;
      };
      const { rerender } = render(<Recorder open />);
      rerender(<Recorder open={false} />);
      anchor = { left: 300, top: 10 };
      seen.length = 0;
      rerender(<Recorder open />);
      expect(seen[0]).not.toEqual({ left: "120", top: "80" });
    });
  });

  describe("좌표 비교", () => {
    it("NaN 좌표가 계속 와도 무한 렌더하지 않는다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      // 무한 렌더면 React가 "Maximum update depth exceeded"를 던져 render가 실패한다.
      expect(() =>
        render(
          <Probe
            element={host}
            open
            readAnchor={() => ({ left: Number.NaN, top: Number.NaN })}
          />,
        ),
      ).not.toThrow();
    });
  });

  describe("readAnchor identity", () => {
    it("매 렌더 새 함수여도 다시 구독하지 않는다", () => {
      stubMenuRect(100, 50);
      const addSpy = vi.spyOn(window, "addEventListener");
      const host = mountHost();
      const { rerender } = render(
        <Probe element={host} open readAnchor={() => ({ left: 1, top: 1 })} />,
      );
      const countScroll = () =>
        addSpy.mock.calls.filter(([type]) => type === "scroll").length;
      const before = countScroll();
      rerender(
        <Probe element={host} open readAnchor={() => ({ left: 2, top: 2 })} />,
      );
      rerender(
        <Probe element={host} open readAnchor={() => ({ left: 3, top: 3 })} />,
      );
      expect(countScroll()).toBe(before);
    });

    it("scroll에서는 가장 최근에 넘긴 함수를 쓴다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      const { container, rerender } = render(
        <Probe element={host} open readAnchor={() => ({ left: 1, top: 1 })} />,
      );
      rerender(
        <Probe
          element={host}
          open
          readAnchor={() => ({ left: 50, top: 60 })}
        />,
      );
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(readStyle(container)).toEqual({ left: "50px", top: "60px" });
    });
  });

  describe("읽기 시점", () => {
    it("이벤트 없이 다시 렌더돼도 앵커를 다시 읽는다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      const { container, rerender } = render(
        <Probe
          element={host}
          open
          readAnchor={() => ({ left: 10, top: 10 })}
        />,
      );
      expect(readStyle(container)).toEqual({ left: "10px", top: "10px" });
      // 같은 함수 identity로 렌더만 다시 한다. 앵커 DOM만 움직인 경우를 흉내 낸다.
      let anchor = { left: 10, top: 10 };
      const readAnchor = () => anchor;
      rerender(<Probe element={host} open readAnchor={readAnchor} />);
      anchor = { left: 30, top: 70 };
      rerender(<Probe element={host} open readAnchor={readAnchor} />);
      expect(readStyle(container)).toEqual({ left: "30px", top: "70px" });
    });

    it("scroll 뒤 앵커가 한 번 더 렌더된 뒤에 움직여도 새 좌표로 수렴한다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      // 이벤트 직후에는 아직 낡은 값을 돌려주고, 부모가 한 번 더 렌더된 뒤에야
      // 새 값을 돌려준다. 서식 툴바처럼 앵커가 두 번 렌더된 뒤에 움직이는 경우다.
      const Parent = () => {
        const [moved, setMoved] = useState(false);
        useLayoutEffect(() => {
          const onScroll = () => setMoved(true);
          window.addEventListener("scroll", onScroll, true);
          return () => window.removeEventListener("scroll", onScroll, true);
        }, []);
        return (
          <Probe
            element={host}
            open
            readAnchor={() =>
              moved ? { left: 10, top: 10 } : { left: 99, top: 99 }
            }
          />
        );
      };
      const { container } = render(<Parent />);
      expect(readStyle(container)).toEqual({ left: "99px", top: "99px" });
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(readStyle(container)).toEqual({ left: "10px", top: "10px" });
    });
  });

  describe("clamp", () => {
    it("clampAnchor 기본값은 topLeft다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      const { container } = render(
        <Probe
          element={host}
          open
          readAnchor={() => ({ left: 200, top: 100 })}
        />,
      );
      expect(readStyle(container)).toEqual({ left: "200px", top: "100px" });
    });

    it("clampAnchor를 useClampedMenuPosition으로 넘긴다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      // centerAbove는 박스 좌상단이 (left - 폭/2, top - 높이 - 8)에 놓인다.
      // 앵커가 뷰포트 위쪽에 붙어 있으면 위로 밀려나 top이 바뀐다.
      const { container } = render(
        <Probe
          clampAnchor="centerAbove"
          element={host}
          open
          readAnchor={() => ({ left: 200, top: 10 })}
        />,
      );
      const { top } = readStyle(container);
      expect(top).not.toBe("10px");
    });
  });
});

describe("readAnchorBelowTrigger", () => {
  it("트리거 왼쪽 가장자리와 하단 + 4px를 돌려준다", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      left: 30,
      top: 10,
      right: 70,
      bottom: 40,
      x: 30,
      y: 10,
      width: 40,
      height: 30,
      toJSON: () => ({}),
    } as DOMRect);
    expect(readAnchorBelowTrigger(trigger)).toEqual({ left: 30, top: 44 });
  });

  it("문서에서 떨어진 트리거는 null을 돌려준다", () => {
    const trigger = document.createElement("button");
    expect(readAnchorBelowTrigger(trigger)).toBeNull();
  });
});
