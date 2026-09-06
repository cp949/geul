# block-side-menu.tsx 책임별 파일 분리

- 레인: qq-workflow (사용자 지시 — "가장 긴 소스코드 3개" 검토 후 분리 승인)
- 대상 이슈: 없음
- 작업 폴더: `_works/20260907-02-block-side-menu-split/`(gitignore, 저장소에는 남지 않음)
- 확정 커밋: `3b58f97`(dev, `refactor(react): block-side-menu.tsx를 책임별 파일 5개로 분리`)

## 목표

`packages/react/src/block-side-menu.tsx`(919줄)를 동작 변경 없이 책임별 파일로 분리해 인지 부하를 줄인다. 같은 패키지의 `table-handles.tsx`가 이미 쓰는 구조(`table-handle-menu.tsx` + `table-handle-geometry.ts`)를 그대로 따랐다.

## 바꾼 계약과 파일

신규 파일 4개 + 축소된 진입점:

- `block-side-menu-types.ts` — `InsertionGuide`/`DragMode`/`DragState`/`BlockMenuState`/`BlockSideMenuProps`/`StoredBlock`
- `block-side-menu-geometry.ts` — `computeDragGuide`/`findBlockInTreeForDrag`/`isBlockIdWithinBlockSelection`/`findOwnRectBlockId`/`computeRangeMoveDragGuide`
- `block-side-menu-block-type.ts` — `findBlockTypeDescriptor`
- `block-side-menu-menu.tsx` — 신규 `BlockSideMenuMenu` 서브컴포넌트(`{ blockId, left, top, onClose }` props만 받음, `table-handle-menu.tsx`와 동일 설계). Turn into/Indent/Outdent/Duplicate/Delete/색상·정렬 핸들러와 JSX 전체를 담는다.
- `block-side-menu.tsx` — 919줄 → 449줄. `BlockSideMenu`(유일한 export, 불변)만 남고, 거터(hover 버튼) 상태·드래그 제스처·dismiss 로직(`BLOCK_MENU_DISMISS_ALLOW_SELECTORS` 등, `table-handles.tsx`와 같은 이유로 진입점에 유지)을 유지한 채 메뉴 렌더를 `<BlockSideMenuMenu .../>` 한 줄로 위임한다.

`packages/react/src/index.ts`는 `BlockSideMenu`를 재노출하지 않는 현재 상태 그대로다. `useClampedMenuPosition` 호출이 부모→자식으로 이동했으나, 메뉴가 열릴 때마다 항상 새로 mount되고(핸들 클릭 시 `setBlockMenuState(null)` 경유) 열린 상태의 위치 갱신은 props로만 흘러 이전과 동일한 `useLayoutEffect` deps로 재계산돼 렌더 결과가 바뀌지 않는다.

## 실행한 검증과 결과

- `pnpm --filter @cp949/geul-react test` — 36 files / 505 tests pass
- `pnpm --filter @cp949/geul-react typecheck` — pass(복합 3단 스크립트, PIT-0038 준수)
- `pnpm --filter @cp949/geul-react build` — pass
- 단계-3 결함 탐지(읽기 전용 subagent) — 발견 0건. 로직 변경(`-U0` 정밀 diff로 4가지 변경 유형만 확인), `useClampedMenuPosition` 이동 안전성, props 연결, dismiss 로직 중복 여부, 순환 import, 심볼 중복·누락, ADR-0002 준수를 전수 확인.
- 병합 직전 첫 `pnpm verify` 실행에서 `format:check`가 신규 파일 `block-side-menu-menu.tsx` 1건에서 실패(포맷 위반, `import-html-media.ts` 선례와 같은 패턴) — `pnpm exec prettier --write`로 수정(줄바꿈만, 로직 무변경)하고 같은 커밋에 `amend`. 재실행한 `pnpm verify` 전량(lint, format, 전 패키지 build/typecheck, unit test, package boundary, license, E2E chromium 183건— `block-handle.spec.ts`/`block-selection.spec.ts` 포함) — 전부 pass.
- **주의**: 첫 `pnpm verify` 실행을 `pnpm verify | tee <log>` 형태로 백그라운드 실행했을 때 세션 알림이 "exit code 0"으로 보고했으나, 이는 파이프 마지막 명령(`tee`)의 종료 코드였고 실제 `pnpm verify`는 `format:check`에서 실패(exit 1)한 상태였다 — 로그 내용을 직접 확인해 발견했다. 이후 `set -o pipefail`을 적용해 재실행함으로써 실제 종료 코드를 신뢰할 수 있게 했다.

## 남은 제한

- 등록한 이슈 없음 — 순수 구조 리팩터이고 제품 동작·게이트 구멍·거짓 통과를 드러내지 않아 issue-tracker.md "등록 기준"을 통과하는 발견이 없었다.
- `pnpm --filter @cp949/geul-react lint`가 패키지에 스크립트 자체가 없어 실행 불가(`ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`) — 이번 변경으로 새로 생긴 문제가 아니라 기존 패키지 상태이며, 저장소 루트 `pnpm lint`(전체 `eslint .`)는 정상 실행되고 통과했다.
