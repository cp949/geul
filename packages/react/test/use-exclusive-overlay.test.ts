// @vitest-environment jsdom

/**
 * useExclusiveOverlay가 정적 config로 등록한 형제 오버레이 중 하나를
 * open하면 이전에 활성이던 id의 onClose만 호출하고, 자기 자신을 다시
 * open해도 자신의 onClose는 호출하지 않는지 검증한다(01-계획.md
 * "20260918-01-toolbar-exclusive-overlay" 완료 조건 1). 이 훅은
 * code-block-language-combobox.tsx의 언어 팝오버/caption 편집/더보기 메뉴
 * 3-peer 상호배제 전용이라 "형제 판정"만 다루고, 각 오버레이 자신의 열림
 * 상태(true/false)는 계속 소비처가 소유한다 — 그래서 이 테스트는 activeId와
 * open()의 부수효과(어느 onClose가 불렸는지)만 확인하고 실제 DOM 렌더는
 * 다루지 않는다(JSX 없이 renderHook만 쓴다).
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useExclusiveOverlay } from "../src/use-exclusive-overlay.js";

describe("useExclusiveOverlay", () => {
  it("최초 open은 활성 id가 없어 어떤 onClose도 호출하지 않는다", () => {
    const onAClose = vi.fn();
    const onBClose = vi.fn();
    const { result } = renderHook(() =>
      useExclusiveOverlay({
        a: { onClose: onAClose },
        b: { onClose: onBClose },
      }),
    );

    act(() => {
      result.current.open("a");
    });

    expect(onAClose).not.toHaveBeenCalled();
    expect(onBClose).not.toHaveBeenCalled();
  });

  it("다른 id를 open하면 이전에 활성이던 id의 onClose가 호출된다", () => {
    const onAClose = vi.fn();
    const onBClose = vi.fn();
    const { result } = renderHook(() =>
      useExclusiveOverlay({
        a: { onClose: onAClose },
        b: { onClose: onBClose },
      }),
    );

    act(() => {
      result.current.open("a");
    });
    act(() => {
      result.current.open("b");
    });

    expect(onAClose).toHaveBeenCalledOnce();
    expect(onBClose).not.toHaveBeenCalled();
  });

  it("자신을 다시 open해도 자신의 onClose는 호출되지 않는다", () => {
    const onAClose = vi.fn();
    const onBClose = vi.fn();
    const { result } = renderHook(() =>
      useExclusiveOverlay({
        a: { onClose: onAClose },
        b: { onClose: onBClose },
      }),
    );

    act(() => {
      result.current.open("a");
    });
    act(() => {
      result.current.open("a");
    });

    expect(onAClose).not.toHaveBeenCalled();
    expect(onBClose).not.toHaveBeenCalled();
  });

  it("open한 id가 activeId로 반영된다", () => {
    const { result } = renderHook(() =>
      useExclusiveOverlay({
        a: { onClose: () => {} },
        b: { onClose: () => {} },
      }),
    );
    expect(result.current.activeId).toBeNull();

    act(() => {
      result.current.open("a");
    });

    expect(result.current.activeId).toBe("a");
  });

  it("셋 이상 등록해도 직전 활성 id 하나의 onClose만 호출한다", () => {
    const onAClose = vi.fn();
    const onBClose = vi.fn();
    const onCClose = vi.fn();
    const { result } = renderHook(() =>
      useExclusiveOverlay({
        a: { onClose: onAClose },
        b: { onClose: onBClose },
        c: { onClose: onCClose },
      }),
    );

    act(() => {
      result.current.open("a");
    });
    act(() => {
      result.current.open("b");
    });
    act(() => {
      result.current.open("c");
    });

    expect(onAClose).toHaveBeenCalledOnce();
    expect(onBClose).toHaveBeenCalledOnce();
    expect(onCClose).not.toHaveBeenCalled();
  });
});
