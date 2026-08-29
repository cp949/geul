# Issue #138 — 중첩 표 인접 삭제의 부모 블록 보존

- 일자: 2026-08-29
- 레인: qq-workflow (자동 선택 — core 소스 1파일과 테스트 1파일의 단일 DELTA)
- 확정 커밋: `28d5b42` (`fix(core): 중첩 표 인접 삭제에서 부모 블록을 보존한다`)
- 종료 이슈: #138

## 목표

중첩 표에 인접한 Backspace/Delete가 조상 `blockContainer`를 선택·삭제하지 않고 인접한 표만 선택·삭제하며 부모·형제 블록을 보존한다.

## 바꾼 계약과 파일

- `packages/core/src/block-join-extension.ts`: `selectNodeBackward`/`selectNodeForward`의 형제 한정 탐색을 제거했다. 표 셀 내부 위치에서 표 조상 시작 위치를 계산해 `NodeSelection`을 직접 dispatch하고 기존 `tableEditing` 정규화로 표 전체 `CellSelection`을 만든다.
- 표 전체 `CellSelection`에서 Backspace/Delete를 한 번 더 누르면 표만 단일 transaction으로 삭제한다. 부분 셀 선택은 기존 `tableEditing` 계약에 남겨두었다.
- 표가 `blockGroup`의 유일한 자식이면 그룹 범위까지 삭제해 PM default fill이 유령 빈 paragraph를 만들지 않는다. 형제 자식이 있으면 표만 제거하고 그룹을 보존한다.
- `packages/core/test/block-join-extension.test.ts`: 중첩 Backspace/Delete 첫 키 selection-only, 두 번째 키 표만 삭제, undo 1회 복원, 유일 자식 그룹 제거를 공개 keymap seam으로 고정했다.
- 공개 API, 저장 모델, 표 명령, HTML/GFM 변환과 제품 기능 상태는 바꾸지 않았다.

## 실행한 검증과 결과

- RED: 중첩 표 인접 첫 키가 표 대신 조상 `blockContainer`를 `NodeSelection`으로 선택했다.
- RED: 표 전체 `CellSelection`에서 두 번째 키가 표 대신 셀 내용만 비웠다.
- 리뷰 RED: 유일 자식 표 삭제 후 `blockGroup`에 신규 빈 paragraph가 채워졌다. 그룹 범위 삭제로 수정했다.
- focused: `block-join-extension.test.ts` 28/28 통과.
- core: 43파일 631/631, 복합 typecheck 통과.
- 독립 결함 탐지: 유일 자식 default fill MAJOR 1건 수정 후 `BLOCKER`·`MAJOR`·`MINOR` 0건.
- 최초 `pnpm verify`: 변경 2파일 Prettier 불일치로 실패. 대상 파일만 포맷했다.
- 최종 `pnpm verify`: lint, format, build, ES compatibility, typecheck, unit 124파일 1505/1505, package boundaries, licenses, Chromium E2E 89/89 통과.
- `git diff --check` 통과. 재그룹화 전후 tree diff 없음. 재그룹화 경계 core 복합 typecheck 통과.

## 남은 제한

미충족 완료 기준과 범위 밖 후속 작업 없음.

## 이슈 등록과 종료

- Issue #138에 완료 댓글을 등록했다(`issuecomment-5459946796`).
- 열린 sub-issue와 미등록 초안이 없고 완료 기준을 모두 충족해 Issue #138을 종료했다.
