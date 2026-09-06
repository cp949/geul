# Issue #156 슬라이스1 RD-003 DELTA-01 — setTextCursorPosition/setSelection 추가(RD-003 완료)

## 목표

roadmap-workflow RD-003(커서·선택 setter API, `DOC-007`/`DOC-008`)의 유일한 DELTA. `EditorController`에 `setTextCursorPosition(blockId, placement?)`/`setSelection(startBlockId, endBlockId)`를 추가한다(spec §3.2). 이 DELTA 완료로 RD-003이 `DONE`이 된다.

## 확정 커밋

- `bde1d8c` — feat(core): 커서·선택 setter API setTextCursorPosition/setSelection 추가

## 변경한 계약과 파일

- `packages/core/src/editor-controller.ts` — `resolveTextCursorTarget`(공유 조회), `firstTableCellRange`(표 첫 셀 위치), `setTextCursorPosition`/`setSelection` 선언·구현.
- `packages/core/test/editor-controller-cursor-selection.test.ts`(신규) — 15건.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/editor-controller-cursor-selection.test.ts` — 15 passed.
- `pnpm --filter @cp949/geul-core test`(전체) — 107 files / 1526 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-core typecheck` · `build`(`tsc -b`) — clean.
- bug-catching RED가 실제 결함을 잡았다 — `firstTableCellRange`의 절대 위치 산술이 처음에 `tablePosition + offset + 1`이었으나 `+2`가 맞다(descendants offset이 tableNode 콘텐츠 시작 기준 상대 좌표라 진입 토큰 두 번(table 자신 + 셀)을 더해야 함, `table-commands.ts`의 `base = position + 1` 관례로 교차 확인). 완료 조건 3 테스트가 이 오차를 그대로 검출.
- post-fix mutation 검증 4건, 2건이 의도한 테스트를 정확히 실패시킴을 확인(`setSelection`의 텍스트 전용 가드 제거, anchor/head 강제 정규화) 후 원복·재검증. 1건(표 첫 셀 판정을 `columnIndexMap` 기반에서 `rows[0].cells[0]`로 단순화)은 관측 가능한 차이가 없음을 확인하고 이 방향으로 구현을 확정(아래).

## 구현 중 계획과 달랐던 사실

- 계획은 "표의 첫 번째 셀"을 `columnIndexMap` 기준 물리 좌상단으로 판정하려 했다(G-TBL-001 경고를 근거). mutation 검증으로 이 재정렬이 실제로는 도달 불가능함을 발견했다 — `ProductionEditorSession`이 매 커밋(초기 로드 포함)마다 `session.currentDocument`를 PM에서 다시 읽어들여, `session.getDocument()`가 항상 이미 PM 물리 순서로 정규화된 `row.cells`를 돌려준다(G-TBL-001은 반대 방향인 model→PM 인코딩 경고라 이 소비 방향엔 적용되지 않는다). `columnIndexMap` 재정렬을 제거하고 `rows[0].cells[0]`로 단순화했다(`RD-003-DELTA-01.md` "## 결정" 갱신).
- `setTextCursorPosition`/`setSelection` 모두 문서를 바꾸지 않으므로 `session.runDocumentCommand`를 거치지 않는다는 것을 계획 단계에서 이미 파악했다(기존 `selectBlockRange`/`clearBlockSelection` 선례와 동일 이유 — `runDocumentCommand`로 감싸면 selection만 바뀌는 성공 케이스가 `blockChanges` 빈 배열 때문에 전부 `COMMAND_NOT_APPLICABLE`로 오판된다).

## 등록한 이슈

없음. 범위 밖 발견 없음.

## RD-003 완료 재대조

RD-003 완료 조건 4개 전부 실측 증거로 재확인:

- `setTextCursorPosition`이 텍스트 블록에서 `start`/`end` 캐럿을 정확히 이동시킨다 — 증거: `RD-003-DELTA-01.md` 완료 조건 1.
- 텍스트 없는 leaf 블록(divider 등)에서 `NodeSelection`으로 대체된다 — 증거: 완료 조건 2.
- `table` 블록 대상은 첫 번째 셀의 시작/끝으로 매핑된다 — 증거: 완료 조건 3.
- `setSelection`이 두 블록 사이 선택을 만든다 — 증거: 완료 조건 5.

RD-003 `DONE`. 남은 RD(RD-004 lifecycle 이벤트, RD-005 읽기 전용)는 여전히 서로 독립이고 이 완료로 새로 열린 후속 edge는 없다.

## 남은 제한

- `setSelection`은 이 DELTA 범위에서 텍스트 블록끼리만 지원한다 — leaf·table이 섞이면 `COMMAND_NOT_APPLICABLE`(RD-003.md "포함 범위"가 요구하지 않은 이 DELTA만의 범위 축소, 설계 결정). 향후 필요해지면 API 시그니처를 바꾸지 않고 내부 판정만 넓히는 additive 변경으로 확장 가능.
- 슬라이스1의 나머지 RD(RD-004~005)는 아직 미착수다.
- push·tag·PR·`dev` → `main` 병합은 이 세션에서 실행하지 않았다.

## rollback

`git revert bde1d8c`. 위험: 낮음 — 기존 파일 확장(신규 인터페이스 메서드 2개 + 내부 헬퍼)뿐, 기존 메서드·동작 변경 없음. 되돌리면 `setTextCursorPosition`/`setSelection`이 사라진다(RD-003은 다시 `READY`로 되돌아간다).
