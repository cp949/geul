# Issue #156 슬라이스4 RD-002 DELTA-01 — `SlashMenu` 커스텀 아이템 (RD-002 완료)

## 목표

RD-002(`SlashMenu` 커스텀 아이템, `EXT-006`)의 유일한 DELTA. 소비자가 `items` prop으로 등록한 아이템이 기존 기본 목록(block type + table + divider + media 4종) 뒤에 추가되고, 동일한 필터링·선택 동작을 갖는다.

## 확정 커밋

- `ddc4fed` — feat(react): SlashMenu 커스텀 아이템 등록 지원(EXT-006)

## 변경한 계약과 파일

- `packages/react/src/slash-menu.tsx`:
  - 공개 `SlashMenuCustomItem` 타입 신설(`id`/`label`/`description?`/`keywords?`/`icon?`/`onSelect: (editor: EditorController) => void`). 계획 초안은 이름을 `SlashMenuItem`으로 뒀으나, 같은 파일의 비공개 내부 discriminated union이 이미 그 이름을 쓰고 있어(TS 모듈 스코프 제약) `SlashMenuCustomItem`으로 정정했다(`_works/roadmap/RD-002.md` "결정" 참고).
  - 내부 `SlashMenuItem`(비공개)에 5번째 variant `kind: "custom"` 추가 — 공통 필드(`id`/`label`/`description`/`keywords`)로 승격하고 원본 `SlashMenuCustomItem`을 `custom` 필드에 보존, 렌더·필터링 코드가 다른 kind와 동일하게 다룬다.
  - `getSlashMenuItems`/`filterItems`에 `customItems` 매개변수를 추가해 기본 목록 뒤에 concat, `ArrowDown`/`ArrowUp`/`Enter` 핸들러와 `useEffect` 의존성 배열까지 일관되게 threading.
  - `selectItem`에 `item.kind === "custom"` 분기 추가 — `item.custom.onSelect(editor)` 호출.
  - `items` prop 기본값은 모듈 스코프 상수 `NO_CUSTOM_ITEMS`(안정 참조) — 인라인 `[]`를 쓰면 `useEffect` 의존성 배열이 매 렌더 바뀐 것으로 보여 document 리스너가 매번 재등록된다(`SLASH_MENU_DISMISS_ALLOW_SELECTORS`와 동일한 기존 저장소 패턴, 구현 중 자체 발견).
  - 아이템 렌더에 선택적 아이콘 슬롯 추가(`item.kind === "custom" && item.icon !== undefined`일 때만).
- `packages/react/src/index.ts` — `SlashMenuCustomItem` 공개 export.
- `packages/react/test/slash-menu/popup.test.tsx` — `vi` import 추가(누락 발견), 신규 top-level `describe("SlashMenu 커스텀 아이템(슬라이스4 RD-002 DELTA-01)", ...)` 4건.

## 검증

- RED: "기본 목록 뒤에 추가된다", "클릭하면 onSelect(editor)가 호출된다", "쿼리로 필터링된다" 3건이 구현 전 실패 확인(`git stash`로 src 일시 되돌려 재현).
- GREEN: 3개 파일 51개 테스트 전부 통과.
- `pnpm --filter @cp949/geul-react test` — 38 files / 529 tests passed.
- `pnpm --filter @cp949/geul-react typecheck` — 구현 중 `TS4104`(readonly 기본값을 mutable prop 타입에 대입 불가) 1건 발견·즉시 수정(`items` prop 타입을 `readonly SlashMenuCustomItem[]`로 정정), 최종 clean.
- `pnpm exec playwright test --project=chromium e2e/slash-menu.spec.ts` — 13개 전부 통과, 플레이크 없음.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-002 완료 조건 재대조 (유일한 DELTA)

- 커스텀 아이템이 기본 목록 뒤에 나타나고 선택 시 `onSelect` 실행 — PASS.
- 기존 slash-menu 테스트 회귀 없음 — PASS.
- `pnpm --filter @cp949/geul-react test` 통과 — PASS.

3개 전부 충족 — RD-002 `DONE` 전환(`_works/roadmap/RD-002.md`).

## roadmap 진행 상태

RD-001·RD-002·RD-003 DONE. RD-004(emoji picker)만 남았다 — 진입 조건(RD-003 DONE) 충족, readiness probe 대기.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스4)는 RD-004가 남아 미완료. Issue #156 완료 댓글은 RD-004까지 끝난 뒤 슬라이스4 전체로 게시한다(슬라이스1~3 전례).

## 남은 위험

- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert ddc4fed`. 위험: 낮음 — 신규 공개 타입·optional prop이라 기본값(`items` 미지정) 동작이 이전과 동일함을 회귀 테스트로 확인했다.
