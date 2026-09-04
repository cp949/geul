# Issue #152 슬라이스 2 — URL 삽입과 기본 명령 (RD-001~004 DONE, roadmap 완료)

## 목표

R3(파일·미디어 parity) 슬라이스2 — 4종(`file`/`image`/`video`/`audio`) 미디어 블록을 `core` 명령으로 조작하고, `react`에서 Slash 삽입·File Panel URL 입력·편집 toolbar(rename/caption/delete/download)까지 사용자가 실제로 다룰 수 있게 한다(`MED-001`, `MED-004`~`006` 일부). 사용자가 roadmap-workflow를 직접 지정했다(착수 시 ff-workflow 트랙-0으로 시작했다가 전환 지시).

## 확정 커밋

- `ca9cafc` — feat(core): R3 슬라이스2 RD-001 DELTA-01 — 파일·미디어 4종 core 명령 5개 배선
- `29e2e99` — feat(core): R3 슬라이스2 RD-002 DELTA-01 — 파일·미디어 4종 콘텐츠 렌더링
- `ef7e35f` — feat(react): R3 슬라이스2 RD-003 DELTA-01 — Slash 4항목 + File Panel
- `3e21e19` — feat(react): R3 슬라이스2 RD-004 DELTA-01 — 미디어 편집 toolbar(rename/caption/delete/download)

## 변경한 계약과 파일

### RD-001(core 명령 계층)

- `packages/core/src/media-commands.ts`(신규) — `insertMediaBlock`(divider 형태 + `duplicateBlock`의 atom NodeSelection 방식).
- `packages/core/src/editor-controller.ts` — `insertMediaBlock`/`setMediaBlockUrl`/`setMediaBlockName`/`setMediaBlockCaption`/`setMediaBlockBackgroundColor` 5개 명령 배선, 신규 `runSetMediaBlockAttrCommand` 공유 helper.
- `packages/core/src/media-block-kind.ts`(신규) — `MediaBlockKind`를 tiptap-free 파일로 분리(`public-types.test.ts` ADR-0002 결합 회피).
- fixture(`mediaBlock`/`tailParagraphBlock`/`expectMediaBlockNodeSelection`), 신규 테스트 18개.

### RD-002(core 콘텐츠 렌더링)

- `packages/core/src/media-block-extension.ts` — File/Image/Video/AudioBlockExtension `renderHTML`을 kind별로 강화(file `<a href>`+name/url 폴백, image `<img src alt>`+caption/name 폴백, video/audio `<video/audio controls src>`), caption 공용 헬퍼(`captionChildren`), `url` 없는 빈 상태는 `data-be-media-empty`로 표식.
- 신규 `media-block-extension.test.ts` 23개.

### RD-003(react 생성·URL 입력 흐름)

- `packages/core/src/editor-controller.ts` — `getSelectionMediaBlock()` 신규 read-only 조회(readiness 단계 발견 — `getSelectionBlockType()`이 blockContainer 전용이라 atom인 media 블록을 못 봄), `isMediaBlockKind` 타입가드.
- `packages/react/src/extract-name-from-url.ts`(신규) — URL 마지막 path segment 추출.
- `packages/react/src/file-panel.tsx`(신규, 최상위 export) — `getSelectionMediaBlock()` 기반 selection 상태 기계.
- `packages/react/src/slash-menu.tsx` — media 4항목(`kind: "insertMedia"`) 배선.
- `packages/react/src/index.ts`/`apps/demo/src/app.tsx` — `FilePanel` export·마운트.

### RD-004(react 편집 toolbar)

- `packages/react/src/read-block-bounds.ts`(신규) — `file-panel.tsx`의 앵커 좌표 계산을 공용 추출(순수 이동).
- `packages/react/src/media-toolbar.tsx`(신규, 최상위 export) — `getSelectionMediaBlock()` 기반 selection 상태 기계, rename/caption(draft/Save/Cancel, `link-toolbar.tsx` 전례), delete(`deleteBlock` 재사용, `block-selection-toolbar.tsx`의 `useTableCommandFeedback` 전례), download(`<a href download>`).
- `packages/react/src/index.ts`/`apps/demo/src/app.tsx` — `MediaToolbar` export·마운트.

## 구현 중 계획과 달랐던 사실

