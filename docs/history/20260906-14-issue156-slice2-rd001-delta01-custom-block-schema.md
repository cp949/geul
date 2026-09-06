# Issue #156 슬라이스2 RD-001 DELTA-01 — 커스텀 block 저장모델 + zod 라우팅 계층 추가

## 목표

roadmap-workflow RD-001(model 커스텀 schema 저장모델 + zod 라우팅)의 첫 DELTA. `CustomBlock`(leaf 전용) 타입과 envelope 검증·라우팅 계층을 추가해 알려지지 않은 `type`을 가진 블록을 구조적으로 파싱할 수 있게 한다(`EXT-001`, spec §4.2~§4.3, `docs/specs/2026-09-06-r4-extensibility-integration-parity-design.md`).

## 확정 커밋

- `8026b43` — feat(model): 커스텀 block(EXT-001) 저장모델 + zod 라우팅 계층 추가

## 변경한 계약과 파일

- `packages/model/src/types.ts` — `CustomBlock` 타입 신설(leaf 전용, `id`/`type`/`content: "none"|"inline"`/`props?`). `Block` 유니온에는 넣지 않는다.
- `packages/model/src/schema.ts` — `customBlockSchema`(envelope만 검증, `.strict()`), `KNOWN_BLOCK_TYPES`(14종 판별 Set, 파일 내부 전용), `blockOrCustomBlockSchema`(spec §4.3 라우팅 패턴), 신규 export `parseBlockOrCustomBlock(input): Result<Block | CustomBlock, DocumentError>`.
- `packages/model/src/index.ts` — `CustomBlock` 타입, `parseBlockOrCustomBlock` 함수 export 추가.
- `packages/model/test/document-custom-block.test.ts`(신규) — 10 tests.

**`Document`/`parseDocument`/`documentSchema`/`blockSchema`는 바꾸지 않았다** — 설계 결정(아래) 참고.

## 검증

- `pnpm --filter @cp949/geul-model exec vitest run --root ../.. test/document-custom-block.test.ts` — 10 passed.
- `pnpm --filter @cp949/geul-model test`(전체, 이번 로드맵에서 `model` 패키지 첫 진입) — 26 files / 392 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-model typecheck` — clean.
- `pnpm --filter @cp949/geul-model build`(`tsc -b`) — clean.
- `pnpm --filter @cp949/geul-core typecheck` — clean(순수 추가 export라 `core` 영향 없음을 확인).
- post-fix mutation 검증 3건: (1) 라우팅 dispatcher의 known-type 조건 반전 → 6/10 테스트 실패, (2) `customBlockSchema`의 `.strict()` 제거 → "여분 키 거절" 테스트 실패, (3) `props` 스키마를 `z.unknown()`으로 느슨화 → "중첩 객체/배열 거절" 테스트 2건 실패. 셋 다 원복 후 재검증 10 passed.

## 설계 결정

- **`Document`/`parseDocument` 위젠 보류**: `Document.blocks`를 `Array<Block | CustomBlock>`로 넓히면 `core`/`react`/`io`의 기존 `Block[]` 타입 소비처(2026-09-06 grep 72곳 — `block-tree.ts`/`model-to-tiptap.ts`/`editor-controller.ts`/`block-side-menu.tsx`/`export-html.ts` 등)가 즉시 typecheck에 실패한다. 대신 독립 함수 `parseBlockOrCustomBlock`만 추가했다 — `core`에 customBlocks registry를 실제로 배선하는 RD-002가 이 소비처들을 함께 넓히기로 결정했다(`_works/roadmap/RD-002.md` "포함 범위"에 기록).
- **id 유일성 등 문서 전체 검증 미포함**: 이 DELTA는 zod envelope(구조)만 검증한다. document 전체 id 유일성(`validateBlocksAt`)은 `Document` 파이프라인에 배선하는 RD-002 몫이다.
- **`KNOWN_BLOCK_TYPES` 하드코딩**: zod v4 discriminatedUnion 내부 구조를 introspect해 동적으로 도출하는 대신 spec §4.3 스니펫 그대로 14종을 하드코딩했다(미검증 zod 내부 API 의존을 새로 만들지 않기 위함).
- **`ctx.addIssue` 타입 캐스트**: `exactOptionalPropertyTypes: true` 아래 zod 내부 `$ZodSuperRefineIssue`가 `safeParse`가 실제로 반환하는 `$ZodIssue`와 구조적으로 정확히 맞지 않아(2026-09-06 tsc 실측) `as unknown as Parameters<typeof ctx.addIssue>[0]` 캐스트를 추가했다. spec §4.3의 issue 그대로 전달 패턴 자체는 zod 4.4.3 런타임으로 이미 검증됐다.

## 등록한 이슈

없음. 범위 밖 발견 없음.

## 남은 제한

- RD-001의 나머지 DELTA-02(`InlineContentItem` 커스텀 변형 + `CustomTextMark` + `textMarkSchema` 라우팅)가 남아 있다 — RD-001 완료 조건 4개는 아직 CustomBlock 부분만 충족하고 InlineContentItem/CustomTextMark 부분은 미충족이라 체크하지 않았다(`_works/roadmap/RD-001.md`).
- RD-002(core registry)·RD-003(io 손실 정책)는 아직 `CANDIDATE` — RD-001 `DONE` 전환 시 readiness probe를 재실행한다.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — 진행분이 이슈 완료 기준(슬라이스2 전체)에 비해 작아 `issue-tracker.md`의 완료 댓글 기준을 충족하지 않는다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 8026b43`. 위험: 낮음 — 신규 파일·타입·함수 추가뿐, 기존 `Document`/`parseDocument`/`blockSchema`/공개 API 변경 없음. 되돌리면 `CustomBlock`/`parseBlockOrCustomBlock`이 사라진다.
