# PIT-0002 canonicalization과 validation을 중앙화한다

- 상태: `ACTIVE`
- 적용 영역: model, HTML/GFM importer, core adapter
- 최초 근거: R0 commit `3990396`, `49fed67`

## 상황과 징후

개별 package 테스트는 통과하지만 importer가 만든 문서를 core가 거부하거나, mark 순서·중복 link·문자열 정규화·URL 허용 여부가 변환 경계마다 다르게 판정된다.

## 근본 원인

같은 독자 문서 불변식을 model, io와 core가 각각 구현하면 허용 집합과 정규형이 조금씩 달라진다. 단독 테스트만으로는 package를 조합할 때 생기는 불일치를 드러내지 못한다.

## 예방 규칙

- canonicalization과 validation의 권위는 model에 둔다.
- io와 core는 model의 공개 함수를 사용하고 같은 정책을 재구현하지 않는다.
- importer 결과를 별도 보정 없이 core에 전달하는 integration test를 둔다.
- 중복 입력의 canonicalization은 idempotent해야 하며, 의미 충돌은 조용히 제거하지 않고 validation에 넘긴다.

## 검증 방법

```bash
pnpm --filter @cp949/geul-model test
pnpm --filter @cp949/geul-io test
pnpm --filter @cp949/geul-core test
```

`packages/core/test/io-import-integration.test.ts`에서 HTML/GFM importer 결과를 core가 직접 수용하는지 확인한다.

## 실제 근거

- `packages/model/src/mark-canonicalization.ts`
- `packages/model/src/link-policy.ts`
- `packages/model/src/string-invariants.ts`
- `packages/core/test/io-import-integration.test.ts`
- commit `3990396`에서 link 정책을 model로 이동했다.
- commit `49fed67`에서 공통 mark·문자열 불변식, package 조합 테스트, 중복 mark 정규형의 idempotence와 충돌 보존을 보강했다.

## 관련 문서

- [계층형 패키지 ADR](../adr/0002-enforce-layered-package-boundaries.md)
