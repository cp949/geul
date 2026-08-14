# PIT-0001 소비자 증거로 패키지 경계를 검증한다

- 상태: `ACTIVE`
- 적용 영역: workspace manifest, TypeScript 환경, 공개 declaration, 배포 package
- 최초 근거: R0 commit `1cfb626`, `49fed67`

## 상황과 징후

package manifest의 의존 방향은 맞지만 model 또는 io가 DOM 전역을 컴파일하거나, 공개 declaration이 내부 편집기 타입을 노출하거나, 소스 import만 성공하고 실제 `dist` 소비가 실패한다.

## 근본 원인

manifest 검사, 소스 typecheck와 unit test는 서로 다른 경계를 증명한다. 한 종류의 검사 결과를 패키지 환경과 배포 소비 전체의 증거로 확대하면 누수를 놓친다.

## 예방 규칙

- manifest의 허용·금지 의존성을 검사한다.
- model과 io를 DOM lib 없이 별도 compiler fixture로 검사한다.
- core 공개 `.d.ts`에서 Tiptap/ProseMirror 타입 누수를 검사한다.
- 빌드된 package exports만 사용하는 consumer fixture를 검사한다.

## 검증 방법

```bash
pnpm check:boundaries
pnpm build
pnpm --filter consumer-fixture typecheck
```

## 실제 근거

- `tests/workspace-boundaries.test.ts`
- `tests/fixtures/model-dom-forbidden.tsconfig.json`
- `tests/fixtures/io-dom-forbidden.tsconfig.json`
- `packages/core/test/public-types.test.ts`
- `fixtures/consumer/src/index.ts`
- commit `1cfb626`에서 DOM compiler fixture와 의존성 검사를 강화했다.
- commit `49fed67`에서 배포 소비 fixture를 최종 게이트에 연결했다.

## 관련 문서

- [계층형 패키지 ADR](../adr/0002-enforce-layered-package-boundaries.md)
