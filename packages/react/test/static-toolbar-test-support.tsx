/**
 * StaticToolbar 테스트가 공유하는 fake EditorController를 제공한다.
 * `formatting-toolbar-test-support.tsx`의 `fakeController`에 `subscribe`를
 * 얹는다. 기존 fake는 FormattingToolbar가 소유하므로 고치지 않는다.
 */
import { act } from "@testing-library/react";
import { vi } from "vitest";

import { fakeController } from "./formatting-toolbar-test-support.js";

/**
 * `subscribe`를 가진 fake controller를 만든다. 인자는 `fakeController`와 같다.
 *
 * 실제 편집기는 상태가 바뀔 때 listener를 부른다. fake는 그 시점을 테스트가
 * 정하도록 `emit()`을 노출한다 — `emit()`을 부르기 전에 조회 mock의 반환값을
 * 바꿔 두면 "상태가 바뀐 뒤 통지"를 재현한다.
 *
 * - `listenerCount()`: 현재 등록된 listener 수. 해제 단언에 쓴다.
 * - `emit()`: 등록된 listener를 모두 부른다. React 갱신을 `act`로 감싼다.
 */
export const fakeStaticToolbarController = (
  ...args: Parameters<typeof fakeController>
) => {
  const controller = fakeController(...args);
  const listeners = new Set<() => void>();
  const subscribe = vi.fn((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  return Object.assign(controller, {
    subscribe,
    listenerCount: () => listeners.size,
    emit: () => {
      act(() => {
        for (const listener of Array.from(listeners)) listener();
      });
    },
  });
};
