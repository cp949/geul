// @vitest-environment jsdom

/**
 * useDismissSuppression<K>이 "닫힌 뒤 같은 key 재관측은 무시·다른 key는
 * 통과"라는 G-UI-001 계약을 key 타입과 무관하게 지키는지 검증한다(C3,
 * use-range-dismiss-suppression.ts 일반화). formatting-toolbar.tsx/
 * link-toolbar.tsx가 쓰는 커스텀 isEqual과 media-toolbar.tsx/file-panel.tsx가
 * 쓰는 기본 Object.is 둘 다 이 계약 하나로 커버된다.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDismissSuppression } from "../src/use-dismiss-suppression.js";

describe("useDismissSuppression", () => {
  it("dismiss 전에는 어떤 key도 억제되지 않는다", () => {
    const { result } = renderHook(() => useDismissSuppression<string>());
    expect(result.current.isSuppressed("a")).toBe(false);
  });

  it("dismiss한 key와 같은 key의 재관측을 억제한다(기본 Object.is)", () => {
    const { result } = renderHook(() => useDismissSuppression<string>());
    result.current.dismiss("block-1");
    expect(result.current.isSuppressed("block-1")).toBe(true);
  });

  it("dismiss한 key와 다른 key는 억제하지 않는다", () => {
    const { result } = renderHook(() => useDismissSuppression<string>());
    result.current.dismiss("block-1");
    expect(result.current.isSuppressed("block-2")).toBe(false);
  });

  it("clear 이후에는 같은 key라도 억제되지 않는다", () => {
    const { result } = renderHook(() => useDismissSuppression<string>());
    result.current.dismiss("block-1");
    result.current.clear();
    expect(result.current.isSuppressed("block-1")).toBe(false);
  });

  it("dismiss(null) 이후에는 어떤 key도 억제되지 않는다", () => {
    const { result } = renderHook(() => useDismissSuppression<string>());
    result.current.dismiss("block-1");
    result.current.dismiss(null);
    expect(result.current.isSuppressed("block-1")).toBe(false);
  });

  it("커스텀 isEqual을 그대로 위임한다(예: Range 경계 비교 대신 하는 값 비교)", () => {
    const isEqual = (a: { id: number }, b: { id: number }) => a.id === b.id;
    const { result } = renderHook(() => useDismissSuppression(isEqual));

    result.current.dismiss({ id: 1 });

    expect(result.current.isSuppressed({ id: 1 })).toBe(true);
    expect(result.current.isSuppressed({ id: 2 })).toBe(false);
  });

  it("반환 객체는 리렌더 사이에 안정적인 참조를 유지한다(effect 의존성 배열에 안전)", () => {
    const { result, rerender } = renderHook(() =>
      useDismissSuppression<string>(),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
