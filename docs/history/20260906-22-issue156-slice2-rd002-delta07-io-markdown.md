# Issue #156 슬라이스2 RD-002 DELTA-07 — io: markdown 3파일 typecheck 정리

## 목표

roadmap-workflow RD-002의 일곱 번째 DELTA. `export-markdown.ts`/`import-markdown.ts`/`loss-analysis.ts`(총 8곳 typecheck 에러)를 정리한다. 이 DELTA로 `io` src 전체(`tsc -p tsconfig.json --noEmit`)가 clean해진다.

## 확정 커밋

- `69ad2c1` — feat(io): markdown 3파일에 top-level CustomBlock typecheck 정리(RD-002-DELTA-07)

## 변경한 계약과 파일

- `packages/io/src/markdown/export-markdown.ts` — `exportMarkdown`이 mode(strict/lossy)와 무관하게 top-level CustomBlock을 기존 `MARKDOWN_DOCUMENT_INVALID`로 즉시 거절한다(`io`의 DELTA-05와 동일 임시 거절 패턴 — 기존 strict/lossy 손실 목록에 섞지 않고 진입점에서 조기 거절). `documentNode`/`flattenBlocks` 호출부는 가드 통과 후 `as Block[]` 캐스트.
- `packages/io/src/markdown/import-markdown.ts` — markdown 파서는 CustomBlock을 만드는 문법이 없어(이 슬라이스 범위 밖) 9개 내부 헬퍼의 반환·파라미터 타입이 파생 타입 `Document["blocks"]`로 선언돼 있었을 뿐이다(DELTA-06의 `import-html.ts`와 동일 원인) — `Block[]`/`Block`으로 되돌려 5곳 해소.
- `packages/io/src/markdown/loss-analysis.ts` — `analyzeMarkdownLoss`가 `exportMarkdown` 외 여러 테스트가 직접 호출하는 공개 API라 자체적으로 `isKnownBlockType` 가드를 둬 미등록 타입을 크래시 없이 건너뛴다(손실 kind 분류 자체는 RD-003 몫, 이 DELTA는 크래시 방지만).
- `packages/io/test/unsupported-block-markdown-export.test.ts`(신규) — 4 tests.

## 검증

- `pnpm --filter @cp949/geul-io exec vitest run --root ../.. packages/io/test/unsupported-block-markdown-export.test.ts` — 4 passed.
- `pnpm --filter @cp949/geul-io test`(전체) — 73/73 파일, 639 tests passed(기존 635 + 신규 4), 회귀 없음.
- `pnpm --filter @cp949/geul-io exec tsc -p tsconfig.json --noEmit`(stale tsbuildinfo 삭제 후) — **`io` src 전체 0건**(DELTA-05 착수 전 34건에서 05~07로 전부 해소).
- post-fix mutation 검증 2건: (1) `exportMarkdown` 거절 가드 무력화 → strict/lossy 둘 다 계획대로 크래시로 재실패. (2) `analyzeMarkdownLoss`의 `isKnownBlockType` 가드 제거 → `collectBlockLosses`가 계획대로 크래시로 재실패. 둘 다 원복 후 재검증.

## 등록한 이슈

없음.

## 남은 제한

- `io`/`react` test 파일 typecheck 정리(DELTA-08·10), `react` src(DELTA-09)가 이어진다.
- `pnpm --filter @cp949/geul-io typecheck`(test 포함)/`pnpm --filter @cp949/geul-core typecheck`(project reference)는 DELTA-08까지 끝나야 다시 통과한다.
- markdown 쪽 CustomBlock 인코딩 문법, `analyzeMarkdownLoss`의 `CUSTOM_BLOCK_LOST` 손실 kind는 RD-003 범위 — 이 DELTA에서 다루지 않았다.
- GitHub Issue #156에는 댓글을 게시하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 69ad2c1`. 위험: 낮음 — 기존 에러 코드 재사용 + 타입 주석 정리 + 방어 가드뿐, 기존 동작 변경 없음(회귀 테스트로 확인).
