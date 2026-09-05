# Issue #152 슬라이스 4 — Drag/drop·Paste (RD-001~002 DONE, roadmap 완료)

## 목표

R3(파일·미디어 parity) 슬라이스4 — 파일을 편집기에 drag/drop하거나 clipboard에 paste하면 media 블록(file/image/video/audio)이 생성되고 실제 `uploadFile` 콜백까지 완주한다(`MED-003`). 이 슬라이스가 `IO-007`(파일·HTML·Markdown·plain text paste)의 R2 이월분(파일 붙여넣기 실제 동작)을 최종 완성한다. 사용자가 슬라이스1~3과 같은 이유로 roadmap-workflow를 지정했다.

## 확정 커밋

- `c098106` — feat(core): RD-001 DELTA-01 — 미디어 drop/paste kind 판별
- `1a6ccd4` — feat(core): RD-002 DELTA-01 — 파일 drop/paste media 블록 생성 확장
- `88c635f` — feat(core): RD-002 DELTA-02 — 업로드 트리거 세션 배선
- `321c184` — feat(demo,e2e): RD-002 DELTA-03 — File drop/paste e2e(Chromium)

## 변경한 계약과 파일

### RD-001(File kind 판별 + 디렉터리 필터, 순수 로직)

- `packages/core/src/media-drop-paste-detection.ts`(신규) — `detectMediaBlockKind(file: File): MediaBlockKind`(그릴링 D3 — MIME `image/`·`video/`·`audio/` 접두사 우선 신뢰, 비어있거나 신뢰 불가하면 확장자 목록 fallback, 둘 다 실패하면 `"file"`), `filterUploadableFiles`(D8 — 디렉터리 항목 제외, 입력 순서 보존). 공개 API 재노출 없음(RD-002가 같은 패키지 내부에서 직접 import).

### RD-002(위치 판정 + Tiptap 확장 배선·우선순위 통합·e2e 게이트)

- **DELTA-01** — `packages/core/src/media-drop-paste-extension.ts`(신규) `MediaDropPasteExtension`: drop/paste DOM 이벤트에서 `File[]`을 추출해 RD-001 함수로 kind·필터를 판별하고, 위치 판정(D1 표 바이패스, D5 CodeBlock은 일반 규칙, paste 전용 빈 paragraph 교체 vs drop 전용 F2 좌표 앞/뒤 — spec §5.2 재독해로 이 둘이 별개 규칙임을 확인), D2 다중 파일 체이닝(직전 반환 `blockId`를 다음 `afterBlockId`로 연쇄), D7 range selection 삭제(**paste 전용** — 최초 구현이 drop에도 적용해 드롭과 무관한 selection을 지우는 버그를 자체 리뷰로 발견·수정), D4 우선순위(`TablePasteExtension` 뒤에 선언, 선언 역순 우선순위 활용)를 구현했다. `packages/core/src/production-editor-assembly.ts`(`isUploadEnabled` 옵션 추가·확장 배선), `packages/core/src/production-editor-session.ts`(`isUploadEnabled` 계산), `packages/core/test/clipboard-test-support.ts`(jsdom `DataTransfer.files/items`·`DragEvent`·`document.elementFromPoint` 폴리필, `pasteFiles`/`pasteFilesAndHtml`/`dropFiles`/`dropEntries` 헬퍼)도 함께 추가·확장했다. 이 DELTA가 만든 media 블록은 항상 `url: null`(실제 업로드는 DELTA-02).
- **DELTA-02** — `runMediaUpload`/`applyUploadedMediaAttrs`(옛 `editor-controller.ts` 클로저)를 `ProductionEditorSession.uploadMediaFile`(public)/`applyUploadedMediaAttrs`(private) 메서드로 이동했다 — 그 클로저는 `session = new ProductionEditorSession(options)` 다음 줄부터 정의돼 세션 생성자 안의 `createTiptapEditor()`가 `MediaDropPasteExtension`을 이미 완성하는 시점엔 존재하지 않았기 때문이다. `createTiptapEditor()`가 `getBlockSelection`과 같은 모양의 `triggerMediaUpload` 클로저(`(blockId, file) => void this.uploadMediaFile("mediaDropPasteUpload", blockId, file)`)를 `createProductionEditor()`에 스레딩한다. `packages/core/src/editor-controller.ts`의 공개 `commands.uploadMediaFile`/`replaceMediaBlockFile`은 이동한 세션 메서드에 위임하는 얇은 wrapper가 됐다(시그니처·Result/Promise 계약 불변). `packages/core/src/production-editor-assembly.ts`에 `triggerMediaUpload` 옵션 추가, `packages/core/src/media-drop-paste-extension.ts`에 같은 옵션(기본값 no-op) 추가 — `handlePaste`/`handleDrop`이 삽입 성공한 각 파일마다(첫 파일+D2 체이닝 전부) fire-and-forget으로 호출한다. 신규 `packages/core/test/media-drop-paste-upload-trigger.test.ts`(다중 파일 독립 성공/실패 고정).
- **DELTA-03** — 신규 `e2e/media-drop-paste.spec.ts`(F2 drop 좌표 판정을 실제 브라우저 레이아웃 — `getBoundingClientRect`/`view.posAtCoords` — 로 검증, 위/아래 절반 각 1개, 데모의 실제 `uploadFile`까지 완주 확인). `e2e/clipboard-paste.spec.ts`의 기존 "파일 단독 클립보드는 무시된다" 테스트를 "파일 단독 클립보드는 실제 uploadFile까지 완주해 media 블록을 만든다"로 갱신(아래 "구현 중 계획과 달랐던 사실" 4번). 프로덕션 소스 변경 없음.

