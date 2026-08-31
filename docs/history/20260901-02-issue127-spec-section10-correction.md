# Issue #127 — spec §10 표 중첩 범위 문언 정정

## 목표

`docs/specs/2026-08-19-r2-basic-block-parity-design.md` §10이 §2.2와 정반대로 "표 블록 자체의 문서 내 중첩"까지 범위 밖이라 서술하던 모순을 §2.2·§3.2 방향으로 정정한다(G-CNV-002 계열의 spec 정합성 문제, Issue #38 슬라이스 1 트랙-2 라운드 7에서 발견).

## 확정 커밋

- `887adb6` — spec §10 표 중첩 범위 문언을 §2.2와 일치시킨다

## 변경한 계약과 파일

- `docs/specs/2026-08-19-r2-basic-block-parity-design.md:285`(§10, 두 번째 bullet). 이전: "표 셀 안 블록 중첩, 표 블록 자체의 문서 내 중첩은 이 명세의 범위가 아니다." 이후: "표 셀 안 블록 중첩은 이 명세의 범위가 아니다. … 표 블록 자체를 문서 안에서 들여쓰기(다른 블록의 자식으로 두는 것)는 R2 범위다(2.2)." — §2.2(표를 들여쓰기는 R2 범위, 표 셀 안 블록 중첩만 범위 밖)·§3.2(표 셀은 InlineContent만 담는다)와 방향을 일치시켰다.
- 코드·테스트 변경 없음. 문서 1줄 정정.

## 검증

- 단계-3 완료 조건 대조(메인 세션 직접 판정): 두 완료 조건 모두 PASS — §10 bullet이 §2.2와 일치, §2.2·§3.2·§10 세 곳이 한 방향으로 읽힘(grep으로 세 절 원문 대조).
- 단계-3 결함 탐지(읽기 전용 subagent): diff 범위 결함 0건. diff가 §10 한 bullet에 국한, 정정 문구가 5.1절 `indentBlock`/`outdentBlock` 정의·2.2절 `children` 서술과 용어 일치, roadmap/current-status/inventory 문서와 상충 없음, 적용 가이드·함정 없음(계획서 판단 타당), 아키텍처 불변식 위반 없음을 확인.
- `pnpm lint` — 통과. `git diff --check` — 통과. `git status --short` — clean.
- `pnpm verify` 전량 — `e2e/list-item.spec.ts:228` 1건 실패, 나머지 114개 통과. `dev`(이 작업 착수 전 baseline)로 전환해 재확인한 결과 같은 위치에서 동일 재현되고 단독 실행은 통과함을 확인 — 이 변경과 무관한 기존 flake로 판정, Issue #144로 분리했다.

## 등록한 이슈

- 완료 댓글: https://github.com/cp949/geul/issues/127#issuecomment-5482059796 — 이슈 닫음.
- 신규 이슈 #144(`pnpm verify` 전량 실행 시 `e2e/list-item.spec.ts:228`가 간헐적으로 실패) — 이 작업 범위 밖 발견을 분리 등록.

## 남은 제한

- Issue #144(baseline e2e flake)의 근본 원인은 조사하지 않았다.
- Issue #128(roadmap §4/IO-007 상충)은 같은 리뷰 라운드에서 나온 별도 문서 정합성 이슈로, 이번 작업에 섞지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋을 `dev`에서 `git revert`한다. 위험: 낮음(spec 문서 1줄, 코드·테스트 영향 없음).
