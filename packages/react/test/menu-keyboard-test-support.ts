/**
 * handleMenuKeyDown을 거치는 테스트가 공용으로 쓰는 keyboard helper(G-TST-002).
 * Enter 반복 억제의 해제만 소유한다.
 */

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
