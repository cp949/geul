# Issue #38 슬라이스 7 — 다중 블록 선택·이동·삭제(`UI-004`)

## 목표

같은 부모의 연속 형제 블록 범위를 드래그로 선택하고, 선택 범위(및 `children`)를 드래그 재정렬 또는 상하 이동 버튼으로 이동하거나 플로팅 툴바로 삭제한다. 전부 undo 1회로 복원된다.

## 확정 커밋

- `6951e1b` — core: `blockSelection` 상태·`selectBlockRange`·`clearBlockSelection` 추가
- `891fc19` — core: `deleteSelectedBlocks`·`moveSelectedBlocksBefore` 명령 추가
- `20763c3` — react: `BlockSideMenu` 드래그 확장(선택 생성·범위 재드래그 이동) 추가
- `026b52c` — react: `BlockSelectionToolbar`(삭제·상하 이동·해제) 추가
- `e21114f` — e2e: 다중 블록 선택 Chromium pointer 시나리오 추가
- `3bb61d4` — react+core: 트랙-6 결함 탐지 수정과 포맷 정리

## 변경한 계약과 파일

- `core`: `blockSelection` 세션 상태(ProseMirror `Selection`과 독립, 문서 비저장) + 공개 명령 4개 — `selectBlockRange`/`deleteSelectedBlocks`/`moveSelectedBlocksBefore`(spec §5.1) + `clearBlockSelection`(spec 미기재, 사용자 승인 확장) + 조회 `getBlockSelection()`. `production-editor-session.ts`, `generic-block-commands.ts`, `editor-controller.ts`, `index.ts`.
- `react`: `block-side-menu.tsx`(기존 drag handle을 2단계 드래그로 확장 — own-rect 판정으로 재정렬/범위 선택/범위 이동 전환), 신규 `block-selection-toolbar.tsx`+`_block-selection-toolbar.scss`(하이라이트, 삭제·상하 이동·해제 플로팅 툴바), `slash-menu.tsx`(조립점 등록), `styles.scss`.
- `e2e`: 신규 `e2e/block-selection.spec.ts`(Chromium pointer 시나리오 8개).
- 저장 포맷(`model`/`io`) 변경 없음 — `blockSelection`은 세션 전용이라 `getDocument()` JSON에 나타나지 않는다.
- `docs/product/blocknote-free-feature-inventory.md`의 `UI-004`는 이 작업에서 갱신하지 않았다(`NOT_STARTED`로 남음, 남은 제한 참고).

## 실행한 검증과 결과

- 트랙-5(누락 탐지): 요구사항 추적표 9행 → 완료 체크리스트 31개 항목 전부 `PASS`, 발견 0건.
- 트랙-6(결함 탐지, Full 3렌즈): `BLOCKER 0 / MAJOR 0 / MINOR 1`(수정 완료 — `BlockSelectionToolbar` `pointerup` 재조회 리스너 등록 순서 경쟁) + 테스트 갭 1건 보강(결함 아님).
- 최종 `pnpm verify` 전량 1회: lint·format·build·check:escompat(117파일)·typecheck(4 project)·`pnpm test` 199 files/2379 tests·check:boundaries·check:licenses·`pnpm test:e2e --project=chromium` 129/129 전부 `PASS`.
- 재그룹화 경계: 위 확정 커밋 6개 각 tip에서 `pnpm typecheck` 개별 재실행, 전부 `PASS`. 원본 tree diff(`pre-squash` 대비)는 빈 출력.

## 상태와 남은 제한

- Issue #38 완료 댓글: `https://github.com/cp949/geul/issues/38#issuecomment-5513173175`. 후속 슬라이스(8~11)가 남아 Issue는 `OPEN` 유지 — 닫지 않음.
- `docs/product/blocknote-free-feature-inventory.md`의 `UI-004` 행이 `NOT_STARTED`로 남았다. 이 workflow의 계획 범위(`core`+`react`+e2e)에 inventory 갱신이 포함되지 않았다 — 별도 후속 커밋 필요.
- `pending-guides/01.md`(`G-EDT-001`이 "PM 문서를 바꾸지 않는 순수 세션 상태 명령"의 판별 기준을 명시하지 않는다는 관찰) — 승격 보류. 이번 슬라이스의 구현 선택을 막지 않았고 재발 1회뿐이라 가이드 갱신 없이 초안만 유지한다.
- 계획대로 다루지 않은 범위: 키보드 기반 다중 선택, `moveSelectedBlocksBefore`의 cross-parent·최상위 승격(슬라이스 7a `#125`로 귀속 확정), `TableBlock` 다중 선택 대상, Firefox/WebKit 전체 게이트.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 6개를 `dev`에서 역순으로 `git revert`한다.
