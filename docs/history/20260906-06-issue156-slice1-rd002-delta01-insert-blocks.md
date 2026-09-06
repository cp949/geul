# Issue #156 슬라이스1 RD-002 DELTA-01 — insertBlocks 추가

## 목표

roadmap-workflow RD-002(범용 블록 조작 API, `DOC-005`/`DOC-006`)의 첫 DELTA. `EditorController`에 `insertBlocks(blocksToInsert, referenceBlockId, placement?)`를 추가한다(spec §3.2). readiness 재검토로 원래 하나였던 RD-002 DELTA-01(`insertBlocks`/`updateBlock`/`replaceBlocks`/`removeBlocks` 전부)을 4개 DELTA로 나눴다(`_works/roadmap/RD-002.md` "예상 DELTA").

## 확정 커밋

- `948a63b` — feat(core): 범용 블록 삽입 API insertBlocks 추가

## 변경한 계약과 파일

- `packages/core/src/model-to-tiptap.ts` — 기존 내부 `blockToTiptapJson`을 export(로직 변경 없음, `insertBlocks`가 삽입 블록만 인코딩하는 데 재사용).
- `packages/core/src/block-tree-edit.ts`(신규) — `insertSiblingsInTree`(depth 무관 형제 스플라이스, 불변 갱신).
- `packages/core/src/editor-controller.ts` — `PartialBlock` 타입(분배 조건부 타입), `insertBlocks` 선언·구현.
- `packages/core/src/index.ts` — `Block`(model 재노출)·`PartialBlock` 신규 공개 export.
- `packages/core/test/editor-controller-block-manipulation.test.ts`(신규) — 7 tests.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/editor-controller-block-manipulation.test.ts` — 7 passed.
- `pnpm --filter @cp949/geul-core test`(전체) — 106 files / 1481 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-core typecheck` · `build`(`tsc -b`) — clean.
- `pnpm --filter @cp949/geul-react typecheck` — clean(신규 export의 하위 패키지 부작용 없음).
- post-fix mutation 검증 3건 전부 의도한 테스트가 정확히 실패함을 확인(검증 게이트 우회, 기본 `placement` 반전, 중첩 재귀 분기 제거) 후 원복·재검증(7 passed).

## 구현 중 계획과 달랐던 사실

- spec §3.2가 표기한 `PartialBlock = { type: Block["type"]; id?: string } & Partial<Omit<Block, "type" | "id">>`는 그대로 쓸 수 없었다 — `Omit`/`Pick`이 유니온에 분배되지 않아 `keyof Block`이 14개 변형의 교집합(사실상 `id`·`type`만)으로 무너져 `content`·`rows` 등 타입별 필드를 받지 못하는 빈 타입이 된다(tsc 실측). 분배 조건부 타입(`{ [T in Block["type"]]: ... }[Block["type"]]`)으로 대체했다 — 공개 시그니처는 spec과 동일, 타입 정의 내부만 교체(`_works/roadmap/RD-002.md` "## 결정").
- 검증 전략: 새 블록만 격리 검증하지 않고 현재 문서 전체에 스플라이스한 "후보 문서"를 `parseDocument`로 통째로 검증한다 — id 유일성과 중첩 깊이(`MAX_NESTING_DEPTH`)는 문서 전체 컨텍스트 없이는 판정할 수 없다.
- 테스트 fixture 실수: depth 1 삽입 테스트에서 상수 `createId`를 썼다가 로드 시점 trailing paragraph(UI-010, 자식 딸린 paragraph로 끝나는 문서가 트리거)와 id가 충돌했다 — 기존 "R-12" 관례(순차 factory)로 교체해 해소.

## 등록한 이슈

없음. 범위 밖 발견 없음. `Block`/`PartialBlock` 신규 export는 이 DELTA의 자연스러운 완결 조건(신규 공개 API를 실제로 쓸 수 있어야 함)이라 별도 이슈로 미루지 않고 같은 변경에 포함했다.

## 남은 제한

- RD-002는 아직 `ACTIVE`다 — `updateBlock`/`replaceBlocks`(DELTA-02), `removeBlocks`(DELTA-03), `moveBlocksUp`/`moveBlocksDown`(DELTA-04)가 남아 있다.
- `PartialBlock.children`이 재귀적으로 partial하지 않는다는 제약(설계 결정)은 API 문서화 단계에서 명시가 필요하다 — 이 DELTA 범위 밖.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 948a63b`. 위험: 낮음 — 신규 파일·인터페이스 확장·export 추가뿐, 기존 메서드·동작 변경 없음. 되돌리면 `insertBlocks`/`PartialBlock`이 사라진다.