## 구현 중 계획과 달랐던 사실

1. **D7이 원래 계획(paste/drop 공통)에서 paste 전용으로 축소됐다**(DELTA-01, 자체 리뷰 발견) — drop 좌표는 selection과 무관한 임의 위치일 수 있어, 최초 구현대로 drop에도 D7을 적용하면 드롭과 무관한 곳의 range selection이 부수적으로 삭제되는 버그였다. 회귀 테스트를 추가해 수정 전 RED → 수정 후 GREEN을 확인했다.
2. **D2(다중 파일 체이닝)·D7(range selection 삭제)이 DELTA-02→DELTA-01로 이동, D6(`blockSelection` 무시)은 구현 자체가 불필요**해졌다(RD-002.md "결정" — D2는 첫 파일만 위치 판정하고 나머지는 기존 API 반복 호출이라 비용이 낮고, D7은 "빈 paragraph 판정"과 직접 얽혀 분리하면 그 판정 자체가 미완성인 채 병합되며, D6은 이 확장이 세션 상태를 아예 참조하지 않아 자동 충족).
3. **`runMediaUpload`/`applyUploadedMediaAttrs`를 세션 메서드로 이동해야 했다**(DELTA-02, 핸드오프가 이미 파악한 설계 후보를 재확인 채택) — `editor-controller.ts` 클로저는 세션 생성 **이후** 정의돼 `MediaDropPasteExtension` 생성 시점에 존재하지 않는 시차 문제가 있었다. `getBlockSelection` 전례(세션 메서드 클로저를 확장에 스레딩)를 그대로 재사용해 해결했다.
4. **기존 e2e 회귀 발견**(DELTA-03 착수 시) — `e2e/clipboard-paste.spec.ts`의 "파일 단독 무시" 테스트가 RD-002 DELTA-01(`1a6ccd4`) 병합 이후 이미 실패 상태였다. 데모(`apps/demo`)가 R3 슬라이스3(`b7020ef`)부터 `uploadFile`을 항상 등록해 뒀는데, DELTA-01이 `isUploadEnabled`를 열어 파일 단독 paste가 더 이상 무시되지 않고 media 블록을 만들기 시작한 것 — 옛 IO-007 "파일 무시" 계약이 spec §4/§5.2로 대체된 의도된 동작 변경이지 버그가 아니다. 이 로드맵 자신의 앞선 DELTA가 낸 회귀라 무관한 기존 결함으로 미루지 않고 DELTA-03 범위에서 새 계약으로 갱신했다(삭제 아닌 assertion 교체, e2e 게이트 개수 불변).
5. **DELTA-03 백로그 스코프를 ADR-0007로 좁혔다** — 원래 백로그 문구("다중 파일 순서·독립 성공실패, no-op 회귀"까지 e2e 검증)를 `docs/adr/0007-own-behavior-at-the-lowest-proving-layer.md`(증명 계층 소유권)에 대조하면, 그 셋은 모델 상태·command 결과 판정이라 core가 이미 소유했고(DELTA-01·DELTA-02 core 유닛) e2e에서 반복하면 ADR 위반이다. e2e 자격은 F2 drop 좌표 판정(실제 레이아웃)과 데모 앱 배선(drop/paste가 실제 uploadFile까지 완주)뿐으로 확정했다 — 실측으로 F2 판정 결과가 core 유닛의 monkeypatch 예측과 실제 브라우저 레이아웃에서 정확히 일치함을 확인해 프로덕션 코드 변경은 없었다.

