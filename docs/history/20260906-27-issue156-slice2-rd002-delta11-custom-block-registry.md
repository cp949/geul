# Issue #156 슬라이스2 RD-002 DELTA-11 — `customBlocks` registry + PM atom 노드 조건부 등록

## 목표

roadmap-workflow RD-002의 열한 번째 DELTA — RD-002에서 처음으로 실제 새 동작(순수 typecheck 정리 아님)을 추가한다. `CreateEditorOptions.customBlocks`(spec §4.4 EXT-001)를 받아 등록된 커스텀 block마다 PM atom 노드를 조건부로 등록하고, 삽입 명령·렌더(NodeView)·model↔PM JSON round-trip을 제공한다.

## 확정 커밋

- `fb48ece` — feat(core): customBlocks registry + PM atom 노드 조건부 등록(RD-002-DELTA-11)

## 변경한 계약과 파일

- `packages/core/src/editor-controller.ts` — `CustomBlockDefinition` 타입(spec §4.4 그대로: `render`/`toHtml?`/`toMarkdown?`) 신설, `CreateEditorOptions.customBlocks?` 추가, `commands.insertCustomBlock` 신설. **핵심 설계 결정**: `createEditor()`가 `ProductionEditorSession` 생성자 안에서 즉시 일어나는 dummy mount/unmount(trailing paragraph 정규화, 기존 동작) 시점에 아직 완성되지 않은 `EditorController`를 커스텀 block NodeView가 필요로 하는 순환 문제를, 빈 박스를 가리키다 `createEditor()` 끝에 채워지는 지연 바인딩 Proxy로 해결했다 — 박스가 비어 있을 때 속성 접근은 `undefined`를 반환할 뿐 던지지 않는다(참조 자체는 항상 유효). **제약**: `render()`는 이 참조의 메서드를 동기적으로 호출하면 안 된다(참조만 캡처해 나중에 쓴다) — 실사용 `mount()`가 만드는 NodeView부터는 완전히 동작한다.
- `packages/core/src/custom-block-extension.ts`(신규) — `createCustomBlockExtension(type, definition, editor)`: divider·media와 동일한 "group: block 직접 멤버, atom, blockId 자체 소유" PM 노드(G-EDT-003) + `addNodeView`로 `definition.render()` 위임. PM 콘텐츠 표현은 만들지 않는다 — model의 `content: "none"|"inline"`은 attrs(`contentMode`)에만 보존해 round-trip만 지키고, 실제 inline 텍스트 편집은 model에 그 텍스트를 담을 필드가 없어 이번 범위 밖이다. `contentRef`(render 반환값)는 이번 DELTA에서 core가 쓰지 않는 예약 필드다.
- `packages/core/src/custom-block-commands.ts`(신규) — `insertCustomBlock`: `insertMediaBlock`(`media-commands.ts`) 골격 재사용(afterBlockId 뒤 삽입, atom NodeSelection, `clearAfterBlockText`). `insertMediaBlock`과 다른 점: 스키마 노드 부재가 도달 불가 방어선(throw)이 아니라 소비자가 실제로 만날 수 있는 오류라 신규 `EditorError` 코드 `CUSTOM_BLOCK_TYPE_NOT_REGISTERED`로 거절한다.
- `packages/core/src/model-to-tiptap.ts`/`tiptap-to-model.ts` — 최상위 문서 루프에만 CustomBlock 인코드/디코드 분기를 추가했다(`customBlockToTiptapJson`/`customBlockFromTiptapJson`). export되는 `blockToTiptapJson`은 건드리지 않는다 — CustomBlock은 top-level 전용(RD-002-DELTA-01 "설계 결정")이라 그 함수의 다른 소비처(children 재귀, 범용 조작 API)엔 나타날 수 없다.
- `packages/core/src/production-editor-session.ts`/`production-editor-assembly.ts` — `customBlocks`·지연 바인딩 Proxy 배선을 관통시킨다. `EditorController`를 `import type`으로 참조 — 이 두 파일이 기존에 쓰던 "구조적 복제" 순환 회피 관례(block-move-keyboard-extension.ts 선례)를 이 타입 하나에 한해 깼다(100개 이상 메서드라 복제가 비현실적이고, type-only import는 컴파일 시 완전히 지워져 런타임 순환 의존을 만들지 않는다).
- `packages/core/src/errors.ts` — `CUSTOM_BLOCK_TYPE_NOT_REGISTERED` 코드 추가, `EDITOR_FEATURE_UNAVAILABLE`의 stale 주석("registry는 RD-002-DELTA-06")을 갱신.
- `packages/core/src/index.ts` — `CustomBlockDefinition`·`CustomBlock` 재수출.
- `packages/core/test/custom-block-registry.test.ts`(신규, 5 tests) — fixture 확장(`myWidget`) 기반 등록·렌더·삽입·round-trip·지연 바인딩 Proxy 해소 검증.

