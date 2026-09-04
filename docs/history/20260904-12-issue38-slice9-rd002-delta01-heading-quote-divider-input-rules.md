# Issue #38 슬라이스 9 RD-002 DELTA-01 — 제목/인용문/구분선 입력 규칙

## 목표

roadmap-workflow RD-002의 첫 DELTA. 빈 paragraph 선두에서 `# `~`###### `, `> `, `---`를 입력하면 캐럿이 속한 블록이 각각 heading(1-6)·quote·divider로 즉시 변환된다.

## 확정 커밋

- `55a0e39` — 신규 블록 입력 규칙(제목/인용문/구분선) 추가 (Issue #38 슬라이스 9, RD-002 DELTA-01)

## 변경한 계약과 파일

- `packages/core/src/block-type-input-rule-extension.ts`(신규) — `BlockTypeInputRuleExtension`. heading/quote는 `list-input-rule-extension.ts`의 `createListInputRule`을 일반화한 `createBlockTypeInputRule`(정규식 하나로 여러 레벨 처리, heading 6종을 `^(#{1,6})\s$` 하나로 커버)로, divider는 content 없는 비포장 atom이라 `setBlockType` 불가라서 전용 구조적 치환 handler(`createDividerInputRule`, 기존 blockId 보존)로 구현했다.
- `packages/core/src/list-input-rule-extension.ts` — **readiness probe 가정이 구현 중 RED로 반증돼 수정**: "ListInputRuleExtension의 Backspace·undo-bridge가 다른 확장의 규칙에도 전역 적용된다"는 가정이 틀렸다 — Tiptap core가 `addInputRules` 확장마다 별도 plugin 인스턴스를 만드는데 기존 헬퍼가 "플래그가 있는 첫 plugin"만 찾아 항상 자기 자신으로 고정, divider 변환 직후 Backspace가 `BlockJoinExtension`(priority 101)에 가로채여 복원되지 않았다. Backspace 판정(활성 상태인 아무 plugin이나 탐색)과 undo-bridge(발동한 plugin 참조를 payload에 보존)를 확장 비의존적으로 수정.
- `packages/core/src/production-editor-assembly.ts` — 새 확장 등록.
- `packages/core/test/block-type-input-rule-extension.test.ts`(신규), `packages/core/test/block-test-support.ts`(`dispatchTextInput`/`typeNativeText` 공유 추출), `packages/core/test/list-input-rule-extension.test.ts`(import 교체), `packages/core/test/editor-controller-support.ts`(`headingBlock` 공유 추출, `quoteBlock` 빈 텍스트 정규화).
- `e2e/heading-quote-divider.spec.ts` — 대표 시나리오 1개 추가.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/block-type-input-rule-extension.test.ts test/list-input-rule-extension.test.ts test/block-type-keyboard-extension.test.ts` → 82 passed.
- `pnpm --filter @cp949/geul-core test`(전체) → 90 files/1191 passed(회귀 없음).
- `pnpm --filter @cp949/geul-core typecheck` — 통과.
- `pnpm test:e2e --project=chromium e2e/heading-quote-divider.spec.ts` → 3 passed(전체 chromium 스위트 140 passed, 회귀 없음).
- ADR-0007 기준 Playwright 자격 있음(슬라이스 5 RD-006의 `InputRule` 이중 검증 전례 — jsdom `handleTextInput` 직접 호출과 실제 브라우저 `page.keyboard.type` 경로는 서로 다른 것을 증명).

## 등록한 이슈

- 완료 댓글: 슬라이스 9 전체 완료 시점까지 보류(RD-004 DELTA-02 이력 참고).

## 남은 제한

- checkListItem 입력 규칙(DELTA-02)이 남아 RD-002는 `ACTIVE` 유지.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 55a0e39`. 위험: 낮음 — 신규 파일 1개 + 기존 `list-input-rule-extension.ts` 확장 비의존화(다른 확장 동작 변경 없음, 전체 회귀 스위트로 확인).
