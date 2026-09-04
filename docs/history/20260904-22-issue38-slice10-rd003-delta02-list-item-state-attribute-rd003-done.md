# Issue #38 슬라이스 10 RD-003 DELTA-02 — production 목록류 상태 노출 attribute, RD-003 DONE

## 목표

roadmap-workflow RD-003(목록류 production 마커+상태 편입, io+core)의 두 번째이자 마지막 DELTA. `Production*ListItemExtension` 4개(bullet/numbered/check/toggle)가 `checked`/`startNumber`/`collapsed` 상태를 DOM에 노출하도록 `renderHTML`을 고치고, 실제 production 에디터가 만든 HTML을 `io.importHtml`에 통과시키는 통합 fixture로 DELTA-01(io)의 hand-authored fixture 가정을 실측 검증한다. 이 DELTA로 RD-003 완료 조건 1~4가 전부 실측 증거로 충족돼 RD-003이 `DONE`이다. RD-005(`ListPasteFallbackExtension` 폐기·목록 경로 통합 흡수)의 남은 진입 조건(RD-003 DONE)이 이제 충족됐다(RD-004는 이미 DONE).

## 확정 커밋

- `07c6e7c` — 목록류 production 마커를 own-content로 편입 (RD-003 DELTA-01, 같은 세션 앞 DELTA)
- `ccf867d` — 목록류 production 확장에 상태 노출 attribute 추가 (Issue #38 슬라이스 10, RD-003 DELTA-02, RD-003 DONE)

## 변경한 계약과 파일

DELTA-01(`07c6e7c`, io):

- `packages/io/src/html/sanitize-schema.ts` — `div` 허용 속성에 목록류 존재 마커 4개 + 상태 마커 3개 추가.
- `packages/io/src/html/import-html.ts` — `productionListItemType`(신규, div 마커 판정), `isOwnBoundaryTag`가 노드 전체를 받도록 변경, `buildProductionListItemBlock`(신규, `blocksFromSegments` 미경유 직접 구성).
- `packages/io/test/html-list-item-marker-import.test.ts`(신규, 10건, hand-authored fixture).

DELTA-02(`ccf867d`, core):

- `packages/core/src/production-editor-assembly.ts` — `ProductionNumberedListItemExtension`/`ProductionCheckListItemExtension`/`ProductionToggleListItemExtension`의 `renderHTML`이 상태를 `data-be-*` attribute로 노출(checked는 무조건, startNumber/collapsed는 값이 있을 때만).
- `packages/core/test/production-list-item-marker-round-trip.test.ts`(신규, 8건) — `createProductionEditor` 실제 렌더 DOM 통합 왕복.

## 구현 중 계획과 달랐던 사실

1. (DELTA-01) `buildProductionListItemBlock` 반환 타입을 전체 `Block` 유니온으로 두면 소비부 스프레드가 `TableBlock`과 충돌해 typecheck 오류 — 목록류 4개 Block 유니온으로 좁혀 해소.
2. (DELTA-01) 셀프 리뷰가 `textBlockPropsFromElement` 호출이 죽은 코드임을 발견해 제거(production div가 textColor 속성을 아직 허용하지 않는다).
3. (DELTA-02) `createProductionEditor`가 `onMount`에서 `ensureTrailingParagraphOnLoad`를 호출해 문서가 childless paragraph로 끝나지 않으면 매번 새 id로 trailing paragraph를 만든다 — fixture가 이를 명시적으로 포함하도록 재설계해 예측 불가능한 id 발급을 없앴다.

## 검증

- DELTA-01: RED 9 failed/1 passed → GREEN 10 passed. `pnpm --filter @cp949/geul-io test`(전체) 64 files/520 tests passed. 변이 검증 3건 검출 확인.
- DELTA-02: RED 4 failed/4 passed → GREEN 8 passed. `pnpm --filter @cp949/geul-core test`(전체) 94 files/1249 tests passed. `pnpm --filter @cp949/geul-io test` 재확인 520/520. 양쪽 typecheck·lint·format 발견 0건. 변이 검증 3건 검출 확인.
- RD-003 완료 조건 1~4 최종 재대조: 전부 실측 증거로 충족(`_works/roadmap/RD-003.md`).

## 등록한 이슈

없음. Issue #38 완료 댓글은 roadmap(RD-001~006) 전체 완료 시점까지 보류한다(`_works/roadmap/roadmap.md` "전체 완료 조건").

## 남은 제한

- 체크박스 시각 UI(아이콘·클릭)는 RD-003 범위 밖 그대로 — 저장·왕복 계층만 완성했다.
- 목록 컨테이너(own-export `<ul>/<ol>`) 인식, `ListPasteFallbackExtension` 삭제, 통합 라우팅 등록은 RD-005 범위다. RD-004가 남긴 "Tiptap `handlePaste` 등록 순서는 `extensions` 배열 선언의 역순" 지식을 RD-005가 반영해야 한다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert ccf867d`이어서 `git revert 07c6e7c`(역순). 위험: 낮음 — io 2파일 + core 1파일 확장(신규 분기·attribute 추가), 소비자는 RD-005(미착수)뿐.
