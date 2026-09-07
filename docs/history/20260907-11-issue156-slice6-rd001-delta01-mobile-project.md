# Issue #156 슬라이스6 RD-001 DELTA-01 — `playwright.config.ts` 모바일 project 신설

## 목표

RD-001(mobile/touch 입력 지원, `UI-015`)의 첫 DELTA. Playwright에 `isMobile`/`hasTouch` 모바일 project를 신설하고 `pnpm test:e2e`에 포함시켜, 후속 DELTA(드래그 핸들 touch-action, 가상 키보드 회피, MediaResizeHandles touch)가 실제 touch 이벤트로 검증할 기반을 만든다.

readiness probe(2026-09-07)로 RD-001을 이어 착수 — RD-002가 이미 `DONE`이라 전환.

## 확정 커밋

- `6b67753` — feat(e2e): 모바일 project 신설(isMobile/hasTouch)

## 변경한 계약과 파일

- `playwright.config.ts` — `mobile` project 신설(`devices["Pixel 5"]`, `grep: /@mobile/`) — `isMobile`은 Firefox 미지원이라(Playwright 공식 타입 확인) Chromium 기반 1개만(그릴링 결정). 기존 spec은 데스크톱 hover(`BlockSideMenu`의 `pointermove` 기반 노출)·넓은 기본 뷰포트를 전제해 그대로 돌리면 무관한 대량 실패를 내므로, `firefox`/`webkit`의 `@core` 부분집합 패턴과 동일하게 `@mobile` 태그 전용으로 스코프했다.
- `package.json` — `test:e2e` 스크립트에 `--project=mobile` 추가(Issue 완료기준 "pnpm test:e2e(신규 모바일 project 포함)" 그대로).
- `e2e/mobile-touch.spec.ts` — 신규. `@mobile` 스모크 테스트 1건(데모 로드 + `editable.tap()` + 타이핑).

## 구현 중 발견·수정

메인 세션 결함 탐지(경량 DELTA 사이클, subagent 없이 직접 수행)로 `pnpm test:e2e` 전체 실행에서 `chromium` project가 `@mobile` 태그 파일도 함께 집어(`grep` 미설정이라 전체 spec 대상) `editable.tap()`이 `hasTouch` 컨텍스트 없이 실패하는 것을 발견했다. `chromium` project에 `grepInvert: /@mobile/`을 추가해 `mobile` project의 `grep: /@mobile/`과 정확히 상보적으로 만들어 해결했다 — 이 수정이 없으면 `pnpm test:e2e` 전체가 항상 실패하는 회귀였다.

## 검증

- `pnpm exec playwright test --project=mobile` 1 passed(project 배선만 단독 확인).
- `pnpm typecheck:e2e`·`pnpm typecheck:configs` clean.
- 1차 `pnpm test:e2e` 실행에서 위 결함 발견(186 중 1 failed) → `grepInvert` 수정 → 재실행 `pnpm test:e2e` 186 passed(chromium 185 + mobile 1).
- 재그룹화: 단일 커밋(수정도 커밋 전에 반영), `git merge --ff-only`로 바로 이전.

## RD-001 진행 상태

DELTA-01 완료. 완료 조건 중 "`playwright.config.ts`에 모바일 project가 있고 `pnpm test:e2e`가 이를 포함해 통과한다" 충족(증거: 위 검증). 남은 것은 DELTA-02(드래그 핸들 touch-action/preventDefault), DELTA-03(가상 키보드 회피), DELTA-04(MediaResizeHandles touch e2e).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스6, RD-001)가 미완료라 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- `firefox`/`webkit` project는 `grep: /@core/`만 걸려 있어, 후속 DELTA가 `@core`와 `@mobile`을 동시에 붙인 테스트를 만들면 hasTouch 없는 Desktop Firefox/Safari에서도 같은 실패가 재현될 수 있다 — 현재는 그런 테스트가 없어 실제 위험은 아니다. 발생 시 같은 패턴(`grepInvert: /@mobile/`)으로 대응.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 6b67753`. 위험: 낮음 — 신규 project·스크립트 인자·스모크 테스트 추가뿐, 기존 `chromium`/`firefox`/`webkit`/`perf`/`chrome83` project 동작은 바뀌지 않는다(`chromium`의 `grepInvert` 추가는 `@mobile` 태그 없는 기존 테스트에 영향 없음).
