# Issue #156 슬라이스2 RD-002 DELTA-05 — io: export-html.ts, top-level CustomBlock 로드 명시적 거절

## 목표

roadmap-workflow RD-002의 다섯 번째 DELTA. `export-html.ts`(21곳 typecheck 에러)를 정리한다. CustomBlock의 HTML 렌더러가 아직 없으므로(registry는 RD-002-DELTA-11), top-level CustomBlock이 있는 문서를 `exportHtml`에 넣으면 기존 `HTML_DOCUMENT_INVALID`로 명시적으로 거절한다(사용자 확인, 2026-09-06 — core DELTA-04와 동일한 "임시 거절" 패턴 채택).

## 확정 커밋

- `c3d4aae` — feat(io): export-html.ts에 top-level CustomBlock 로드 명시적 거절(RD-002-DELTA-05)

## 변경한 계약과 파일

- `packages/io/src/html/export-html.ts` — `exportHtml`이 `document.blocks`에서 top-level 미등록 타입(`!isKnownBlockType`)을 찾으면 HTML 직렬화 시도 전에 기존 `HTML_DOCUMENT_INVALID` 에러 코드로 즉시 거절한다(새 에러 코드 추가 없음, 신규 공개 계약 변경 없음). `blockNode`의 파라미터 타입을 파생 타입 `Document["blocks"][number]`에서 `Block`으로 되돌렸다 — 이 함수는 실제로 `blockNodes(blocks: Block[])`의 내부 순회와 `Block[]`인 `children` 재귀 호출에서만 호출돼 `CustomBlock`을 받을 일이 없는데, 파생 타입 선언 때문에 `Document.blocks` 위젠(DELTA-01)이 그대로 흘러들어 무관한 20곳까지 typecheck 에러가 났었다.
- `packages/io/test/unsupported-block-export.test.ts`(신규) — 2 tests. 파일명은 기존 fixture(`quote-divider-document.ts`)의 문서 주석이 이미 예고해 둔 이름을 그대로 썼다.

## 검증

- `pnpm --filter @cp949/geul-io exec vitest run --root ../.. packages/io/test/unsupported-block-export.test.ts` — 2 passed.
- `pnpm --filter @cp949/geul-io test`(전체) — 72/72 파일, 635 tests passed(기존 633 + 신규 2), 회귀 없음.
- `pnpm --filter @cp949/geul-io exec tsc -p tsconfig.json --noEmit`(stale tsbuildinfo 삭제 후) — `export-html.ts` 에러 0건(이전 21건). `import-html.ts`/`export-markdown.ts`/`import-markdown.ts`/`loss-analysis.ts`는 이 DELTA 범위 밖이라 계속 에러가 남는다(DELTA-06·07 대상).
- post-fix mutation 검증 1건: 거절 가드를 `parsed.value.blocks.find(() => false)`로 무력화 → 신규 테스트가 RED 때와 동일한 크래시(`content.flatMap is not a function`)로 재실패 확인 후 원복, 재검증.

## 등록한 이슈

없음.

## 남은 제한

- DELTA-05 착수 전 재측정 결과 원래 계획(io 6파일·react 2파일, src만)보다 훨씬 컸다: `io` src 5파일/34곳 + test 16파일/51곳, `react` src 1파일/1곳 + test 7파일/62곳. `RD-002.md`의 "예상 DELTA"를 05~10으로 재분할(구 DELTA-06/07은 11/12로 이동): DELTA-06(`import-html.ts`)·07(markdown 3파일)·08(io test)·09(react src)·10(react test)가 이어진다.
- `pnpm --filter @cp949/geul-io typecheck`/`pnpm --filter @cp949/geul-core typecheck`(project reference)는 DELTA-06·07까지 끝나야 src 기준 다시 통과하고, DELTA-08·10까지 끝나야 test 기준도 통과한다.
- GitHub Issue #156에는 댓글을 게시하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert c3d4aae`. 위험: 낮음 — 기존 에러 코드 재사용 + 명시적 거절 분기뿐, 기존 동작 변경 없음(회귀 테스트로 확인).
