// @vitest-environment jsdom

/**
 * useFixedPlacement의 배치 계약을 검증한다.
 * - 재측정: window scroll, 안쪽 요소 scroll(capture), resize에서 앵커를 다시 읽는다.
 * - 구독 수명: `open`인 동안만 구독하고 닫힘·unmount에서 해제한다.
 * - `readAnchor`가 `null`이면 마지막 좌표를 유지하고, 닫으면 좌표를 버린다.
 * - 열린 뒤 첫 읽기가 `null`이면 `fallbackAnchor`를 쓴다. 이후 `null`은 마지막 좌표다.
 * - `readAnchor` identity가 바뀌어도 재구독하지 않고 최신 함수를 쓴다.
 * - 읽기 시점: 렌더마다 앵커를 다시 읽고, 앵커가 이벤트 뒤 한 번 더 렌더된 뒤
 *   움직여도 새 좌표로 수렴한다.
 * - `clampAnchor`가 `useClampedMenuPosition`으로 전달된다.
 * - `clip`: 앵커 점이 스크롤 컨테이너의 보이는 영역 밖이면 메뉴를 숨긴다.
 *   기본값 `false`와 닫힘에서는 `visibility`를 건드리지 않는다.
 * - `readAnchorBelowTrigger`: 트리거 하단 + 4 좌표와 연결 해제 시 `null`.
 * - `readAnchorBelowTriggerEnd`: 트리거 오른쪽·하단 좌표(간격 0)와 연결 해제 시 `null`.
 */

import { act, cleanup, render } from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type FixedPlacementAnchor,
  readAnchorBelowTrigger,
  readAnchorBelowTriggerEnd,
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
  fallbackAnchor?: FixedPlacementAnchor;
  clip?: boolean;
  onRender?: () => void;
};

/**
 * 훅이 돌려준 `menuRef`와 `style`을 DOM에 꽂아 보는 최소 소비처.
 * `useClampedMenuPosition`은 노드가 붙어야 좌표를 갱신하므로 항상 렌더한다.
 */
const Probe = ({
  open,
  element,
  readAnchor,
  clampAnchor,
  fallbackAnchor,
  clip,
  onRender,
}: ProbeProps) => {
  onRender?.();
  const { menuRef, style } = useFixedPlacement({
    open,
    element,
    readAnchor,
    ...(clampAnchor === undefined ? {} : { clampAnchor }),
    ...(fallbackAnchor === undefined ? {} : { fallbackAnchor }),
    ...(clip === undefined ? {} : { clip }),
  });
  return <div data-testid="probe" ref={menuRef} style={style} />;
};

/** probe 요소의 fixed 좌표(style)를 읽는다. */
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

