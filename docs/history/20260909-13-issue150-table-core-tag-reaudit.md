# Issue #150 — 표 e2e `@core` 태그 재심사 완료

## 목표

Issue #150이 지목한 `table-format.spec.ts`·`table-handle.spec.ts`의 `@core` 태그 0건 상태의 실제 원인을 확인하고, ADR-0007 기준에 맞춰 필요한 만큼 `@core`를 재부여한다.

## 확정 커밋

없음. 이 작업은 코드 변경 없이 종료됐다 — 재심사 대상 신규 테스트 9건 전부 `@core` 미부여로 판정돼 태그 추가 자체가 발생하지 않았다. 작업 브랜치 `test/150-table-core-tag-reaudit`는 `dev`(`ad15b66`)와 diff 0으로 `git merge --ff-only`가 no-op으로 완료됐다.

## 조사 결과 — 이슈 전제 정정

이슈 본문 "리팩터링 중 우발적 유실로 추정"은 사실과 달랐다. git pickaxe 검색(`git log -p -S'@core'`)으로 확인한 실제 원인: 2026-08-25 커밋 `a24c92c`(Issue #89, "표 계열 @core 태그를 ADR 0007 엔진 차이 기준으로 재판정한다")가 `docs/adr/0007-own-behavior-at-the-lowest-proving-layer.md` 기준으로 9건(table-format 3, table-handle 4, table-paste 2)을 **의도적으로, 근거를 남기고** 제거한 것이었다. 이슈 본문의 "열 핸들 메뉴, 드래그 재정렬 헬퍼 정리" 서술도 실제 커밋 내역(뷰포트 도달성 Issue #163, indent/outdent Issue #126, ADR-0013 dismiss)과 일치하지 않았다.

진짜 게이트 공백은 "유실"이 아니라, 그 재판정(2026-08-25) **이후** 추가된 신규 테스트 9건(table-format 6, table-handle 3)이 ADR-0007 기준으로 심사된 적이 없었다는 점이었다.

## 심사 방법과 결과

9건 각각을 ADR-0007 기준(엔진 차이를 증명할 수 있는 가장 낮은 계층이 그 동작을 단독 소유하는가)으로 판정했다. 1차 판정(subagent)과 독립 2차 판정(subagent, 1차 결과 미제공)을 교차 검증했고, 1건(뷰포트 밖 버튼의 키보드 Tab 포커스 도달성 — `table-format.spec.ts:465`)에서 이견이 나와 메인 세션이 해당 테스트에 임시로 `@core`를 붙여 `npx playwright test --project=webkit --project=firefox`로 직접 실행해 조정했다 — 두 엔진 모두 통과, 발산 없음을 확인하고 미부여로 확정했다.

**최종 판정: 9건 전부 미부여.** 대부분 Playwright 자동 스크롤·표준 `focus()`/`scrollIntoView()`·결정적 모델 커맨드처럼 엔진 무관 경로였다.

## 검증

- `npx playwright test --project=firefox --list`: 신규 9건 모두 목록에 없음(미부여 판정과 일치, 38 tests in 22 files).
- `pnpm test:e2e:full`: 279 passed, 3-엔진(chromium/firefox/webkit) GREEN.
- `npx playwright test --project=webkit --project=firefox -g "<:465 테스트 제목>"`(임시 태그, 판정 조정용): 2 passed, 원복 후 `git status` clean 확인.
- `pnpm verify`: 전량 GREEN(lint, format, build, escompat, typecheck, unit test, boundaries, licenses, e2e chromium+mobile 205 passed).

## 남은 제한

없음. 심사 중 표 기능 자체의 엔진별 결함은 발견되지 않았다. WebKit의 "Full Keyboard Access 기본 꺼짐 시 버튼 Tab 제외" 자체는 실재하는 브라우저 특성이나, 이 저장소가 쓰는 Playwright WebKit 실행 환경에서는 재현되지 않았다 — Playwright WebKit 빌드나 실행 옵션이 바뀌면 재실측이 필요하다.

## GitHub

- Issue #150 완료 댓글: `issuecomment-5600240557`.
- Issue #150 종료.
- 범위 밖 발견 분리: 없음(신규 등록 이슈 없음).
- commit 없음(코드 변경 없음), `dev` ff-only 병합(no-op) 완료. push·tag·PR 생성은 수행하지 않았다.

qq-workflow, 단계-1~4 전체 진행. 단계-1에서 그릴링 2라운드로 이슈 전제 오류 발견 후 완료 조건을 "16개 복원"에서 "신규 9건 재심사"로 재정의(사용자 승인).
