# PIT-0006 배포 산출물 검증 전에 build한다

- 상태: `ACTIVE`
- 적용 영역: package exports, consumer fixture, E2E, CI
- 최초 근거: R0 commit `49fed67`

## 상황과 징후

소스 typecheck와 unit test는 통과하지만 consumer fixture 또는 E2E가 누락되거나 이전 상태의 `dist`를 읽어 실패한다. 반대로 오래된 산출물을 검사해 현재 소스의 배포 가능성을 잘못 통과시킬 수도 있다.

## 근본 원인

배포 소비 검증은 source가 아니라 package exports가 가리키는 build 산출물을 사용한다. build와 소비 검증 사이의 순서가 명시되지 않으면 작업공간의 우연한 `dist` 상태에 의존한다.

## 예방 규칙

- consumer fixture와 E2E 전에 workspace build를 명시적으로 실행한다.
- 최종 게이트가 build 뒤에 배포 소비와 브라우저 검증을 실행하도록 순서를 고정한다.
- 생성된 `dist`를 소스처럼 편집하거나 커밋하지 않는다.

## 검증 방법

```bash
pnpm build
pnpm --filter consumer-fixture typecheck
pnpm test:e2e
```

## 실제 근거

- 루트 `package.json`의 `verify` script
- `fixtures/consumer/`
- commit `49fed67`에서 배포 검증 전에 build가 실행되도록 최종 게이트 순서를 고정했다.

## 관련 문서

- [계층형 패키지 ADR](../adr/0002-enforce-layered-package-boundaries.md)
