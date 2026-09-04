# Issue #38 슬라이스 9 RD-004 DELTA-01 — 캐럿 단일 블록 위/아래 이동 단축키

## 목표

roadmap-workflow RD-004의 첫 DELTA. `Shift-Mod-ArrowUp`/`Shift-Mod-ArrowDown`이 캐럿이 속한 블록을 같은 형제 배열(최상위 또는 같은 blockGroup) 안에서 정확히 한 칸 위/아래로 옮긴다. 경계(맨 위/맨 아래)에서는 no-op이다.

## 확정 커밋

- `8e31d34` — 블록 이동 키보드 단축키(위/아래) 추가 (Issue #38 슬라이스 9, RD-004 DELTA-01)

## 변경한 계약과 파일

- `packages/core/src/block-move-commands.ts`(신규) — `moveBlockAdjacent(editor, blockId, direction)`. 기존 `moveBlockBefore`(session bound, cross-parent 이동용 깊이·자손 가드 보유)를 재사용하지 않고 순수 PM 위치 계산만으로 인접 형제를 `tr.replaceWith` 한 step에 자리 교환한다 — 같은 부모 안 이동은 부모·깊이가 항상 그대로라 그 가드들이 구조적으로 불필요하다는 readiness probe 판단을 그대로 구현.
- `packages/core/src/block-move-keyboard-extension.ts`(신규) — `BlockMoveKeyboardExtension`, `block-type-keyboard-extension.ts`의 `setBlockTypeShortcut`과 같은 골격.
- `packages/core/src/production-editor-assembly.ts` — 새 확장 등록.
- `packages/core/test/block-move-commands.test.ts`(신규) — core 유닛 테스트 7건.
- `packages/core/test/block-test-support.ts` — `dispatchModShiftKeydown` 공유 추출(`block-type-keyboard-extension.test.ts` 로컬 사본이 두 번째 소비 파일 등장 시점에 승격).
- `packages/core/test/block-type-keyboard-extension.test.ts` — 위 승격에 따른 로컬 정의 제거·import 교체(동작 변경 없음).

구현 중 캐럿 위치 보존에 `tr.mapping.map`을 쓸 수 없음을 RED로 발견했다 — `replaceWith`가 두 블록을 아우르는 삭제 범위 **안**의 캐럿은 매핑이 경계로 스냅한다. `sourceStart` 기준 상대 오프셋을 새 위치에 직접 더하는 산술로 교체했다. 셀프 리뷰에서 `moveBlockShortcut`이 `setBlockTypeShortcut`의 stale `CellSelection` 재동기화 옵션을 빠뜨린 것을 발견해 추가했다(전용 회귀 테스트는 없음).

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/block-move-commands.test.ts` → 7 passed.
- `pnpm --filter @cp949/geul-core test`(전체) → 92 files/1223 passed(회귀 없음, `block-type-keyboard-extension.test.ts` 33건 포함).
- typecheck 통과.
- ADR-0007 기준 Playwright 미자격(RD-001과 동일 판단, 단일 keydown).

## 등록한 이슈

- 완료 댓글: 슬라이스 9 전체 완료 시점까지 보류(RD-004 DELTA-02 이력 참고).

## 남은 제한

- 활성 블록 선택 범위 이동(DELTA-02)이 남아 RD-004는 `ACTIVE` 유지.
- `moveBlockShortcut`의 stale `CellSelection` 역방향 재동기화 경로는 전용 회귀 테스트가 없다(낮은 위험 — 기존 검증된 유틸 재사용).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 8e31d34`. 위험: 낮음 — 신규 파일 2개 추가, 기존 shortcut(`Mod-Alt-N`류)은 새 확장이 다른 키(`Shift-Mod-ArrowUp/Down`)만 바인딩해 영향 없음(전체 회귀 스위트로 확인).
