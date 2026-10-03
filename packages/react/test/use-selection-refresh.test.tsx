/**
 * useSelectionRefresh가 마운트 시 onUpdate를 한 번 호출하고,
 * selectionchange/mouseup/keyup/scroll(capture)/resize 각 이벤트가 발생할
 * 때마다 다시 호출하는지 확인한다. element가 null인 동안에는 리스너를
 * 걸지 않으면서도 초기 호출은 그대로 하는지(호출부가 스스로 element null을
 * 판정하는 계약), 언마운트 시 리스너를 제거하는지도 함께 본다.
 *
 * 선택 옵션 `enabled`(Issue #235)도 본다. 기본값 true는 기존 동작이고,
 * false면 구독도 초기 호출도 하지 않는다. true로 바뀌면 구독하고 초기 한 번을
 * 호출하며, false로 바뀌면 리스너를 뗀다.
 */
// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSelectionRefresh } from "../src/use-selection-refresh.js";

afterEach(cleanup);

type ProbeProps = {
  onUpdate: () => void;
  mount?: boolean;
  enabled?: boolean;
};

/**
 * useSelectionRefresh를 구동하는 테스트용 컨테이너. ref 콜백으로 element를
 * state에 담아 훅에 넘긴다 — useEditorMount()도 마운트 후에야 엘리먼트를
 * 내주므로 같은 "처음엔 null" 상황을 재현한다. mount=false면 컨테이너를
 * 아예 렌더하지 않아 element가 계속 null인 상황을 만든다.
 */
const Probe = ({ onUpdate, mount = true, enabled }: ProbeProps) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  // enabled를 주지 않는 호출부와 같은 모양을 유지하려고 undefined면 키를 뺀다.
  useSelectionRefresh({
    element: container,
    onUpdate,
    ...(enabled === undefined ? {} : { enabled }),
  });
  return mount ? <div data-testid="container" ref={setContainer} /> : null;
};

describe("useSelectionRefresh", () => {
  it("마운트 시 onUpdate를 호출한다", () => {
    // Probe는 useEditorMount()처럼 첫 렌더에서 element가 null이었다가 ref
    // 콜백으로 실제 DOM이 붙은 뒤에야 갱신된다 — 그 사이 리렌더 한 번이 끼어
    // effect가 element=null(1회)과 element=실제 노드(1회) 두 번 돈다. 두
    // 호출 모두 "마운트 시 초기 호출" 계약이 지켜졌다는 뜻이라 정상이다.
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);

    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("element가 null이어도 onUpdate를 한 번 호출한다", () => {
    const onUpdate = vi.fn();
    render(<Probe mount={false} onUpdate={onUpdate} />);

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("selectionchange가 발생하면 다시 호출한다", () => {
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    document.dispatchEvent(new Event("selectionchange"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("mouseup이 발생하면 다시 호출한다", () => {
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    document.dispatchEvent(new Event("mouseup"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("keyup이 발생하면 다시 호출한다", () => {
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    document.dispatchEvent(new Event("keyup"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("scroll이 발생하면 다시 호출한다(capture 등록이라 캡처 단계 dispatch로도 잡힌다)", () => {
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    window.dispatchEvent(new Event("scroll"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("resize가 발생하면 다시 호출한다", () => {
    const onUpdate = vi.fn();
    render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    window.dispatchEvent(new Event("resize"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("언마운트하면 리스너를 제거한다", () => {
    const onUpdate = vi.fn();
    const { unmount } = render(<Probe onUpdate={onUpdate} />);
    onUpdate.mockClear();

    unmount();
    document.dispatchEvent(new Event("selectionchange"));
    window.dispatchEvent(new Event("resize"));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  describe("enabled 옵션(Issue #235)", () => {
    /** 훅이 구독하는 다섯 이벤트를 모두 한 번씩 보낸다. */
    const dispatchAll = () => {
      document.dispatchEvent(new Event("selectionchange"));
      document.dispatchEvent(new Event("mouseup"));
      document.dispatchEvent(new Event("keyup"));
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    };

    it("enabled가 false면 마운트 시 onUpdate를 호출하지 않는다", () => {
      const onUpdate = vi.fn();
      render(<Probe enabled={false} onUpdate={onUpdate} />);

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("enabled가 false면 어떤 이벤트에도 onUpdate를 호출하지 않는다", () => {
      const onUpdate = vi.fn();
      render(<Probe enabled={false} onUpdate={onUpdate} />);

      dispatchAll();

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("enabled가 false면 window에 scroll 리스너를 달지 않는다", () => {
      const addEventListener = vi.spyOn(window, "addEventListener");
      try {
        render(<Probe enabled={false} onUpdate={vi.fn()} />);

        const scrollCalls = addEventListener.mock.calls.filter(
          ([type]) => type === "scroll",
        );
        expect(scrollCalls).toEqual([]);
      } finally {
        addEventListener.mockRestore();
      }
    });

    it("enabled를 주지 않으면 기본값 true로 동작한다", () => {
      const onUpdate = vi.fn();
      render(<Probe onUpdate={onUpdate} />);
      onUpdate.mockClear();

      window.dispatchEvent(new Event("scroll"));

      expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    it("false에서 true로 바뀌면 구독하고 초기 한 번을 호출한다", () => {
      const onUpdate = vi.fn();
      const { rerender } = render(
        <Probe enabled={false} onUpdate={onUpdate} />,
      );
      expect(onUpdate).not.toHaveBeenCalled();

      rerender(<Probe enabled onUpdate={onUpdate} />);
      expect(onUpdate).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new Event("scroll"));
      expect(onUpdate).toHaveBeenCalledTimes(2);
    });

    it("true에서 false로 바뀌면 리스너를 뗀다", () => {
      const onUpdate = vi.fn();
      const { rerender } = render(<Probe enabled onUpdate={onUpdate} />);

      rerender(<Probe enabled={false} onUpdate={onUpdate} />);
      onUpdate.mockClear();
      dispatchAll();

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });
});
