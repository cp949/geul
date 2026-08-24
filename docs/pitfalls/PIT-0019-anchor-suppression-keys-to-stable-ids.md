# PIT-0019 재정렬 뒤 React가 재사용한 DOM은 이동 후 index를 본다

- 상태: `ACTIVE`
- 적용 조건: stable key 항목 재정렬 뒤 같은 DOM node의 후속 click 억제
- 정상 가이드: [`G-UI-002`](../guides/G-UI-002-key-reordered-ui-by-stable-id.md)
- 최초 근거: Issue #17

## 오해하기 쉬운 신호

drag 시작 index를 저장했지만 재정렬 직후 합성 click이 메뉴를 연다. command가 성공해도 실패해도 index 비교가 어긋날 수 있다.

## 원인

React가 stable key DOM을 재사용하면서 handler closure는 이동 후 index로 갱신한다. 안정 ID와 억제 상태 수명 규칙은 `G-UI-002`가 소유한다.

## 탐지

실제 DOM 순서를 바꾸는 unit test와 동일 DOM node에 후속 click을 보내는 Chromium E2E를 실행한다.
