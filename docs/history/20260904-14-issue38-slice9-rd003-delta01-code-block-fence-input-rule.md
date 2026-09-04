# Issue #38 슬라이스 9 RD-003 DELTA-01 — 코드 블록 펜스 입력 규칙

## 목표

roadmap-workflow RD-003의 첫 DELTA. 빈 paragraph에서 ` ```{lang} `(공백으로 종료, `lang`은 선택)을 입력하면 codeBlock으로 변환되고 `language` prop이 설정된다.

## 확정 커밋

- `589b308` — 코드 블록 펜스 입력 규칙 추가 (Issue #38 슬라이스 9, RD-003 DELTA-01)

## 변경한 계약과 파일

- `packages/core/src/block-type-input-rule-extension.ts` — `createBlockTypeInputRule`에 "대상 타입이 `nestableBlockContent`가 아니면(=leafBlockContent) 컨테이너에 이미 `blockGroup` 자식이 있을 때 발동하지 않는다" 구조 가드를 타입명 하드코딩 없이 추가(`type.isInGroup` 판정) — codeBlock은 divider(비포장 atom)와 달리 blockContainer 안 content 노드라 구조적 치환 없이 `setBlockType` 경로를 그대로 재사용할 수 있다는 readiness probe 가설이 그대로 확인됨. `addInputRules()`에 codeBlock 규칙 1개(`/^```(\S*)\s$/`, 빈 캡처는 `"text"`, 아니면 `canonicalizeCodeBlockLanguage`) 추가.
- `packages/core/test/editor-controller-support.ts` — `codeBlockBlock` test fixture 신규.
- `packages/core/test/block-type-input-rule-extension.test.ts` — describe "코드 블록 펜스 native shorthand exact 변환" 신규(정확 일치 3종 + 비대상 3건 + 자식 블록 구조 가드 1건) + Backspace 복원 describe에 codeBlock 1건 추가.
- `e2e/code-block.spec.ts` — 대표 시나리오 1개 추가(ADR-0007, RD-002와 동일 `InputRule` 자격).

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/block-type-input-rule-extension.test.ts` → 34 passed(신규 8건 포함, 회귀 없음).
- `pnpm --filter @cp949/geul-core test`(전체) → 90 files/1207 passed.
- typecheck 통과.
- `pnpm test:e2e --project=chromium e2e/code-block.spec.ts` → 10 passed(전체 chromium 스위트 141 passed, 회귀 없음 — 기존 140+신규 1).

## 등록한 이슈

- 완료 댓글: 슬라이스 9 전체 완료 시점까지 보류(RD-004 DELTA-02 이력 참고).

## 남은 제한

- Enter/Delete 확장(DELTA-02)이 남아 RD-003은 `ACTIVE` 유지.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 589b308`. 위험: 낮음 — 기존 확장에 가드 1개 + 규칙 1개 추가한 국소 변경, 기존 규칙(heading/quote/checkListItem) 동작 불변 확인(전체 회귀 스위트).
