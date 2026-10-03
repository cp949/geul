// @vitest-environment jsdom

/**
 * useStableCallback: 참조는 렌더 사이에 그대로이고, 호출은 마지막으로 커밋된
 * 렌더의 클로저를 부른다(Issue #240). 참조가 바뀌면 React.memo 자식이 깨지고,
 * 클로저가 낡으면 핸들러가 이전 상태를 본다.
 */

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useStableCallback } from "../src/use-stable-callback.js";

// vitest 설정에 globals가 없어 testing-library 자동 cleanup이 걸리지 않는다.
afterEach(cleanup);

describe("useStableCallback", () => {
  it("렌더가 바뀌어도 같은 참조를 돌려준다", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useStableCallback(() => value),
      { initialProps: { value: 1 } },
    );
    const first = result.current;

    rerender({ value: 2 });

    expect(result.current).toBe(first);
  });

  it("호출하면 마지막으로 커밋된 렌더의 클로저를 부르고 인자와 반환값을 그대로 전한다", () => {
    const { result, rerender } = renderHook(
      ({ base }) => useStableCallback((added: number) => base + added),
      { initialProps: { base: 10 } },
    );
    expect(result.current(1)).toBe(11);

    rerender({ base: 20 });

    expect(result.current(1)).toBe(21);
  });
});
