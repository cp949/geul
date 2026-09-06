# Issue #156 슬라이스2 RD-002 DELTA-18 — `customInlineContent` registry 배선(PM inline atom, NodeView)

## 목표

roadmap-workflow RD-002의 열여덟 번째 DELTA. `CreateEditorOptions.customInlineContent`(spec §4.4 EXT-002)를 받아 등록된 커스텀 inline 원소마다 PM inline atom 노드를 조건부로 등록하고, 삽입 명령·렌더(NodeView)·model↔PM JSON round-trip을 제공한다. DELTA-14가 무조건 거절해 두었던 커스텀 inline 원소 로드를 **등록된 타입에 한해서만** 통과시킨다(미등록은 회귀 없이 그대로 `EDITOR_FEATURE_UNAVAILABLE`). `customStyles`(Mark)는 DELTA-19로 분리했다.

착수 전 판단(그릴링 없이 결정, 근거는 `_works/roadmap/result/RD-002-DELTA-18.md` "착수 전 판단"):

1. `customInlineContent`(inline atom, Node)와 `customStyles`(Mark)를 분리한다 — PM 확장점 종류 자체가 달라(`addNodeView` vs `addAttributes`+`renderHTML`) 서로 무관한 설계 결정이 뒤섞이는 것을 막는다.
2. `io`의 `blocksInlineContentViolation`(DELTA-16)은 이번에도 건드리지 않는다 — `customBlocks`(DELTA-11)도 `io` html/markdown 연결을 명시적으로 범위 밖에 두었고, RD-002 완료 조건도 "에디터에서" 삽입·렌더·round-trip만 요구한다. 이전 세션이 `RD-002.md` 백로그에 남긴 "게이트를 조건부화해야 한다"는 예상은 DELTA-11 선례를 반영하기 전의 성급한 문구였다고 판단해 이번에 정정한다.
3. 클립보드·붙여넣기 경로, `insertBlocks`/`updateBlock`/`replaceBlocks` 우회 위험도 `customBlocks`와 동일한 근거로 범위 밖에 둔다(DELTA-11/14가 이미 같은 위험 범주를 문서화).
4. `insertCustomInlineContent` 명령은 `afterBlockId`가 아니라 현재 selection(caret)에 삽입한다 — inline 원소는 model에 `id`가 없어 block과 달리 위치 식별자가 없다.

## 확정 커밋

- `e5d5554` — feat(core): customInlineContent registry 배선(PM inline atom, NodeView)(RD-002-DELTA-18)

## 변경한 계약과 파일

- `packages/core/src/editor-controller.ts` — `CustomInlineContentDefinition` 타입 신설(spec §4.4 그대로: `render`가 `HTMLElement`를 직접 반환, `toHtml?`), `CreateEditorOptions.customInlineContent?` 추가, `commands.insertCustomInlineContent(type, props?)` 추가(미등록 시 `CUSTOM_INLINE_CONTENT_TYPE_NOT_REGISTERED`).
- `packages/core/src/errors.ts` — `CUSTOM_INLINE_CONTENT_TYPE_NOT_REGISTERED` 코드 추가.
- `packages/core/src/custom-inline-content-extension.ts`(신규) — `createCustomInlineContentExtension(type, definition, editor)`: `Node.create({group:"inline", inline:true, atom:true, addNodeView})`. 기존 `"inline*"` content expression에 `group:"inline"`만으로 자동 참여(스키마 표현식 변경 없음).
- `packages/core/src/custom-inline-content-commands.ts`(신규) — `insertCustomInlineContent(editor, type, props)`: 스키마 노드 존재 확인 후 `editor.chain().insertContent(...).run()`.
- `packages/core/src/model-to-tiptap.ts` — `inlineContentViolation`/`validateEditableContent`/`modelToTiptap`에 `customInlineContentTypes` 옵션 threading. 등록된 커스텀 원소를 만나면 통과시키고 "인접 동일 마크" 판정용 `previousMarks`를 리셋한다(원소가 인접성을 끊는다). `inlineContentToTiptap`은 `isTextRunItem`으로 분기해 커스텀 원소를 `{type: customType, attrs:{props}}`로 인코드.
- `packages/core/src/tiptap-to-model.ts` — `inlineContentFromTiptap`/`tableBlockFromTiptapJson`/`blockContainerToModel`/`decodeBlock`/`tiptapToModel`에 `customInlineContentTypes` threading(children 재귀에는 `customBlockTypes`와 달리 빈 집합으로 리셋하지 않고 그대로 전달 — inline 원소는 중첩 블록에도 나타날 수 있다).
- `packages/core/src/production-editor-session.ts`/`production-editor-assembly.ts` — `customBlocks`/`customBlockEditor`와 동일한 지연 바인딩 Proxy 배선을 `customInlineContent`/`customInlineContentEditor`에도 적용.
- `packages/core/src/index.ts` — `CustomInlineContentDefinition` 재수출.
- `packages/core/test/custom-inline-content-registry.test.ts`(신규, 5 tests) — 등록·렌더, 인접 동일 마크 오판 방지, `insertCustomInlineContent` round-trip(props 있음/없음), 미등록 타입 거절, 회귀 없음(다른 타입 등록 상태에서도 미등록 타입은 여전히 거절).

