# Issue #166 — io 패키지 typecheck 게이트 (quote 타입 좁히기)

## 목표

`pnpm --filter @cp949/geul-io typecheck`가 `markdown-quote-loss.test.ts`의 `quote?.children` 접근에서 실패하는 것을 실제 타입가드로 좁혀 통과시킨다.

## 확정 커밋

- `7c1336a` — `fix(io): quote 재import 테스트의 타입 좁히기를 실제 type predicate로 고친다 (Issue #166)`

## 변경

- `packages/io/test/markdown-quote-loss.test.ts`: 로컬 `isQuoteBlock(block): block is QuoteBlock` type predicate 추가. `expect(quote?.type).toBe("quote")` 뒤 `if (!quote || !isQuoteBlock(quote)) throw new Error(...)`로 좁혀 `quote.children` 접근이 `as` 캐스트 없이 컴파일된다.
- 계획 단계에서 저장소 기존 "가드+`as` 캐스트" idiom(`table.test.ts`, `markdown-round-trip-downgrade.test.ts`)을 그대로 따르려던 초안은 폐기했다 — `CustomBlock.type: string`이 리터럴이 아니라 열려 있어 그 idiom도 `CustomBlock`을 실제로는 배제하지 못한다는 사실을 구현 중 발견해, 사용자 승인 아래 로컬 type predicate 방식으로 바꿨다.

## 검증

- `pnpm --filter @cp949/geul-io typecheck`: exit 0.
- `pnpm --filter @cp949/geul-io exec vitest run --root ../.. test/markdown-quote-loss.test.ts`: 21 tests, 21 passed.
- 결함 탐지 리뷰(읽기 전용 subagent): `packages/model/src/types.ts`·`block-schema.ts` 대조로 `isQuoteBlock` 오탐 불가능성 확인, 발견 0건.
- `pnpm verify` 전량: 통과(unit, e2e Chromium 205개, lint, format, build, escompat, package boundaries, licenses 포함).

## 남은 제한

같은 반복 패턴(`?.type).toBe(...)` 뒤 narrowing 없이 접근)이 다른 21개 테스트 파일에 남아 있으나 전량 typecheck 통과 중이라 게이트 구멍이 아니다 — 이번 범위에서 제외했고 별도 이슈로 등록하지 않았다(`issue-tracker.md` 등록 기준 미충족).

## GitHub

- Issue #166 완료 댓글: `issuecomment-5598535219`
- Issue #166 종료.
- commit·`dev` ff-only merge 완료. push·tag·PR 생성은 수행하지 않았다.
