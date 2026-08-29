# Issue #133 — 서식 툴바 중첩 action 상태와 연속 적용

- 일자: 2026-08-29
- 레인: qq-workflow (자동 선택, 사용자 승인으로 DELTA 전문 3,952줄 크기 예외 적용)
- 확정 커밋: `3f7a4a7` (`fix(editor): 중첩 action 상태와 선택을 유지한다`)
- 종료 이슈: #133

## 목표

서식 툴바의 들여쓰기·내어쓰기 버튼이 core 판정에 따라 적용 불가 상태를 표시하고, 선택한 텍스트를 유지한 채 같은 블록에 명령을 연속 적용하게 했다.

## 바꾼 계약과 파일

- `packages/core/src/indent-commands.ts`: `getBlockNestingActionState`가 명령과 query의 구조 판정을 단일 소유한다. 이동 대상 내부의 비축약 `TextSelection`은 안정 ID와 anchor/head 상대 오프셋으로 방향까지 복원한다. collapsed·대상 밖 selection은 기존 캐럿 복원 경로를 유지한다.
- `packages/core/src/editor-controller.ts`: 공개 `getBlockNestingActionState(blockId)` query를 추가했다. destroyed·revision 포화 상태는 두 action 모두 불가로 보고하고 공개 반환 타입에서 ProseMirror 타입을 노출하지 않는다.
- `packages/react/src/formatting-toolbar.tsx`: query 결과로 Indent/Outdent 각각의 `disabled`와 `aria-disabled`를 렌더링한다. 명령 성공·실패 뒤 같은 block ID 상태를 다시 조회한다.
- core·React unit test와 `e2e/formatting-toolbar.spec.ts`: 구조 경계, revision 포화, 정방향·역방향 selection, 버튼별 상태, 실제 선택을 다시 만들지 않는 2단 indent·연속 outdent를 고정했다. 신규 E2E는 `@core` 3엔진 대상이다.
- model·io·저장 JSON·Tab/Shift+Tab·표 중첩 UI 계약과 외부 의존성은 변경하지 않았다.

## RED/GREEN과 리뷰

- 최초 RED: core 5 failed / 22 passed, React 2 failed / 15 passed.
- 최초 GREEN: core focused 27/27, React focused 17/17, Chromium 2/2.
- 독립 리뷰에서 revision 포화 query-command drift, 3엔진 태그 누락, controller fixture 미해제, named helper 주석 누락 등 MINOR 4건을 발견했다.
- 리뷰 RED: core selection 1 failed / 11 passed, React 1 failed / 16 passed.
- 리뷰 GREEN: core focused 28/28, core 전체 637/637, React focused 17/17, React 전체 265/265, Chromium·Firefox·WebKit 3/3.
- 재검토 후 미해결 `FAIL`·`BLOCKER`·`MAJOR`·`MINOR` 0건이다.

## 검증

- `pnpm verify`: lint, format, build, ES compatibility, typecheck, unit 124 files / 1,513 tests, package boundaries, licenses, Chromium E2E 90/90 통과.
- `pnpm --filter @cp949/geul-core typecheck`, `pnpm --filter @cp949/geul-react typecheck` 통과. 각 package의 복합 script가 제품·테스트 tsconfig를 모두 실행했다.
- focused 3엔진 E2E 3/3 통과.
- `git diff --check` 통과.
- 재그룹화 전후 tree diff 없음.

## 남은 제한

미충족 완료 기준과 범위 밖 후속 작업 없음.

## 이슈 등록과 종료

- Issue #133에 완료 댓글을 등록했다(`issuecomment-5460099184`).
- 열린 sub-issue와 미등록 초안이 없고 완료 기준을 모두 충족해 Issue #133을 종료했다.
