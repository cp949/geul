# Issue #152 슬라이스4 RD-002 DELTA-02 — 업로드 트리거 세션 배선

## 목표

roadmap-workflow RD-002의 두 번째 DELTA. `MediaDropPasteExtension`(DELTA-01)이 drop/paste로 삽입한 media 블록(`url: null`)이 삽입 직후 실제 `uploadFile` 콜백을 트리거해 spec §4 업로드 파이프라인(pending "uploading" → 성공/실패/취소 → attrs 적용)에 태우게 한다.

## 확정 커밋

- `88c635f` — RD-002 DELTA-02, 업로드 트리거 세션 배선(Issue #152 슬라이스4)

## 변경한 계약과 파일

- `packages/core/src/production-editor-session.ts` — `editor-controller.ts`의 `runMediaUpload`/`applyUploadedMediaAttrs` 클로저를 `ProductionEditorSession.uploadMediaFile`(public)/`applyUploadedMediaAttrs`(private) 메서드로 이동. 그 클로저는 `session = new ProductionEditorSession(options)` 다음 줄부터 정의돼 있어, 세션 생성자 안에서 `createTiptapEditor()`가 `MediaDropPasteExtension`을 포함한 Tiptap `Editor`를 이미 완성하는 시점엔 존재하지 않았다 — 이동으로 그 시차 문제를 없앴다. `createTiptapEditor()`가 `getBlockSelection`과 같은 모양의 `triggerMediaUpload` 클로저(`(blockId, file) => void this.uploadMediaFile("mediaDropPasteUpload", blockId, file)`)를 `createProductionEditor()`에 스레딩한다.
- `packages/core/src/editor-controller.ts` — 이동한 두 클로저 제거. 공개 `commands.uploadMediaFile`/`replaceMediaBlockFile`은 이동한 세션 메서드에 위임하는 얇은 wrapper가 됐다(시그니처·Result/Promise 계약 불변). 미사용 `UploadResult` import 제거.
- `packages/core/src/production-editor-assembly.ts` — `createProductionEditor` 옵션에 `triggerMediaUpload?: (blockId: string, file: File) => void` 추가, `MediaDropPasteExtension.configure(...)`에 전달.
- `packages/core/src/media-drop-paste-extension.ts` — `MediaDropPasteOptions.triggerMediaUpload` 추가(기본값 no-op). `handlePaste`/`handleDrop`이 삽입에 성공한 각 파일마다(첫 파일 + D2 다중 파일 체이닝 전부) `triggerUpload(blockId, file)`을 fire-and-forget으로 호출한다. `isUploadEnabled`(DELTA-01)는 그대로 유지 — "이벤트 소비 여부" 게이트와 "업로드 트리거 방법"을 독립 관심사로 뒀다.
- `packages/core/test/media-drop-paste-upload-trigger.test.ts`(신규) — drop/paste가 실제 업로드를 트리거하는지, 다중 파일이 서로 독립적으로 성공/실패하는지 고정(2개 테스트).

기존 `packages/core/test/editor-controller-media-upload.test.ts`(26개)와 `packages/core/test/media-drop-paste-extension.test.ts`(19개)는 수정 없이 그대로 통과해, 이동이 공개 계약과 DELTA-01 동작을 그대로 보존했음을 확인했다.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/media-drop-paste-upload-trigger.test.ts test/editor-controller-media-upload.test.ts test/media-drop-paste-extension.test.ts` → 3 files·38 tests passed.
- `pnpm --filter @cp949/geul-core test`(전체) → 104 files·1419 tests passed(회귀 없음).
- `pnpm --filter @cp949/geul-core typecheck`, `pnpm lint`, `pnpm check:boundaries`, `pnpm --filter @cp949/geul-core build` 전부 통과.
- 뮤테이션 3건(메인 세션 자체 리뷰, subagent dispatch 없음) — `handlePaste` 첫 파일 트리거 제거, `chainRemainingFiles` 체이닝 트리거 제거, `session.uploadMediaFile` 성공 분기의 `applyUploadedMediaAttrs` 호출 제거 — 각각 관련 테스트가 RED로 잡음을 확인한 뒤 전부 원복(마지막 뮤테이션은 신규 테스트뿐 아니라 기존 `editor-controller-media-upload.test.ts` 4개도 RED로 만들어, 이동이 실제로 같은 코드를 공유함을 재확인했다).

## 등록한 이슈

- 없음. 완료 댓글은 RD-002 완료(DELTA-03 Playwright e2e 이후) 시점까지 보류.

## 남은 제한

- Playwright e2e(Chromium, 실제 브라우저 drop/paste + 실제 업로드 왕복)가 아직 없다 — DELTA-03이 검증해야 한다(RD-002 완료 조건 "drop/paste 시나리오가 Chromium e2e로 검증된다"는 여전히 미충족).
- `command` 라벨 `"mediaDropPasteUpload"`는 공개 API에 노출되지 않는 내부 에러 분류 문자열이라 테스트가 직접 단언하지 않는다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 88c635f`. 위험: 낮음 — 순수 내부 배선 이동(오케스트레이션 로직 자체는 그대로 옮겼을 뿐 동작을 바꾸지 않았다), 공개 `EditorController` 시그니처·Result/Promise 계약 불변. `editor-controller-media-upload.test.ts` 전량이 revert 전후 동일하게 통과해 안전하게 되돌릴 수 있음을 확인.
