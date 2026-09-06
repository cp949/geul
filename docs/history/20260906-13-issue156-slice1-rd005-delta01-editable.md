# Issue #156 슬라이스1 RD-005 DELTA-01 — isEditable getter/setter 추가(RD-005 완료, 슬라이스1 완료)

## 목표

roadmap-workflow RD-005(읽기 전용 편집기, `DOC-013`)의 유일한 DELTA. `EditorController`에 `get isEditable(): boolean` / `set isEditable(value: boolean)`를 추가한다(spec §3.4). 이 DELTA 완료로 RD-005가 `DONE`이 되고, 슬라이스1의 5개 RD(RD-001~005)가 모두 `DONE`이 된다.

## 확정 커밋

- `eed6693` — feat(core): 읽기 전용 편집기 isEditable getter/setter 추가 (RD-005 완료)

## 변경한 계약과 파일

- `packages/core/src/production-editor-assembly.ts` — `createProductionEditor` 옵션에 `editable?: boolean` 추가.
- `packages/core/src/production-editor-session.ts` — `editableState` 필드, `get isEditable()`/`set isEditable()`, `createTiptapEditor()` 전달.
- `packages/core/src/editor-controller.ts` — `EditorController`에 `get isEditable()`/`set isEditable()` 선언·구현.
- `packages/core/test/editor-controller-editable.test.ts`(신규) — 5건.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/editor-controller-editable.test.ts` — 5 passed.
- `pnpm --filter @cp949/geul-core test`(전체, 슬라이스1 최종 통합 검증 겸용) — 110 files / 1543 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-core typecheck` · `build`(`tsc -b`) — clean.
- `pnpm --filter @cp949/geul-react typecheck` — clean.
- post-fix mutation 검증 4건. 3건이 의도한 결함을 정확히 검출: (1) getter를 Tiptap 자신의 `isEditable`에 위임 → destroy 후 stub proxy가 `true`를 반환해 실패, (2) setter의 `editableState` 갱신 생략 → getter·replaceDocument 유지 2건 실패, (3) `createTiptapEditor()`의 `editable` 전달 생략 → 처음 작성한 테스트(getter만 확인)는 통과했으나 DOM `contenteditable` 속성 직접 확인으로 강화한 뒤 정확히 검출. 1건(`setEditable`의 `emitUpdate` 기본값)은 계획대로 관찰 가능한 차이가 없음을 확인.

## 구현 중 계획과 달랐던 사실

- "replaceDocument() 이후에도 값이 유지된다" 테스트를 처음엔 공개 `isEditable` getter만으로 검증했는데, getter가 세션 필드(`editableState`)만 읽으므로 실제 tiptap Editor 재구성 시 그 값이 전달되지 않는 결함을 잡지 못했다(mutation 검증 3에서 발견). `replaceDocument()` 전후로 마운트된 DOM의 `contenteditable` 속성을 직접 확인하도록 테스트를 강화해 실제 PM 레벨 effect까지 검증하게 했다.

## 등록한 이슈

없음. 범위 밖 발견 없음.

## RD-005 완료 재대조

RD-005 완료 조건 3개 전부 실측 증거로 재확인:

- `isEditable = false`에서 DOM 입력(타이핑 이벤트)이 차단된다 — 증거: `RD-005-DELTA-01.md` 완료 조건 1(`contenteditable` 속성 확인).
- `isEditable = false` 상태에서도 `commands.*` 호출이 계속 성공한다 — 증거: 완료 조건 2.
- `isEditable` getter가 setter 이후 값을 정확히 반영한다 — 증거: 완료 조건 3·4·5.

RD-005 `DONE`.

## 슬라이스1 완료 재대조

`_works/roadmap/roadmap.md`의 슬라이스1 전체 완료 조건 3개 전부 실측 증거로 재확인:

- 신규 API 전부 `Result<T,EditorError>` 계약과 undo 원자성을 만족한다 — RD-002·RD-003(`DONE`).
- `onBeforeChange` 다중 등록이 AND 결합으로 동작한다 — RD-004(`DONE`).
- `isEditable=false`에서 DOM 입력은 막히고 command 호출은 허용됨이 검증된다 — RD-005(`DONE`, 이 DELTA).

최종 통합 검증(`pnpm --filter @cp949/geul-core test`): 110 files / 1543 tests passed. 슬라이스1(Issue #156 공개 편집기 API + 읽기 전용, `DOC-004`~`010`·`013`) 완료. RD-001~005 5개 전부 `DONE`(RD-001 1 DELTA, RD-002 4 DELTA, RD-003 1 DELTA, RD-004 2 DELTA, RD-005 1 DELTA — 총 9개 DELTA).

## 남은 제한

- `isEditable`은 `commands.*`/§3.2 API 호출을 막지 않는다(spec §3.4 명시 의미) — "완전 잠금"을 기대하면 오해 소지, API 문서화 단계(슬라이스10)에서 명시 필요(RD-005.md "## 결정"이 이미 지목).
- `onBeforeChange`의 `changedBlockIds`는 새로 생성되는 블록에 한해 최종 커밋 id와 다른 placeholder id를 담을 수 있다(RD-004-DELTA-02 "## 결과").
- `setSelection`은 텍스트 블록끼리만 지원한다(RD-003-DELTA-01 "## 결정").
- `PartialBlock.children`은 재귀적으로 partial하지 않다(RD-002-DELTA-01부터 이어지는 기존 항목).
- 위 4개 항목 모두 최종 API 문서화 단계(슬라이스10)에서 명시가 필요하다 — 이번 슬라이스1 범위가 아니다.
- Issue #156의 슬라이스2 이후(커스텀 schema, extension/command, UI, theming, i18n, mobile/a11y, paste, SSR, 서버 렌더)는 이 roadmap이 다루지 않았다 — 아직 미착수.
- push·tag·PR·`dev` → `main` 병합은 이 세션에서 실행하지 않았다.

## rollback

`git revert eed6693`. 위험: 낮음 — 기존 파일 확장(신규 accessor 쌍 + 시그니처 확장)뿐, 기존 메서드·동작 변경 없음. 되돌리면 `isEditable`이 사라지고 RD-005는 다시 `READY`로 되돌아간다.
