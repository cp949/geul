# PIT-0006 build하지 않은 배포 검증은 stale dist를 검사한다

- 상태: `ACTIVE`
- 적용 조건: source 변경 뒤 consumer fixture·package export·E2E 검증
- 정상 가이드: [`G-WKS-002`](../guides/G-WKS-002-build-before-distribution-verification.md)
- 최초 근거: R0

## 오해하기 쉬운 신호

source는 바뀌었지만 consumer와 E2E가 이전 `dist`를 읽어 통과하거나 엉뚱한 실패를 낸다.

## 원인과 회피

배포 소비자는 source가 아니라 build 산출물을 읽는다. consumer fixture와 E2E 전에 workspace build를 실행한다.

## 탐지

가이드의 순서대로 build → consumer typecheck → E2E를 실행한다. 생성된 `dist`를 편집하거나 커밋하지 않는다.
