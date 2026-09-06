# Issue #156 슬라이스2 RD-002 DELTA-06 — io: import-html.ts typecheck 정리

## 목표

roadmap-workflow RD-002의 여섯 번째 DELTA. `import-html.ts`(5곳 typecheck 에러)를 정리한다. DELTA-05와 달리 이 파일은 새 거절 로직이 필요 없다 — HTML 파서가 CustomBlock을 만드는 경로 자체가 없다.

## 확정 커밋

- `6c40503` — feat(io): import-html.ts 내부 헬퍼 4개 반환 타입을 Block[]로 되돌림(RD-002-DELTA-06)

## 변경한 계약과 파일

- `packages/io/src/html/import-html.ts` — `blocksFromNodes`/`blocksFromSegments`/`blocksFromListElement`/`blocksFromListItem` 네 헬퍼 함수의 반환 타입을 파생 타입 `Document["blocks"]`에서 `Block`으로 되돌렸다. 이 헬퍼들은 top-level 진입점과 중첩 children 재귀(둘 다 `Block[]`만 담아야 하는 자리) 양쪽에서 호출되는데, 실제로 CustomBlock을 만드는 코드가 없어 언제나 `Block[]`만 반환한다 — 반환 타입 선언이 `Document.blocks` 위젠(DELTA-01)의 영향을 그대로 흡수한 것뿐이었다. 새 에러 코드나 거절 분기 추가 없음, 런타임 동작 무변경.

## 검증

- `pnpm --filter @cp949/geul-io test`(전체) — 72/72 파일, 635 tests passed(변화 없음), 회귀 없음.
- `pnpm --filter @cp949/geul-io exec tsc -p tsconfig.json --noEmit`(stale tsbuildinfo 삭제 후) — `import-html.ts` 에러 0건(이전 5건).
- 변이 검증(정적 조건): `git stash`로 네 함수를 원래 상태로 되돌려 5건이 그대로 재현됨을 확인 후 `git stash pop`으로 복원, 재검증.

## 등록한 이슈

없음.

## 남은 제한

- `export-markdown.ts`/`import-markdown.ts`/`loss-analysis.ts`(DELTA-07), `io`/`react` test 파일 typecheck 정리(DELTA-08·10), `react` src(DELTA-09)가 이어진다.
- `pnpm --filter @cp949/geul-io typecheck`는 DELTA-07까지 끝나야 src 기준 다시 통과한다.
- GitHub Issue #156에는 댓글을 게시하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 6c40503`. 위험: 낮음 — 타입 주석 변경뿐, 런타임 로직 무변경(회귀 테스트로 확인).
