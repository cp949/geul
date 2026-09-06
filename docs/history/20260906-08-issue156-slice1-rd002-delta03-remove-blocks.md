# Issue #156 슬라이스1 RD-002 DELTA-03 — removeBlocks 추가

## 목표

roadmap-workflow RD-002(범용 블록 조작 API, `DOC-005`/`DOC-006`)의 세 번째 DELTA. `EditorController`에 `removeBlocks(blockIds)`를 추가한다(spec §3.2).

## 확정 커밋

- `040a8ad` — feat(core): 범용 블록 삭제 API removeBlocks 추가

## 변경한 계약과 파일

- `packages/core/src/editor-controller.ts` — `removeBlocks` 선언·구현. DELTA-02의 `removeBlocksFromTree`·`validateCandidateDocument`를 그대로 재사용 — 신규 트리 유틸리티 없음.
- `packages/core/test/editor-controller-block-manipulation.test.ts` — `removeBlocks` 6건 추가(기존 21건 포함 총 27건).

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/editor-controller-block-manipulation.test.ts` — 27 passed.
- `pnpm --filter @cp949/geul-core test`(전체) — 106 files / 1501 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-core typecheck` · `build`(`tsc -b`) — clean.
- post-fix mutation 검증 3건, 2건이 의도한 테스트를 정확히 실패시킴을 확인(개별 트랜잭션으로 분해, R0 재확인 우회) 후 원복·재검증. 나머지 1건(빈 배열 이른 반환 가드)은 `ProductionEditorSession.commitDocument`의 no-op 판정과 우연히 같은 결과로 수렴함을 확인하고 가드 자체는 구조적 이유(타입 대칭·비용 절감·내부 구현 결합 회피)로 유지(`RD-002-DELTA-03.md` "## 결과" 참고).

## 구현 중 계획과 달랐던 사실

- 계획대로 신규 트리 유틸리티 없이 DELTA-02의 `removeBlocksFromTree`/`validateCandidateDocument`만으로 구현이 끝났다 — `replaceBlocksImpl`의 "삽입 없는 부분집합"이라는 계획 문서의 예상이 그대로 들어맞았다.
- 별도 리뷰 발견 없음 — 첫 구현이 typecheck·전체 테스트를 한 번에 통과했다.

## 등록한 이슈

없음. 범위 밖 발견 없음.

## 남은 제한

- RD-002는 아직 `ACTIVE`다 — `moveBlocksUp`/`moveBlocksDown`(DELTA-04)만 남았다.
- `validateCandidateDocument`(사전 검증)와 실제 PM 트랜잭션(커밋 경로)이 "무엇이 바뀌는가"를 각자 계산하는 구조적 위험은 DELTA-02와 동일하게 남아 있다(`RD-002-DELTA-02.md`/`RD-002-DELTA-03.md` "## 결과"의 "남은 위험").
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 040a8ad`. 위험: 낮음 — 기존 파일 확장(신규 인터페이스 메서드 1개)뿐, 기존 메서드·동작 변경 없음. 되돌리면 `removeBlocks`가 사라진다.
