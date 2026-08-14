# PIT-0005 미지원 Markdown의 원문 의미를 보존한다

- 상태: `ACTIVE`
- 적용 영역: GFM import, warning, source position recovery
- 최초 근거: R0 commit `a23cfe8`

## 상황과 징후

미지원 block, image reference 또는 깨진 reference 문법을 import할 때 사용자에게 보이던 alt, destination, 구획 경계나 구두점이 사라지거나 중복 warning이 생긴다.

## 근본 원인

Markdown parser AST는 resolved reference와 unresolved·malformed source를 같은 수준으로 보존하지 않는다. AST만 변환하면 원문에 있던 의미 있는 텍스트와 위치를 복원할 수 없다.

## 예방 규칙

- 지원하지 않는 문법도 가능한 한 보이는 텍스트와 block 경계를 유지한다.
- AST가 잃는 reference 형태는 source position과 원문 slice를 사용해 복원한다.
- escaped syntax와 실제 image reference를 구분한다.
- 의미 손실은 종류와 위치가 있는 warning으로 보고하고 조용히 삭제하지 않는다.

## 검증 방법

resolved, missing, collapsed, shortcut, escaped와 malformed image reference를 인접 구두점과 함께 fixture로 고정한다.

```bash
pnpm --filter @cp949/geul-io test
```

## 실제 근거

- `packages/io/src/markdown/import-markdown.ts`
- `packages/io/test/markdown-round-trip.test.ts`
- commit `a23cfe8`에서 미지원 구조와 image의 명시적 downgrade, reference 정의, 축약형과 malformed 원문 복원을 함께 고정했다.

## 관련 문서

- [독자 저장 모델 ADR](../adr/0001-own-versioned-document-model.md)
