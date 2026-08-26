# 2026-08-26 `chrome83` 게이트에 표 행 추가 `createId()` 회귀 시나리오 추가 (Issue #124)

qq-workflow(단계 1~4, IMPL-REVIEW 1회)로 진행했다.

## 목표

Issue #121이 리스크 판단으로 제외했던 표 행/열 추가의 `createId()` 경로를, 마우스 드래그·오버레이 없이 키보드(Tab)만으로 트리거하는 `@core` e2e 시나리오로 `chrome83` 실브라우저 게이트에 추가한다.

## 확정 커밋

- `4e33de8` test(e2e): chrome83 게이트에 표 행 추가 createId() 회귀 시나리오를 추가한다

## 바꾼 계약

- **신규 `e2e/support/ids.ts`** — `uuidV4Pattern`, `trackPageErrors(page)`. `block-handle.spec.ts`와 두 번째 사용처가 생겨 공용 test support로 추출했다(G-TST-002).
- **신규 `e2e/table-keyboard-row-insert.spec.ts`** — 표 마지막 셀 Tab → `goToNextTableCellOrInsertRow` → `insertTableRow` → `createId()` 경로 실행, 발급 id UUID v4 검증 + `pageerror` 0건 확인 `@core` 시나리오. `table-keyboard-navigation.spec.ts`(Shift+Tab 포커스 트랩 전용)와 의도적으로 별도 파일 — `chrome83` `testMatch`는 파일명 단위라 한 파일에 두면 그 파일의 다른 `@core` 테스트까지 의도치 않게 편입된다(단계-3 결함 탐지 MAJOR 1건, 같은 실행에서 수정).
- **`playwright.config.ts`** — `chrome83` project `testMatch`에 `table-keyboard-row-insert` 추가(`link-toolbar`, `block-handle`과 함께 3개 파일).

## 주요 파일

`e2e/support/ids.ts`(신규), `e2e/table-keyboard-row-insert.spec.ts`(신규), `e2e/block-handle.spec.ts`(로컬 헬퍼 제거·import 대체), `playwright.config.ts`. 4파일, +75/-14.

## 검증

- `pnpm verify` 전량 exit 0(수정 전·후 각 1회) — lint / build / `check:escompat` / typecheck / `vitest run` 1031 Tests / `check:boundaries` / `check:licenses` / `test:e2e` 83 passed(chromium).
- `pnpm test:e2e:chrome83`(Docker, Chrome83 실바이너리) 연속 2회 3 passed — 링크 툴바·블록 분리·표 행 추가.
- `pnpm exec playwright test --list --project=chrome83` → 정확히 3 tests in 3 files(단계-3 결함 수정 후 재확인).
- `pnpm scan:test-helpers` — 신규 헬퍼 중복 미검출(기존 무관 2건만).
- 변이 검증: `table-keyboard-extension.ts`의 행 추가 무력화 → RED(행 개수 불변), `id-factory.ts`를 유일하지만 비-UUID 값으로 교체 → RED(형식 불일치, 행 개수는 정상) — 두 변이 모두 원복 후 GREEN 재확인.

단계-3 결함 탐지(1개 subagent, diff 전체)가 MAJOR 1건을 잡았다 — `chrome83` `testMatch`가 파일명 단위인 것을 고려하지 않아 표 행 추가 시나리오를 `table-keyboard-navigation.spec.ts`에 합쳤을 때, 그 파일의 기존 Shift+Tab `@core` 테스트까지 chrome83에 의도치 않게 편입됐다(설정 주석은 "3개"인데 실제로는 4개). 시나리오를 별도 파일로 분리해 같은 실행에서 수정하고 재검증했다.

## 남은 제한

- `chrome83` project webServer의 `reuseExistingServer` stale 재사용 위험은 Issue #123으로 이미 분리돼 있다 — 이번 작업이 만든 위험이 아니다.
- `uuidV4Pattern` 형식 검증 자체는 `block-handle.spec.ts`와 같은 `createId` 클로저(`editor-controller.ts`)를 공유해 한계효용은 낮지만, `pageerror` 무발생 단언은 `insertTableRow`가 지나가는 `table-commands.ts`/`table-grid.ts` 경로 고유의 사실을 새로 증명한다.
- 표 열 추가의 키보드 트리거는 현재 코드에 없다 — 완료 기준의 "최소 하나"는 행 경로로 충족했다.

## 등록·종료한 이슈

- 종료: #124(완료 댓글에 완료 기준 2개 대조·검증·남은 제한 기록)
