# Issue #160 — EditorProvider R4 확장성 옵션 7개 threading

## 목표

`EditorProviderProps`에 `customBlocks`/`customInlineContent`/`customStyles`/`enabledBlockTypes`/`commands`/`keyboardShortcuts`/`attributeOverrides`를 추가해 `core.createEditor()`로 threading한다. `EditorProvider`(react 패키지의 표준 통합 경로)만으로 소비자가 커스텀 schema·extension·command·theming을 등록할 수 있게 한다.

## 확정 커밋

- `0aa1dc7` — feat(react): EditorProvider가 R4 확장성 옵션 7개를 core로 threading
- `0c50151` — docs(product): EXT-001~005·EXT-008 inventory react 미배선 캐벗 제거

## 변경한 계약과 파일

- `packages/react/src/editor-provider.tsx` — `EditorProviderProps` 유니온 양쪽에 7개 필드 추가.
  - `customBlocks`/`customInlineContent`/`customStyles`/`enabledBlockTypes`/`attributeOverrides`는 `initialDocument`와 같이 마운트 시점 값만 `createEditor()`로 threading한다(core 계약상 PM 스키마·`editorProps.attributes`가 생성 시점에 정적으로 고정됨, spec §4.4/§7).
  - `commands`/`keyboardShortcuts`는 `uploadFile` 선례(등록 여부 마운트 고정 + 함수 본체 latest-ref)를 확장한 혼합 패턴 — 등록 key 집합(`Object.keys()`)은 마운트 시 고정하고, 각 key의 함수 본체는 `latestCommands`/`latestKeyboardShortcuts` ref를 거쳐 최신 클로저로 실행한다. 마운트 후 key를 추가·제거해도 경고 없이 조용히 무시된다(추가된 key는 core에 애초에 등록되지 않고, 제거된 key는 마지막으로 관측된 함수 본체를 계속 실행).
- 신규 `packages/react/test/editor-provider-extensibility.test.tsx` — 통합 테스트 10건(customBlocks/customInlineContent/customStyles 등록·삽입 2건, enabledBlockTypes 거절 1건, commands latest-ref+key 추가·제거 무시 3건, keyboardShortcuts 동형 3건, attributeOverrides DOM 반영 1건).
- `docs/product/blocknote-free-feature-inventory.md` — `EXT-001`~`005`·`EXT-008` 행의 "react 미배선"/"forwarding하지 않는다" 캐벗을 Issue #160 완료 사실로 교체(슬라이스 근거·완료 판정 경로 등 기존 사실은 보존).

## 그릴링 결정

01-계획.md의 "## 결정"(qq-workflow 단계-1)에서 확정, Issue #160 완료 댓글과 코드 주석에 요약 반영.

1. `commands`/`keyboardShortcuts` threading: uploadFile 혼합 패턴 채택(key 집합 마운트 고정 + 함수 본체 latest-ref) — 콜백형 prop 4개(onChange 등) 전부가 latest-ref인 기존 관례와 일관.
2. 마운트 후 key 집합 변경: 경고 없이 조용히 무시 — 가장 가까운 선례(uploadFile 존재 여부 변경)가 경고 없이 취소로 흡수하는 방식과 일관.

## 구현 중 발견·재검토

- 단계-3 결함 탐지(MINOR 1건) — "key 제거 시 마지막 함수 본체 유지" 주장이 "key 추가" 케이스만 회귀로 고정돼 있었다. commands/keyboardShortcuts 각각에 제거 케이스 회귀 테스트를 추가해 수정했다.
- `commands`/`keyboardShortcuts`에 전달되는 `editor` 인자는 지연 바인딩 Proxy(`controllerFacade`)라 캡처한 controller와 참조 동일성이 없다 — 테스트는 core 자체 테스트 관례대로 실제 문서를 바꿔 기능적으로 검증했다.

## 검증

- `pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/editor-provider-extensibility.test.tsx` — `Test Files 1 passed`, `Tests 10 passed`.
- `pnpm --filter @cp949/geul-react typecheck` — 통과(3개 tsconfig 프로젝트).
- `pnpm --filter @cp949/geul-react test`(전체 43 files) — 통과, 회귀 없음.
- `pnpm check:boundaries` — 통과(core 공개 선언에 Tiptap/PM 타입 누수 없음, ADR-0002 준수).
- `pnpm verify` 전량(lint·format·build·escompat·typecheck·unit·boundaries·license·E2E chromium+mobile 188건) — 통과.

## 남은 제한

- `packages/react/README.md`에 7개 옵션 사용 예시를 추가하지 않았다 — 기존 4개 콜백 prop도 문서화돼 있지 않은 선례와 일관되게 범위 밖으로 뒀다(계획서 "범위 밖" 명시).
- `commands` wrapper의 방어 분기 하나(`latestCommands.current[key] ?? {ok:true,value:undefined}`)는 forward-only 갱신 정책상 정상 경로에서 도달하지 않는 사실상 죽은 코드 — 기능적 위험 아님, 정책 변경 시 재검토 메모만 남김.

## 등록한 이슈

없음.

## 게시

Issue #160에 완료 댓글 게시(issuecomment-5575341072), 완료 기준 전부 충족 확인 후 이슈 종료(qq-workflow 단계-4, `docs/agents/issue-tracker.md` "게시 승인" 넷째 bullet — 게이트 통과 후 에이전트 판단, 사용자 확인 없이 수행).
