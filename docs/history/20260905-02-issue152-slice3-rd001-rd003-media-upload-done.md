# Issue #152 슬라이스 3 — Upload 콜백 (RD-001~003 DONE, roadmap 완료)

## 목표

R3(파일·미디어 parity) 슬라이스3 — 소비자가 제공하는 `uploadFile` 콜백을 등록하면 File Panel Upload 탭에서 파일을 선택해 업로드하고, 성공/실패/취소 3분기가 loading/에러/retry UI로 반영되게 한다(`MED-002`, `MED-005` 완성). 기존 URL이 있는 미디어 블록은 새 파일로 교체(`replaceMediaBlockFile`)할 수 있고, 교체 실패 시 기존 값이 유지된다. 사용자가 슬라이스1·2와 같은 이유로 roadmap-workflow를 지정했다.

## 확정 커밋

- `45ca97c` — feat(core): R3 슬라이스3 RD-001 DELTA-01 — upload 콜백 배선·pending 상태·경합 가드
- `3541539` — feat(core): R3 슬라이스3 RD-002 DELTA-01 — replaceMediaBlockFile(교체 유지 정책)
- `95cd5c4` — feat(core,react): R3 슬라이스3 RD-003 DELTA-01 — Upload 인프라 배선
- `e6ee5c1` — feat(react): R3 슬라이스3 RD-003 DELTA-02 — File Panel Upload 탭
- `6177996` — feat(react): R3 슬라이스3 RD-003 DELTA-03 — Media Toolbar Replace 트리거
- `b7020ef` — feat(demo,e2e): R3 슬라이스3 RD-003 DELTA-04 — Upload e2e(Chromium)

## 변경한 계약과 파일

### RD-001(core upload 파운데이션)

- `packages/core/src/media-upload.ts`(신규) — `UploadResult`/`UploadFile`/`MediaUploadState` tiptap-free leaf 타입(`media-block-kind.ts`와 같은 자리).
- `packages/core/src/production-editor-session.ts` — pending 맵·`AbortController` 맵(`blockSelection`과 같은 자리), `beginMediaUpload`/`endMediaUpload`/`getMediaUploadState`/`getMediaUploadController`/`uploadFile` getter.
- `packages/core/src/editor-controller.ts` — `runMediaUpload`·`applyUploadedMediaAttrs` 클로저, `uploadMediaFile`/`cancelMediaUpload`/`getMediaUploadState` 배선. react 알림 메커니즘으로 신규 전용 콜백 `onUploadStateChange` 확정(`onChange` 확장 아님, `onPasteRejected`류 단일 목적 콜백 전례 재사용).

### RD-002(core replaceMediaBlockFile)

- `packages/core/src/editor-controller.ts` — `applyUploadedMediaAttrs`/`runMediaUpload`에 `command: string` 파라미터 추가해 RD-001의 하드코딩 `"uploadMediaFile"` 리터럴을 매개변수화, `commands.replaceMediaBlockFile` 배선. `uploadMediaFile`과 같은 파이프라인을 command 이름만 바꿔 재사용(신규 helper 불필요).

### RD-003(react Upload UI + e2e, DELTA 4개)

- `packages/core/src/editor-controller.ts` — `EditorController.isUploadEnabled()`(`session.uploadFile !== undefined` 반영, "탭 자체 미노출" 판정의 유일한 core 조회 지점).
- `packages/react/src/editor-provider.tsx` — `uploadFile`/`onUploadStateChange` 플러밍. 등록 여부는 `initialDocument`와 같은 방식으로 마운트 시점에 고정(`configuration`), 함수 자체는 `onChange`/`onPasteRejected`와 같은 latest-ref 패턴으로 최신값 전달.
- `packages/react/src/file-panel.tsx` — `PanelState`를 `activeTab`(embed/upload)·`upload`(idle/uploading/error)·`heldFile`로 확장. `uploadFile` 미등록 시 tablist 자체를 렌더링하지 않고 기존 URL 입력 단일 모드 유지, 기본 활성 탭은 항상 Embed. `startUpload`가 파일 선택·retry 공용 경로 — `uploadMediaFile` await 후 `getMediaUploadState` 재조회로 success/cancelled(둘 다 pending null)와 error를 구분(RD-003 결정: react는 `onUploadStateChange` 구독을 만들지 않고 Promise await로 상태 관찰). Cancel 버튼 추가(`deleteBlock`이 `cancelMediaUpload`를 호출하지 않아 Upload 탭이 유일한 취소 UI 진입점).
- `packages/react/src/media-toolbar.tsx` — `ToolbarState`에 `"replacing"` 모드 추가. `isUploadEnabled()`일 때만 보이는 "Replace" 버튼(spec §6.2 순서상 Rename 앞). `startReplaceUpload`가 성공 시 `finishEditing`과 달리 로컬 캐시 값을 재사용하지 않고 `getSelectionMediaBlock()`을 재조회해 view로 복귀(교체는 실제로 url/name이 바뀌므로). File Panel Upload 탭과 코드는 공유하지 않고 독립 구현(사용처 2곳뿐이라 훅 추출 보류, 이 저장소의 기존 복제 관례와 일치).
- `apps/demo/src/app.tsx` — 결정적 mock `uploadFile` 배선(파일명 `"reject"` 포함 여부로 성공/실패, `AbortSignal`로 취소 지원, 300ms 지연). 새 공개 export 없이 이미 재수출된 `CreateEditorOptions["uploadFile"]`로 타입을 얻는다.
- `e2e/media-upload.spec.ts`(신규) — 성공/실패+retry/취소, 업로드 중 undo로 블록을 지우는 경합 가드, Replace 실패(기존 값 유지)/성공 6개 시나리오. `e2e/support/demo.ts`에 `media-toolbar.spec.ts`의 `insertFilledImage`를 이관해 공유(G-TST-002).

