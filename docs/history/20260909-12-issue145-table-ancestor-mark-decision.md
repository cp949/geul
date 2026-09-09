# Issue #145 — Import HTML 표 내부 조상 마크 미상속 규칙 확정

## 목표

Import HTML에서 blockquote/list 등 인라인 마크 조상 아래 중첩된 표가 그 조상 마크를 상속해야 하는지 제품 결정을 확정하고, 결정에 따라 코드를 조정하거나 현재 동작을 문서화하며 회귀 테스트로 고정한다.

## 확정 커밋

- `749b254` — `docs(io): 표 내부 조상 마크 미상속 규칙을 ADR로 확정하고 회귀 테스트로 고정한다 (Issue #145)`

## 결정

표 내부는 조상 인라인 마크(링크 등)를 top-level 직접 중첩·blockquote 중첩·list 중첩 세 진입 경로 모두에서 상속하지 않는다 — 현재(`dev`) 동작을 공식 계약으로 확정했다(`docs/adr/0014-table-content-ignores-ancestor-marks.md`). 조사 결과 세 경로는 이미 self-consistent했고, blockquote/list 경로만 예전(Issue #143 DELTA-01, `06cd986` 이전)에는 상속했지만 top-level 경로는 그때도 상속하지 않았다 — "복원해야 할 예전의 일관된 규칙"은 존재하지 않았다.

## 변경

- `docs/adr/0014-table-content-ignores-ancestor-marks.md`(신규): 위 결정과 근거 기록.
- `packages/io/src/html/block-segmenter.ts`: `wrapTextDescendantsInAncestors` 주석에 ADR 링크 추가. 코드 동작 변경 없음.
- `packages/io/test/html-security-block-boundary.test.ts`: top-level `<a><table>`·`<a><blockquote><table>`·`<a><ul><li>text<table>` 세 경로의 마크 미전파 회귀 테스트 추가.

## 검증

- `pnpm --filter @cp949/geul-io test`: 79 files / 681 tests 통과.
- `pnpm --filter @cp949/geul-io typecheck`: 변경분(위 3개 파일) 신규 실패 없음. 무관한 dev 베이스라인 실패(`test/markdown-quote-loss.test.ts:548-549`, TS2339)는 이번 변경과 무관함을 확인하고 Issue #166으로 분리.
- 변경 파일 대상 `eslint`·`prettier --check` 통과.
- mutation 검증: `wrapTextDescendantsInAncestors`의 `isTableNode` 조기 반환을 임시 제거하면 blockquote 케이스가 실제 FAIL로 뒤집힘을 확인(원복). top-level `kind:"table"` 분기의 대응 변이는 "마크 적용"이 아니라 `importHtml`이 `ok:false`를 내는 형태로 깨짐을 실측 — 두 경로가 서로 다른 메커니즘이라는 근거.

## 남은 제한

없음. clipboard HTML 붙여넣기 경로(`clipboard-table-parser.ts`)는 이 결정의 직접 대상이 아니다 — 표 식별 메커니즘이 달라 별도 계약이다.

## GitHub

- Issue #145 완료 댓글: `issuecomment-5597902326`
- Issue #145 종료.
- 범위 밖 발견 분리 — Issue #166(`io` 패키지 typecheck 게이트가 `markdown-quote-loss.test.ts`에서 dev 베이스라인부터 실패 중) 신규 등록.
- commit·`dev` ff-only fast-forward 병합 완료. push·tag·PR 생성은 수행하지 않았다.

roadmap-workflow 경량 DELTA 사이클, RD-001 DELTA-01(단일 DELTA로 RD 완료).
