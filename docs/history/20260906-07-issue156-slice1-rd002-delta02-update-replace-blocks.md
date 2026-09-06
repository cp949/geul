# Issue #156 슬라이스1 RD-002 DELTA-02 — updateBlock/replaceBlocks 추가

## 목표

roadmap-workflow RD-002(범용 블록 조작 API, `DOC-005`/`DOC-006`)의 두 번째 DELTA. `EditorController`에 `updateBlock(blockId, update)`과 `replaceBlocks(blockIdsToRemove, blocksToInsert)`를 추가한다(spec §3.2).

## 확정 커밋

- `14644e4` — feat(core): updateBlock/replaceBlocks 범용 블록 조작 API 추가

## 변경한 계약과 파일

- `packages/core/src/block-tree-edit.ts` — `updateBlockInTree`(blockId 위치의 블록을 새 블록으로 교체), `removeBlocksFromTree`(id 집합을 트리 전 깊이에서 제거, 서브트리 통째 제거, 제거된 블록 목록 반환) 추가.
- `packages/core/src/editor-controller.ts` — `validateCandidateDocument` 공유 헬퍼 신설(`insertBlocksImpl`이 이 헬퍼를 쓰도록 리팩터링, 동작 변경 없음). `updateBlock`/`replaceBlocks` 선언·구현.
- `packages/core/test/editor-controller-block-manipulation.test.ts` — `updateBlock` 7건, `replaceBlocks` 7건 추가(기존 7건 포함 총 21건).

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/editor-controller-block-manipulation.test.ts` — 21 passed.
- `pnpm --filter @cp949/geul-core test`(전체) — 106 files / 1495 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-core typecheck` · `build`(`tsc -b`) — clean.
- `pnpm --filter @cp949/geul-react typecheck` — clean(신규 타입 export 없음, 하위 패키지 영향 없음 확인).
- post-fix mutation 검증 3건 전부 의도한 테스트가 정확히 실패함을 확인(타입 불일치 가드 무력화, R0 빈 문서 재확인 무력화, 병합 순서 파괴) 후 원복·재검증(21 passed). 탐색적 mutation 2건(삽입 placement 반전, `removeIdSet` 좁힘)은 구조적으로 관측 불가능함을 확인하고 폐기(`RD-002-DELTA-02.md` "## 결과" 참고).

## 구현 중 계획과 달랐던 사실

- `updateBlock`의 타입 변경 허용 여부는 spec이 명시하지 않아 이 세션에서 사용자 승인을 받아 확정했다 — `update.type`이 대상 블록의 `type`과 다르면 `COMMAND_NOT_APPLICABLE`로 거절한다(discriminatedUnion 멤버 중 일부만 `.strict()`라 타입 변경을 허용하면 잔여 필드가 스키마를 우연히 통과하는 데이터 정합성 구멍이 생긴다, `_works/roadmap/RD-002.md` "## 결정").
- `replaceBlocks`가 문서의 모든 블록을 제거하고 아무것도 삽입하지 않을 수 있다는 점(제거 개수 > 삽입 개수)을 계획 단계에서 발견했다 — `insertBlocks`/`updateBlock`은 블록 수를 줄이지 않아 도달 불가능했던 R0(문서는 항상 1개 이상 블록) 위반이 `replaceBlocks`에서 처음 가능해진다. `parseDocument`(model 계층)는 빈 배열을 허용하므로 별도 재확인이 필요했다 — mutation 검증으로 이 재확인이 없으면 실제로 빈 문서가 커밋됨을 실측 확인했다.
- `replaceBlocks`의 트리 스플라이스 순서(앵커가 아직 트리에 있을 때 그 앞에 삽입 → 이후 전부 제거)를 설계하며, 삽입 위치를 "앞" 대신 "뒤"로 둬도 최종 결과가 항상 같다는 구조적 불변식(앵커 자신이 정의상 항상 제거 대상)을 mutation으로 실측 확인했다 — 버그가 아니라 설계상 무관한 선택이었다.

## 등록한 이슈

없음. 범위 밖 발견 없음.

## 남은 제한

- RD-002는 아직 `ACTIVE`다 — `removeBlocks`(DELTA-03), `moveBlocksUp`/`moveBlocksDown`(DELTA-04)가 남아 있다.
- `validateCandidateDocument`(사전 후보 검증)와 실제 PM 트랜잭션(커밋 경로)이 "무엇이 제거·삽입되는가"를 각자 계산하는 구조는 유지된다 — 현재는 둘 다 같은 인자에서 직접 파생해 갈릴 지점이 없지만, 후속 수정에서 한쪽만 고치면 조용히 어긋날 수 있는 구조적 위험이 남는다(`RD-002-DELTA-02.md` "## 결과"의 "남은 위험" 참고, DELTA-03이 같은 패턴을 재사용할 때 함께 인지 필요).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 14644e4`. 위험: 낮음 — 기존 파일 확장(신규 인터페이스 메서드 2개 + 내부 헬퍼)뿐, 기존 메서드·동작 변경 없음(`insertBlocksImpl`의 `validateCandidateDocument` 리팩터링은 순수 동작 보존). 되돌리면 `updateBlock`/`replaceBlocks`가 사라진다.
