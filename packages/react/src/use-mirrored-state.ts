import { type MutableRefObject, useCallback, useRef, useState } from "react";

// state와 ref를 항상 같은 값으로 함께 갱신하는 wrapper다. ref는 이벤트
// 핸들러(pointermove 등)가 클로저를 다시 만들지 않고도 최신값을 읽기 위해
// 필요하고, state는 그 값을 렌더에 반영하기 위해 필요하다 —
// table-handles.tsx 3곳(hover 대상, 재정렬 상태, 리사이즈 상태)과
// block-side-menu.tsx 1곳(드래그 상태)에 타입만 다르고 바이트 단위로
// 반복되던 패턴이다(3차 리뷰 후보 S).
export const useMirroredState = <T>(
  initial: T,
): [T, MutableRefObject<T>, (next: T) => void] => {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(initial);
  const update = useCallback((next: T) => {
    ref.current = next;
    setValue(next);
  }, []);
  return [value, ref, update];
};
