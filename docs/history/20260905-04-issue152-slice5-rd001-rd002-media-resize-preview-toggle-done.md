# Issue #152 슬라이스 5 — Resize와 preview 전환 (RD-001~002 DONE, roadmap 완료)

## 목표

R3(파일·미디어 parity) 슬라이스5 — image/video 미디어 블록의 preview 너비를 리사이즈 핸들로 조절하고(`MED-007`), image/video/audio 블록의 preview·링크 표시를 toolbar 버튼으로 전환한다(`MED-008`). 사용자가 슬라이스1~4와 같은 이유로 roadmap-workflow를 지정했다.

## 확정 커밋

- `cc52ecb` — feat(core): RD-001 DELTA-01 — `setMediaPreviewWidth` 명령과 previewWidth DOM 투영 추가
- `da9b343` — feat(react): RD-001 DELTA-02 — `MediaResizeHandles` 리사이즈 핸들 컴포넌트 추가
- `667901a` — fix(react): RD-001 DELTA-02 병합 후 독립 리뷰 Micro 수정 — `MediaResizeHandles`가 `MediaToolbar`를 영구히 닫는 문제와 취소 시 fluid 이미지를 고정폭으로 굳히는 문제
- `cf6b99c` — test(e2e): RD-001 DELTA-03 — media resize handle 실제 pointer 드래그 검증
- `3a61aa2` — feat(core): RD-002 DELTA-01 — `setMediaShowPreview` 명령과 showPreview DOM 투영 추가
- `9f37bd1` — feat(react): RD-002 DELTA-02 — `MediaToolbar`에 preview 토글 버튼 추가
- `d005b09` — test(e2e): RD-002 DELTA-03 — media toolbar preview 토글 실제 Chromium 검증
- `b0539fb` — docs(product): 슬라이스5 완료로 인벤토리·현재 상태 동기화

## 변경한 계약과 파일

### RD-001(previewWidth 명령 + resize handle UI, `MED-007`)

- **DELTA-01** — `packages/core/src/errors.ts`에 `MEDIA_RESIZE_NOT_SUPPORTED` 추가. `packages/core/src/editor-controller.ts`에 `setMediaPreviewWidth(blockId, width)` 공개 명령(image/video만 허용, 나머지는 거절, model `isValidMediaPreviewWidth` 재사용, 별도 함수 `runSetMediaPreviewWidthCommand`로 구현). `packages/core/src/media-block-extension.ts`의 image/video `renderHTML`이 `previewWidth`를 인라인 `width` 스타일로 투영(`previewWidthStyleAttrs`).
- **DELTA-02** — `packages/react/src/media-resize-handles.tsx`(신규) `MediaResizeHandles` — image/video 선택 시 좌우 pointer/touch 드래그 핸들 2개, 64px~content 폭 clamp, 중심 고정 대칭 리사이즈(`table-handles.tsx`의 `usePointerDragGesture`/`useMirroredState` 패턴 재사용). `_media-resize-handles.scss`(신규, img/video 가운데 정렬·`max-width:100%`), `styles.scss`/`index.ts`/데모 앱 wiring.
- **병합 후 독립 리뷰 Micro 수정(`667901a`)** — F5: `MediaToolbar`의 바깥 클릭 allow-list에 리사이즈 핸들이 빠져 드래그 시작이 toolbar를 영구히 닫음. F6: 취소·커밋실패 복원이 시작 rect 폭을 재조립해 써서 원래 `previewWidth: null`(fluid)이던 이미지가 취소 후 고정폭으로 굳음 — `startStyleWidth` 캡처로 원본 인라인 스타일 그대로 복원.
- **DELTA-03** — `e2e/media-resize-handle.spec.ts`(신규 5개, 실제 300×180 PNG fixture를 `page.route()`로 fulfill). 검증 중 발견: 드래그 중 Escape가 `usePointerDragGesture`의 취소와 별개로 `MediaToolbar` 자신의 dismiss-on-escape 리스너에도 반응해 toolbar가 함께 닫힘 — `usePointerDragGesture`의 keydown 리스너를 capture phase + `stopPropagation()`으로 고쳐 해결(`table-handles.tsx`의 같은 훅 소비자에 영향 없음을 전체 e2e로 재확인).

