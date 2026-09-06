# Issue #156 슬라이스1 RD-004 DELTA-01 — onMount/onUnmount/onSelectionChange 추가

## 목표

roadmap-workflow RD-004(lifecycle·변경전 훅 이벤트, `DOC-009`/`DOC-010`)의 첫 DELTA. `CreateEditorOptions`에 `onMount?: () => void`/`onUnmount?: () => void`/`onSelectionChange?: () => void`를 추가한다(spec §3.3). RD-004의 예상 DELTA 2개(DELTA-01, DELTA-02) 중 첫 번째로, `onBeforeChange`(DELTA-02)는 이 변경 범위 밖이다.

## 확정 커밋

- `e5a4917` — feat(core): 편집기 lifecycle·selection 이벤트 onMount/onUnmount/onSelectionChange 추가

## 변경한 계약과 파일

- `packages/core/src/editor-controller.ts` — `CreateEditorOptions`에 `onMount`/`onUnmount`/`onSelectionChange` 선언 추가.
- `packages/core/src/production-editor-session.ts` — 생성자 옵션 타입 확장, `mount()` 끝에 `onMount` 호출, `unmount()` 가드 통과 직후·실제 unmount 작업 전에 `onUnmount` 호출, `createTiptapEditor()`에서 `onSelectionChange`를 `createProductionEditor`로 조건부 전달.
- `packages/core/src/production-editor-assembly.ts` — `createProductionEditor` 옵션에 `onSelectionChange?: () => void` 추가, `new Editor({...})`에 조건부로 Tiptap 네이티브 `onSelectionUpdate` 등록.
- `packages/core/test/editor-controller-lifecycle-events.test.ts`(신규) — 4 tests.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/editor-controller-lifecycle-events.test.ts` — 4 passed.
- `pnpm --filter @cp949/geul-core test`(전체) — 108 files / 1530 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-core typecheck` · `build`(`tsc -b`) — clean.
- `pnpm --filter @cp949/geul-react typecheck` — clean.
- post-fix mutation 검증 3건 전부 의도한 테스트가 정확히 실패함을 확인(`onSelectionUpdate` → `onTransaction` 교체, `mount()`의 `onMount` 호출 제거, `unmount()`의 `onUnmount` 호출을 가드 앞으로 이동) 후 원복·재검증(4 passed).

## 구현 중 계획과 달랐던 사실

없음. 계획한 두 배선 지점(세션 자신의 `mount()`/`unmount()`, Tiptap 네이티브 `onSelectionUpdate`)이 구현·검증 전 과정에서 그대로 성립했다 — 사전 조사(Tiptap 3.30.1 `dispatchTransaction`의 `selection.eq` 판정, load-normalizing dummy mount의 trailing-paragraph 정규화가 selection을 옮기지 않는다는 기존 주석) 단계에서 이미 확인했던 사실이 구현 단계에서 재확인됐을 뿐이다.

## 등록한 이슈

없음. 범위 밖 발견 없음.

## RD-004 진행 상태

완료 조건 4개 중 2개(`onMount`/`onUnmount` 1회 발화, `onSelectionChange` 발화) 충족. RD-004는 아직 `ACTIVE`다 — 남은 완료 조건(`onBeforeChange` AND 결합·fail-fast, 기존 revision guard 편입 후 회귀 유지)은 DELTA-02가 담당한다.

## 남은 제한

- `onMount`/`onUnmount`은 세션 자신의 `mount()`/`unmount()` 호출에만 대응한다 — `replaceDocument()`의 내부 remount·세션 생성 시 내부 load-normalizing dummy mount/unmount에는 발화하지 않는다(설계 결정, RD-004.md "포함 범위"가 요구하지 않는 범위).
- RD-004 DELTA-02(`onBeforeChange`)가 아직 미착수다. RD-005(읽기 전용)도 미착수다.
- push·tag·PR·`dev` → `main` 병합은 이 세션에서 실행하지 않았다.

## rollback

`git revert e5a4917`. 위험: 낮음 — 기존 파일 확장(신규 옵션 3개 + 배선)뿐, 기존 메서드·동작 변경 없음. 되돌리면 `onMount`/`onUnmount`/`onSelectionChange`가 사라진다.
