# Issue #156 슬라이스3 RD-002 DELTA-01 — `keyboardShortcuts` 등록 + 내장 shortcut 우선순위·경고

## 목표

roadmap-workflow RD-002(`keyboardShortcuts` 등록, 신규 Tiptap Extension)의 유일한 DELTA. 소비자가 `CreateEditorOptions.keyboardShortcuts`로 커스텀 keyboard shortcut을 등록하고, 내장 keyboard shortcut(9개 확장) 과 겹쳐도 항상 우선하게 한다(`EXT-005`, spec §5). RD-001(`commands` 등록)이 `DONE`으로 전환된 직후, 유일한 `READY` RD였던 RD-002로 전환해 착수했다.

착수 전 그릴링 결정(`_works/roadmap/roadmap.md` "결정", 2026-09-07): 소비자 등록 shortcut이 항상 우선(신규 Extension을 `extensions` 배열 끝에 삽입 — Tiptap 3.30.1 `sortExtensions([...extensions].reverse())` 실측 기반), 겹치는 키는 `console.warn`으로만 알리고 등록을 막지 않는다. RD-001과의 분리 근거도 같은 절이 기록한다.

## 확정 커밋

- `8d10c29` — feat(core): 커스텀 keyboard shortcut 등록(EXT-005) 지원

## 변경한 계약과 파일

- `packages/core/src/editor-controller-types.ts` — `CreateEditorOptions.keyboardShortcuts?: Record<string, (editor: EditorController) => boolean>` 신설. `EditorController`에는 필드를 추가하지 않는다 — 등록된 shortcut은 keydown 시 확장이 직접 실행하므로 `commands`(RD-001)와 달리 소비자가 호출할 별도 진입점이 필요 없다.
- `packages/core/src/custom-keyboard-shortcuts-extension.ts`(신규) — `CustomKeyboardShortcutsExtension`(`Extension.create`). `addKeyboardShortcuts()`에서 `@tiptap/core`가 export하는 `getExtensionField`로 `this.editor.extensionManager.extensions`(자기 자신 제외)를 순회해 각 확장의 `addKeyboardShortcuts` 필드를 동적으로 호출·키를 모은다 — 내장 키 9개(block-join/move/split/type-keyboard, code-block-exit/mark-guard, indent-keyboard, list-input-rule, table-keyboard) 목록을 하드코딩하지 않는다. 등록된 키가 그 집합과 겹치면 `console.warn`, 겹치지 않아도 등록은 그대로 진행한다. handler는 `controllerFacade`(RD-001과 동일한 지연 바인딩 facade)로 partial-apply해 호출한다.
- `packages/core/src/production-editor-assembly.ts` — 옵션에 `keyboardShortcuts?`/`keyboardShortcutsEditor?: EditorController` 추가. `extensions` 배열 맨 끝(`RevisionGuardExtension` 뒤)에 `options.keyboardShortcuts`가 있을 때만 조건부로 `CustomKeyboardShortcutsExtension.configure(...)`를 삽입한다.
- `packages/core/src/production-editor-session.ts` — `createTiptapEditor()`의 조건부 스프레드에 `keyboardShortcuts`/`keyboardShortcutsEditor: this.controllerEditor` 추가(customBlocks 등과 동일 패턴). 생성자 옵션 타입(구조적 복제, `CreateEditorOptions` 재사용 아님)에도 `keyboardShortcuts` 필드를 나란히 추가.
- `packages/core/test/editor-controller-keyboard-shortcuts.test.ts`(신규) — 테스트 6건. `mountTiptapEditor`(`list-item-block-type-support.ts`)·`dispatchKeydown`(`block-test-support.ts`) 기존 공유 헬퍼를 재사용해 실제 `view.someProp("handleKeyDown", ...)` 디스패치로 검증한다(사본 신설 없음).

## 발견(계획에 없던 마찰, 착수 중 즉시 해소)

1. **typecheck**: `getExtensionField`에 넘길 context에서 `editor.extensionStorage[extension.name]`을 바로 인덱싱하면 `Storage` 타입에 인덱스 시그니처가 없어 `TS7053`으로 막혔다. `as unknown as Record<string, unknown>` 캐스팅으로 해소 — 9개 내장 확장의 `addKeyboardShortcuts` 구현 중 `this.storage`를 참조하는 곳이 없다는 계획 시점 실측은 그대로 유효하다(타입 레벨 문제일 뿐 런타임 정확성과 무관).
2. **테스트 fixture 실수(구현 결함 아님)**: 초안 회귀 테스트 중 "false 반환 시 내장 shortcut이 이어서 실행된다"와 "옵션 미지정 시 기존 동작 유지"가 **baseline**(구현 전, `keyboardShortcuts` 참조가 아직 없는 상태) 실행에서부터 실패했다. 원인은 `Tab`으로 실제 indent(두 번째 paragraph가 첫 번째의 자식이 됨)가 일어나면 기존 `TrailingBlockExtension`이 최상위 목록 끝에 빈 문단을 자동으로 유지해, `toMatchObject`로 `blocks` 배열 전체를 비교하면 길이가 어긋난 것 — 프로덕션 정책의 정상 동작이다. 단언을 `editor.getDocument().blocks[0]`만 확인하도록 좁혀 해결했다.

