# PIT-0015 test tsconfig는 clean checkout에서 dependency dist를 요구할 수 있다

- 상태: `ACTIVE`
- 적용 조건: workspace package의 별도 `tsconfig.test.json`이 다른 package type을 import
- 정상 가이드: [`G-WKS-003`](../guides/G-WKS-003-typecheck-tests-and-non-package-sources.md)
- 최초 근거: Issue #32

## 오해하기 쉬운 신호

`pnpm verify`는 build 뒤 typecheck라 통과하지만 clean checkout에서 `turbo run typecheck`만 실행하면 `Cannot find module`로 실패한다.

## 원인과 회피

test config는 project reference가 아니라 dependency package의 `exports.types`와 `dist`를 읽는다. Turbo `typecheck`가 `^build`에 의존하게 한다.

## 탐지

dependency `dist`가 없는 격리 환경에서 `pnpm exec turbo run typecheck --filter=<consumer> --force`를 실행하고, 검증 뒤 build로 산출물을 복구한다.
