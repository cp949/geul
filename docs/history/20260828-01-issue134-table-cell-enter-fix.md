# 표 셀 안 Enter 셀·행 분할 결함 수정 (Issue #134)

- 레인: qq-workflow (계획 승인 → 구현 → 리뷰 1회 → 병합·등록)
- 확정 커밋: `febb9d8`(fix), `ede9f8e`(G-EDT-002 보강)
- 대상 이슈: [#134](https://github.com/cp949/geul/issues/134) — 완료 댓글 등록 후 종료

## 목표

셀 안 Enter를 소비하는 keymap이 없어 Tiptap 코어 Enter 체인이 폴스루해 셀·행을 분할하고(rowId·cellId 중복, 빈 ID) `readEditorDocument`가 `TypeError`를 던지던 R0/R1 사전 결함을, "표 안 Enter = 아래 행 같은 열 셀 이동 + 무조건 소비" 계약으로 수정한다.

## 바꾼 계약과 파일

- spec `docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md` §7.1·§7.2: 셀 안 `Enter`(아래 행 이동·마지막 행 no-op·범위 선택 포함 무조건 소비)와 `Shift+Enter`(소비) 계약 신설. 그릴링(2026-08-28) 사용자 결정 — BlockNote 현행(v0.51.4+) parity, BlockNote의 부분 처리+폴스루 크래시 이력(BlockNote #2792)이 "무조건 소비"의 근거.
- `packages/core/src/table-keyboard-extension.ts`: `goToTableCellBelow`/`consumeKeyInsideTable` 추가(Enter/Shift-Enter 바인딩). `resolveSelectionAwareState` 재사용(G-EDT-002) + 역방향 stale(재계산 표 밖·live 셀 안)에서 live state 폴백 소비 — 단계-3 리뷰 MAJOR 반영.
- `docs/guides/G-EDT-002`: 소비형 핸들러의 역방향 stale 소비 규칙·완료 기준 보강.
- 테스트: 마운트 keydown 회귀(재현 3 시나리오·범위 선택·표 밖 분할 보존), 핸들러 단위 계약(이동·dispatch 횟수·stale 정·역방향), 병합 표 fixture(`docWithMergedTable`) 이동 회귀. `cellJson` span 옵션, `dispatchKeydown` shiftKey 파라미터 확장.

## 검증

- 이 세션 실행: core 31 files/524 passed, core typecheck(복합 스크립트), lint, `git diff --check`, `pnpm verify` — e2e `formatting-toolbar.spec.ts:67` 1건 제외 전량 통과. 그 1건은 #131로 등록된 기존 baseline 실패(이 변경 이전 dev `ce5f0be`에서 동일 재현 확인, 이 변경 무관).
- RED: 마운트 keydown 3건(빈 셀 `TypeError: Id must be non-empty...`, 셀 중간 `TypeError: Duplicate id`, 마지막 행 셀), 역방향 stale 단위 2건. mutation 3건(바인딩 제거·resync 우회·마지막 행 false)으로 테스트 유효성 확인.

## 남은 제한

- `readEditorDocument`의 구조화 `Result` → throw 승격(invalid 문서 시 영구 desync)은 무변경 — 알려진 도달 경로는 이 수정으로 사라져 기록만 남김.
- keydown 외 Enter 유입 경로(beforeinput·DOM 변이 parse)는 가드 없음 — 사전 상태·도달성 미확정, 실경로 관측 시 별도 이슈.
- 셀 안 줄바꿈(hardBreak) 미도입, Notion식 마지막 행 새 행 생성 미채택 — 필요 시 별도 이슈.

## 등록한 이슈

- 신규 등록 없음. #134에 완료 댓글(실측 확정·본문 정정 포함) 등록 후 종료.
