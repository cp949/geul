// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClampedMenuPosition } from "../src/use-clamped-menu-position.js";

type ProbeProps = {
  left: number;
  top: number;
};

const Probe = ({ left, top }: ProbeProps) => {
  const { menuRef, position } = useClampedMenuPosition(left, top);
  return (
    <div
      data-left={position.left}
      data-testid="probe"
      data-top={position.top}
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

beforeEach(() => {
  stubViewport(1000, 800);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
});
