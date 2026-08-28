# PIT-0038 implementer가 패키지 복합 typecheck 대신 tsconfig.json 단독 tsc를 실행한다

- 상태: `ACTIVE`
- 적용 조건: 패키지에 `tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit` 형태의 복합 `typecheck` 스크립트가 있고, subagent(implementer)에게 typecheck를 포함한 검증을 위임하는 작업
- 지배 가이드: [`G-WKS-003`](../guides/G-WKS-003-typecheck-tests-and-non-package-sources.md)
- 반복 근거: Issue #38 슬라이스 1 트랙-4에서 2회 반복 — DELTA-02 implementer·즉시 리뷰가 "tsc/lint 통과"만 보고하고 `tsconfig.test.json`을 실행하지 않아 테스트 파일의 TS2352 5건이 커밋 2개에 남았고(다음 DELTA 게이트에서 발견), DELTA-02a implementer는 명시적으로 `npx tsc -p tsconfig.json --noEmit` exit 0만 보고해 신규 테스트의 `Block.children` 접근 오류 2건을 메인 세션 게이트가 재실행으로 발견했다.

## 오해하기 쉬운 신호

`npx tsc -p tsconfig.json --noEmit`이 exit 0을 내고 `pnpm --filter <pkg> test`(vitest)도 전부 통과해 "타입·테스트 다 통과"로 보인다. vitest는 타입 검사를 하지 않고 `tsconfig.json`은 `test/`를 포함하지 않으므로, 테스트 파일 전용 타입 오류(유니온 좁히기 실패, 클로저 재대입 후 무효 캐스트 등)가 완전히 가려진다.

## 원인

구현 prompt·검증 명령이 "typecheck"를 일반 명사로만 지시하면 implementer가 즉석에서 `npx tsc -p tsconfig.json`을 골라 실행한다 — `package.json`의 `typecheck` 스크립트가 두 tsconfig를 묶어 실행하도록 이미 설계돼 있다는 사실을 놓친다.

## 탐지

- 구현 prompt의 검증 명령에 vitest focused 명령과 별개로 `pnpm --filter <패키지> typecheck`(패키지의 복합 스크립트 그대로, 개별 tsconfig 아님)를 명시한다.
- implementer 보고가 "tsc 통과"라고만 하고 어느 tsconfig인지 명시하지 않으면, 메인 세션 게이트가 `pnpm --filter <패키지> typecheck`를 직접 재실행해 판정한다.
