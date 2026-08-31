# Issue #140 — 목록 block type test support cleanup 실패 집계

## 목표

테스트 editor cleanup(`afterEach`)이 `destroy()` 실패로 나머지 정리가 막히거나 내부 Set이 안 비워지는 결함을 없애고, 실패를 `AggregateError`로 집계한다(G-TST-003).

## 확정 커밋

- `d198710` — 테스트 editor cleanup이 destroy() 실패를 집계하도록 보강

## 변경한 계약과 파일

- `packages/core/test/list-item-block-type-support.ts`: `afterEach` 콜백을 named export `destroyMountedEditorsForTest`로 추출. 등록된 editor 전량에 `destroy()`를 시도하고(개별 실패는 `try/catch`로 흡수), 성공·실패와 무관하게 `mountedEditors`를 항상 비우며, 실패가 있으면 `AggregateError`로 던진다.
- `packages/core/test/table-test-support.ts`: 같은 결함 패턴을 계획 단계에서 추가로 확인해 `destroyFixtureEditorsForTest`에 동일 수정을 적용. 두 함수는 공유 헬퍼로 추출하지 않고 독립 구현을 유지한다.
- `packages/core/test/list-item-block-type-support.test.ts`(신규), `packages/core/test/table-test-support.test.ts`(추가): 각 4개 계약(전량 시도, 무조건 clear, 실패 집계, RED→GREEN 회귀)을 고정하는 회귀 테스트 2건씩.
- 신규 런타임 의존성, 공개 API와 저장 형식 변경 없음. 테스트 코드 전용 변경.

## 검증

- 단계-2/단계-3 focused: `vitest run test/list-item-block-type-support.test.ts test/table-test-support.test.ts` → `Test Files 2 passed (2)`, `Tests 14 passed (14)`. `packages/core` typecheck 통과. `git diff --check` 통과.
- RED 재현(메인 세션 직접 확인): 수정 전 코드로 되돌려 같은 테스트 실행 → `Test Files 2 failed`, `Tests 4 failed | 10 passed` — 두 번째 실패 집계 테스트가 이전 테스트에서 새어나간 editor로 오염되는 것까지 관측(set 미정리의 직접 증거).
- 단계-3 결함 탐지(읽기 전용 subagent): diff 범위 결함 0건. 루프 조기 종료 가능성, `clear()` 무조건 실행, `AggregateError` 생성자, 신규 테스트 실효성, 테스트 간 side effect, 타입 안전성을 코드 추적 + 실제 실행으로 교차 검증.
- 단계-4 병합 게이트: `pnpm verify` 전량(lint·build·typecheck·unit·package boundary·license·e2e chromium 115/115) 통과.
- `packages/core` 전체 스위트 65 files / 927 tests 통과(subagent 별도 실행 확인).

## 상태와 남은 제한

- Issue #140 완료 댓글: `https://github.com/cp949/geul/issues/140#issuecomment-5481722764`. 이슈 닫음.
- 개별 `destroy()`가 실제로 왜 실패할 수 있는지의 근본 원인은 조사하지 않았다 — 이번 작업은 실패 시 집계·전량 시도 계약만 다뤘다(계획서 "범위 밖").
- 저장소 전역 검색으로 같은 cleanup 루프 패턴(`for (const ... of ...) ...destroy()` 뒤 `.clear()`)이 이 두 파일뿐임을 확인했다 — 세 번째 인스턴스 없음.
- push·tag·PR·`dev -> main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋과 이 이력 커밋을 `dev`에서 역순으로 `git revert`한다. 위험: 낮음(테스트 전용 변경, 제품 코드 영향 없음).