### RD-002(showPreview 명령 + preview 토글 UI, `MED-008`)

- **DELTA-01** — `packages/core/src/errors.ts`에 `MEDIA_PREVIEW_TOGGLE_NOT_SUPPORTED` 추가. `packages/core/src/editor-controller.ts`에 `setMediaShowPreview(blockId, show)` 공개 명령(image/video/audio 허용, file만 거절, `isPreviewToggleableMediaBlockKind`+`runSetMediaShowPreviewCommand`). `packages/core/src/media-block-extension.ts`에 공유 헬퍼 `mediaAnchorChildren`(`FileBlockExtension`의 기존 `<a>` 출력을 추출해 재사용) 신설, image/video/audio `renderHTML`이 `showPreview === false`일 때 미디어 태그 대신 `<a href={url}>{name ?? url}</a>`를 투영(신규 DOM shape 없음).
- **DELTA-02** — `packages/core/src/editor-controller.ts`의 `getSelectionMediaBlock()` 반환 타입에 `showPreview: boolean | null` 추가(file은 `null`, 나머지는 `attrs.showPreview !== false`). `packages/react/src/media-toolbar.tsx`의 `MediaInfo`에 `showPreview` 추가해 모든 상태 전이(view/editingName/editingCaption/replacing)에 스레딩, `kind !== "file"`일 때만 노출되는 Preview 토글 버튼(고정 레이블 + `aria-pressed`, `formatting-toolbar.tsx`의 Bold/Italic 토글 관례 재사용) 추가.
- **DELTA-03** — `e2e/media-toolbar.spec.ts`에 신규 3개(img↔a 교체+undo, aria-pressed 반전, Save/Load JSON round-trip). 검증 중 기존 결함 1건 발견(아래 "구현 중 계획과 달랐던 사실" 참고, 회귀 아님).

## 구현 중 계획과 달랐던 사실

1. **`getSelectionMediaBlock()` 공개 API 확장이 "승격 예외"에 해당하지 않는다고 판단했다**(RD-002 DELTA-02 계획 단계) — 공개 API shape 변경이지만, 이 roadmap이 이미 반복해 온 additive 명령 추가(RD-001·RD-002 DELTA-01의 신규 공개 명령들)와 같은 성격이라 qq/ff-workflow 승격을 사용자에게 묻지 않고 경량 DELTA 사이클을 유지했다. readiness probe가 이 필드를 실제로 검증하는 소비처가 core `editor-controller-selection.test.ts`와 react `slash-menu.test.tsx` 둘뿐임을 확인해 파급 범위가 작음을 근거로 뒀다.
2. **테스트 자신의 결함 2건을 DELTA-03(RD-002)에서 발견·수정했다**(구현 결함 아님) — `[data-be-block-id]`가 미디어 블록만이 아니라 모든 block-level 노드의 공통 속성이라 `.first()`가 엉뚱한 블록을 집었다(실제 blockId 값으로 셀렉터 고정). Save JSON의 실제 직렬화가 pretty-print(`JSON.stringify(doc, null, 2)`)인데 단정 문자열이 compact 형식이었다(공백 추가).
3. **기존 결함을 실측했다(회귀 아님, 슬라이스5 범위 밖으로 분리)** — Media toolbar가 열린 채로 편집기 바깥 버튼(Save JSON)을 클릭하면 그 클릭이 toolbar를 닫고 focus를 옮기는 것까지는 되지만 그 버튼 자신의 `onClick`이 조용히 무시된다. `cf6b99c`(RD-002 착수 이전, RD-001 DONE 시점)에서도 동일 재현을 확인해 이번 슬라이스의 회귀가 아님을 확정했다 — 별도 이슈 초안(`_works/_completed/20260905-04-roadmap-media-resize-preview-toggle/pending-issues/02.md`)으로 분리했다. DELTA-03의 round-trip 테스트는 Escape로 toolbar를 먼저 닫아 이 결함을 우회했다.

## 검증

