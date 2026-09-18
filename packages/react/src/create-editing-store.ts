import { useSyncExternalStore } from "react";

/**
 * "문서 전체에서 동시 편집 가능한 대상은 하나뿐"이라는 불변식을 지키는
 * `useSyncExternalStore` 기반 모듈 싱글톤을 만드는 factory다(C4).
 * media caption(`media-caption-editing-store.ts`)과 codeBlock caption
 * (`code-block-caption-editing-store.ts`) 두 store가 state/listeners/
 * getSnapshot/setState/subscribe/hook 여섯 조각을 타입 이름만 다르게 복제하고
 * 있어 뽑았다. 호출마다 독립된 `state`/`listeners` 클로저를 새로 만들므로
 * 여러 caption류 상태(예: 표 캡션)가 늘어도 서로 격리된다.
 *
 * 왜 이 상태를 모듈 싱글톤으로 소유하는지, 어떤 컴포넌트들이 공유하는지 같은
 * 도메인별 설명은 각 소비 파일에 남아 있다 — 여기는 메커니즘만 다룬다.
 */
export type EditingStore<T> = {
  getSnapshot: () => T | null;
  setState: (next: T | null) => void;
  subscribe: (listener: () => void) => () => void;
  useEditingState: () => T | null;
};

export const createEditingStore = <T>(): EditingStore<T> => {
  let state: T | null = null;
  const listeners = new Set<() => void>();

  /** 최신 상태를 동기로 읽는다 — commit 핸들러가 stale closure 없이 쓴다. */
  const getSnapshot = (): T | null => state;

  /** 편집 시작·커밋·취소 모두 이 setter 하나로 간다. */
  const setState = (next: T | null): void => {
    state = next;
    for (const listener of listeners) listener();
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  /** 소비 컴포넌트가 렌더에 구독한다. */
  const useEditingState = (): T | null =>
    useSyncExternalStore(subscribe, getSnapshot);

  return { getSnapshot, setState, subscribe, useEditingState };
};
