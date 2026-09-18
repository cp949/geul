// @vitest-environment jsdom

/**
 * createEditingStore<T>()가 만드는 useSyncExternalStore 기반 모듈 싱글톤이
 * "문서 전체에서 동시 편집 가능한 대상은 하나"라는 불변식과 subscribe/notify
 * 계약을 지키는지, 그리고 인스턴스를 두 번 만들면 서로 상태를 공유하지
 * 않는지 검증한다(C4, media-caption-editing-store.ts·
 * code-block-caption-editing-store.ts 중복 제거).
 */

import { renderHook } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { createEditingStore } from "../src/create-editing-store.js";

type Payload = { blockId: string; draft: string };

describe("createEditingStore", () => {
  it("초기 상태는 null이다", () => {
    const store = createEditingStore<Payload>();
    expect(store.getSnapshot()).toBeNull();
  });

  it("setState로 쓴 값을 getSnapshot이 그대로 돌려준다", () => {
    const store = createEditingStore<Payload>();
    store.setState({ blockId: "a", draft: "hello" });
    expect(store.getSnapshot()).toEqual({ blockId: "a", draft: "hello" });
  });

  it("setState(null)로 편집을 종료할 수 있다", () => {
    const store = createEditingStore<Payload>();
    store.setState({ blockId: "a", draft: "hello" });
    store.setState(null);
    expect(store.getSnapshot()).toBeNull();
  });

  it("useEditingState 훅이 setState 이후 리렌더로 최신 값을 반영한다", () => {
    const store = createEditingStore<Payload>();
    const { result } = renderHook(() => store.useEditingState());

    expect(result.current).toBeNull();

    act(() => {
      store.setState({ blockId: "a", draft: "hello" });
    });

    expect(result.current).toEqual({ blockId: "a", draft: "hello" });
  });

  it("subscribe한 리스너는 setState마다 호출되고, 해제 후에는 호출되지 않는다", () => {
    const store = createEditingStore<Payload>();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });

    store.setState({ blockId: "a", draft: "hello" });
    expect(calls).toBe(1);

    unsubscribe();
    store.setState(null);
    expect(calls).toBe(1);
  });

  it("createEditingStore를 두 번 호출하면 서로 독립된 상태를 갖는다", () => {
    const storeA = createEditingStore<Payload>();
    const storeB = createEditingStore<Payload>();

    storeA.setState({ blockId: "a", draft: "from-a" });

    expect(storeA.getSnapshot()).toEqual({ blockId: "a", draft: "from-a" });
    expect(storeB.getSnapshot()).toBeNull();
  });
});
