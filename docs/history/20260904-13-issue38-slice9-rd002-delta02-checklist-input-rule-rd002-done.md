# Issue #38 슬라이스 9 RD-002 DELTA-02 — checkListItem 입력 규칙, RD-002 DONE

## 목표

roadmap-workflow RD-002의 마지막 DELTA. 빈 paragraph 선두에서 `[] `/`[ ] `는 미체크, `[x] `/`[X] `는 체크된 checkListItem으로 즉시 변환된다. 이 DELTA로 RD-002 완료 조건 5개가 모두 충족돼 RD-002가 `DONE`으로 전환된다.

## 확정 커밋

- `e6ee9b9` — checkListItem 입력 규칙(미체크/체크) 추가 (Issue #38 슬라이스 9, RD-002 DELTA-02)

## 변경한 계약과 파일

- `packages/core/src/block-type-input-rule-extension.ts`의 `addInputRules()`에 checkListItem 규칙 2개 추가(`^\[\s*\]\s$`→checked:false, `^\[[Xx]\]\s$`→checked:true) — DELTA-01의 `createBlockTypeInputRule`을 그대로 재사용, 새 handler·구조적 예외 없음(heading/quote와 같은 `nestableBlockContent`).
- `packages/core/test/editor-controller-support.ts` — `checkListItemBlock` test helper를 `block-type-keyboard-extension.test.ts`에서 공유 위치로 추출(두 번째 소비 파일).

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/block-type-input-rule-extension.test.ts` → 26 passed(DELTA-01 18건 포함, 회귀 없음).
- `pnpm --filter @cp949/geul-core test`(전체) → 90 files/1199 passed.
- typecheck·prettier 통과.
- Playwright는 RD-002 "최소 1개" 조건을 DELTA-01이 이미 충족해 이 DELTA는 추가 실행하지 않았다(계획대로).
- DELTA-01에서 undo-bridge를 확장 비의존적으로 이미 고친 덕에 RED 없이 첫 구현에서 바로 GREEN — Backspace 즉시 복원도 재검증만으로 통과.

## 등록한 이슈

- 완료 댓글: 슬라이스 9 전체 완료 시점까지 보류(RD-004 DELTA-02 이력 참고).

## 남은 제한

- RD-002 완료 조건 5개 전부 충족 — 메인 세션 재대조 통과, `DONE`.
- RD-003·RD-004는 RD-002와 독립이라 readiness 변화 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert e6ee9b9`. 위험: 낮음 — 기존 확장에 규칙 2개 추가한 국소 변경.
