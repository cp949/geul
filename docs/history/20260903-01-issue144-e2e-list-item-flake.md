# Issue #144 — `list-item.spec.ts` 간헐 실패 조사, `pressAndReadConsumption` 리스너 정리(G-TST-003)

## 목표

`pnpm verify`/`pnpm test:e2e` 전량 실행 시 `e2e/list-item.spec.ts:228`("목록 선두 Backspace와 끝 Delete join은 native 폴스루 없이 각각 소비된다")가 간헐적으로 실패하는 원인을 규명하고 고친다(Issue #144).

## 확정 커밋

- `ff1e7ac` — `pressAndReadConsumption` keydown 리스너 정리(G-TST-003)

## 변경한 계약과 파일

- `e2e/list-item.spec.ts` `pressAndReadConsumption` 헬퍼(17-53행): 매 호출마다 등록만 하고 한 번도 제거하지 않던 `document`-레벨 keydown 리스너에 `removeEventListener` 정리를 추가했다. `page.keyboard.press`와 판정을 `try`에, 리스너 제거를 `finally`에 둬 press가 던지는 경로에서도 정리가 빠지지 않게 했다. 반환 계약(`Promise<boolean>`)과 기존 6개 호출부 시그니처·동작은 그대로다.

## 검증

- 단계-3 완료 조건 대조(메인 세션 직접 판정): 계획서 완료 조건 3개 중 1("원인 규명")은 FAIL — 사용자에게 보고하고 "위생 수정 유지 + 이슈는 열어둔 채 완료 댓글로 이월"(A안)을 승인받았다. 2-(b)(baseline 5회 연속 통과 확인)와 3(기존 테스트 회귀 없음)은 PASS.
- 단계-3 결함 탐지(읽기 전용 subagent 1개): MINOR 1건(F1 — 정리 코드에 실패 경로 보장이 없음) 발견, 같은 실행에서 `try/finally`로 수정 후 재검증(`tsc`, `eslint`, `playwright test e2e/list-item.spec.ts` 10/10 통과).
- 원인 조사: 수정 후 `pnpm test:e2e`(chromium 129개) 5회 연속 실행과, 수정 전 baseline(`git stash`)에서도 5회 연속 실행 — 양쪽 모두 전량 통과. 로컬(12-core, 6 workers)에서 Issue #144가 보고한 실패를 재현하지 못해 리스너 누적 가설을 확증·반증하지 못했다.
- `pnpm exec tsc -p e2e/tsconfig.json --noEmit`, `pnpm exec eslint e2e/list-item.spec.ts` — 통과.
- `pnpm verify` 전량(lint·build·typecheck·unit test·package boundary·license·e2e chromium 129건) — 통과.
- `git diff --check`, `git status --short` — 이상 없음.

## 등록한 이슈

- 완료 댓글: https://github.com/cp949/geul/issues/144#issuecomment-5520772323 — **이슈를 닫지 않았다.** 완료 조건 1("원인 규명")이 미충족이라 종료 기준을 채우지 못한다.
- 이번 작업 범위 밖 신규 이슈 등록 없음.

## 남은 제한

- Issue #144의 근본 원인은 여전히 미확인이다. 로컬에서 10회(수정 전/후 각 5회) 무실패라 CI 재발 관찰 외에는 남은 관찰 수단이 없다.
- `pressAndReadConsumption`과 같은 "keydown 리스너 미정리" 패턴이 다른 spec 파일에도 있는지는 조사하지 않았다 — 계획서 범위 밖으로 명시했다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋을 `dev`에서 `git revert`한다. 위험: 낮음(e2e 테스트 헬퍼 1개 파일, 프로덕션 소스 무변경, 반환 계약·호출부 시그니처 불변).