## 검증

- `pnpm --filter @cp949/geul-core test` — 104 files / 1419 tests(RD-001 DELTA-01 신규 37건, RD-002 DELTA-01 신규 16건, RD-002 DELTA-02 신규 2건).
- `pnpm --filter @cp949/geul-core typecheck`·`pnpm lint`·`pnpm check:boundaries`·`pnpm --filter @cp949/geul-core build` — 전부 clean(DELTA-01 시점 `check:escompat`가 `packages/react`의 무관한 기존 결함으로 실패 — GitHub #153로 분리, 이 슬라이스와 무관).
- `pnpm test:e2e --project=chromium`(DELTA-03) — 170개 전부 통과(신규 2개 + 갱신 1개 포함, 회귀 없음).
- 뮤테이션 검증(각 DELTA 완료 시 메인 세션이 직접 수행, subagent dispatch 없음, 전부 원복) — D7 재도입, F2 부등호 반전, no-op 게이트 무력화, 업로드 트리거 호출 제거(첫 파일·체이닝 각각), `applyUploadedMediaAttrs` 호출 제거 등 핵심 분기를 각각 반전·제거해 관련 테스트가 실제로 RED를 잡는지 확인했다.

## 등록한 이슈

- 없음. 슬라이스4 완료를 반영한 진행 댓글·체크박스 갱신(Issue #152)과 게시 여부는 이 이력 작성과 별도로 사용자 확인 후 수행한다(슬라이스1~3과 동일한 관례). 범위 밖 발견 1건(`packages/react`의 `Array.prototype.at` ES2022 위반, RD-001 DELTA-01 발견)은 사용자 지시로 이미 [cp949/geul#153](https://github.com/cp949/geul/issues/153)에 등록 완료.

## 남은 제한

- `docs/product/blocknote-free-feature-inventory.md` 갱신: `MED-003`을 `NOT_STARTED`→`VERIFIED`로, `IO-007`을 `PARTIAL`→`VERIFIED`로(R2 이월 파일 붙여넣기 계약 최종 완성) 갱신했다. `docs/product/current-status.md` R3 실행 상태 줄에도 반영했다.
- resize·preview 토글(`MED-007`/`008`, 슬라이스5), HTML/GFM round-trip(슬라이스6), 3-엔진 게이트와 R3 완료 판정(슬라이스7)은 잔여.
- Firefox/WebKit 3-엔진 게이트는 이 슬라이스 범위 밖(슬라이스7이 재확인) — `@core` 태그를 붙이지 않았다.
- push, tag, PR, `dev` → `main` 병합은 실행하지 않았다.

## rollback

각 DELTA는 독립 커밋이라 개별 `git revert`가 가능하다 — 다만 DELTA-02는 DELTA-01의 `MediaDropPasteExtension`을, DELTA-03은 DELTA-01·02가 만든 실제 동작(파일 paste가 media를 만든다)을 전제로 e2e assertion을 갱신했으므로, 되돌릴 때는 역순(`321c184`→`88c635f`→`1a6ccd4`→`c098106`)으로 하고 그때마다 `pnpm --filter @cp949/geul-core test`·`pnpm test:e2e --project=chromium`로 재확인한다. 위험: 낮음 — 전부 신규 파일·내부 배선 추가이거나(DELTA-01·02) 순수 테스트 변경(DELTA-03)이라 기존 공개 계약을 깨지 않는다.
