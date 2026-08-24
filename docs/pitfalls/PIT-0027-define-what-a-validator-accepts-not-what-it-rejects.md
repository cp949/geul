# PIT-0027 느슨한 허용 술어 뒤의 관용 처리는 gate 범위를 조용히 비운다

- 상태: `ACTIVE`
- 적용 조건: validator 뒤에 `existsSync`, 기본값, optional chaining 또는 skip 처리 존재
- 정상 가이드: [`G-WKS-004`](../guides/G-WKS-004-verify-lint-and-gate-changes.md)
- 최초 근거: Issue #107

## 오해하기 쉬운 신호

거절 사례 test가 전부 통과하고 gate가 exit 0이지만 검사 대상 수가 0이 된다.

## 원인

거절 목록에 없는 잘못된 값이 넓은 허용 술어를 통과한 뒤 관용 처리에서 사라진다. validator 구현 규칙은 `G-WKS-004`가 소유한다.

## 탐지

술어를 비우거나 wildcard·주석·빈 줄 같은 경계 입력을 넣는 변이가 test를 RED로 만들고, gate가 보고하는 검사 대상 수가 유지되는지 확인한다.
