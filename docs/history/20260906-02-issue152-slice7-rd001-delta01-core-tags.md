# Issue #152 슬라이스7 RD-001 DELTA-01 — chromium 베이스라인 회귀 수정 + 3-엔진 `@core` 태그 부여, RD-001 DONE

## 목표

roadmap-workflow RD-001(3-엔진 Chromium/Firefox/WebKit `@core` 게이트 GREEN)의 유일한 DELTA. 슬라이스4(`MED-003`, drag/drop) 대표 시나리오에 `@core` 태그를 부여하고 `pnpm test:e2e:full`을 GREEN으로 만든다. readiness probe가 착수 전 발견한 chromium 베이스라인 회귀(슬라이스6 이후 stale e2e 단언) 수정을 포함한다.

## 확정 커밋

- `9611550` — test(e2e): 위험한 HTML 정화 회귀 테스트 단언 교정
- `021227f` — test(e2e): media drop 대표 시나리오에 @core 태그 부여

## 변경한 계약과 파일

프로덕션 코드 변경 없음. e2e spec 파일 2개:

- `e2e/editor-round-trip.spec.ts` — "화면의 가져오기·내보내기 컨트롤을 거쳐 위험한 HTML을 정화한다" 단언 교정. 슬라이스6(Issue #152)이 `<img>`를 HTML import allowlist에 편입시켜 별도 image 블록으로 정상 복원되게 바꿨는데(`packages/io/test/html-security.test.ts`는 이미 반영), 이 e2e만 "Unsafe link"와 "Visible text"가 한 문단에 붙어 있고 `<img>` 자체가 사라진다는 옛 기대를 그대로 갖고 있어 `pnpm test:e2e`(chromium)를 깨고 있었다. `onerror`/`onclick`/`javascript:`/`position:` 제거는 그대로 검증하고, `<img data-be-media-type="image">`가 안전하게 남는 것을 새로 검증하도록 고쳤다 — 보안 posture 회귀는 아니다.
- `e2e/media-drop-paste.spec.ts:73` — drop 좌표 위쪽 절반 → 블록 앞 삽입 + 실제 업로드 완주 시나리오에 `@core` 태그 신규 부여(이 파일 2 tests 중 0 → 1개). firefox/webkit `@core` 게이트가 35 → 36개 시나리오로 증가(실측 `npx playwright test --project=firefox --list`).

## 구현 중 계획과 달랐던 사실

RD-001 readiness probe에서 `pnpm test:e2e`(chromium)를 실측한 결과 182 passed / 1 failed였다(진입 조건 "현재 chromium GREEN" 위반). 판정은 `REPLAN_WITHIN_RD` — RD 결과·경계는 유지한 채 이 수정을 DELTA-01 포함 범위에 추가했다(`_works/roadmap/RD-001.md`에 반영). 원래 예상 DELTA는 "`@core` 태그 부여 + 3-엔진 실행"만이었다.

## 검증

- `pnpm test:e2e --project=chromium e2e/editor-round-trip.spec.ts` — 4 passed(회귀 수정 확인).
- `npx playwright test --project=firefox --list` — 36개 시나리오(35 → 36, `media-drop-paste.spec.ts` 신규 편입 확인).
- `pnpm test:e2e:full` — **255 passed(1.7m), 0 failed**(chromium 183 + firefox 36 + webkit 36). 엔진별 실패 0건.
- `pnpm lint`(eslint) · `pnpm run format:check`(prettier) — 전부 clean.
- 결함 탐지(메인 세션 직접 수행, subagent dispatch 없음 — roadmap-workflow 경량 DELTA 사이클): `git diff --stat`(2 files, +10/-4)가 계획한 두 파일·두 변경과 정확히 일치. 발견 0건.

## 등록한 이슈

없음. 범위 밖 발견 없음(readiness probe가 발견한 1건은 이 DELTA에서 바로 해소).

## 남은 제한

- RD-001 완료 조건 2개 전부 실측 증거로 재대조 완료 → RD-001 `DONE`(`_works/roadmap/RD-001.md`).
- RD-002(R3 완료 판정 문서 + inventory/roadmap/current-status 동기화) 진입 조건이 충족돼 `READY`로 전환. Issue #152 슬라이스7의 나머지 절반이 남아 있다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 021227f 9611550`(역순). 위험: 낮음 — e2e 테스트 단언·제목 문자열만 변경, 프로덕션 코드 변경 없음. 되돌리면 chromium 베이스라인 회귀가 재발하고 3-엔진 게이트 커버리지가 35개 시나리오로 줄어든다.
