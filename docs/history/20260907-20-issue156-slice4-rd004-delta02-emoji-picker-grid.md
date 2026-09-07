# Issue #156 슬라이스4 RD-004 DELTA-02 — EmojiPicker grid·키보드·삽입·portalTarget (RD-004 완료, roadmap 전체 완료)

## 목표

RD-004(emoji picker, `EXT-006`/`UI-012`/`UI-013`)의 마지막 DELTA. DELTA-01의 데이터셋·트리거 감지 위에 실제 `EmojiPicker` 컴포넌트를 완성한다 — 8열 grid 렌더, 방향키/Enter/Escape 네비게이션, 선택 시 caret 위치 삽입, `portalTarget`. 이 DELTA 완료로 RD-004가 DONE, roadmap 전체(슬라이스4, Issue #156)가 완료된다.

## 확정 커밋

- `19acc4a` — feat(react): EmojiPicker grid 렌더·키보드 네비게이션·선택 삽입·portalTarget 지원(RD-004 DELTA-02, EXT-006/UI-012/UI-013)
- `b5ca9ab` — docs(product): Issue #156 슬라이스4 완료 반영 - EXT-006/UI-012/UI-013 VERIFIED, EXT-007 PARTIAL

## 변경한 계약과 파일

- `packages/react/src/emoji-picker.tsx`: `EmojiPicker` 컴포넌트 + `EmojiPickerProps`(`portalTarget?: HTMLElement | null`) 추가. `SlashMenu`의 캐럿-폴링(selectionchange/input/scroll/resize 리스너, Escape 직후 재오픈 레이스 방지용 `dismissedQueryRef`, CodeBlock guard)·클램프 위치(`useClampedMenuPosition`)·바깥클릭/Escape dismiss(`useDismissOnOutsideOrEscape`)·초점 복구(`useFocusEditor`) 골격을 재사용하되, `SlashMenu`가 내부 자동 마운트하는 `BlockSideMenu`/`TableHandles` 같은 것이 없는 독립 컴포넌트다.
  - 선택 삽입: `commands.setText(blockId, item.char)` + `setTextCursorPosition(blockId, "end")`(controller 최상위 API, `commands` 아래가 아니다). DELTA-01이 확정한 대로 트리거가 블록 텍스트 전체와 일치할 때만 메뉴가 열리므로(`parseEmojiQuery`) "블록 재작성"이 곧 "트리거 치환"이다.
  - 키보드 네비게이션: 8열 grid라 `SlashMenu`의 1차원 modulo wrap 대신 `ArrowRight`/`ArrowLeft`(±1)·`ArrowUp`/`ArrowDown`(±8)을 경계에서 clamp한다(wrap 없음) — 2차원 grid에서 modulo wrap은 예측 불가능한 위치로 튄다.
- `packages/react/src/_emoji-picker.scss`(신규): `.geul-emoji-picker`(컨테이너, `SlashMenu`와 동일 계열 `position: fixed` 규칙)·`.geul-emoji-picker__grid`(`grid-template-columns: repeat(8, 1fr)`)·`.geul-emoji-picker__item`(정사각형 버튼). grid 열 수는 JS 상수(`EMOJI_GRID_COLUMNS`)와 CSS 리터럴에 각각 있어 상호 참조 주석으로 동기화를 남겼다.
- `packages/react/src/styles.scss` — `@use "emoji-picker"` 추가.
- `packages/react/src/index.ts` — `EmojiPicker`/`EmojiPickerProps` export.
- `packages/react/test/emoji-picker-popup.test.tsx`(신규): 9개 테스트 — 열기/필터링, `:` 단독 전체 목록, 빈 상태 문구, 비트리거 무시, 클릭 선택, Enter 선택, Escape 취소, 방향키 clamp, `portalTarget`.
- `docs/history/20260907-19-...md` — DELTA-01 이력 문서의 `setTextCursorPosition` 소속 오탈자 정정(같은 커밋에 번들).
- `docs/product/blocknote-free-feature-inventory.md` — `EXT-006`/`UI-012`/`UI-013`을 `VERIFIED`로, `EXT-007`을 `PARTIAL`(side/table 제외 사유 명기, 후속 이슈 승격 시 `VERIFIED`)로 갱신.

## 구현 중 발견·정정

계획 초안이 선택 삽입 코드를 `editor.commands.setTextCursorPosition(current.blockId, "end")`로 적었으나, `setTextCursorPosition`은 `editor-controller-types.ts:126-129`가 보여주듯 `commands` 객체가 아니라 `EditorController` 최상위 메서드다. RED 단계에서 클릭/Enter/portalTarget 관련 8개 테스트가 `TypeError: editor.commands.setTextCursorPosition is not a function`으로 즉시 드러났고, `editor.setTextCursorPosition(...)`로 고쳐 GREEN을 만들었다. 계획 문서(`_works/roadmap/result/RD-004-DELTA-01.md`, `RD-004-DELTA-02.md`)와 이전 이력 문서의 같은 오기도 함께 정정했다.

## 검증

- RED: `emoji-picker-popup.test.tsx` 9개 전부, `EmojiPicker`가 `index.ts`에 없어 "Element type is invalid" 실패 확인. 최초 구현 후에도 위 API 오배치로 8개가 `TypeError`로 실패 — 수정 후 9개 전부 GREEN.
- `pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/emoji-picker-popup.test.tsx test/emoji-picker.test.ts` — 18 passed.
- `pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/style-build.test.ts` — 12 passed(신규 SCSS가 기존 빌드 계약을 안 깸).
- `pnpm --filter @cp949/geul-react test`(RD 완료 조건) — 40 files / 547 tests passed.
- `pnpm --filter @cp949/geul-react typecheck` — clean.
- `pnpm exec eslint packages/react/src/emoji-picker.tsx packages/react/src/index.ts packages/react/test/emoji-picker-popup.test.tsx` — 결함 0건.
- `pnpm test:e2e`(`--project=chromium`, RD 완료 조건) — 183 passed, 1.2분, 플레이크 없음(핸드오프가 남긴 `media-toolbar.spec.ts`의 `insertFilledImage` 간헐 실패는 이번 실행에서 재현 안 됨).
- 재그룹화: 단일 커밋(`19acc4a`), `git merge --ff-only`로 바로 이전.

## RD-004 완료 조건 재대조 (마지막 DELTA)

- `:`+쿼리 입력 시 grid가 뜨고 keyword로 필터링되며 선택 시 caret 위치에 이모지가 삽입됨 — PASS(실제 `EditorController`/ProseMirror로 검증, mock 없음).
- `portalTarget` 지정 시 지정 DOM 노드 하위에 렌더됨 — PASS.
- `pnpm --filter @cp949/geul-react test`, `pnpm test:e2e --project=chromium` 통과 — PASS.

3개 전부 충족 — RD-004 `DONE` 전환(`_works/roadmap/RD-004.md`).

## roadmap 전체 완료 (Issue #156 슬라이스4)

RD-001(최상위 오버레이 4종 `component` override)·RD-002(`SlashMenu` 커스텀 아이템)·RD-003(`portalTarget` 5종)·RD-004(emoji picker) 전부 DONE. 전체 완료 조건(오버레이 override 동작, `SlashMenuCustomItem` 추가, `portalTarget` 5종 additive, emoji picker 삽입·portal, 패키지 test·e2e 통과, 인벤토리 갱신) 전부 충족(`_works/roadmap/roadmap.md` "전체 완료 조건").

## roadmap 진행 상태

RD-001·RD-002·RD-003·RD-004 전부 `DONE`. roadmap 전체(슬라이스4) 완료 — 남은 절차: Issue #156 완료 댓글 게시, 이슈 본문 슬라이스4 체크박스 갱신, `_works/roadmap/` archive.

## 등록한 이슈

없음.

## 게시

Issue #156에 슬라이스4 통합 완료 댓글 게시 예정(슬라이스1~3 전례와 동일 패턴 — 개별 RD/DELTA는 게시하지 않고 슬라이스 전체로 한 번 게시).

## 남은 위험

- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.
- `BlockSideMenu`/`TableHandles`(side/table) override는 이번 slice 범위 밖으로 남았다(`EXT-007` `PARTIAL`) — 후속 이슈 대상.

## rollback

`git revert 19acc4a`(DELTA-02 코드)과 `git revert b5ca9ab`(인벤토리 갱신)을 이 순서로 되돌리면 된다. 위험: 낮음 — 신규 컴포넌트·신규 export만 추가했고 기존 5개 컴포넌트·`SlashMenu` 계약을 건드리지 않았다. 인벤토리 갱신은 문서 전용이라 되돌려도 코드 동작에 영향이 없다.
