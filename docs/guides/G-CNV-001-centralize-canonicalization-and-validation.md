# G-CNV-001 canonicalization과 validation은 model이 단독 소유한다

- 상태: `ACTIVE`
- 적용 조건: model, HTML·GFM importer 또는 core adapter의 입력 정규화·검증 변경

## 구현 규칙

- canonicalization과 validation의 권위는 model 공개 함수에 둔다.
- io와 core는 같은 정책을 다시 구현하지 않는다.
- canonicalization은 idempotent하게 만들고 의미 충돌은 조용히 제거하지 않고 validation에 넘긴다.
- importer 결과를 별도 보정 없이 core가 수용하는 integration test를 둔다.

## 검증

```bash
pnpm --filter @cp949/geul-model test
pnpm --filter @cp949/geul-io test
pnpm --filter @cp949/geul-core test
```
