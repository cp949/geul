# PIT-0028 isolate:false에서는 module-scope teardown 소유권이 file 경계와 어긋난다

- 상태: `ACTIVE`
- 적용 조건: 공용 test support가 module-scope 자원과 `afterEach`를 함께 소유하고 Vitest isolation 변경
- 정상 가이드: [`G-TST-003`](../guides/G-TST-003-clean-up-test-resources.md)
- 최초 근거: Issue #103

## 오해하기 쉬운 신호

기본 gate는 통과하지만 `--no-isolate --no-file-parallelism` 반복 실행에서 다른 test file의 fixture가 남거나 계약 test가 불규칙하게 실패한다.

## 원인

공용 module은 cache되지만 hook 등록·실행 scope는 test file 경계와 일치하지 않을 수 있다. 자원 정리 구현 규칙은 `G-TST-003`이 소유한다.

## 탐지

package 디렉터리에서 Vitest를 직접 호출해 `--no-isolate --no-file-parallelism` 조합을 반복한다. 실제 command line은 [`PIT-0029`](./PIT-0029-verify-pnpm-passthrough-flags-reach-the-real-command.md)에 따라 확인한다.
