import { useCallback, useMemo, useRef } from "react";

// 핸들 keydown(Enter·Space)이 만드는 click만 키보드 열림으로 본다.
// click의 `detail === 0`은 jsdom `fireEvent.click` 기본값이기도 해서 신호로
// 쓰지 않는다. 마우스·터치 열림은 초점을 옮기지 않는다.
const isKeyboardActivationKey = (key: string): boolean =>
  key === "Enter" || key === " ";

/**
 * 핸들 버튼의 키보드 활성화 신호(Issue #233 RD-002).
 * block-side-menu.tsx와 media-handle-overlays.tsx가 같은 규칙을 공유한다.
 *
 * - `onKeyDown`: Enter·Space면 신호를 세운다. 핸들 `onKeyDown`에 연결한다.
 * - `consume`: 신호를 읽고 지운다. click 핸들러가 메뉴를 열기 전에 부른다.
 * - `reset`: 읽지 않고 지운다. pointerdown이 부른다. 키로 눌렀지만 click이
 *   오지 않은 신호가 뒤따르는 마우스 click을 키보드 열림으로 만들지 않게 한다.
 *
 * 반환 객체와 함수는 참조가 안정적이다.
 */
export const useHandleKeyboardActivation = () => {
  const signalRef = useRef(false);

  const onKeyDown = useCallback((event: { key: string }) => {
    if (isKeyboardActivationKey(event.key)) signalRef.current = true;
  }, []);

  const consume = useCallback((): boolean => {
    const signaled = signalRef.current;
    signalRef.current = false;
    return signaled;
  }, []);

  const reset = useCallback(() => {
    signalRef.current = false;
  }, []);

  return useMemo(
    () => ({ onKeyDown, consume, reset }),
    [onKeyDown, consume, reset],
  );
};
