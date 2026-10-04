/**
 * handleMenuKeyDown을 거치는 테스트가 공용으로 쓰는 keyboard helper(G-TST-002).
 * Enter 반복 억제의 해제, 억제 관찰(문서 keydown 전송·리스너 수)을 소유한다.
 */

import { vi } from "vitest";

/**
 * 문서에 Enter keyup을 보내 handleMenuKeyDown이 처음 Enter에 건 문서 capture
 * 반복 억제를 푼다.
 *
 * 억제가 남으면 다음 테스트의 반복 Enter가 문서 capture에서 삼켜진다. 그러면
 * `defaultPrevented`가 가짜로 참이 된다. 단언이 먼저 던져도 풀리도록
 * `afterEach`에서 부른다.
 */
export const releaseEnterRepeatSuppression = (): void => {
  document.dispatchEvent(
    new KeyboardEvent("keyup", { key: "Enter", bubbles: true }),
  );
};

/**
 * 문서의 keydown·keyup capture 리스너 수를 add/remove 호출로 센다. 같은
 * keydown을 항목 버튼과 컨테이너가 두 번 부르는 경우의 누수를 이벤트
 * 동작으로는 볼 수 없어 리스너 수로 본다.
 *
 * `document`의 add/remove를 spy로 바꾼다. 호출한 테스트는 `afterEach`에서
 * `vi.restoreAllMocks()`로 되돌린다.
 */
export const trackCaptureListeners = (): (() => number) => {
  const live = new Set<EventListenerOrEventListenerObject>();
  const isCapture = (options: unknown) =>
    options === true ||
    (typeof options === "object" &&
      options !== null &&
      "capture" in options &&
      options.capture === true);
  const originalAdd = document.addEventListener.bind(document);
  const originalRemove = document.removeEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation(
    (type, listener, options) => {
      if (
        (type === "keydown" || type === "keyup") &&
        isCapture(options) &&
        listener !== null
      ) {
        live.add(listener);
      }
      originalAdd(type, listener, options);
    },
  );
  vi.spyOn(document, "removeEventListener").mockImplementation(
    (type, listener, options) => {
      if (listener !== null) live.delete(listener);
      originalRemove(type, listener, options);
    },
  );
  return () => live.size;
};

/**
 * 문서에 keydown 하나를 실제로 보내 반복 억제가 걸려 있는지 본다. 억제가
 * 걸려 있으면 문서 capture에서 삼켜져 body 리스너에 닿지 않고
 * `defaultPrevented`가 된다.
 */
export const dispatchKeydown = (init: {
  key: string;
  repeat?: boolean;
}): { reachedTarget: boolean; defaultPrevented: boolean } => {
  let reachedTarget = false;
  const listener = () => {
    reachedTarget = true;
  };
  document.body.addEventListener("keydown", listener);
  const event = new KeyboardEvent("keydown", {
    ...init,
    bubbles: true,
    cancelable: true,
  });
  document.body.dispatchEvent(event);
  document.body.removeEventListener("keydown", listener);
  return { reachedTarget, defaultPrevented: event.defaultPrevented };
};

/** 반복 Enter keydown이 문서 capture에서 삼켜지는지. */
export const isRepeatEnterSwallowed = (): boolean => {
  const { reachedTarget, defaultPrevented } = dispatchKeydown({
    key: "Enter",
    repeat: true,
  });
  return !reachedTarget && defaultPrevented;
};
