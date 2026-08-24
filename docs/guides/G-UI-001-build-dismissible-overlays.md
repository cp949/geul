# G-UI-001 dismissible overlay는 공용 hook과 render 후 geometry로 구현한다

- 상태: `ACTIVE`
- 적용 조건: menu·toolbar·popover의 바깥 클릭, Escape, 위치 계산 또는 focus 처리

## 구현 규칙

- 바깥 pointerdown과 Escape는 `useDismissOnOutsideOrEscape`를 사용한다. `allowSelectors`는 module-scope 상수로 둔다.
- 바깥 클릭과 Escape callback을 분리한다. Escape만 편집기로 초점을 복구한다.
- selection·input 관측으로 열리는 overlay는 닫은 상태의 안정 key를 ref에 기록하고 같은 상태의 재관측만 무시한다 — Escape 직후 같은 selection이 다시 관측되어 재오픈할 수 있다. 실제 text나 caret이 바뀌면 다시 열리게 하고, listener는 mount 동안 유지하며 최신 상태는 ref로 읽는다.
- `position: fixed` overlay는 `useLayoutEffect`에서 렌더된 크기를 재고 viewport 안으로 clamp한다.
- CSS transform offset을 clamp 입력에 포함하고, 크기 변경은 `ResizeObserver`로 다시 계산한다.
- viewport보다 큰 overlay는 `max-height`와 `overflow-y: auto`를 사용한다.
- geometry를 여러 기능이 공유하면 DOM rect를 한 번 읽어 파생한다. viewport 좌표를 React key로 쓰지 않는다.

## 검증

[`G-TST-001`](./G-TST-001-test-overlays-and-keyboard-interactions.md)을 적용한다. 네 viewport 경계와 마지막 항목의 실제 클릭 가능성을 Chromium E2E에서 확인한다.
