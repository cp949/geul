# Issue #156 슬라이스2 RD-002 DELTA-02 — core block-tree/block-tree-edit/editor-controller에 top-level CustomBlock 반영

## 목표

roadmap-workflow RD-002의 두 번째 DELTA. DELTA-01이 넓힌 `Document.blocks: DocumentBlock[]`을 `core`의 트리 순회·스플라이스 프리미티브(`block-tree.ts`, `block-tree-edit.ts`)와 그 유일한 소비처 `editor-controller.ts`가 typecheck 통과하도록 정리한다.

## 확정 커밋

- `f1f60fb` — feat(core): block-tree/block-tree-edit/editor-controller에 top-level CustomBlock 반영

## 변경한 계약과 파일

- `packages/core/src/block-tree.ts` — 탐색·순회 함수 6개(`childrenOf`/`walkBlockTree`/`findBlockInTree`/`findParentInTree`/`findSiblingContext`/`findAdjacentInTree`) 파라미터·반환 타입을 `DocumentBlock`으로 위젠. 순수 탐색이라 판정 로직은 무변경.
- `packages/core/src/block-tree-edit.ts` — `childrenOf`/`withChildren`/`insertSiblingsInTree`/`removeBlocksFromTree`도 동일 위젠. `updateBlockInTree`만 예외: target이 `isKnownBlockType`이 아니면 `null`(BLOCK_NOT_FOUND와 동일 경로) 반환 — `replace` 콜백의 "같은 타입 안 병합" 계약이 CustomBlock에 아직 없다.
- `packages/core/src/editor-controller.ts` — `EditorController`의 `getBlock`/`getPrevBlock`/`getNextBlock`/`getParentBlock`/`forEachBlock`(DOC-004, 읽기 전용)만 `DocumentBlock`을 반환하도록 공개 시그니처 확장(RD-002 "포함 범위"가 명시한 실제 공개 API 변경). `insertBlocks`/`updateBlock`/`replaceBlocks`/`removeBlocks`/`moveBlocksUp`/`moveBlocksDown`/table 셀 조회는 공개 시그니처를 유지하고, 신규 module-local 헬퍼 `asKnownBlock`/`asKnownSiblings`로 `findBlockInTree`/`findSiblingContext` 결과의 CustomBlock을 기존 BLOCK_NOT_FOUND/COMMAND_NOT_APPLICABLE 경로로 흡수한다.
- `packages/core/test/block-tree-custom-block.test.ts`(신규) — 4 tests. `createEditor()`를 거치지 않고 block-tree 함수를 직접 호출한다(`model-to-tiptap.ts`가 아직 CustomBlock을 지원하지 않아 실제 에디터 round-trip은 후속 DELTA 몫).

**`generic-block-commands.ts`(module-local 중복 `findBlockInTree` 보유, ~20곳)와 `model-to-tiptap.ts` 계열은 이 DELTA 밖이다** — DELTA-01 착수 전 실측한 설계 발견에 따라 RD-002.md DELTA-02를 재분할했다.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. packages/core/test/block-tree-custom-block.test.ts` — 4 passed.
- `pnpm --filter @cp949/geul-core test`(전체) — 110/111 파일 통과, 1546 tests passed(기존 1542 + 신규 4). `public-types.test.ts` 1건은 `generic-block-commands.ts`/`model-to-tiptap.ts` 등 후속 DELTA 대상 에러로 계속 실패 — DELTA-01 결과 문서에서 이미 예고한 범위 밖 실패, 이 DELTA가 만든 회귀 아님.
- `pnpm --filter @cp949/geul-core typecheck` — `block-tree.ts`/`block-tree-edit.ts`/`editor-controller.ts` clean. 나머지 6파일(26곳)은 후속 DELTA.
- post-fix mutation 검증 1건: `updateBlockInTree`의 `isKnownBlockType` 조건 제거 → "target이 CustomBlock이면..." 테스트 정확히 실패 확인 후 원복, 재검증(4 passed, typecheck clean).

## 등록한 이슈

없음.

## 남은 제한

- `generic-block-commands.ts`(자체 `findBlockInTree` 중복, ~20곳), `model-to-tiptap.ts`/`production-editor-session.ts`/`table-model-codec.ts`/`document-id-factory.ts`/`clipboard-paste-extension.ts`(CustomBlock의 PM 표현 미설계 — `EDITOR_FEATURE_UNAVAILABLE` 패턴 검토 필요)가 이어진다.
- `pnpm --filter @cp949/geul-core typecheck`/`pnpm verify`는 아직 통과하지 않는다(위 파일들의 에러가 남아 있음) — RD-002의 나머지 DELTA가 닫을 때까지 `dev`의 알려진 상태다(`_works/roadmap/RD-002.md`에 기록).
- GitHub Issue #156에는 댓글을 게시하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert f1f60fb`. 위험: 낮음 — 공개 API 확장은 5개 읽기 전용 메서드의 반환 타입 확장뿐(기존 `Block`은 여전히 유효한 반환값의 부분집합)이고, 나머지 변경은 내부 타입 위젠 + 방어적 가드다.
