# Issue #65 항목 1 — 표 핸들 메뉴 대상 정체성 추적(qq-workflow)

## 목표

Issue #65(Issue #18 whole-branch 리뷰 후속) 항목 1을 해소한다 — 행/열 핸들 메뉴가 열린 동안 대상보다 앞선 행/열이 사라져 인덱스가 밀리면, 인덱스는 여전히 범위 안이라 메뉴가 열린 채 남아 사용자가 지목하지 않은 행/열에 명령이 실행되는 조용한 데이터 손실을 막는다(재리뷰에서 "남은 항목 중 우선순위 1순위"로 심각도 상향).

## 확정 커밋

- `8a45fa4` — `fix(react): 표 핸들 메뉴가 대상 행/열의 정체성을 안정 id로 재추적한다 (Issue #65)`(재그룹화로 구현·단계-3 결함 수정·서식 정리 3커밋을 통합)

## 변경

- `packages/react/src/table-handle-types.ts` — `HandleMenuState`에 `targetId: string`을 추가한다(`ReorderState.sourceId`와 같은 결, G-UI-002).
- `packages/react/src/table-handle-geometry.ts` — `readTableRowIds`를 추가한다. `readTableColumnIds`와 대칭으로 `data-geul-row-id`의 DOM 순서를 그대로 반환한다(G-TBL-001).
- `packages/react/src/table-handles.tsx` — 무효화 감시 effect(`resolveMenuTargetIndex`/`reconcileMenuState`)가 인덱스 범위 대신 `targetId`로 대상을 재해석한다. 대상이 사라지면 닫고, 위치만 바뀌면 인덱스를 갱신해 재조준한다. 빈 `targetId`는 G-UI-002 fail-open으로 기존 인덱스-범위 판정만 본다. `TableHandleMenu`의 React `key`도 `index` 대신 `targetId`로 바꿨다(아래 단계-3 발견 F1).
- `packages/react/test/table-handle-geometry.test.ts`, `packages/react/test/table-handle-menu.test.tsx` — 재조준(행·열), 대상 자신 소멸 시 닫힘(행·열), 재조준 중 실패 메시지 보존 회귀 테스트 추가.
- `docs/guides/G-UI-002-key-reordered-ui-by-stable-id.md` — "저장한 안정 id를 자식 컴포넌트의 React key로도 그대로 쓴다"는 구현 규칙을 추가한다(단계-3 F1이 드러낸 빠진 문구 — 조작 대상 저장은 안정 id로 옮겨도 `key`에 index를 남기면 위치 변경마다 자식이 remount돼 로컬 state가 초기화된다).

## 검증

- RED(단계-2): 재조준·자체 소멸 시나리오 3건 실패(엉뚱한 행/열 삭제, 메뉴 안 닫힘) → GREEN 3건 확인. `readTableRowIds` 미구현으로 인한 unit 3건 실패 → GREEN 확인.
- 단계-3 결함 탐지(읽기 전용 subagent, `IMPL-REVIEW-01.md`): F1(MAJOR — `TableHandleMenu` `key`가 `index`를 써서 재조준 시 remount, Issue #18 실패 메시지 소실) 발견·수정, F2(MINOR — 열 쪽 "대상 자신 소멸" 테스트 갭) 발견·수정. 그 외 발견 없음.
- F1 회귀: "재조준되는 동안에도 이미 떠 있던 실패 메시지가 사라지지 않는다" RED(alert 사라짐) → `key`를 `targetId`로 바꾼 뒤 GREEN. 기존 "다른 행으로 메뉴 대상을 바로 전환하면 이전 실패 메시지가 남지 않는다" 테스트로 대상 전환 시 remount 유지 확인.
- `pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/table-handle-geometry.test.ts test/table-handle-menu.test.tsx test/table-handles.test.tsx`: 68 passed.
- `pnpm --filter @cp949/geul-react typecheck`, `pnpm --filter @cp949/geul-react test`(45 files, 644 tests), `pnpm lint`: 통과.
- `pnpm verify` 전량(메인 세션이 직접 실행, exit 0): unit `Test Files 313 passed (313)` / `Tests 3543 passed (3543)`, e2e(chromium+mobile) `207 passed`, lint·format·build·escompat·typecheck·package boundary·license 전부 통과. 1차 실행에서 prettier format:check 실패(신규 테스트 파일 서식) → `prettier --write` 후 재실행해 통과.

## 남은 제한

Issue #65의 나머지 항목(3 실패 알림 위치, 4 자동 닫힘 초점 이동, 7 `canDelete` 증가 방향 미반영, 8 `disabled` 이유 미설명, 9 교차 통합 테스트 부재, 10 테스트 픽스처 4중 중복)은 이번 범위 밖으로 그대로 열려 있다. 이슈는 닫지 않았다.

## GitHub

- Issue #65 완료 댓글(항목 1만): `issuecomment-5602450868`
- Issue #65는 닫지 않았다 — 나머지 항목이 별도 이슈로 분리되지 않은 채 남아 있어 이슈 트래커 종료 판단 기준("분리되지 않았으면 닫지 않는다")에 따른다.
- commit·`dev` ff-only merge 완료(재그룹화 3커밋 → 1커밋). push·tag·PR 생성은 수행하지 않았다.