1. **`getSelectionMediaBlock()` 신규 core 메서드**(RD-003 readiness 단계 발견) — RD-003.md에 명시된 범위는 아니었지만 File Panel과 RD-004 toolbar 둘 다 필요한 인프라라 REPLAN_WITHIN_RD로 RD-003 DELTA-01 범위에 포함했다. RD-004는 이 메서드를 그대로 재사용해 core를 다시 건드리지 않았다(RD-004.md 진입 조건이 실제로 그대로 맞아떨어짐).
2. **`read-block-bounds.ts` 공용 추출**(RD-004, 계획 문서에 없던 리팩터링) — File Panel과 media toolbar 둘 다 같은 media 블록 DOM(`[data-be-block-id]`)을 다른 시점에 앵커해야 해서 `file-panel.tsx`의 private 헬퍼를 공용 모듈로 옮겼다(동작 변경 없음).
3. **RD-003 e2e 실측 결함 2건**(focus/close 순서, `--repeat-each` 병렬 반복에서만 드러난 `dismissedBlockIdRef` 재오픈 레이스) — jsdom 단위 테스트는 둘 다 통과한 채로 넘어갔다. 상세는 `_works/_completed/`(archive 예정)의 `result/RD-003-DELTA-01.md` 참고.
4. **RD-004 e2e 실측 결함 2건**(둘 다 jsdom 단위 테스트는 통과, 단일 실행에서도 100% 재현) —
   - 편집(rename/caption) 중 Escape가 `cancelEditing`으로 view 전환은 정상 처리하지만, 같은 물리 keydown 이벤트가 `stopPropagation` 없이 document까지 전파돼 방금 재활성화된 `useDismissOnOutsideOrEscape`의 keydown 리스너에도 닿아 toolbar 전체가 곧바로 다시 닫혔다. 입력의 Escape 분기에 `event.stopPropagation()`을 추가해 해결.
   - 이미 표시 중인 toolbar의 대상 블록을 다시 클릭하면 `pointerdown` 시점엔 아직 클릭이 선택을 확정하기 전이라 "바깥 클릭"으로 오판정돼 `dismissToolbar`가 먼저 실행되고, `dismissedBlockIdRef`가 뒤이은 재선택의 재오픈을 막았다. `allowSelectors`에 `[data-be-block-id]`(모든 블록의 공통 wrapper)를 추가해 편집기 내부 클릭 전체를 "바깥 아님"으로 처리하도록 수정 — 편집기 완전 바깥 클릭은 여전히 정확히 판정된다.
   - `--repeat-each=8 --workers=6`(80회)로 재검증했다. G-UI-001의 "닫은 상태의 안정 key만 재관측 무시" 규칙이 "같은 blockId의 모든 재관측"까지 과하게 넓게 해석될 수 있다는 2차 실패 모드를 `pending-guides` 후보로 남겼다 — `file-panel.tsx`(RD-003, 이미 `DONE`)도 구조적으로 같은 위험이 있으나 이 DELTA 범위가 아니라 수정하지 않았다.

## 검증

- `pnpm --filter @cp949/geul-core test` — 100 files / 1344 tests(RD-001·002 신규 41건 포함, RD-003·004는 core 무변경).
- `pnpm --filter @cp949/geul-react test` — 32 files / 446 tests(RD-003 신규 다수 + RD-004 신규 17건).
- `pnpm --filter @cp949/geul-core typecheck`·`pnpm --filter @cp949/geul-react typecheck`·`pnpm --filter geul-demo typecheck` — clean.
- `pnpm test:e2e --project=chromium`(전체 게이트) — 162개 전부 통과(슬라이스1 이전 145 + RD-003 `media-file-panel.spec.ts` 7 + RD-004 `media-toolbar.spec.ts` 10). RD-003·RD-004 둘 다 `--repeat-each`(각 최대 8) 병렬 반복으로 레이스 재검증.
- `pnpm exec eslint`·`pnpm exec prettier --check`(변경 파일 전체) — 발견 0건. `pnpm lint`(문서 갱신 포함 전체) — 발견 0건.

## 등록한 이슈

없음. Issue #152는 슬라이스 3~7이 남아 완료 댓글을 게시하지 않는다 — 슬라이스2 진행 댓글만 게시하고 체크박스를 갱신한다(게시는 이 이력 작성과 별도로 사용자 확인 후 수행).

## 남은 제한

- 슬라이스2는 URL 기반 삽입·편집만 다룬다 — upload 콜백(`MED-002`), drag/drop·paste(`MED-003`), 파일 교체(`MED-005` 나머지), resize·preview 토글(`MED-007`/`008`, `MED-006` 나머지), HTML/GFM round-trip(`io`)은 슬라이스3~6 잔여다.
- `docs/product/blocknote-free-feature-inventory.md` 갱신: `MED-001`·`MED-004`를 `VERIFIED`로, `MED-005`·`MED-006`을 `PARTIAL`로 갱신했다. `BLK-013`~`BLK-016`(파일·이미지·비디오·오디오 블록)의 근거 열도 슬라이스2 완료 범위를 반영했다(상태는 upload·drag/drop 등 잔여로 `PARTIAL` 유지).
- push, tag, PR, `dev` → `main` 병합은 실행하지 않았다.
