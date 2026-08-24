# G-UI-002 재정렬 UI의 상태와 후속 event를 안정 ID로 연결한다

- 상태: `ACTIVE`
- 적용 조건: stable React key를 가진 행·열·블록을 재정렬하거나 후속 click을 억제

## 구현 규칙

- 조작 대상을 index가 아니라 `rowId`·`columnId`·`blockId`로 저장한다 — React가 stable key DOM을 재사용하면 handler closure는 이동 후 index로 갱신되므로 저장한 index는 재정렬 뒤 어긋난다.
- 빈 ID는 index로 대체하지 않고 억제를 걸지 않는 fail-open으로 처리한다.
- 억제 상태는 후속 event 소비뿐 아니라 다음 gesture의 `pointerdown`에서도 비운다.
- 회귀 테스트는 no-op mock 대신 실제 DOM·권위 속성 순서를 바꾸거나 실제 browser drag를 사용한다.
- 후속 합성 click을 검증하면 drag 시작 전 붙잡은 동일 DOM node에 명시적으로 dispatch한다.

## 완료 기준

재정렬 성공·거절·후속 click 미도착 뒤 다음 진짜 click 시나리오가 unit과 focused E2E에서 모두 통과한다.
