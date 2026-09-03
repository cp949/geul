# Issue #126 — 표 들여쓰기/내어쓰기 UI 경로

## 목표

`indentBlock`/`outdentBlock` 명령 계층은 슬라이스 1부터 블록 타입 무관하게 동작하지만, 이 명령을 UI로 호출할 경로가 표에는 없었다(그릴링 확인 결과 일반 블록에도 없었다 — block-side-menu.tsx 메뉴에 항목 자체가 없었음). 표를 포함한 모든 블록 타입에 Indent/Outdent UI 경로를 추가한다.

## 확정 커밋

- `e02ebe4` — 표 들여쓰기/내어쓰기 UI 경로 추가 (Issue #126)
- `dcb2fd6` — test(react): Outdent undo 검증에 재중첩 위치 assertion 추가

## 변경한 계약과 파일

- `packages/react/src/block-side-menu.tsx`: 블록 메뉴(Turn into / Duplicate / Delete)에 Indent, Outdent 항목을 새 구분선 없이 Duplicate/Delete 앞에 추가했다. `blockId`는 `blockMenuState.blockId`를 직접 호출하고, `getBlockNestingActionState(blockId)`의 `canIndent`/`canOutdent`가 `false`면 `disabled`(formatting-toolbar.tsx와 같은 관용구). 텍스트 전용, 아이콘 없음(기존 Duplicate/Delete와 일관).
- `packages/react/src/table-handles.tsx`: 표 hover 시(기존 `hoverTableId`/`geometry` 재사용) 좌상단 여백(`geometry.left-48/-24`, `top-24`)에 Indent/Outdent 직접 IconButton 2개를 추가했다(팝업 메뉴 없음). `block-side-menu.tsx`의 hover gutter가 `usePointerHoverTarget({ entitySelector: "[data-be-block-id]:not(table)" })`로 `<table>`을 제외해(행/열 핸들 gutter 겹침 방지, 기존 설계) 그 블록 메뉴가 표에 절대 열리지 않으므로, 이 두 버튼이 표를 대상화하는 유일한 진입점이다. 같은 `getBlockNestingActionState` 기반으로 비활성화.
- `packages/react/src/_block-side-menu.scss`, `packages/react/src/_table-handles.scss`: `disabled` 시각 상태(opacity 0.4, cursor not-allowed) 추가.
- `e2e/block-handle.spec.ts`: 일반 블록 Indent/Outdent 성공+undo 1회 2건, disabled 상태 1건. PIT-0011 뷰포트 클램프 테스트의 항목 수 주석 갱신.
- `e2e/table-handle.spec.ts`: 최상위 표 Indent+undo 1회, 중첩 표(toggleListItem 자식) Outdent+undo 1회 각 1건 — 각각 반대쪽 버튼의 disabled 상태도 함께 확인.

Tab 키 경로는 대상이 아니다(이슈 본문 결정 — 표를 대상화할 caret 상태가 구조적으로 없다). 새 core command, 새 EditorError 코드 없음 — 기존 공개 `indentBlock`/`outdentBlock`/`getBlockNestingActionState`만 소비했다.

## 실행한 검증과 결과

- 단계-2 구현(subagent): RED(신규 e2e 5건 전부 timeout/미발견) → GREEN(5/5) 확인. 메인 세션이 diff를 읽고 `pnpm --filter @cp949/geul-react typecheck`, `eslint`, `playwright --project=chromium e2e/block-handle.spec.ts e2e/table-handle.spec.ts`(31/31) 독립 재실행해 확인.
- 단계-3 결함 탐지(읽기 전용 subagent, 계획 비공개 dispatch): BLOCKER·MAJOR 없음. MINOR 1건(F1 — Outdent undo 검증이 재중첩 위치가 아니라 blockGroup 개수만 확인) 수정. 결함 탐지 과정에서 신규 버튼 좌표를 실제 Chromium(48px 2열 표)에서 실측해 기존 row/column handle과 겹치지 않음을 확인.
- 완료 조건 6개 전부 `PASS`(실측 대조, `IMPL-REVIEW-01.md`).
- 최종 `pnpm verify` 전량 1회: lint·format(2건 정리 후 재통과)·build·escompat·typecheck(4 project)·`pnpm test` 200 files/2391 tests·check:boundaries·check:licenses·`pnpm test:e2e --project=chromium` 135/135 전부 `PASS`.
- 재그룹화 경계 2개(`e02ebe4`/`dcb2fd6`) 각 tip에서 `pnpm --filter @cp949/geul-react typecheck` 개별 재실행, 전부 `PASS`. 원본 tree diff(`pre-squash` 대비)는 빈 출력, 병합 직전 재대조도 빈 출력.

## 상태와 남은 제한

- Issue #126 완료 댓글 게시·종료: 이 이력 등록과 같은 실행에서 판단(qq-workflow 단계-4 예외 — 사용자 확인 없이 수행). 완료 댓글 등록 후 종료 기준 4개 전부 충족해 닫았다.
- 조사 중 발견한 범위 밖 사실 — 표 자체(TableBlock)를 대상으로 한 Duplicate/Delete/드래그 이동에는 여전히 UI가 없다(`block-side-menu.tsx`가 표를 제외하는 같은 설계 때문) — [Issue #149](https://github.com/cp949/geul/issues/149)로 분리해 같은 실행에서 등록했다.
- 표 Indent/Outdent 버튼 좌표는 48px(`MIN_COLUMN_WIDTH`) 2열 표에서 실측 확인했다 — 1열 표나 극단적 뷰포트는 별도 실측하지 않았다(위험 낮음으로 판단, 열이 좁아질수록 여백은 늘어나는 방향).
- Firefox/WebKit e2e는 미검증(`pnpm verify`도 chromium 프로젝트만 포함).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 2개를 `dev`에서 역순으로 `git revert`한다.