## 검증

- 착수 전 조사 2건(계획 문서에 반영): (1) `@tiptap/core` 3.30.1 dist 소스(`getExtensionField`/`ExtensionManager.plugins` getter)로 keymap 우선순위와 context shape 실측, 내장 keyboard 확장 9개 목록을 `grep -rl addKeyboardShortcuts`로 확인. (2) 기존 키보드 테스트 헬퍼(`dispatchKeydown`, `mountTiptapEditor`, `console.warn` spy 선례 유무) 조사.
- RED: 신규 테스트 6건 중 3건(등록 handler 실행, Tab 우선권, `console.warn` 호출)이 미구현 상태에서 실패 확인. 나머지 3건은 위 "발견" 2번 fixture 수정 후 baseline에서 이미 통과(회귀 없음 사전 확인).
- 최소 구현 후 GREEN: 6건 전부 통과.
- `pnpm --filter @cp949/geul-core typecheck` 0건(전환 전 3건 → 전환 후 0건).
- `pnpm --filter @cp949/geul-core test` 133 파일·1591 테스트 전부 통과(RD-001 시점 132 파일·1585 테스트 대비 +1 파일 +6 테스트, 회귀 없음).
- `pnpm exec prettier --check`/`eslint`(변경 5파일) 0 문제.
- 재그룹화: 백업 ref(`refs/backup/feat/156-slice3-keyboard-shortcuts-pre-squash`, `-tip`) 생성 → 단일 커밋 재조립 → 트리 대조 2회(4단계·6단계) 전부 빈 출력 → `dev` ff-only 병합(`8d10c29`) → 브랜치·백업 ref 정리 완료.

## RD-002 완료 조건 재대조 (마지막 DELTA)

- 등록된 shortcut이 내장 shortcut과 충돌 시 소비자 shortcut이 우선한다 — PASS. 증거: "등록한 키가 내장 shortcut과 같아도 소비자 handler가 먼저 실행되고 내장 handler는 호출되지 않는다" 테스트.
- 내장 키와 겹치는 등록 시 `console.warn`이 발생한다 — PASS. 증거: "내장 키와 겹치는 이름으로 등록하면 console.warn이 호출된다"/"겹치지 않으면 호출되지 않는다" 테스트 쌍.
- `pnpm --filter @cp949/geul-core test` 통과 — PASS. 증거: 위 검증(1591 passed).

3개 전부 충족 — RD-002 `DONE` 전환(`_works/roadmap/RD-002.md`).

## roadmap 완료 판정

RD-001·RD-002 모두 `DONE`, roadmap.md 전체 완료 조건 3개(`commands` 이름 비충돌·`Result` 계약, `keyboardShortcuts` 우선순위·경고, `pnpm --filter @cp949/geul-core test` 통과) 전부 PASS. Issue #156 슬라이스3(`EXT-005`) 완료 — roadmap-workflow "RD 완료와 roadmap 종료" 절차에 따라 active 작업공간(`_works/roadmap/`)을 `_works/_completed/20260907-01-roadmap-issue156-slice3-extension-command-registration/`으로 정리한다.

## 등록한 이슈

없음.

## 게시

Issue #156에 슬라이스3 통합 완료 댓글을 게시했다(https://github.com/cp949/geul/issues/156#issuecomment-5565180489, RD-001만으로는 게시하지 않고 슬라이스 전체 완료 시점까지 보류한 판단은 이전 이력 `20260907-07-...` "남은 위험" 참고). 이슈 본문의 슬라이스3 체크박스를 `[x]`로 갱신했다. 이슈 자체(#156)는 슬라이스 4~11이 남아 있어 닫지 않는다.

## 남은 위험

- `getExtensionField`/`extensionManager.extensions`/`KeyboardShortcutCommand`는 `@tiptap/core`가 공개 export하지만 `ExtensionManager.plugins` getter의 내부 context shape 재현에 기대는 결합이다 — Tiptap 메이저 업그레이드 시 이 재현이 깨질 수 있다(그때는 typecheck와 이 DELTA의 회귀 테스트가 먼저 걸린다).
- `react` 패키지(`EditorProvider` 등)는 아직 `commands`/`keyboardShortcuts` 어느 쪽도 소비자에게 전달하지 않는다(슬라이스2의 `customBlocks` 등과 같은 성격의 제약, 완료 댓글에 명시) — 현재는 `core`의 `createEditor`를 직접 호출해야 두 계약을 모두 쓸 수 있다.
- raw ProseMirror `Plugin`·Tiptap `Extension` 등록은 이 슬라이스에서도 제공하지 않는다(ADR-0002 유지, 계획된 범위 그대로).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 8d10c29`. 위험: 낮음 — `CreateEditorOptions.keyboardShortcuts`는 신규 optional 필드이고 `CustomKeyboardShortcutsExtension`은 그 필드가 있을 때만 조건부로 삽입돼 기존 호출부(옵션 미전달)는 동작이 그대로다(전체 회귀 스위트로 확인). 되돌리면 이 API 자체가 사라진다.