## 검증

- RED→GREEN: 신규 테스트 5개를 구현과 함께 작성 → 1차 실행에서 계획에 없던 결함 발견(`production-editor-assembly.ts`의 `createProductionEditor` 자체 진입점에 있는 `modelToTiptap(options.document)` 호출이 `parseSupportedDocument`와 별개인데 여기 `customBlockTypes`를 빠뜨려, 등록된 커스텀 block이 있는 문서도 여전히 `EDITOR_FEATURE_UNAVAILABLE`로 거절되는 버그) → 즉시 수정 → 5/5 GREEN.
- post-fix mutation 4건 전부 의도한 대로 정확히 실패 확인 후 원복: `addNodeView` 제거(렌더·Proxy 캡처 테스트 실패) / 등록 가드 제거(그레이스풀 거절 대신 `TypeError: Cannot read properties of undefined (reading 'create')`로 크래시) / `contentMode` 복원 제거(inline 삽입 round-trip 테스트 실패) / `controllerBox.current` 대입 제거(Proxy 해소 테스트만 정확히 실패, 나머지 4개는 그대로 통과 — 격리 정확성 확인).
- `pnpm --filter @cp949/geul-core test`(전체) — 113 파일, 1555 tests passed(기존 1550 + 신규 5). 회귀 없음.
- `pnpm --filter @cp949/geul-core typecheck`(project reference 전량) — 0건.
- `pnpm --filter @cp949/geul-io typecheck`·`pnpm --filter @cp949/geul-react typecheck` — 둘 다 0건(회귀 없음, 이 DELTA는 `core`만 변경).
- `npx eslint`(변경 파일 전체) — 0 문제.

## 등록한 이슈

없음.

## 남은 위험

- "결정" 2(지연 바인딩 Proxy)의 제약 — `render()`가 `context.editor`의 메서드를 동기적으로 호출하면 dummy mount 구간에서 TypeError가 난다. 코드 주석 3곳(editor-controller.ts·production-editor-assembly.ts·custom-block-extension.ts)에 남겼다 — 실제 소비자 문서(가이드·스토리북)가 생기면 명시가 필요하다(범위 밖, 후속 후보).
- RD-002는 아직 `ACTIVE`(DELTA-12: `customInlineContent`/`customStyles`/`enabledBlockTypes` 남음). 완료 조건 3개 모두 `customBlocks` 부분만 부분 충족.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-002 전체 완료 기준 대비 부분 진행이다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert fb48ece`. 위험: 낮음 — 기존 14종 block 경로는 그대로 유지된다(`isKnownBlockType`이 여전히 우선 분기, `customBlockTypes`가 비어 있으면 이전과 동일하게 모든 커스텀 타입을 거절). 신규 export(`CustomBlockDefinition`/`CustomBlock`)와 신규 명령(`insertCustomBlock`)만 추가돼 기존 공개 계약을 깨지 않는다(1555 tests 그대로 통과로 확인).