## 구현 중 계획과 달랐던 사실

1. **RD-003 단일 DELTA → 4개 분할**(readiness probe 단계 발견) — `file-panel.tsx`가 실제로는 tab UI 자체가 없는 단일 URL 입력 모드였고(RD-003.md 원래 서술 "Embed 탭만 있는 현재 상태"를 실측으로 정정), `EditorProvider`의 `uploadFile`/`onUploadStateChange` 플러밍과 `EditorController.isUploadEnabled()` 둘 다 부재해 단일 DELTA로는 크기 상한을 확실히 초과한다고 판단했다. 인프라 배선(DELTA-01) → File Panel Upload 탭(DELTA-02) → Media Toolbar Replace(DELTA-03) → e2e(DELTA-04) 순서로 나눴다.
2. **`pnpm --filter @cp949/geul-react test`의 core dist 참조 함정**(DELTA-01 실측) — react vitest가 `@cp949/geul-core`의 빌드된 `dist`(package.json `exports`)를 참조해, core 변경 후 `pnpm --filter @cp949/geul-core build`를 먼저 실행해야 react 테스트가 새 core 표면을 본다. turbo pipeline을 거치면 자동 처리되지만 이 roadmap의 세션들은 `pnpm --filter <pkg> exec vitest`로 turbo를 우회해 직접 호출해 이 함정을 실측했다.
3. **jest-dom 미설정 실측**(DELTA-02) — `toHaveAttribute`/`toBeDisabled` 같은 jest-dom 전용 matcher를 쓰려다 이 저장소에 jest-dom이 없음을 확인, 기존 파일들의 `.getAttribute()`/`.disabled` 직접 비교 관례로 교정.
4. **경합 가드 e2e 트리거 변경**(DELTA-04) — 계획은 "블록 클릭 + Backspace"로 빈 미디어 블록을 삭제하는 것이었으나, 이 저장소에 그 키보드 상호작용의 e2e 전례가 없어(실측 grep) 착수 중 이미 검증된 `media-file-panel.spec.ts`의 "Escape+Ctrl+Z undo" 경로로 교체했다 — 완료 조건이 요구하는 건 "결과 도착 시점에 대상 블록이 이미 없다"이지 삭제 수단이 아니므로 동등하다.
5. **Buffer 함정**(DELTA-04 실측) — Playwright `setInputFiles({name, mimeType, buffer: Buffer})` 객체형이 `e2e/tsconfig.json`의 `types: []`(`@types/node` 전역 배제)와 충돌해 `typecheck:e2e`가 `TS2591`로 실패(`import { Buffer } from "node:buffer"` 명시적 import로도 같은 원인으로 실패). `e2e/fixtures/`의 실제 파일 경로 문자열로 대체해 Node 타입 의존 자체를 없앴다.
6. **탭 미노출 e2e 범위 제외**(DELTA-04 계획 시점) — RD-003.md "예상 DELTA" 원래 문구의 "탭 미노출(uploadFile 미등록)" e2e 항목을 뺐다. 조건 1(탭 미노출)은 이미 DELTA-02의 component test로 e2e 요구 없이 충족 판정됐고, `apps/demo`는 단일 인스턴스라 "미등록" 변형을 만들면 다른 완료 조건과 무관하게 범위만 늘어난다.

## 검증

- `pnpm --filter @cp949/geul-core test` — 101 files / 1364 tests(RD-001 신규 2건 + RD-002 신규 5건, RD-003은 core 무변경).
- `pnpm --filter @cp949/geul-react test` — 32 files / 467 tests(RD-003 DELTA-01~03 신규 18건 — DELTA-01 core 2 제외 react 3, DELTA-02 10, DELTA-03 8).
- `pnpm --filter @cp949/geul-core typecheck`·`pnpm --filter @cp949/geul-react typecheck`·`pnpm --filter @cp949/geul-demo typecheck`·`pnpm typecheck:e2e` — clean.
- `pnpm test:e2e --project=chromium`(전체 게이트) — 168개 전부 통과(슬라이스2 이전 162 + `media-upload.spec.ts` 신규 6).
- `pnpm exec eslint`·`pnpm exec prettier --check`(변경 파일 전체) — 발견 0건.

## 등록한 이슈

없음. Issue #152는 슬라이스 4~7이 남아 완료 댓글을 게시하지 않는다 — 슬라이스3 완료를 반영한 진행 댓글·체크박스 갱신과 게시 여부는 이 이력 작성과 별도로 사용자 확인 후 수행한다.

## 남은 제한

- `docs/product/blocknote-free-feature-inventory.md` 갱신: `MED-002`를 `VERIFIED`로, `MED-005`를 `VERIFIED`로(삭제는 슬라이스2, 이번 슬라이스가 교체까지 완성) 갱신했다.
- drag/drop·paste(`MED-003`, `IO-007` 파일 부분), resize·preview 토글(`MED-007`/`008`), HTML/GFM round-trip, 3-엔진 게이트, R3 완료 판정은 슬라이스4~7 잔여.
- push, tag, PR, `dev` → `main` 병합은 실행하지 않았다.