## 검증

- 착수 전 재측정(`pnpm --filter @cp949/geul-model build` 후 `core`/`io` stale tsbuildinfo 삭제) — 코드 구조 재확인 후 착수.
- RED→GREEN: 신규 테스트 5개를 구현과 함께 작성, 1차 실행에서 5/5 GREEN(계획한 설계를 그대로 구현).
- post-fix mutation 5건 전부 의도한 대로 정확히 실패 확인 후 원복:
  1. `custom-inline-content-extension.ts`의 `addNodeView` 제거 → 완료 조건 1·3(초기 로드·삽입 렌더) 2건 실패.
  2. `inlineContentViolation`의 `previousMarks` 리셋 제거 → 완료 조건 2(인접 동일 마크 오판 방지) 1건만 정확히 실패(격리 확인, `DOCUMENT_INVALID`로 로드 자체가 크래시).
  3. `inlineContentToTiptap`의 커스텀 원소 인코드 분기 제거 → 초기 로드 경로가 `RangeError: Invalid text node in JSON`으로 크래시(완료 조건 1).
  4. `inlineContentFromTiptap`의 커스텀 원소 디코드 분기 제거 → `insertCustomInlineContent` round-trip 경로(완료 조건 3) 2건 실패 + 테스트 정리(destroy) 시점 크래시.
  5. `custom-inline-content-commands.ts`의 스키마 등록 가드 제거 → 완료 조건 4(미등록 타입 거절)가 깔끔한 거절 대신 Tiptap 내부 경고 로그를 남기며 `COMMAND_NOT_APPLICABLE`로 흐려짐(그레이스풀 실패가 실제로 이 가드에 의존함을 확인).
  6. `inlineContentViolation`의 `customInlineContentTypes.has(...)` 멤버십 확인 제거(블랭킷 허용) → 기존 회귀 테스트(`editor-feature-unavailable.test.ts`) 4건이 즉시 실패(신규 테스트 없이도 기존 스위트가 이 실수를 이미 방어하고 있음을 확인).
- `pnpm --filter @cp949/geul-core test` 1574 passed(기존 1569+신규 5) · `pnpm --filter @cp949/geul-io test` 648 passed(변화 없음) · `pnpm --filter @cp949/geul-react test` 505 passed(변화 없음).
- `pnpm --filter @cp949/geul-core typecheck`/`io typecheck`/`react typecheck` 전부 0건(project reference 전량 포함) — 세 패키지 전부 typecheck clean 유지.
- `npx eslint`(변경 10파일) 0 문제. `git diff --check` 0건.

## 등록한 이슈

없음.

## 남은 위험

- `customStyles`(PM Mark, addAttributes/renderHTML) registry 배선은 아직 미착수 — DELTA-19(백로그)가 이어받는다. `CustomStyleDefinition.render`가 `HTMLElement | {className?, style?}`를 반환하는데(spec §4.4) PM Mark의 `renderHTML`은 배열 기반 `DOMOutputSpec`에 콘텐츠 hole(`0`)이 필요해 HTMLElement를 그대로 못 쓰는 문제부터 설계해야 한다(`RD-002-DELTA-18.md` "착수 전 판단" 1번에 상세 근거).
- `io`(`exportHtml`/`exportMarkdown`)와 클립보드·붙여넣기 경로, `insertBlocks`/`updateBlock`/`replaceBlocks` 우회는 여전히 `customInlineContent`를 모른다 — `customBlocks`(DELTA-11)와 동일한 기존 위험 범주로 남겨 두었다(의도적, 위 "목표" 2·3번 참고). `table-model-codec.ts`(라이브 PM 테이블 노드 코덱)도 새로 발견된 같은 범주 — table cell에 등록된 customInlineContent를 넣고 라이브 테이블 명령을 실행하면 `TABLE_NODE_INVALID`로 깔끔하게 거절되지만(크래시 아님) 지원되지는 않는다.
- RD-002는 아직 `ACTIVE`. 완료 조건 3개 중 "PM 노드가 스키마에 등록되지 않는다"만 DELTA-12로 충족. 1번("등록·삽입·렌더·round-trip")은 `customBlocks`+`customInlineContent` 부분만 충족, `customStyles`는 DELTA-19 대기. 3번(회귀 없음 전체 재대조)은 마지막 DELTA 완료 시 수행.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-002 전체 완료 기준 대비 부분 진행이다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert e5d5554`. 위험: 낮음 — 신규 파일 2개(`custom-inline-content-{extension,commands}.ts`)와 기존 파일의 추가적 옵션 필드·조건부 분기뿐이다. 기존 옵션(`customInlineContent` 미지정)에서는 모든 조건부 분기가 빈 집합/undefined로 접혀 DELTA-17 이전과 동일하게 동작한다(`pnpm --filter @cp949/geul-io test`/`core test`/`react test`가 기존 개수 그대로 통과함을 확인). 되돌리면 `customInlineContent` 옵션 자체가 사라지고 커스텀 inline 원소는 다시 무조건 `EDITOR_FEATURE_UNAVAILABLE`로 거절된다(DELTA-14 상태로 복귀).
