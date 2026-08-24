# G-UI-001 dismissible overlay는 공용 hook과 render 후 geometry로 구현한다

- 상태: `ACTIVE`
- 적용 조건: menu·toolbar·popover의 바깥 클릭, Escape, 위치 계산 또는 focus 처리
- 관련 함정: [`PIT-0009`](../pitfalls/PIT-0009-verify-keyboard-close-with-parallel-e2e.md), [`PIT-0011`](../pitfalls/PIT-0011-clamp-fixed-overlays-into-viewport.md), [`PIT-0014`](../pitfalls/PIT-0014-set-contenteditable-attribute-in-jsdom-fakes.md)

## 구현 규칙

- 바깥 pointerdown과 Escape는 `useDismissOnOutsideOrEscape`를 사용한다. `allowSelectors`는 module-scope 상수로 둔다.
- 바깥 클릭과 Escape callback을 분리한다. Escape만 편집기로 초점을 복구한다.
- `position: fixed` overlay는 `useLayoutEffect`에서 렌더된 크기를 재고 viewport 안으로 clamp한다.
- CSS transform offset을 clamp 입력에 포함하고, 크기 변경은 `ResizeObserver`로 다시 계산한다.
- viewport보다 큰 overlay는 `max-height`와 `overflow-y: auto`를 사용한다.
- geometry를 여러 기능이 공유하면 DOM rect를 한 번 읽어 파생한다. viewport 좌표를 React key로 쓰지 않는다.

## 검증

[`G-TST-001`](./G-TST-001-test-overlays-and-keyboard-interactions.md)을 적용한다. 네 viewport 경계와 마지막 항목의 실제 클릭 가능성을 Chromium E2E에서 확인한다.
