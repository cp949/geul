# PIT-0004 저장 배열 대신 논리 테이블 순서를 사용한다

- 상태: `ACTIVE`
- 적용 영역: table model, HTML/GFM 변환, 향후 table command
- 최초 근거: R0 commit `1b2c23e`, `49fed67`

## 상황과 징후

셀 배열이 열 순서와 다르거나 row/column span이 교차할 때 header column, HTML 직렬화 순서 또는 round-trip 결과가 바뀐다.

## 근본 원인

독자 문서는 기준 셀과 `columnId`를 저장한다. 배열 위치를 논리 좌표로 간주하면 안정 ID와 span이 정의하는 실제 격자를 무시하게 된다.

## 예방 규칙

- table 동작과 직렬화는 열 ID와 span을 논리 격자로 투영한 결과를 사용한다.
- 저장 배열의 우연한 순서를 사용자에게 보이는 열 순서로 사용하지 않는다.
- 역순 셀 배열, 병합, header row/column 교차 fixture를 포함한다.
- R1의 모든 table mutation은 같은 논리 격자 권위를 사용한다.

## 검증 방법

```bash
pnpm --filter @cp949/geul-model test
pnpm --filter @cp949/geul-io test
pnpm test:e2e
```

## 실제 근거

- `packages/model/src/table-grid-validation.ts`
- `packages/io/test/html-round-trip.test.ts`
- `e2e/editor-round-trip.spec.ts`
- commit `1b2c23e`에서 비정렬 셀 배열의 header column round-trip을 보강했다.
- commit `49fed67`에서 브라우저 논리 순서와 교차 header metadata를 검증했다.

## 관련 문서

- [독자 저장 모델 ADR](../adr/0001-own-versioned-document-model.md)
