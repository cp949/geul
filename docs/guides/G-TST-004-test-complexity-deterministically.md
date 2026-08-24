# G-TST-004 복잡도 회귀는 작업량으로 검증한다

- 상태: `ACTIVE`
- 적용 조건: 성능 최적화, 대용량 fixture, 시간 상한 또는 서드파티 성능 patch 변경
- 관련 함정: [`PIT-0034`](../pitfalls/PIT-0034-verify-wall-clock-limits-separate-regression-from-load-noise.md)

## 구현 규칙

- wall-clock 대신 getter 접근 횟수, helper 호출 횟수 등 결정적인 작업량을 센다.
- 크기가 다른 두 입력에서 작업량 증가율을 비교한다.
- 계측 축을 둘 이상 사용하고, helper 재순회·인라인 재순회·사본 재순회 변이로 각각 RED를 확인한다.
- 시간 상한은 심각한 붕괴 탐지에만 사용한다. 정상 코드의 부하 분포와 회귀 코드의 무부하 분포가 겹치면 결정적 작업량 단언으로 대체하거나 보강한다.
- 서드파티 병목은 timeout 상향 전에 `pnpm patch` 가능성을 검토한다. patch가 여러 export 조건 사본에 적용되는지 결정적으로 검사한다.

## 검증

관련 focused test에 회귀 변이를 넣어 실패를 확인한 뒤 되돌리고 source diff가 비었는지 확인한다.
