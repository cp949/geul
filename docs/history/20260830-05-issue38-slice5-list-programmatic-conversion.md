# Issue #38 슬라이스 5 RD-004 — 목록 programmatic 변환 command

## 목표

core 소비자가 공개 `setBlockType` command로 글머리·번호 목록을 생성하고 기존 text block과 양방향 변환한다.

## 확정 커밋

- `5a05e4c` — 목록 command test support 정리
- `e8f324d` — 목록 종류 변환 public command와 회귀 테스트

## 변경한 계약과 파일

- `packages/core/src/editor-controller.ts`, `packages/core/src/index.ts`: public `SetBlockTypeDescriptor`에 bullet과 `startNumber?: number | null` numbered 입력을 추가하고 package root에서 export한다.
- `packages/core/src/generic-block-commands.ts`: paragraph·heading·quote·bullet·numbered 변환 행렬과 승인된 `startNumber` 의미를 구현한다. 목록↔CodeBlock은 `clearContent`와 무관하게 mutation 전에 거절한다.
- `packages/core/test/list-item-block-type-commands.test.ts`, `packages/core/test/list-item-block-type-support.ts`: ID·content·marks·children·selection, revision/event, single dispatch와 undo 원자성을 검증한다.
- `packages/react/src/block-type-options.ts`, `fixtures/consumer/src/index.ts`: React 기존 4종 option compatibility와 built public consumer를 검증한다.
- `docs/specs/2026-08-19-r2-basic-block-parity-design.md`: `startNumber` command 입력 의미와 거절 계약을 기록한다.
- `docs/product/blocknote-free-feature-inventory.md`, `docs/product/current-status.md`: RD-004 완료와 RD-003·RD-005 잔여 귀속을 동기화한다. `BLK-007`·`BLK-008`은 `PARTIAL`을 유지한다.

## 검증

- 트랙-5: 최종 체크리스트 R01~R07 `PASS`.
- 트랙-6: `PASS` — `BLOCKER 0 / MAJOR 0 / MINOR 0`.
- 트랙-6 최종 `pnpm verify`: unit 151 files / 1,895 tests, package boundary, license, Chromium E2E 106/106 포함 `PASS`.
- 재그룹화 경계 1: 1 file / 7 tests, core 복합 typecheck, helper scan, `git diff --check` `PASS`.
- 재그룹화 경계 2: 1 file / 42 tests, core·React 복합 typecheck, build, consumer typecheck, package boundary, `git diff --check` `PASS`.
- 재그룹화 전후 트리 diff: 빈 출력.

## 상태와 남은 위험

- RD-004는 `DONE`. RD-003·RD-005는 모두 `READY`다.
- 다음 작업은 RD-005다. output descriptor, `- `·`1. ` input rule, Slash·Turn into·formatting toolbar와 Chromium 사용자 진입점을 연결한다.
- RD-003에 HTML/GFM import·warning·중첩 round-trip이 남았다.
- 공개 command 입력 변경은 core·React compile seam과 built consumer를 횡단한다. Full review와 최종 gate를 통과했고 열린 `BLOCKER`·`MAJOR`·`MINOR`는 없다.
- rollback: `dev`에서 `5a05e4c`, `e8f324d`와 이 완료 문서 커밋을 역순으로 `git revert`한다.

## GitHub

- Issue #38 완료 댓글: `#issuecomment-5467653984`
- Issue #38은 RD-003·RD-005와 후속 R2 슬라이스가 남아 `OPEN` 유지.
- 신규 이슈·가이드·pitfall 등록 없음.
