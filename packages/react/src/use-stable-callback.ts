import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * 렌더마다 새로 만든 클로저를 참조가 안정적인 함수로 감싼다. 호출 시점에는
 * 마지막으로 커밋된 렌더의 클로저를 부른다. `React.memo` 자식에 콜백을 넘길 때
 * 쓴다 — 콜백 참조가 매 렌더 바뀌면 memo가 항상 깨진다.
 *
 * ref는 layout effect에서 갱신한다. 렌더 중에는 쓰지 않는다. 이 함수는
 * 이벤트 핸들러로만 부른다. 렌더 본문이나 effect 안에서 부르면 이전 렌더의
 * 클로저를 볼 수 있다.
 */
export const useStableCallback = <Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): ((...args: Args) => Result) => {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
};
