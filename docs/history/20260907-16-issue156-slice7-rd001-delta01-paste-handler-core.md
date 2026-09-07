# Issue #156 슬라이스7 RD-001 DELTA-01 — core pasteHandler override hook

## 목표

RD-001(custom paste handler, `IO-008`)의 첫 번째 DELTA. `core`의 `ClipboardPasteExtension`에 `pasteHandler` override hook을 추가해, 등록된 함수가 붙여넣기 기본 동작을 대체(`true`)·취소(`false`)·`defaultPasteHandler()`로 위임(`undefined`)할 수 있게 한다(spec §10).

## 확정 커밋

- `055f682` — feat(core): ClipboardPasteExtension에 pasteHandler override hook 추가

## 변경한 계약과 파일

- `packages/core/src/editor-controller-types.ts` — `CreateEditorOptions.pasteHandler` 필드 추가.
- `packages/core/src/production-editor-session.ts` — 생성자 옵션 타입 + `createTiptapEditor`가 `pasteHandler`/`pasteHandlerEditor`(controllerFacade)를 threading.
- `packages/core/src/production-editor-assembly.ts` — `createProductionEditor` 옵션 타입 + `ClipboardPasteExtension.configure()` 배선.
- `packages/core/src/clipboard-paste-extension.ts` — `ClipboardPasteOptions`에 `pasteHandler`/`controllerFacade` 추가, 기존 `handlePaste` 본문을 `defaultHandlePaste`로 추출.
- `packages/core/test/clipboard-paste-extension.test.ts` — 신규 테스트 7건.

## 구현 중 발견·재검토

- `context.editor: EditorController` 접근 경로는 신규 설계가 필요 없었다 — `createDeferredControllerFacade`(EXT-005/RD-001-DELTA-01이 이미 만든 지연 바인딩 Proxy)와 `keyboardShortcuts`(EXT-005)가 이미 쓰는 "controllerEditor를 `createTiptapEditor`→`createProductionEditor`→extension `.configure()`까지 threading"하는 패턴을 그대로 재사용했다(readiness probe에서 확인, `_works/roadmap/progress.md`).
- PM `handlePaste` 반환 규약이 `pasteHandler`의 세 값 의미와 어긋난다는 점을 구현 중 명시했다 — `pasteHandler`의 "취소"(`false`)도 PM 레벨에서는 `true`를 반환해야 PM 기본 plain-text 붙여넣기까지 막는다("취소" ≠ PM `handlePaste`의 `false`). 이 매핑을 놓치면 취소 테스트가 "seedworld"가 삽입돼 실패한다(구현 중 실제로 RED로 확인).

## 검증

- RED 확인: 테스트 추가 직후 3건 실패(true 대체, false 취소, `context.editor` facade) — hook 미배선 상태에서 기존 `handlePaste`가 그대로 실행됨을 실측.
- GREEN: `pnpm --filter @cp949/geul-core test` 138 files / 1615 tests 전부 통과.
- `tsc -p tsconfig.json --noEmit`, `tsc -p tsconfig.test.json --noEmit` clean.
- 변경 파일 대상 `eslint` clean.

## RD-001 진행 상태

DELTA-01 완료. DELTA-02(react threading)로 이어서 진행.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스7, RD-001 하나)가 DELTA-02까지 끝난 뒤 통합 완료 시점에 한 번만 Issue #156에 게시한다.
