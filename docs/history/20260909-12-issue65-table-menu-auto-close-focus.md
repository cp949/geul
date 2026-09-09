# Issue #65 항목 4 — 표 메뉴 무효화 자동 닫힘의 초점 이동(qq-workflow)

## 목표

Issue #65(Issue #18 whole-branch 리뷰 후속) 항목 4를 해소한다 — `table-handles.tsx`의 인덱스/대상 무효화 자동 닫힘이 항상 `closeMenu`(초점을 편집기로 강제 이동)를 써서, 바깥 클릭(초점 유지)과 Escape(편집기로 복귀)를 구분하는 G-UI-001 기존 관례와 결이 다르던 문제를 막는다.

## 확정 커밋

- `8cef45e` — `fix(react): 표 메뉴 무효화 자동 닫힘이 초점을 조건부로 되돌린다 (Issue #65)`(구현·단계-3 결함 수정 2커밋을 재그룹화)
- `6a967ce` — `docs(guides): G-UI-001에 자동 닫힘(무효화)의 초점 판정 규칙을 추가한다 (Issue #65 항목4)`(단계-4 가이드 정비)

## 변경

- `packages/react/src/table-handles.tsx` — `closeMenuOnInvalidation` 콜백을 신설해 `reconcileMenuState`의 두 무효화 분기(대상 표 자체 소멸, 대상 행/열 소멸)에 적용했다. `document.activeElement`가 메뉴(`data-geul-table-menu`) 안에 있으면 편집기로 초점을 되돌리고(Escape와 같은 이유), 밖에 있으면(편집기 포함) 건드리지 않는다(바깥 클릭과 같은 이유). Escape·바깥 클릭·메뉴 명령 성공 시 닫힘(`onClose`)은 손대지 않았다.
- `packages/react/src/table-handle-constants.tsx` — `data-geul-table-menu` 셀렉터 리터럴이 두 배열(`TABLE_MENU_DISMISS_ALLOW_SELECTORS`, `TABLE_HOVER_IGNORE_SELECTORS`)에 중복돼 있던 것을 `TABLE_MENU_SELECTOR` named export로 모았다.
- `packages/react/test/table-handle-menu.test.tsx` — 초점이 메뉴 안/밖에 있을 때 무효화 자동 닫힘의 초점 처리를 확인하는 회귀 테스트 2개 추가.
- `docs/guides/G-UI-001-build-dismissible-overlays.md` — 바깥 클릭·Escape 두 경로만 다루던 초점 규칙에 "사용자의 물리적 클릭·키 입력이 아닌 자동 닫힘"이라는 셋째 범주와 그 판정 기준(`activeElement.closest(...)`로 overlay 안/밖 판정)을 추가했다.

## 검증

- RED(단계-2): "초점이 메뉴 밖에 있을 때 무효화로 자동 닫히면 초점을 옮기지 않는다" 테스트가 구현 전 코드(무조건 `focusEditor()`)에서 `expected <contenteditable> to be <button>`로 실패 → `closeMenuOnInvalidation` 도입 후 GREEN. "메뉴 안" 테스트는 기존 동작과 일치해 처음부터 통과(회귀 방지 핀).
- 단계-3 결함 탐지(읽기 전용 subagent, `IMPL-REVIEW-01.md`): 확정 결함 0건. MINOR 1건 — 계획서가 "`onClose` 성공 클릭 시점엔 초점이 항상 메뉴 안"이라고 전제한 근거를 `preserveFocusOnMouseDown`(메뉴 항목 버튼의 `mousedown` 기본 포커스 이동 차단)으로 반증. `onClose`의 동작 자체(이 diff 이전부터 무조건 `focusEditor()`)는 이번 범위가 아니라 바꾸지 않았고, 코드 주석의 근거만 정정했다(계약 위반 아님).
- `pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/table-handle-menu.test.tsx test/table-handles.test.tsx`: 56 passed. `pnpm --filter @cp949/geul-react test`: 648 passed. `typecheck`, `pnpm lint`: 통과.
- `pnpm verify` 전량(메인 세션이 직접 실행, exit 0): unit `Test Files 313 passed (313)` / `Tests 3547 passed (3547)`, e2e(chromium+mobile) `209 passed`, lint·format·build·typecheck·package boundary·license 전부 통과.

## 남은 제한

Issue #65의 나머지 항목(7 `canDelete` 증가 방향 미반영, 8 `disabled` 이유 미설명, 9 교차 통합 테스트 부재, 10 테스트 픽스처 4중 중복)은 이번 범위 밖으로 그대로 열려 있다. `onClose`(메뉴 명령 성공 클릭)의 초점 정확성(클릭 이전 초점이 메뉴 밖이었어도 무조건 편집기로 이동)은 이 diff가 만든 회귀가 아니고 항목4가 요구하는 범위도 아니라 손대지 않았다 — 실사용 불만이 확인되면 별도 이슈로 재조사한다.

## GitHub

- Issue #65 완료 댓글(항목 4만): `issuecomment-5604173416`
- Issue #65는 닫지 않았다 — 나머지 항목이 별도 이슈로 분리되지 않은 채 남아 있어 이슈 트래커 종료 판단 기준("분리되지 않았으면 닫지 않는다")에 따른다.
- commit·`dev` ff-only merge 완료(재그룹화 2커밋 → 1커밋 + 가이드 정비 1커밋). push·tag·PR 생성은 수행하지 않았다.
