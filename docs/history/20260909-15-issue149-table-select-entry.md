# Issue #149 — 표(TableBlock) 자신을 대상으로 한 Delete·이동 UI 진입점

## 목표

표 자체(TableBlock)를 대상으로 한 Delete·이동에 UI 진입점이 없던 공백을 없앤다. Duplicate는 Issue #125 결정(clone의 표 row/cell/column id 중복 위험)에 따라 미지원을 유지한다.

## 확정 커밋

- `85b2f9c` — `feat(react): 표 자신을 선택하는 버튼을 추가해 Delete·이동 진입점을 연다 (Issue #149)`
- `7847854` — `test(e2e): domBlockIds를 공용 헬퍼로 추출해 block-selection/table-handle 중복을 없앤다 (Issue #149)`

## 변경

- `packages/react/src/table-handles.tsx` — `handleIndentTable`/`handleOutdentTable`(Issue #126)과 같은 모양으로 `handleSelectTable`을 추가해 `editor.commands.selectBlockRange(tableBlockId, tableBlockId)`를 커밋한다.
- `packages/react/src/table-handle-overlays.tsx` — `onSelectTable` prop과 "Select table" IconButton 추가(Indent/Outdent와 같은 좌상단 여백 클러스터, `left - 72`).
- `packages/react/src/table-handle-constants.tsx` — `selectTableIcon`(`MousePointerSquareDashed`), `TABLE_HOVER_IGNORE_SELECTORS`에 새 셀렉터 추가.
- `packages/core/src/dictionary.ts`/`dictionary-ko.ts` — `handle.selectTable` 키 추가.
- `docs/specs/2026-08-19-r2-basic-block-parity-design.md` §5.4 — "표 직접 duplicate 미지원 유지, Delete·이동은 BlockSelectionToolbar 진입점(표 선택 버튼)으로 지원" 재확인.
- `packages/react/test/table-handles.test.tsx`, `e2e/table-handle.spec.ts` — 회귀 테스트 추가.
- `e2e/support/block-selection-toolbar.ts`(신규) — `BlockSelectionToolbar` 로케이터 공용화(G-TST-002).
- `e2e/support/block-order.ts`(신규), `e2e/block-selection.spec.ts` — 단계-3 결함 탐지 MAJOR(F1) 수정: `domBlockIds`/`blockOrder` 중복을 이 공용 파일로 통합.
- 새 core 명령이나 `duplicateBlock`/`deleteBlock`/`moveBlockBefore` 관련 회귀 테스트는 무수정 — core는 이미 표를 지원(delete·move)하거나 의도적으로 거절(duplicate)하고 있었다.
- 그릴링(mattpocock-skills:grilling)으로 확정한 결정 2개(`_works/20260909-09-issue149-table-select-entry/01-계획.md` "8. 결정"): (1) 표 직접 duplicate는 미지원 유지, (2) 전용 toolbar 신설 대신 기존 `BlockSelectionToolbar`(2026-09-03에 이미 병합, 표 거절 가드 없음)를 재사용하는 "표 선택" 진입점 하나만 추가.

## 검증

- 결함 탐지 리뷰(읽기 전용 subagent, `IMPL-REVIEW-01.md`): F1(MAJOR, `e2e/support/block-selection-toolbar.ts`의 `blockOrder`가 `block-selection.spec.ts`의 `domBlockIds`를 복제, G-TST-002 위반) 발견·수정, 그 외 발견 없음.
- 단위 RED(구현 stash 제거) → GREEN(복원): `vitest run test/table-handles.test.tsx` 2 failed → 18 passed. e2e RED → GREEN: `playwright test e2e/table-handle.spec.ts -g "Issue #149"` 타임아웃 2건 → 통과.
- `pnpm --filter @cp949/geul-react typecheck`, `pnpm typecheck:e2e`, `pnpm exec eslint <변경 파일>`: 통과.
- `pnpm exec playwright test e2e/table-handle.spec.ts e2e/block-selection.spec.ts --project=chromium`: 25 passed(F1 수정 반영 재실행).
- `pnpm scan:test-helpers`: F1 수정 후 `domBlockIds`/`blockOrder` 중복 사라짐(grep 무매치).
- `pnpm verify` 전량: 통과(lint, build, typecheck, unit test, package boundary, license, e2e chromium+mobile 207 tests) — 메인 세션이 직접 재실행해 exit 0 확인.

## 남은 제한

표 직접 duplicate는 여전히 미지원이다 — 표가 자식으로 포함된 상위 블록을 duplicate할 때 쓰는 id 재발급 로직(D7)을 표 직접 대상 케이스로 배선하면 지원 가능할 여지는 있지만, 검증되지 않은 core 리팩터링이라 이번 범위에서 다루지 않았다. 재론이 필요하면 별도 이슈로 분리한다.

`docs/specs/2026-08-19-r2-basic-block-parity-design.md`에 이번 변경과 무관한 기존 prettier 포맷 위반이 있음을 확인했다 — 이번 diff가 만든 문제가 아니고 제품 동작·게이트·거짓 통과와 무관해 별도 이슈로 등록하지 않았다(`issue-tracker.md` 등록 기준 미충족).

## GitHub

- Issue #149 완료 댓글: `issuecomment-5601797873`
- Issue #149 종료.
- commit·`dev` ff-only merge 완료(재그룹화 2커밋). push·tag·PR 생성은 수행하지 않았다.
