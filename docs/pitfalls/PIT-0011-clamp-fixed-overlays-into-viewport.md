# PIT-0011 anchor가 같아도 overlay 크기 변경은 clamp를 무효화한다

- 상태: `ACTIVE`
- 적용 조건: 내용·mode에 따라 크기가 바뀌는 fixed overlay
- 지배 가이드: [`G-UI-001`](../guides/G-UI-001-build-dismissible-overlays.md)
- 반복 근거: R1 clamp 도입 뒤 Issue #43 리뷰 — 기존 규칙이 있는 상태에서 미적용·부분 적용 clamp 잔여와 `max-height` 항목 누락이 재발

## 오해하기 쉬운 신호

처음 열린 overlay는 viewport 안에 있지만 view→editing 전환처럼 자체 크기만 바뀌면 화면 밖으로 나간다. jsdom rect는 0이라 unit test가 통과한다.

## 원인

anchor 좌표만 dependency로 둔 clamp 값은 overlay 자체 크기 변경을 관측하지 못한다. 구현 규칙은 `G-UI-001`이 소유한다.

## 탐지

실제 Chromium에서 mode를 전환한 뒤 네 경계와 마지막 항목 클릭 가능성을 확인한다.
