# Issue #156 슬라이스1 RD-002 DELTA-04 — moveBlocksUp/moveBlocksDown 추가(RD-002 완료)

## 목표

roadmap-workflow RD-002(범용 블록 조작 API, `DOC-005`/`DOC-006`)의 마지막 DELTA. `EditorController`에 `moveBlocksUp(blockIds)`/`moveBlocksDown(blockIds)`를 추가한다(spec §3.2). 이 DELTA 완료로 RD-002(6개 API 전부)가 `DONE`이 된다.

## 확정 커밋

- `cb33fde` — feat(core): 범용 블록 이동 API moveBlocksUp/moveBlocksDown 추가

## 변경한 계약과 파일

- `packages/core/src/block-tree.ts` — `findSiblingContext`(blockId의 형제 배열 참조 + 인덱스 조회) 추가.
- `packages/core/src/editor-controller.ts` — `resolveMoveRange` 공유 헬퍼(같은 부모의 연속한 형제 범위 검증), `moveBlocksUp`/`moveBlocksDown` 선언·구현.
- `packages/core/test/editor-controller-block-manipulation.test.ts` — 10건 추가(기존 27건 포함 총 37건).

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/editor-controller-block-manipulation.test.ts` — 37 passed.
- `pnpm --filter @cp949/geul-core test`(전체) — 106 files / 1511 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-core typecheck` · `build`(`tsc -b`) — clean.
- post-fix mutation 검증 4건, 3건이 의도한 테스트를 정확히 실패시킴을 확인(연속성 검사 무력화, 같은 형제 배열 검사 무력화, 단일 트랜잭션을 두 단계로 분리) 후 원복·재검증. 이 과정에서 완료 조건 5·6의 초기 fixture가 경계 가드(`startIndex===0`)에 우연히 걸려 검사를 우회해도 green으로 남는 결함을 발견해 fixture를 교체했다(`RD-002-DELTA-04.md` "## 결과" 참고). 4번째 mutation(삽입 기준 블록을 반대로 바꿈)은 기존 완료 조건 1 테스트가 즉시 잡아 별도 조정 없이 원복.

## 구현 중 계획과 달랐던 사실

- RD-002.md가 "착수 시 확정"으로 미뤄둔 "다중 blockId 처리 방식"을 이 DELTA에서 확정했다 — `blockIds`는 같은 부모의 **연속한** 형제 범위여야 하고, `moveBlocksUp`/`moveBlocksDown`은 그 범위 바로 앞/뒤 형제 하나와 통째로 자리를 바꾼다(`moveSelectedBlocksBefore`의 기존 "같은 부모 연속 범위" 제약 재사용).
- spec 주석 "기존 moveBlockBefore 조합"을 공개 `commands.moveBlockBefore` 호출로 문자 그대로 구현하면 안 된다는 것을 계획 단계에서 발견했다 — 그 함수의 `beforeBlockId=null`은 "언제나 최상위 문서 끝"을 뜻해(R2 결정) 중첩된 형제 범위의 "그 형제 목록의 끝"과 의미가 다르다. 대신 교환 대상 위치를 항상 범위 자신의 경계에서 상대 계산해 이 불일치를 원천적으로 피했다 — `moveSelectedBlocksBefore`도 이미 같은 이유로 공개 API를 호출하지 않는다(선례 확인).
- mutation 검증 중 두 완료 조건(5·6)의 fixture가 부실해 재설계가 필요했다 — "경계 가드가 다른 검사를 가려 우연히 통과시키는" 패턴을 두 번 반복 관측했다(`RD-002-DELTA-04.md` "## 결과"에 상세 기록).

## 등록한 이슈

없음. 범위 밖 발견 없음.

## RD-002 완료 재대조

RD-002 완료 조건 3개 전부 실측 증거로 재확인:

- 6개 API(`insertBlocks`/`updateBlock`/`replaceBlocks`/`removeBlocks`/`moveBlocksUp`/`moveBlocksDown`) 전부 `Result<T,EditorError>` 계약을 만족하고 새 `EditorError` 코드를 추가하지 않았다(`BLOCK_NOT_FOUND`/`COMMAND_NOT_APPLICABLE`/`DOCUMENT_INVALID`만 재사용) — 증거: `packages/core/src/errors.ts`(diff 없음), 4개 result 파일의 각 완료 조건.
- 6개 API 전부 단일 undo step이다 — 증거: 각 result 파일의 undo 테스트(`RD-002-DELTA-01.md`~`RD-002-DELTA-04.md`).
- `insertBlocks`/`updateBlock`/`replaceBlocks`/`removeBlocks`(타입별 블록 콘텐츠를 받거나 만드는 4개)는 공유 `validateCandidateDocument`로 기존 `model` 검증에 위임하고 별도 완화 검증을 두지 않았다. `moveBlocksUp`/`moveBlocksDown`은 블록 콘텐츠를 새로 만들지 않아(기존 블록의 위치만 바꿈) 이 조건이 공허하게 성립한다(검증 대상 자체가 없음) — 증거: 4개 result 파일.

RD-002 `DONE`. 남은 RD(RD-003 커서·선택 setter, RD-004 lifecycle 이벤트, RD-005 읽기 전용)는 여전히 서로 독립이고 이 완료로 새로 열린 후속 edge는 없다 — DAG 갱신 불필요.

## 남은 제한

- 슬라이스1의 나머지 RD(RD-003~005)는 아직 미착수다.
- push·tag·PR·`dev` → `main` 병합은 이 세션에서 실행하지 않았다.

## rollback

`git revert cb33fde`. 위험: 낮음 — 기존 파일 확장(신규 인터페이스 메서드 2개 + 내부 헬퍼)뿐, 기존 메서드·동작 변경 없음. 되돌리면 `moveBlocksUp`/`moveBlocksDown`이 사라진다(RD-002는 다시 `ACTIVE`로 되돌아간다).
