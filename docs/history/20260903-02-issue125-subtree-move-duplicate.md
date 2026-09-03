# Issue #125 — 하위 트리 인지 블록 이동·복제

## 목표

`moveBlockBefore`/`duplicateBlock`이 자식 딸린 블록을 `COMMAND_NOT_APPLICABLE`로 거절하던 것을 하위 트리 인지 구현으로 교체한다(2026-09-01 그릴링 D1~D9). cross-parent 이동·최상위 승격·표 이동 성공, duplicateBlock의 재귀 id 재발급(표 내부 id 포함)을 계약으로 편입한다.

## 확정 커밋

- `b5867e6` — core: 자식 딸린 블록의 이동·복제가 하위 트리를 인지하도록 확장
- `714cebf` — test(core): 단계-3 결함 탐지 수정과 포맷 정리
- `981c916` — docs: Issue #125 하위 트리 이동·복제 계약 영속화, R2 진행 상태 동기화

## 변경한 계약과 파일

- `core`: `moveBlockBefore(blockId, beforeBlockId)`가 cross-parent 이동과 `beforeBlockId===null`의 최상위 문서 끝 승격을 지원한다(R2 결정 — `null`은 항상 최상위 끝, 소스의 현재 부모 끝이 아니다). 목적지가 소스 자신의 하위 트리 안이면 mutation 전 `COMMAND_NOT_APPLICABLE`(자기 자손 가드), 이동 결과 최심부가 `MAX_NESTING_DEPTH`(64)를 넘어도 동일 코드로 거절한다(새 에러 코드 신설 없음, `indentBlock`과 같은 코드로 수렴). 표를 소스로 한 이동(같은 부모·cross-parent)은 신규 거절 가드 없이 성공한다.
- `core`: `duplicateBlock(blockId)`가 자식 딸린 블록의 하위 트리 전체를 재귀 복제하고 모든 `blockId`를 재발급한다. 하위 트리 안에 표가 있으면 그 column/row/cell id도 재귀 재발급한다(참조 무결성 — cell의 `columnId`가 재발급된 새 column id를 가리키도록 remap). 표 자신이 직접 duplicate 대상인 경우는 계속 거절한다(clone이 표 내부 id 중복을 낳는 문제는 미해결로 남는다).
- `packages/core/src/generic-block-commands.ts`: `isDescendantOfBlock`/`findBlockDepth`/`subtreeHeightOfBlock`(D2·D3 사전 판정)와 `cloneBlockSubtreeWithFreshIds`(D6·D7 재귀 clone, table 분기 포함) 신설. `moveBlockBefore`에 `removesWholeGroup` 판정(`deleteBlock`과 동일 패턴)을 추가해 cross-parent 이동이 유일한 자식을 옮길 때 빈 `blockGroup`을 남기지 않는다.
- `packages/core/src/document-id-factory.ts`: `createDocumentIdAllocator` 신설 — `createUniqueDocumentId`를 감싸 반복 호출 간 점유 집합을 갱신하는 클로저.
- 옛 "자식 있으면 거절" 테스트 3건을 새 GREEN 계약(성공·속성 보존·undo 1회)으로 교체: `editor-controller-blocks.test.ts`, `code-block-commands.test.ts`, `list-item-commands.test.ts`.
- 신규 `packages/core/test/editor-controller-subtree-commands.test.ts`(D1~D9 시나리오 10건).
- `e2e/nested-block.spec.ts` 전면 재작성 — cross-parent drag 성공, 하위 트리 동반 drag(UI-003 재검증) Chromium pointer 시나리오 2건.
- `docs/specs/2026-08-19-r2-basic-block-parity-design.md` §5.4 신설(계약 영속화).
- `docs/product/blocknote-free-feature-inventory.md`: `DOC-002`에서 Issue #125 거절 잔존 서술 제거, `UI-004`를 `NOT_STARTED` → `VERIFIED`로 정정(슬라이스 7 자체가 남긴 소급 반영 대상 — 아래 "남은 제한" 참고).
- `docs/product/current-status.md`: 슬라이스 7·7a 완료 서술 추가, "다음 작업"을 슬라이스 7b(#126)로 갱신.

## 실행한 검증과 결과

- 단계-2 구현(subagent): RED(9 tests failed) → GREEN(91/91) 확인, `pnpm --filter @cp949/geul-core typecheck` 통과, `pnpm exec playwright test e2e/nested-block.spec.ts --project=chromium` 2/2 통과. 메인 세션이 diff를 읽고 focused 검증 전체를 독립 재실행해 확인.
- 단계-3 결함 탐지(4렌즈, 계획서 비공개 dispatch): 확정 결함 1건(F1, MINOR — D3 경계 테스트 fixture가 63을 만들어 진짜 64 경계를 검증하지 못함). 메인 세션이 코드 추론으로 재확인 후 수정, `>`→`>=` mutation을 수동 적용해 수정 전 미탐지·수정 후 탐지를 직접 확인.
- 완료 조건 13개 중 12개 `PASS`(실측 대조), 1개(문서 갱신)는 계획서가 명시적으로 단계-4로 미룬 항목 — 이 세션 안에서 완료.
- 최종 `pnpm verify` 전량 1회: lint·format(2건 정리 후 재통과)·build·escompat·typecheck(4 project)·`pnpm test` 200 files/2391 tests·check:boundaries·check:licenses·`pnpm test:e2e --project=chromium` 130/130 전부 `PASS`.
- 재그룹화 경계 3개(`b5867e6`/`714cebf`/`981c916`) 각 tip에서 `pnpm --filter @cp949/geul-core typecheck` 개별 재실행, 전부 `PASS`(981c916은 `pnpm lint`도 추가 확인). 원본 tree diff(`pre-squash` 대비)는 빈 출력, 병합 직전 재대조도 빈 출력.

## 상태와 남은 제한

- Issue #125 완료 댓글: 이 이력 등록과 같은 실행에서 게시·종료 판단(qq-workflow 단계-4 예외 — 사용자 확인 없이 수행).
- 조건 9(D7 케이스, 하위 트리 안 표를 포함한 duplicateBlock의 undo)를 직접 assert하는 테스트는 없다. 단일 트랜잭션 구조상 D6과 같은 보장을 받는다고 판단했지만 실측하지 않았다 — `IMPL-REVIEW-01.md`의 "남은 위험"에 기록.
- `docs/product/blocknote-free-feature-inventory.md`의 `UI-004`(`NOT_STARTED`→`VERIFIED`)는 이 workflow의 계획 범위(#125)가 아니라 슬라이스 7 자체 이력(`docs/history/20260902-02-issue38-slice7-multiblock-select-move-delete.md` "남은 제한")이 명시한 후속 항목을 이번에 대신 처리한 것이다 — Issue #125와 직접 관련 없는 소급 수정임을 남긴다.
- Firefox/WebKit e2e는 미검증(계획 범위 밖, `pnpm verify`도 chromium 프로젝트만 포함).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 3개를 `dev`에서 역순으로 `git revert`한다.
