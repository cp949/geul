# Issue #156 슬라이스2 RD-002 DELTA-01 — Document/Block 배열을 top-level CustomBlock 포함 형태로 위젠

## 목표

roadmap-workflow RD-002의 첫 DELTA. RD-001이 의도적으로 미룬 `Document`/`parseDocument` 위젠 중 `model` 쪽 절반을 끝낸다 — `Document.blocks`(최상위만)가 기존 14종 `Block`과 top-level `CustomBlock`을 함께 담고, `parseDocument`가 이를 실제로 파싱·검증(id 유일성 포함)하게 한다(spec §4.2~§4.3). `core`/`io`/`react` 소비처 typecheck 정리는 후속 DELTA(DELTA-02/03)로 남긴다.

## 확정 커밋

- `af5c2a4` — feat(model): Document/Block 배열을 top-level CustomBlock 포함 형태로 위젠

## 변경한 계약과 파일

- `packages/model/src/types.ts` — `DocumentBlock = Block | CustomBlock` 신규 타입, `Document.blocks: DocumentBlock[]`(기존 `Block[]`에서 위젠). `Block` 자체의 재귀 `children` 필드는 바꾸지 않는다.
- `packages/model/src/schema.ts` — `documentSchema.blocks`를 `z.array(blockSchema)`에서 `z.array(blockOrCustomBlockSchema)`로 변경(top-level만 라우팅). 신규 export `isKnownBlockType(type): type is Block["type"]`(기존 private `KNOWN_BLOCK_TYPES`를 감쌈). `validateBlocksAt`/`visitTableBlocks`/`canonicalizeCodeBlockLanguages`의 파라미터를 `DocumentBlock[]`로 넓히고 각각 CustomBlock을 조기 skip한 뒤 `as Block` 캐스트한 로컬 변수(`known`)로 나머지 로직을 그대로 수행 — `validateColumnWidths`/`validateCells`/`validateTextBlockProps(At)`/`validateTableLimits`/`validateTableGrids`는 파라미터 타입만 넓힌다(본문은 이미 문자열 predicate 기반이라 CustomBlock을 안전하게 통과).
- `packages/model/src/index.ts` — `DocumentBlock` 타입, `isKnownBlockType` 함수 export 추가.
- `packages/model/test/document-custom-block.test.ts` — top-level CustomBlock 포함 문서의 round-trip, id 충돌 거절(Duplicate id), malformed envelope 거절, nested(children) CustomBlock 여전히 거절(characterization) 4건 추가.
- `packages/model/test/document-mark-ordering.test.ts`, `document-table-validation.test.ts` — `Document.blocks` 위젠으로 발생한 discriminated union 잔여분기(아래 "설계 발견") 때문에 필요해진 `as Block` 캐스트 2곳.

**top-level 전용, 자식 중첩 없음**: `Block`의 재귀 `children` 스키마는 그대로 두어 CustomBlock이 다른 block의 children으로 중첩되는 것은 여전히 거절한다(Issue #156 제외 범위 확장 해석, 필요해지면 별도 DELTA로 재검토).

## 검증

- `pnpm --filter @cp949/geul-model exec vitest run --root ../.. packages/model/test/document-custom-block.test.ts` — 14 passed.
- `pnpm --filter @cp949/geul-model test`(전체) — 27 files / 405 tests passed(기존 401 + 신규 4), 사전 결함 없음.
- `pnpm --filter @cp949/geul-model typecheck` — clean.
- post-fix mutation 검증 2건: (1) `documentSchema.blocks`를 `blockSchema`로 되돌림 → 신규 3건(round-trip/duplicate-id/malformed-envelope) 정확히 실패, (2) `validateBlocksAt`의 `isKnownBlockType` 조기 continue를 id 검증보다 앞으로 이동 → duplicate-id 테스트 1건 정확히 실패(잘못 성공). 둘 다 `Edit`로 원복 후 재검증(405 passed, typecheck clean, `isKnownBlockType(block.type)` occurrence 3건만 남아 무결성 확인).

## 설계 발견(다음 DELTA에 중요)

`CustomBlock.type: string`(비literal)이 discriminated union 좁히기를 흐린다 — `block.type === "table"` 같은 리터럴 비교로 좁혀도 TS는 `CustomBlock & {type: "table"}` 잔여 분기를 완전히 배제하지 못한다. `model` 내부는 "`isKnownBlockType`으로 먼저 걸러내고 `as Block`로 캐스트한 별도 변수를 쓴다" 패턴으로 해결했다. `core`(DELTA-02)·`io`/`react`(DELTA-03)의 각 소비처도 같은 패턴이 필요할 가능성이 크다.

소비처 영향 실측(정보용, 이 DELTA의 완료 조건 아님): `pnpm --filter @cp949/geul-model build` 후 `pnpm --filter @cp949/geul-core typecheck` 실행 — `editor-controller.ts`(4곳), `generic-block-commands.ts`(약 20곳), `model-to-tiptap.ts`(2곳), `production-editor-session.ts`(2곳), `table-model-codec.ts`(1곳)에서 에러. `generic-block-commands.ts`가 예상보다 호출 지점이 많아 DELTA-02 착수 시 이 파일만으로도 크기 규칙을 다시 확인해야 한다.

## 등록한 이슈

없음. 범위 밖 발견 없음.

## 남은 제한

- `core`(DELTA-02)·`io`/`react`(DELTA-03) 소비처 typecheck 정리, registry·PM atom 노드(DELTA-04), `customInlineContent`/`customStyles`+`enabledBlockTypes`(DELTA-05)가 이어진다 — `_works/roadmap/RD-002.md` "예상 DELTA" 참고.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — DELTA-01 하나로는 RD-002 완료 조건은 물론 슬라이스2 전체 완료 기준을 충족하지 못해 `issue-tracker.md`의 완료 댓글 기준 미충족.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert af5c2a4`. 위험: 낮음 — `Document`/`parseDocument`는 이전보다 더 많은 입력(top-level CustomBlock)을 받아들이게 넓어졌을 뿐 기존 14종 문서의 파싱 결과·에러는 변경 없음(405개 기존+신규 테스트로 확인).
