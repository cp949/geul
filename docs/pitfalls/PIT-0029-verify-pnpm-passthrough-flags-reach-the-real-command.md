# PIT-0029 pnpm script의 추가 --는 Vitest flag를 무시시킬 수 있다

- 상태: `ACTIVE`
- 적용 조건: package script 뒤에 임시 Vitest flag 전달
- 지배 가이드: [`G-WKS-004`](../guides/G-WKS-004-verify-lint-and-gate-changes.md)
- 반복 근거: Issue #103 — 트랙-4와 트랙-5가 같은 무효 flag 전달을 "반복 통과" 근거로 기록했고, 트랙-6이 직접 실행으로 무효임을 확인

## 오해하기 쉬운 신호

명령은 통과하지만 실제 command line이 `vitest ... -- --sequence.shuffle` 형태라 뒤 flag가 적용되지 않는다.

## 원인

pnpm과 package script의 pass-through 경계에서 `--`가 하나 더 전달된다. 직접 실행 경로는 `G-WKS-004`가 소유한다.

## 탐지

실행 로그 첫 줄에서 의도한 flag가 추가 `--` 없이 Vitest command에 포함됐는지 확인한다.
