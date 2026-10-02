// @vitest-environment jsdom

/**
 * useHandleKeyboardActivation(Issue #233 RD-002 DELTA-02)이 핸들 keydown
 * (Enter·Space)을 키보드 활성화 신호로 세우고, 소비·해제로 지우는지 확인한다.
 *
 * click의 `detail === 0`은 jsdom `fireEvent.click` 기본값이라 신호로 쓰지 않는다.
 * 이 hook은 keydown만 신호로 본다. 소비처(block-side-menu, media-handle-overlays)
 * 의 통합 동작은 각 컴포넌트 테스트가 소유한다.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useHandleKeyboardActivation } from "../src/use-handle-keyboard-activation.js";

afterEach(cleanup);

describe("useHandleKeyboardActivation", () => {
  it.each(["Enter", " "])("%j keydown 뒤 consume은 true를 돌려준다", (key) => {
    const { result } = renderHook(() => useHandleKeyboardActivation());

    act(() => result.current.onKeyDown({ key }));

    expect(result.current.consume()).toBe(true);
  });

  it("keydown 없이 consume하면 false다", () => {
    const { result } = renderHook(() => useHandleKeyboardActivation());

    expect(result.current.consume()).toBe(false);
  });

  it.each(["a", "Tab", "Escape", "ArrowDown"])(
    "%s keydown은 신호를 세우지 않는다",
    (key) => {
      const { result } = renderHook(() => useHandleKeyboardActivation());

      act(() => result.current.onKeyDown({ key }));

      expect(result.current.consume()).toBe(false);
    },
  );

  it("consume은 신호를 지워 두 번째 consume은 false다", () => {
    const { result } = renderHook(() => useHandleKeyboardActivation());
    act(() => result.current.onKeyDown({ key: "Enter" }));

    expect(result.current.consume()).toBe(true);
    expect(result.current.consume()).toBe(false);
  });

  it("reset은 consume 없이 신호를 지운다", () => {
    const { result } = renderHook(() => useHandleKeyboardActivation());
    act(() => result.current.onKeyDown({ key: "Enter" }));

    act(() => result.current.reset());

    expect(result.current.consume()).toBe(false);
  });

  it("렌더가 반복돼도 반환 객체와 핸들러 참조가 안정적이다", () => {
    const { result, rerender } = renderHook(() =>
      useHandleKeyboardActivation(),
    );
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
