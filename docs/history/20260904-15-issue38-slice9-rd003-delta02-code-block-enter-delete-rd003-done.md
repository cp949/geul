# Issue #38 슬라이스 9 RD-003 DELTA-02 — CodeBlock double Enter 종료·빈 Delete 삭제, RD-003 DONE

## 목표

roadmap-workflow RD-003의 마지막 DELTA. codeBlock 안에서 이미 빈 줄(직전 Enter가 만든)에 캐럿이 있을 때 Enter를 한 번 더 누르면 그 트레일링 개행을 지우고 다음 블록으로 캐럿을 옮긴다. 빈 codeBlock에서 Delete를 누르면 그 블록 전체를 삭제한다. spec §5가 "슬라이스 9 재평가" 대상으로 남긴 두 항목이며, spec의 원래 추측(triple Enter exit·ArrowUp/Down exit·Backspace→paragraph)이 아니라 roadmap.md가 실제 BlockNote 소스로 재확인한 동작(double Enter·Delete)만 구현한다. 이 DELTA로 RD-003 완료 조건 4개가 모두 충족돼 RD-003이 `DONE`으로 전환된다.

## 확정 커밋

- `7733301` — CodeBlock double Enter 종료·빈 CodeBlock Delete 삭제 추가 (Issue #38 슬라이스 9, RD-003 DELTA-02)

## 변경한 계약과 파일

- `packages/core/src/code-block-exit-extension.ts`(신규) — `CodeBlockExitExtension`(priority 1_100, `BlockSplitExtension`·`BlockJoinExtension`의 101보다 먼저 실행). `exitCodeBlockOnDoubleEnter`·`deleteEmptyCodeBlock` 둘 다 G-EDT-002(클릭 직후 stale selection) 패턴.
- `packages/core/src/production-editor-assembly.ts` — 새 확장 등록.
- `packages/core/test/code-block-exit-extension.test.ts`(신규) — core 유닛 테스트 9건.

구현 중 readiness probe 가정 하나가 틀렸음을 발견해 정정했다: "codeBlock 안 정상 개행 삽입은 브라우저 native 위임"이 아니라 Tiptap 코어 내장 `Keymap` 확장의 `newlineInCode` 폴백이었다(실제 커맨드 실행, jsdom 완전 재현 — ADR-0007 결론에는 영향 없음, 오히려 근거 강화). 계획에 없던 발견도 있었다 — codeBlock은 `TrailingBlockExtension.endsWithChildlessParagraph`를 절대 만족 못 해 문서 최상위 마지막 블록이면 항상 trailing paragraph가 자동으로 붙는다 — 이 불변식 때문에 최초 설계의 "다음 형제 없으면 새로 만든다"(Enter)·"문서 유일 블록이면 거절"(Delete) 두 분기가 도달 불가능해 제거하고, 대신 실제 도달 가능한 경계(들여쓴 codeBlock의 blockGroup 안 마지막 자식, blockContainer로 안 감싸인 다음 형제)를 테스트로 고정했다.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/code-block-exit-extension.test.ts` → 9 passed.
- `pnpm --filter @cp949/geul-core test`(전체) → 91 files/1216 passed(회귀 없음).
- typecheck 통과.
- `pnpm test:e2e --project=chromium`(전체) → 141 passed(회귀 없음 — 이 DELTA는 ADR-0007 기준 jsdom-only라 신규 e2e 없음, 계획대로).
- 각 가드 분기는 무력화 뮤테이션으로 실측 실패를 확인한 뒤 원복했다(메인 세션 직접 검증, subagent 없음).

## 등록한 이슈

- 완료 댓글: 슬라이스 9 전체 완료 시점까지 보류(RD-004 DELTA-02 이력 참고).

## 남은 제한

- RD-003 완료 조건 4개 전부 충족 — 메인 세션 재대조 통과, `DONE`.
- RD-004는 RD-003과 독립이라 readiness 변화 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 7733301`. 위험: 낮음 — 신규 파일 1개 추가, 기존 Enter/Delete 경로는 이 확장이 자기 조건에서 벗어나면 그대로 물러나 회귀 없음(전체 회귀 스위트로 확인).
