# Issue #128 — roadmap §4 릴리스 판정 문언과 IO-007 PARTIAL 상충 정정

## 목표

`docs/product/roadmap.md` §4(릴리스 판정)의 "단계에 배정된 모든 기능 ID가 `VERIFIED`다" 문언이 사용자 승인된 `IO-007` R3 이월(R2 완료 시점 `PARTIAL` 유지)과 문언 그대로 충돌하던 문제를 정정한다(Issue #38 슬라이스 1 트랙-2 라운드 7에서 발견).

## 확정 커밋

- `de3c434` — roadmap §4 릴리스 판정에 승인된 이월 예외 조항을 추가한다

## 변경한 계약과 파일

- `docs/product/roadmap.md` §4 완료 조건 1번째 bullet에 예외 조항 추가: "단, 후속 단계로 이월이 사용자 승인되고 그 승인 근거(Issue 번호·일자)와 이월 조건이 해당 단계 절에 기록된 기능 ID는 `PARTIAL`로 완료 판정에 참여한다."
- `docs/product/roadmap.md` R2 완료 조건 목록(4개 bullet, 개수 불변 — Issue #38 슬라이스 11이 "roadmap R2 완료 조건 4개 전부 PASS"로 참조하는 리터럴) 뒤에 별도 문장 추가: `IO-007`이 파일 붙여넣기 R3 이월로 `PARTIAL`로 남고 위 §4 예외로 완료 판정에 포함됨을 명시, 승인 근거(Issue #38 승인 2026-08-27, spec §2.2) 인용.
- Issue #38 본문·spec §2.2·`current-status.md`는 편집하지 않았다 — 이미 정확했고, 상충 원인은 roadmap §4의 일반 문언 한 곳이었다.
- 코드·테스트 변경 없음. 문서 전용.

## 검증

- 단계-3 완료 조건 대조(메인 세션 직접 판정): 계획서 4개 완료 조건 전부 `PASS`(`IMPL-REVIEW-01.md`).
- 단계-3 결함 탐지(읽기 전용 subagent): 2건 발견, 모두 수정.
  - F1(MAJOR): §4 예외 조항이 "사용자 승인"·"이월 조건 기록"의 근거 형식(Issue 번호·일자)을 규정하지 않아 향후 다른 기능 ID·단계에서 근거 없이 남용될 여지 — 조항에 인용 요건 명문화로 수정.
  - F2(MAJOR): R2 `IO-007` 문장이 R2 로컬 완료 조건 bullet 안에 있어 "이 조건"이 로컬 목록과 §4 전역 조건 중 어느 쪽을 가리키는지 모호 — 목록 밖 별도 문장으로 분리하고 지시 대상·승인 근거를 명시해 수정.
- `pnpm lint` — 통과. `git diff --check` — 통과. `git status --short` — clean.
- `pnpm verify` 전량 — 통과(e2e 115개 전부 통과, 3세션 전 Issue #127 작업에서 발견된 `e2e/list-item.spec.ts:228` baseline flake는 이번 실행에서 재현되지 않음).

## 등록한 이슈

- 완료 댓글: https://github.com/cp949/geul/issues/128#issuecomment-5482471234 — 이슈 닫음.
- 신규 이슈 없음(범위 밖 발견 없음).

## 남은 제한

- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋을 `dev`에서 `git revert`한다. 위험: 낮음(roadmap 문서 4줄, 코드·테스트 영향 없음).
