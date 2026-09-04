# Issue #38 슬라이스 11 RD-002 DELTA-01 — R2 완료 판정 문서, RD-002 DONE, roadmap 전체 완료

## 목표

roadmap-workflow RD-002(R2 완료 판정 문서 + inventory/current-status 동기화)의 유일한 DELTA. `pnpm verify` 최종 증거를 확보하고 `docs/reviews/r2-basic-block-parity-completion.md`를 작성해 roadmap R2 완료 조건 4개를 판정하며, inventory·current-status를 실제 상태로 동기화한다. 이 DELTA로 roadmap(RD-001·RD-002) 전체가 완료돼 Issue #38 슬라이스 11이 끝난다.

## 확정 커밋

- `d0c9c2e` — docs: R2 기본 블록 parity 완료 판정, inventory·current-status R3 진입 동기화 (Issue #38 슬라이스 11, RD-002 DELTA-01)

## 변경한 계약과 파일

프로덕션 코드 변경 없음.

- `docs/reviews/r2-basic-block-parity-completion.md`(신규) — R1 완료 판정 문서 형식(`development-lifecycle.md` §7). roadmap.md R2 완료 조건 4개(AC-01~04)를 R2-01 회차로 전부 `PASS` 판정. §3 계약 변경 이력에 `BLK-005` 이월 예외 신설 결정 기록.
- `docs/product/blocknote-free-feature-inventory.md` — `DOC-002`(중첩 모델)·`UI-009`(placeholder) → `VERIFIED`. `BLK-005`(인용문) 사유를 "TextBlockProps 완료, GFM 중첩 재평가만 미해결 — 이월 예외"로 갱신(상태는 `PARTIAL` 유지).
- `docs/product/current-status.md` — "현재 단계"를 R2 완료/R3 다음 단계로 전환(R2 실행 상태 요약 narrative 추가), "바로 다음 작업"을 R3(파일·미디어 parity) 계획 착수 안내로 교체.

## 구현 중 계획과 달랐던 사실

계획 초안은 RD-002를 순수 "문서 동기화"로 예상했다. 착수 전 조사(subagent 위임)로 `DOC-002`·`BLK-005`·`UI-009` 3개 인벤토리 `PARTIAL` 사유를 재검증한 결과, `DOC-002`·`UI-009`는 후속 슬라이스(5/6/7a/8)가 실제로 닫았음을 코드·테스트로 확인해 `VERIFIED`로 갱신했다. 그러나 `BLK-005`는 `TextBlockProps` gap만 닫히고 GFM 중첩 인용문 표현 재평가(Issue #38 확정 사항 9가 예고한 "재평가 대상")가 슬라이스 5(목록만 재평가)에서 다뤄지지 않아 여전히 미해결임을 발견했다 — 이는 문서 동기화가 아니라 실제 제품 범위 gap이라 roadmap-workflow "사용자 결정 경계"(승인된 spec 의미 변경)에 해당해 진행을 멈추고 사용자에게 물었다. 사용자는 "PARTIAL로 이월 + 후속 이슈 등록"(3개 선택지 중 권장안)을 선택했다 — `IO-007`과 같은 이월 예외를 `BLK-005`에도 적용한다.

## 검증

- `pnpm verify` — exit 0. `pnpm lint`(biome+eslint)·`pnpm run format:check`·`pnpm build`(turbo 10/10)·`pnpm check:escompat`(126개 파일 Chrome ≥75)·`pnpm typecheck`(turbo 10/10+configs/e2e/tests/scripts)·`pnpm test`(vitest, 219 files/2659 tests)·`pnpm check:boundaries`(manifest 7개·public core declaration 5개)·`pnpm check:licenses`(manifest 6개·외부 package 139개)·`pnpm test:e2e`(chromium, 145 passed) 전부 통과.
- `pnpm test:e2e:full`(RD-001에서 이미 실행) — 191 passed(chromium 145+firefox 23+webkit 23), 엔진별 실패 0건.
- 결함 탐지(메인 세션 직접 수행, subagent dispatch 없음): 변경이 전부 문서(신규 리뷰 문서 1개+인벤토리 3행+current-status 상태 전환)라 Micro로 판정. 완료 판정 문서의 각 AC 판정이 실제 inventory 상태·테스트 파일명과 일치하는지, §3 계약 변경 이력이 인벤토리 `BLK-005` 행의 새 사유와 일치하는지 대조 완료. 발견 없음.

## 등록한 이슈

없음(신규 이슈 후보 2건은 아래 "남은 제한" 참고 — 등록 여부는 사용자 지시 대기).

## 남은 제한

- RD-002 완료 조건 3개 전부 실측 증거로 재대조 완료 → RD-002 `DONE`(`_works/roadmap/RD-002.md`).
- **roadmap 전체 완료 조건 5개 전부 재대조 완료 → roadmap `DONE`.** 모든 RD(RD-001·RD-002)가 `DONE`이고 전체 통합 검증(`pnpm verify`)이 통과해 Issue #38 슬라이스 11이 완료됐다. roadmap-workflow "RD 완료와 roadmap 종료" 절차(Issue 진행 계획 동기화, `_works/roadmap/` archive, Issue 완료 댓글·종료 판단)를 이 DELTA 직후 별도로 수행한다.
- 신규 후속 이슈 후보 2건(등록 여부 사용자 지시 대기):
  1. `table-format.spec.ts`·`table-handle.spec.ts`의 `@core` 태그가 현재 0개(R1 AC-05가 인용한 16개 시나리오와 불일치, 회귀 추정) — RD-001 DELTA-01에서 발견.
  2. `BLK-005`(인용문) GFM 중첩(`>`/`>>`) 표현 재평가 미해결 — 이번 DELTA에서 발견.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert d0c9c2e`. 위험: 낮음 — 문서 파일만(리뷰 문서 신규 1개, inventory·current-status 각 수정), 프로덕션 코드·테스트 변경 없음.
