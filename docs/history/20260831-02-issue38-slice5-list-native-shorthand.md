# Issue #38 슬라이스 5 RD-006 — 목록 native shorthand

## 목표

production editor에서 exact `- `·`1. ` native 입력을 글머리·번호 목록으로 변환하고 ID·children·selection·stored marks·revision/event·undo 원자성을 보존한다.

## 확정 커밋

- `32a882bf8d8d2a06a601326f5801b253fc5fff1a` — 목록 native shorthand와 계약·상태
- `8021ffc8e1a1a50cadaa82a9dea5605a5509a3cc` — worktree lint 병렬 timeout 안정화

## 변경 계약과 파일

- `packages/core/src/list-input-rule-extension.ts`: whole-paragraph exact marker input rule, appended transaction 뒤 undo metadata bridge, 즉시 Backspace trailing 복원을 추가했다.
- `packages/core/src/production-editor-assembly.ts`: production assembly에 목록 input rule을 연결했다.
- `packages/core/test/list-input-rule-extension.test.ts`: trigger/negative, nested·children, selection·marks, dispatch·revision/event, undo·Backspace 36건을 검증한다.
- `e2e/list-item.spec.ts`: Chromium native keyboard·DOM marker/type·focus·둘째 space 3건을 추가했다.
- `docs/specs/2026-08-19-r2-basic-block-parity-design.md`, `docs/product/blocknote-free-feature-inventory.md`, `docs/product/current-status.md`: exact 입력 계약, `PARTIAL` 잔여 소유자와 RD-006 완료 상태를 동기화했다.
- `tests/worktree-lint.test.ts`: 전량 병렬 부하에서 10초를 넘는 worktree 내부 ESLint integration test 제한을 30초로 조정했다. 기능 assertion은 바꾸지 않았다.

## 검증

- RED/GREEN: exact guard와 undo metadata MAJOR 2건, Backspace trailing MAJOR 1건을 각각 실패 재현 뒤 수정했다. 최종 독립 리뷰는 `BLOCKER 0 / MAJOR 0 / MINOR 0`, PASS다.
- core focused: 1 file / 36 tests PASS.
- core 전체: 62 files / 915 tests PASS.
- worktree lint focused: 1 file / 2 tests PASS.
- 최종 `pnpm verify`: lint·format·build 5/5·Chrome 75 escompat 107 files·typecheck·unit 153 files / 1,969 tests·boundary 7 manifests / 5 declarations·license 6 manifests / 139 packages·Chromium E2E 115/115 전부 PASS.
- `git diff --check`: PASS.

## 남은 제한

- HTML/GFM 중첩 목록 round-trip은 RD-003이 소유하며 다음 작업으로 `READY`다.
- 임의 번호 marker와 IME/composition 전용 검증은 Issue #38 슬라이스 9 소유다.
- Firefox·WebKit 전량은 RD-006 기본 gate 범위 밖이다.
- `BLK-007`·`BLK-008`·`UI-011`은 `PARTIAL`을 유지한다.

## 이슈

- 완료 댓글: https://github.com/cp949/geul/issues/38#issuecomment-5470391419
- Issue #38: `OPEN` 유지. RD-003과 후속 R2 슬라이스가 남아 있다.

rollback: 두 확정 커밋을 역순으로 `git revert`해 가능하다. 저장 형식·공개 API·의존성·DB migration 변경은 없다.
