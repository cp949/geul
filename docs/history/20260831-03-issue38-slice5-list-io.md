# Issue #38 슬라이스 5 RD-003 — HTML/GFM 중첩 목록 round-trip

## 목표

글머리·번호 목록의 content, 시작 번호와 임의 자식 중첩을 HTML/GFM에서 승인된 warning·loss 계약으로 round-trip하고 importer 결과를 production editor load/save에 연결한다.

## 확정 커밋

- `d01082f` — HTML 목록 계층과 번호 의미 왕복
- `4ddff8c` — GFM 목록 import 계층·번호·task downgrade
- `f671523` — GFM 목록 children strict/lossy 손실 처리
- `5210253` — HTML/GFM importer 결과 production 왕복 증명
- `6810fb4` — 슬라이스 5 제품 상태 완료

## 변경한 계약과 파일

- `packages/io/src/html/import-html.ts`, `export-html.ts`: `ul`/`ol`/`li`의 안정 ID·own content·`ol[start]`·재귀 children을 import/export한다. 별도 컨테이너 재시작과 same-`ol` flow interruption 뒤 실제 서수를 보존한다.
- `packages/io/src/html/parse-html.ts`, `hast-properties.ts`: parse5가 numeric attribute를 coercion하기 전 raw decimal 문법을 HAST metadata로 전달한다. 의미 변환은 sanitized HAST만 사용하고 raw HAST warning fact 경계를 유지한다.
- `packages/io/src/markdown/import-markdown.ts`: mdast list/listItem type·start·계층·표현 가능한 임의 children을 보존한다. task list는 슬라이스 6 경계를 유지해 `[x]`·`[ ]` paragraph와 `LIST_DOWNGRADED`로 강등한다.
- `packages/io/src/markdown/export-markdown.ts`, `loss-analysis.ts`: 표현 가능한 목록 children을 strict round-trip한다. 표현 불가 일반 children과 빈 own content 뒤 첫 paragraph ambiguity는 strict 거절 또는 lossy 평탄화+`NESTED_CHILDREN`으로 처리한다.
- `packages/core/test/list-item-io-round-trip.test.ts`: public create/replace/save와 HTML exact·GFM ID 제외 의미 exact round-trip을 검증한다.
- `docs/product/blocknote-free-feature-inventory.md`, `current-status.md`: `BLK-007`·`BLK-008`을 `VERIFIED`, 다음 작업을 슬라이스 6 체크·토글 목록으로 동기화했다.
- 신규 런타임 의존성, 공개 API와 저장 형식 변경 없음.

## 검증

- 트랙-5: F01~F11 `PASS`, 구현 누락 0건.
- 트랙-6: MAJOR 5건 수정 후 HTML boundary·GFM correctness reviewer `CLEAN`.
- `pnpm verify`: lint·format·build·Chrome 75 escompat·전체 typecheck·unit 159 files / 2,004 tests·package boundary·license·Chromium 115/115 `PASS`.
- IO 전체 42 files / 364 tests, core 전체 63 files / 918 tests `PASS`.
- 재그룹화 경계: HTML 45 tests, GFM import 23 tests, GFM loss 18 tests, production 7 tests와 관련 typecheck/build/boundary/consumer/lint `PASS`.
- 첫 그룹 경계 검증이 HTML import test의 export 의존을 검출했다. HTML import/export를 한 의미 그룹으로 재조립했고 최종 원본 tree diff는 빈 출력이다.

## 상태와 남은 제한

- RD-003과 슬라이스 5 roadmap `DONE`. `BLK-007`·`BLK-008` `VERIFIED`.
- Issue #38 완료 댓글: `https://github.com/cp949/geul/issues/38#issuecomment-5471023888`. 후속 R2 슬라이스가 남아 Issue는 `OPEN` 유지.
- GFM은 block ID를 표현하지 않는다. GFM re-import는 ID·table column ID를 제외한 재귀 의미 exact로 검증했다.
- task/check·toggle 목록 native 지원은 슬라이스 6 범위다. Firefox·WebKit 전체 gate는 실행하지 않았다.
- push·tag·PR·`dev -> main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 5개와 이 이력 커밋을 `dev`에서 역순으로 `git revert`한다.
