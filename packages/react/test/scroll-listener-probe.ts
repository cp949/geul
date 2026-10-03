/**
 * window의 scroll capture 리스너 순증가를 센다. 오버레이가 구독 범위를
 * 지키는지 컴포넌트 수준에서 확인할 때 쓰는 공용 test support다.
 *
 * 렌더 전에 `watchWindowScrollCapture()`로 spy를 세우고 끝나면 `restore()`로
 * 되돌린다. 추가와 제거를 함께 세므로 `net()`은 감시 시작 이후 걸려 있는
 * 리스너 수의 변화량이다.
 */
import { vi } from "vitest";

export type WindowScrollCaptureWatch = {
  net: () => number;
  restore: () => void;
};

type ListenerArgs = readonly [
  type: string,
  listener: unknown,
  options?: boolean | AddEventListenerOptions | EventListenerOptions,
];

const countScrollCapture = (calls: readonly ListenerArgs[]): number =>
  calls.filter(([type, , options]) => {
    if (type !== "scroll") return false;
    return (
      options === true ||
      (typeof options === "object" && options.capture === true)
    );
  }).length;

export const watchWindowScrollCapture = (): WindowScrollCaptureWatch => {
  const add = vi.spyOn(window, "addEventListener");
  const remove = vi.spyOn(window, "removeEventListener");
  return {
    net: () =>
      countScrollCapture(add.mock.calls as unknown as ListenerArgs[]) -
      countScrollCapture(remove.mock.calls as unknown as ListenerArgs[]),
    restore: () => {
      add.mockRestore();
      remove.mockRestore();
    },
  };
};
