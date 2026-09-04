# Issue #38 슬라이스 10 RD-005 DELTA-01 — 목록 붙여넣기 통합 흡수, RD-005 DONE

## 목표

roadmap-workflow RD-005(`ListPasteFallbackExtension` 폐기·목록 경로 통합 흡수, core)의 유일한 DELTA. 옛 확장이 독립 DOM 파서로 처리하던 외부 `ul`/`ol` 붙여넣기(중첩·`ol[start]`·깊이 상한)를 `io.importHtml`이 이미 동등하게 처리한다는 사실을 근거로 그 확장을 삭제하고, `ClipboardPasteExtension`(RD-004)이 등록 순서상 그 자리를 흡수해 목록·체크 목록·토글 목록(own-format과 RD-003이 편입한 production 마커 둘 다)까지 통합 경로 하나로 처리하게 한다. 이 DELTA로 RD-005 완료 조건 1~5가 전부 충족돼 RD-005가 `DONE`이다.

## 확정 커밋

- `fa09934` — ListPasteFallbackExtension 폐기하고 목록 붙여넣기를 ClipboardPasteExtension으로 통합 (Issue #38 슬라이스 10, RD-005 DELTA-01, RD-005 DONE)

## 변경한 계약과 파일

- `packages/io/src/html/import-html.ts` — `blocksFromListElement`의 `ol[start]` 처리에 model 범위(`startNumber: min(0).max(999_999_999)`) 검증 추가(`isStartNumberInRange`, `table-paste-commands.ts`와 같은 `parseDocument` 프로브 패턴). 범위 밖 값은 explicit start 부재로 접는다.
- `packages/core/src/production-editor-assembly.ts` — `ListPasteFallbackExtension` import·등록 삭제, 관련 stale 주석(2곳) 정정.
- `packages/core/src/clipboard-paste-extension.ts` — 헤더 주석·`clampDepth` 주석을 "옛 확장 삭제 이후" 사실에 맞게 갱신.
- `packages/core/src/list-paste-fallback-extension.ts` — 삭제(301줄).
- `packages/core/src/indent-commands.ts` — `modelDepthAtPasteTarget` 주석의 죽은 파일 참조 2곳 정정(`ClipboardPasteExtension`으로).
- `packages/core/test/list-paste-fallback.test.ts` → `packages/core/test/clipboard-paste-list.test.ts`(이름 변경+확장) — 기존 9개 시나리오(문단 사이 목록, `ol[start]`, 범위 밖 start, 중첩, 깊이 상한 4종, divider 인접) 그대로 이관 + 신규 3건(own-format 체크 목록, production 목록류 실제 렌더 DOM 왕복, 표 셀 안 무회귀) = 12건.
- `packages/core/test/production-editor-test-support.ts`(신규) — `productionHtml`/`productionDocumentOf`/`PRODUCTION_TRAILING_ID`를 `production-list-item-marker-round-trip.test.ts`에서 뽑아 승격(G-TST-002, 두 번째 소비 파일 `clipboard-paste-list.test.ts` 등장).
- `packages/core/test/production-list-item-marker-round-trip.test.ts` — 위 승격에 맞춰 로컬 정의 제거, 공유 모듈 소비로 전환(순수 이동, 결과 8/8 동일).
- `packages/core/test/clipboard-paste-extension.test.ts`, `packages/core/test/clipboard-test-support.ts`, `packages/core/test/editor-controller-support.ts`, `packages/core/test/table-paste-commands.test.ts` — 죽은 파일명 참조(`list-paste-fallback.test.ts`/`ListPasteFallbackExtension`) 정정.

## 구현 중 계획과 달랐던 사실

readiness probe 단계에서 실측으로 찾았다(계획에 이미 반영, 구현 중 추가 발견 없음):

1. `io.importHtml('<ol start="-1"><li>z</li></ol>')`가 model 범위를 벗어난 `start`를 무검증으로 통과시켜 `parseDocument`가 문서 전체를 거절했다(`HTML_DOCUMENT_INVALID`) — `ClipboardPasteExtension`은 이 경우 붙여넣기 전체(목록 아닌 나머지 콘텐츠까지)를 조용히 버린다. 옛 확장은 `isStartNumberInRange` 프로브로 범위 밖 값만 접어 나머지는 반영했다 — 이 결함을 고치지 않으면 이관 시나리오 "범위 밖 start"가 새 경로에서 RED로 막힌다.
2. 부수 확인(계획하지 않은 기존 결함): 옛 확장이 등록된 상태에서 own-format 체크 목록(`<ul><li data-be-checked="true">`)을 붙여넣으면 옛 확장의 `jsonFromListElement`가 `data-be-checked`를 전혀 인식하지 않아 평범한 `bulletListItem`으로 떨어졌다(실측 RED로 확인). `io.importHtml`은 이미 이를 올바르게 인식하므로 확장 삭제만으로 자동 해소됐다.

## 검증

- RED(1단계, 옛 확장 존재 상태에서 새 시나리오만 먼저 작성): 12건 중 2건 실패 — "표 셀 안"(fixture 오류, 즉시 수정) 제외하면 "own-format 체크 목록"이 실제 결함으로 실패(`expected [] to have a length of 2 but got +0`).
- RED(2단계, 옛 확장 삭제 후 io 수정 전): "ol[start] 범위 밖" 1건 실패(`expected [] to have a length of 1 but got +0`), 나머지 11건 GREEN(own-format 체크 목록 포함 — 확장 삭제만으로 이미 해소).
- GREEN(io 범위 검증 추가 후): 12/12 전체 통과.
- `pnpm --filter @cp949/geul-io test`(전체) 64 files/520 tests passed(회귀 없음).
- `pnpm --filter @cp949/geul-core test`(전체) 94 files/1252 tests passed(1249 − 9(이관 삭제) + 12(신규 파일) = 1252, 회귀 없음).
- 양쪽 typecheck 통과, lint 발견 0건, format 발견 0건(2개 파일 자동 정렬 적용 후 재확인).
- 변이 검증 2건: (1) io 범위 검증을 되돌리면(`isStartNumberInRange` 우회) "범위 밖 start" 테스트가 계획대로 RED 재현. (2) `ClipboardPasteExtension`의 `handlePaste`가 실제 삽입 없이 무조건 `true`만 반환하도록 되돌리면 12건 중 9건이 RED로 무너져(own-format 체크 목록·production 왕복 포함) 새 테스트가 실제 경로를 검증함을 확인.

## 등록한 이슈

없음. Issue #38 완료 댓글은 roadmap(RD-001~006) 전체 완료 시점까지 보류한다(`_works/roadmap/roadmap.md` "전체 완료 조건").

## 남은 제한

- 체크박스 시각 UI(아이콘·클릭)는 RD-001 DELTA-02 결정대로 계속 범위 밖(저장·왕복 계층만).
- `ol`의 형제 scope 재시작, 외부 `<input type="checkbox">` 휴리스틱은 RD-005 제외 범위 그대로(Issue #113/#143 근거 유지).
- RD-006(전체 블록 타입 fixture-locked 통합 테스트 + e2e, io/core/e2e)만 남았다 — RD-001~005 전체 `DONE`으로 진입 조건은 충족됐으나 readiness probe는 아직 실행하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert fa09934`. 위험: 낮음 — io 1파일(순수 첨언, 함수 시그니처·공개 계약 변경 없음) + core 삭제 1파일·수정 8파일(전부 내부 확장 등록·주석·테스트), 공개 API 변경 없음. RD-006(미착수)만 이 결과를 소비할 예정이라 소비자 영향 없음.
