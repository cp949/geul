# Issue #146 — 붙여넣기 폴백 targetDepth off-by-one 수정

## 목표

`list-paste-fallback-extension.ts`의 `targetDepth` 계산이 `modelDepthAt`의 "대상 노드 바로 앞 경계" 전용 계약과 어긋나 캐럿 위치에서 실제보다 1 크게 계산되던 off-by-one을 고친다(Issue #143 트랙-6 결함 탐지에서 발견, MINOR 판정).

## 확정 커밋

- `d2f34dc` — PM 기본 붙여넣기 폴백의 targetDepth가 위치 종류를 가리지 않고 -1 보정하던 결함을 고친다

## 변경한 계약과 파일

- `packages/core/src/indent-commands.ts`: `modelDepthAt`(경계 위치 전용 계약)은 그대로 두고, 새 `modelDepthAtPasteTarget`을 추가했다. `$pos.parent`가 `blockGroup`이거나 `$pos.depth===0`(부모가 `doc`)이면 divider·table처럼 blockContainer로 감싸이지 않는 block-level 형제 사이 경계 위치라 보정 없이 `modelDepthAt`을 그대로 쓰고, 그 외(캐럿이 속한 콘텐츠 노드 내부)는 `-1` 보정을 쓴다. 기존 유일 소비자 `getBlockNestingActionState`는 무변경.
- `packages/core/src/list-paste-fallback-extension.ts:259` 부근: `targetDepth` 계산을 `modelDepthAtPasteTarget` 호출로 교체.
- `packages/core/test/list-paste-fallback.test.ts`: 회귀 테스트 2건 추가(상한과 떨어진 위치에서 정확한 값 판별, divider NodeSelection 크래시 회귀 방지), 기존 1건 목적 정정.

## 검증

- 단계-3 완료 조건 대조(메인 세션 직접 판정): 계획서(01-계획.md) 완료 조건 4개 전부 PASS(수정 라운드 반영 후).
- 단계-3 결함 탐지(Light, 읽기 전용 subagent 1개 + 메인 세션 직접 코드 추적으로 재확인): 최초 구현에서 BLOCKER 1건(F1 — 위치 종류를 가리지 않은 `-1` 보정이 divider NodeSelection 경로에서 깊이를 과소계산해 `MAX_NESTING_DEPTH` 초과·`TypeError` 크래시를 재도입), MAJOR 1건(F2 — 신규 회귀 테스트가 clampDepth 흡수 특성 때문에 off-by-one을 판별하지 못하는 tautology였음) 발견. 같은 실행에서 위치 종류 자체 판별 로직 추가와 테스트 재설계로 수정, 재검증 PASS.
- RED/GREEN 메인 세션 독립 재현: F1 회귀 테스트를 수정 전 소스로 임시 복원해 재실행 — `TypeError: Nesting depth exceeds 64`(1 failed, 나머지 8건 통과) 확인 후 수정 상태로 복원, 전체 스위트 재통과 확인.
- `pnpm --filter @cp949/geul-core test`(전체 947개), `typecheck` — 통과.
- `pnpm verify` 전량(lint·build·typecheck·unit test·package boundary·license·e2e chromium 115건) — 통과. Issue #144(baseline e2e flake, `list-item.spec.ts:228`)는 이번 실행에서 재현되지 않았다.
- `git diff --check`, `git status --short` — 이상 없음.

## 등록한 이슈

- 완료 댓글: https://github.com/cp949/geul/issues/146#issuecomment-5488652340 — 이슈 닫음.
- 이번 작업 범위 밖 신규 이슈 등록 없음.

## 남은 제한

- GapCursor(이 저장소에 `@tiptap/starter-kit` 기본 포함으로 존재 확인)가 이 붙여넣기 경로에 도달하는 상태에 대한 전용 회귀 테스트는 추가하지 않았다 — divider와 같은 구조(block-level 형제 사이 경계)라 판별 로직이 구조적으로 커버하지만, 표는 `allowTableNodeSelection: false`로 전체 NodeSelection이 막혀 있고 GapCursor 경로는 미확인 상태로 남는다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋을 `dev`에서 `git revert`한다. 위험: 낮음(단일 패키지 `core` 내부, 새 export 함수 1개 + 호출부 교체 + 테스트, 공개 계약·스키마 변경 없음).
