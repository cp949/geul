# Issue #156 슬라이스2 RD-002 DELTA-04 — core: top-level CustomBlock 로드를 EDITOR_FEATURE_UNAVAILABLE로 명시적 거절

## 목표

roadmap-workflow RD-002의 네 번째 DELTA. `model-to-tiptap.ts`/`production-editor-session.ts`/`table-model-codec.ts`/`document-id-factory.ts`/`clipboard-paste-extension.ts`(`core`에 남은 typecheck 에러 전부)를 정리한다. CustomBlock의 PM 표현이 아직 없으므로(registry는 RD-002-DELTA-06), top-level CustomBlock이 있는 문서를 이 에디터에 로드하려 하면 `EDITOR_FEATURE_UNAVAILABLE`로 명시적으로 거절한다(사용자 승인, 2026-09-06).

## 확정 커밋

- `bba2386` — feat(core): top-level CustomBlock 로드를 EDITOR_FEATURE_UNAVAILABLE로 명시적 거절
- `1ebe3dd` — docs(agents): EDITOR_FEATURE_UNAVAILABLE 불변식 문구를 R0 표 전용 설명에서 갱신(부수 발견, 기본 레인)

## 변경한 계약과 파일

- `packages/core/src/errors.ts` — `EditorError`에 `{ code: "EDITOR_FEATURE_UNAVAILABLE"; message: string }` 재도입. **이 코드는 AGENTS.md가 문서화하지만 R1 슬라이스12(표 완전 지원)에서 생산처가 사라져 실제로는 존재하지 않았다** — 같은 이름·의미를 top-level CustomBlock이라는 새 상황에 재도입한 것이지 기존 라이브 코드 재사용이 아니다.
- `packages/core/src/model-to-tiptap.ts` — `modelToTiptap`이 `document.blocks`에서 top-level 미등록 타입(`!isKnownBlockType`)을 찾으면 `validateEditableContent`/`blockToTiptapJson`(모두 알려진 14종 전용 필드에 접근) 호출 전에 즉시 거절한다.
- `packages/core/src/production-editor-session.ts` — `flattenBlockTree` 위젠, 생성자 `TypeError` 메시지 매핑에 `EDITOR_FEATURE_UNAVAILABLE`도 `DOCUMENT_INVALID`처럼 `message`를 그대로 던지도록 추가.
- `packages/core/src/document-id-factory.ts`/`table-model-codec.ts` — `isKnownBlockType`+`as TableBlock` 캐스트 패턴 재사용("table"은 예약 리터럴이라 CustomBlock일 수 없음).
- `packages/core/src/clipboard-paste-extension.ts` — `reassignNonTableBlockIds`(id 재발급, 타입 무관) 위젠.
- `packages/core/test/editor-feature-unavailable.test.ts`(신규) — 3 tests.
- `AGENTS.md` — 위 재도입 과정에서 발견한 stale 문구("table은 R0에서...") 갱신(부수 발견, 기본 레인).

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. packages/core/test/editor-feature-unavailable.test.ts` — 3 passed.
- `pnpm --filter @cp949/geul-core test`(전체) — 111/112 파일, 1549 tests passed(기존 1546 + 신규 3), 회귀 없음.
- `pnpm --filter @cp949/geul-core typecheck` — **`core` 자체 `src/*.ts`는 clean**(`grep "^src/"` 0건). `public-types.test.ts`는 project reference가 `io` 소스까지 재검사해 계속 실패한다 — 원인이 이제 `io`(DELTA-05 대상, `pnpm --filter @cp949/geul-io typecheck` 독립 실행으로 동일 에러 재현 확인)로 바뀌었을 뿐 이 DELTA가 만든 회귀가 아니다.
- post-fix mutation 검증 1건: `modelToTiptap`의 `customBlock` 탐지를 무력화(`find(() => false)`) → 신규 2건이 RED 때와 동일한 크래시로 재실패 확인 후 원복, 재검증.

## 등록한 이슈

없음.

## 남은 제한

- `io`/`react` typecheck 정리(DELTA-05), registry+PM atom 노드(DELTA-06), customInlineContent/enabledBlockTypes+enabledBlockTypes(DELTA-07)가 이어진다.
- `pnpm --filter @cp949/geul-core typecheck`(project reference로 io 포함)/`public-types.test.ts`는 DELTA-05까지 끝나야 다시 통과한다.
- GitHub Issue #156에는 댓글을 게시하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert bba2386`(기능), `git revert 1ebe3dd`(문서). 위험: 낮음 — 새 에러 코드 추가 + 명시적 거절 분기뿐, 기존 동작 변경 없음(회귀 테스트로 확인).