- `pnpm --filter @cp949/geul-core test` — 104 files / 1451 tests.
- `pnpm --filter @cp949/geul-react test` — 33 files / 489 tests.
- `pnpm --filter @cp949/geul-core typecheck`·`pnpm --filter @cp949/geul-react typecheck`·`pnpm --filter @cp949/geul-demo typecheck`·`pnpm typecheck:e2e`·`pnpm lint`·`pnpm run format:check` — 전부 clean.
- `pnpm test:e2e --project=chromium` — 178개 전부 통과(RD-001 DELTA-03이 175개로 확장한 기준에 RD-002 DELTA-03의 신규 3개 추가, 회귀 없음). 참고: 이 spec 파일 하나만 `--repeat-each`로 반복하면 이 슬라이스가 손대지 않은 기존 테스트에서도 동일 지점의 산발적 타임아웃이 재현됐다 — 공유 데스크톱 환경의 자원 경합으로 판단(전체 스위트 클린 통과, `playwright.config.ts`의 기존 `retries` 전제 근거).
- 각 DELTA 완료 시 메인 세션이 직접 RED→GREEN·완료 조건 대조를 수행했다(subagent dispatch 없음, 경량 DELTA 사이클). RD-001 DELTA-02는 병합 전 `code-review`(effort: high) 1회, 병합 후 새 세션의 독립 재검토(수동 대조 + `code-review` effort: high 재실행)까지 거쳤다.

## 등록한 이슈

- 없음. 슬라이스5 완료를 반영한 진행 댓글·체크박스 갱신(Issue #152)과 게시 여부는 이 이력 작성과 별도로 사용자 확인 후 수행한다(슬라이스1~4와 동일한 관례).
- 범위 밖 발견 2건을 별도 초안으로 분리(등록은 사용자 확인 후):
  - `textAlignment` 명령 부재(spec §6.2 toolbar 항목과 §5.1 명령 목록 불일치) — RD-001·RD-002 착수 전 발견, 슬라이스5 착수 시 사용자 확인(2026-09-05)으로 이번 슬라이스 제외 확정.
  - Media toolbar가 열린 채 편집기 바깥 버튼을 클릭하면 그 클릭의 `onClick`이 무시되는 기존 결함(위 "구현 중 계획과 달랐던 사실" 3번).

## 남은 제한

- `docs/product/blocknote-free-feature-inventory.md` 갱신: `MED-006`(다운로드+preview)·`MED-007`·`MED-008`을 `VERIFIED`로 갱신, `BLK-013`~`016`의 잔여 설명을 슬라이스5 완료 반영으로 갱신(HTML/GFM·3-엔진 게이트만 남음). `docs/product/current-status.md` R3 실행 상태 줄에도 반영했다(`b0539fb`).
- HTML/GFM round-trip(슬라이스6), 3-엔진 게이트와 R3 완료 판정(슬라이스7)은 잔여.
- Firefox/WebKit 3-엔진 게이트는 이 슬라이스 범위 밖(슬라이스7이 재확인) — `@core` 태그를 붙이지 않았다.
- push, tag, PR, `dev` → `main` 병합은 실행하지 않았다.

## rollback

각 DELTA는 독립 커밋이라 개별 `git revert`가 가능하다 — 다만 RD-001 DELTA-02→Micro 수정(`667901a`)→DELTA-03(`cf6b99c`)은 순서대로 서로의 산출물을 전제하고, RD-002도 DELTA-01→DELTA-02→DELTA-03이 같은 순서 의존이다. 되돌릴 때는 역순(`b0539fb`→`d005b09`→`9f37bd1`→`3a61aa2`→`cf6b99c`→`667901a`→`da9b343`→`cc52ecb`)으로 하고 그때마다 `pnpm --filter @cp949/geul-core test`·`pnpm --filter @cp949/geul-react test`·`pnpm test:e2e --project=chromium`으로 재확인한다. 위험: 낮음 — 전부 신규 공개 명령·신규 컴포넌트·DOM 투영 분기 추가이거나(feat 커밋) 순수 테스트/문서 변경(test·docs 커밋)이라 기존 공개 계약을 깨지 않는다.