/** document에 붙은 빈 host 요소를 만든다. */
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

    it("열린 첫 읽기가 null이면 fallbackAnchor 좌표를 쓴다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      const { container } = render(
        <Probe
          element={host}
          fallbackAnchor={{ left: 96, top: 48 }}
          open
          readAnchor={() => null}
        />,
      );
      expect(readStyle(container)).toEqual({ left: "96px", top: "48px" });
    });

    it("fallbackAnchor가 있어도 읽은 좌표 뒤의 null은 마지막 좌표를 유지한다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      let anchor: FixedPlacementAnchor | null = { left: 120, top: 80 };
      const { container } = render(
        <Probe
          element={host}
          fallbackAnchor={{ left: 96, top: 48 }}
          open
          readAnchor={() => anchor}
        />,
      );
      anchor = null;
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(readStyle(container)).toEqual({ left: "120px", top: "80px" });
    });

    it("fallbackAnchor는 닫았다 다시 연 첫 읽기에도 쓰인다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      let anchor: FixedPlacementAnchor | null = { left: 120, top: 80 };
      const { container, rerender } = render(
        <Probe
          element={host}
          fallbackAnchor={{ left: 96, top: 48 }}
          open
          readAnchor={() => anchor}
        />,
      );
      rerender(
        <Probe
          element={host}
          fallbackAnchor={{ left: 96, top: 48 }}
          open={false}
          readAnchor={() => anchor}
        />,
      );
      anchor = null;
      rerender(
        <Probe
          element={host}
          fallbackAnchor={{ left: 96, top: 48 }}
          open
          readAnchor={() => anchor}
        />,
      );
      expect(readStyle(container)).toEqual({ left: "96px", top: "48px" });
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
      // 앵커가 뷰포트 위쪽에 붙어 있으면 위로 밀려난다. 박스 상단이 여백 8px에
      // 닿도록 top이 8 + 50 + 8 = 66이 된다. 폭은 가운데 정렬이라 left는 그대로다.
      const { container } = render(
        <Probe
          clampAnchor="centerAbove"
          element={host}
          open
          readAnchor={() => ({ left: 200, top: 10 })}
        />,
      );
      expect(readStyle(container)).toEqual({ left: "200px", top: "66px" });
    });
  });

  describe("렌더 안정성", () => {
    // 렌더 직후 effect가 같은 좌표로 `setState`를 부르면 React가 업데이트를 큐에 넣어
    // 매 커밋 다시 렌더한다(Maximum update depth exceeded, 업로드 중 블록을 undo로
    // 지운 e2e에서 재현). 외부 렌더 한 번당 이 컴포넌트는 정확히 한 번만 렌더돼야 한다.
    const countRendersPerExternalRender = (open: boolean) => {
      stubMenuRect(100, 50);
      const host = mountHost();
      let renders = 0;
      const props = {
        element: host,
        open,
        readAnchor: () => ({ left: 120, top: 80 }),
        onRender: () => {
          renders += 1;
        },
      };
      const { rerender } = render(<Probe {...props} />);
      const settled = renders;
      for (let index = 0; index < 5; index += 1) {
        rerender(<Probe {...props} />);
      }
      return renders - settled;
    };

    it("열려 있고 좌표가 같으면 외부 렌더 한 번에 한 번만 렌더한다", () => {
      expect(countRendersPerExternalRender(true)).toBe(5);
    });

    it("닫혀 있으면 외부 렌더 한 번에 한 번만 렌더한다", () => {
      expect(countRendersPerExternalRender(false)).toBe(5);
    });
  });

  describe("clip", () => {
    // 에디터 host를 overflow 컨테이너로 본다. 보이는 영역은 (0,0)–(600,100)이다.
    // `Element.prototype` 스텁은 모든 노드에 같은 rect를 줘 박스와 메뉴를 구분하지
    // 못한다. host 인스턴스만 스텁한다.
    const mountClipHost = () => {
      const host = mountHost();
      host.style.overflowY = "auto";
      vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 600,
        bottom: 100,
        x: 0,
        y: 0,
        width: 600,
        height: 100,
        toJSON: () => ({}),
      } as DOMRect);
      return host;
    };
    const readMenu = (container: HTMLElement) => {
      const node = container.querySelector<HTMLElement>(
        '[data-testid="probe"]',
      );
      if (node === null) throw new Error("probe 요소가 없다");
      return node;
    };

    it("앵커가 clip 박스 안이면 보인다", () => {
      stubMenuRect(100, 50);
      const host = mountClipHost();
      const { container } = render(
        <Probe
          clip
          element={host}
          open
          readAnchor={() => ({ left: 300, top: 50 })}
        />,
      );
      expect(readMenu(container).style.visibility).toBe("");
    });

    it("앵커가 clip 박스 밖이면 숨긴다", () => {
      stubMenuRect(100, 50);
      const host = mountClipHost();
      const { container } = render(
        <Probe
          clip
          element={host}
          open
          readAnchor={() => ({ left: 300, top: 300 })}
        />,
      );
      expect(readMenu(container).style.visibility).toBe("hidden");
    });

    it("viewport clamp가 앵커를 박스 안으로 끌어와도 clamp 전 좌표로 판정해 숨긴다", () => {
      // 앵커 top -100은 clip 박스(top 0) 위다. clamp 후 좌표는 8이라 박스 안이다.
      stubMenuRect(100, 50);
      const host = mountClipHost();
      const { container } = render(
        <Probe
          clip
          element={host}
          open
          readAnchor={() => ({ left: 300, top: -100 })}
        />,
      );
      expect(readMenu(container).style.top).toBe("8px");
      expect(readMenu(container).style.visibility).toBe("hidden");
    });

    it("스크롤로 앵커가 박스 밖으로 나가면 숨기고 돌아오면 다시 보인다", () => {
      stubMenuRect(100, 50);
      const host = mountClipHost();
      let anchor = { left: 300, top: 50 };
      const { container } = render(
        <Probe clip element={host} open readAnchor={() => anchor} />,
      );
      expect(readMenu(container).style.visibility).toBe("");

      anchor = { left: 300, top: 300 };
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(readMenu(container).style.visibility).toBe("hidden");

      anchor = { left: 300, top: 50 };
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(readMenu(container).style.visibility).toBe("");
    });

    it("메뉴 박스가 경계 밖으로 삐져나와도 앵커가 안이면 보인다", () => {
      // 메뉴 박스를 박스 밖(top 300)에 두어도 판정은 앵커 점이다. 첫 줄을
      // 선택할 때 popover가 사라지지 않게 하는 계약이다(scroll-clip.ts).
      const host = mountClipHost();
      const { container } = render(
        <Probe
          clip
          element={host}
          open
          readAnchor={() => ({ left: 300, top: 50 })}
        />,
      );
      vi.spyOn(readMenu(container), "getBoundingClientRect").mockReturnValue({
        left: 280,
        top: 300,
        right: 380,
        bottom: 350,
        x: 280,
        y: 300,
        width: 100,
        height: 50,
        toJSON: () => ({}),
      } as DOMRect);
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(readMenu(container).style.visibility).toBe("");
    });

    it("clip 기본값은 false라 앵커가 박스 밖이어도 visibility를 건드리지 않는다", () => {
      stubMenuRect(100, 50);
      const host = mountClipHost();
      const { container } = render(
        <Probe
          element={host}
          open
          readAnchor={() => ({ left: 300, top: 300 })}
        />,
      );
      expect(readMenu(container).style.visibility).toBe("");
    });

    it("clip이 false여도 호출부가 쓴 visibility를 덮어쓰지 않는다", () => {
      stubMenuRect(100, 50);
      const host = mountClipHost();
      let anchor = { left: 300, top: 300 };
      const { container } = render(
        <Probe element={host} open readAnchor={() => anchor} />,
      );
      readMenu(container).style.visibility = "hidden";
      anchor = { left: 300, top: 50 };
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(readMenu(container).style.visibility).toBe("hidden");
    });

    it("open이 false면 박스 밖 앵커(fallbackAnchor)가 있어도 visibility를 건드리지 않는다", () => {
      // 닫힌 렌더에서 `placed`는 `fallbackAnchor`다. 가드가 없으면 이 좌표로 판정해
      // 숨긴다.
      stubMenuRect(100, 50);
      const host = mountClipHost();
      const { container } = render(
        <Probe
          clip
          element={host}
          fallbackAnchor={{ left: 300, top: 300 }}
          open={false}
          readAnchor={() => ({ left: 300, top: 300 })}
        />,
      );
      expect(readMenu(container).style.visibility).toBe("");
    });

    it("첫 읽기가 null이면 fallbackAnchor로 판정한다", () => {
      stubMenuRect(100, 50);
      const host = mountClipHost();
      const { container } = render(
        <Probe
          clip
          element={host}
          fallbackAnchor={{ left: 300, top: 300 }}
          open
          readAnchor={() => null}
        />,
      );
      expect(readMenu(container).style.visibility).toBe("hidden");
    });

    it("읽을 앵커가 없으면(null, fallback 없음) 판정하지 않는다", () => {
      stubMenuRect(100, 50);
      const host = mountClipHost();
      const { container } = render(
        <Probe clip element={host} open readAnchor={() => null} />,
      );
      expect(readMenu(container).style.visibility).toBe("");
    });

    it("자르는 조상이 없으면 항상 보인다", () => {
      stubMenuRect(100, 50);
      const host = mountHost();
      const { container } = render(
        <Probe
          clip
          element={host}
          open
          readAnchor={() => ({ left: 300, top: 5000 })}
        />,
      );
      expect(readMenu(container).style.visibility).toBe("");
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

describe("readAnchorBelowTriggerEnd", () => {
  it("트리거 오른쪽 가장자리와 하단을 간격 없이 돌려준다", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    try {
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
      expect(readAnchorBelowTriggerEnd(trigger)).toEqual({ left: 70, top: 40 });
    } finally {
      trigger.remove();
    }
  });

  it("문서에서 떨어진 트리거는 null을 돌려준다", () => {
    const trigger = document.createElement("button");
    expect(readAnchorBelowTriggerEnd(trigger)).toBeNull();
  });
});
