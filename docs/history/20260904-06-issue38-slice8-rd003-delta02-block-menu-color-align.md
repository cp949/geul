# Issue #38 슬라이스 8 RD-003 DELTA-02 — 블록 메뉴 색상·정렬 섹션

## 목표

roadmap-workflow RD-003(React UX)의 두 번째 DELTA. DELTA-01이 끝낸 인라인 색상(서식 툴바)에 이어 블록 수준 명령 3개(`setBlockTextColor`/`setBlockBackgroundColor`/`setBlockTextAlignment`)를 블록 메뉴(`BlockSideMenu`)에서 호출하는 UI를 추가하고, `table`/`divider`/`codeBlock` 대상에는 이 섹션을 비노출한다.

## 확정 커밋

- `683de01` — react 블록 메뉴 색상·정렬 섹션 추가 (Issue #38 슬라이스 8, RD-003 DELTA-02)

## 변경한 계약과 파일

- `packages/react/src/block-side-menu.tsx`: 블록 메뉴(Turn into→hr→Indent/Outdent→Duplicate→Delete)의 Delete 뒤에 Text color/Background color 팔레트(8색+None, `TABLE_TEXT_COLORS`/`TABLE_BACKGROUND_COLORS` 재사용) + Align 행(Left/Center/Right/None, `table-cell-format-menu.tsx`와 동형 아이콘·클래스)을 추가했다. Turn into 옵션 계산에 쓰던 source descriptor를 `blockMenuSource` 변수로 분리해 새 섹션의 게이트(`isNestableBlockType(blockMenuSource.type)`)와 공유한다 — 이 predicate가 정확히 spec §3.3의 7개 대상 타입(paragraph/heading/quote/목록 4종)만 인정하고 `table`/`divider`/`codeBlock`을 제외한다(RD-002 DELTA-02와 같은 predicate). 색상·정렬은 Indent/Outdent와 같은 "재조정 가능" 액션으로 분류해 적용 후에도 메뉴를 닫지 않는다(Turn into/Duplicate/Delete는 일회성이라 닫음).
- 테스트(수정): `packages/react/test/block-side-menu.test.tsx` — `renderBlockMenu` 헬퍼의 옵션 타입을 `Omit<MountBlockEditorOptions, "children">`로 넓혀 divider fixture(`initialBlocks`)를 받게 했다. 신규 `describe("블록 메뉴 색상·정렬 섹션(RD-003 DELTA-02)", ...)` 7건 — 섹션 노출, 텍스트/배경색 적용·해제(문서 값으로 검증), 정렬 적용·해제, codeBlock/divider 소스 비노출.

## 검증

- TDD RED→GREEN: 신규 5개 케이스(섹션 부재로 실패)를 확인한 뒤 구현. codeBlock/divider "비노출" 2건은 애초에 아무것도 없어 구현 전에도 우연히 통과했다 — 구현 후 재확인으로 실제 게이트가 그 통과를 만든다는 것까지 확인했다. 계획한 설계가 첫 시도에 그대로 통과(정정 없음).
- `pnpm --filter @cp949/geul-react test`(29 files, 406/406 — 기존 399 + 신규 7), `pnpm --filter @cp949/geul-react typecheck` — 통과.
- `pnpm --filter @cp949/geul-model test`(337/337)·`pnpm --filter @cp949/geul-io test`(449/449)·`pnpm --filter @cp949/geul-core test`(1145/1145) — 전부 무변경 확인.
- 루트 `pnpm typecheck`(전체 10 task, `@cp949/geul-react:build` 포함) — 전부 통과.
- 변경 파일 `eslint` — 0 findings.
- 단일 커밋이라 재그룹화 대상 없음. 백업 ref·트리 diff 재대조(빈 출력) 후 ff-only 병합.
- RD-003 완료 조건 갱신(roadmap-workflow "경량 DELTA 사이클" 9단계): 조건 2(블록 메뉴 색상·정렬 반영)·조건 3(table/divider/codeBlock 비노출)을 이 DELTA가 충족 — 근거는 `RD-003.md`. 조건 4(e2e)는 DELTA-03이 남긴다 — RD-003은 계속 `ACTIVE`다.

## 등록한 이슈

- 완료 댓글: 게시하지 않음 — RD-003이 아직 `ACTIVE`(완료 조건 4개 중 4번째만 미충족)라 DELTA 단위 GitHub 게시 대상이 아니다.
- 범위 밖 신규 이슈 등록 없음 — 가이드·pitfall 갭 없음.

## 남은 제한

- Chromium e2e(DELTA-03)가 남는다.
- `table` 소스 케이스는 만들지 않았다 — `blockMenuState.blockId`가 표를 가리킬 일이 없다는 기존 불변식(RD-002 DELTA-02, `block-side-menu.tsx:538` 주석)이 여전히 성립한다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 1개를 `dev`에서 `git revert`한다. 위험: 낮음 — `BlockSideMenu` 컴포넌트 안에서 완결된 UI 추가만이라 다른 컴포넌트·core·model 계약을 바꾸지 않는다.
