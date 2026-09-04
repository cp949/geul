# Issue #38 슬라이스 10 RD-003 DELTA-01 — 목록류 production 마커 own-content 편입

## 목표

roadmap-workflow RD-003(목록류 production 마커+상태 편입, io+core)의 첫 DELTA(io만). 생산 편집기 in-editor copy가 만드는 목록류 4종(bulletListItem/numberedListItem/checkListItem/toggleListItem)의 실제 렌더 DOM(`div[data-be-bullet-list-item]` 등, `ul`/`li`가 아니다)을 `io.importHtml`이 own-content로 인식해 대응 블록 타입으로 반영하고, 상태 attribute(`data-be-checked`/`data-be-start-number`/`data-be-collapsed`)가 있으면 그 값을, 없으면 model 기본값을 반영한다. RD-003 자체는 core 쪽 상태 노출 attribute 추가 + 통합 fixture(DELTA-02)가 남아 아직 `DONE`이 아니다.

## 확정 커밋

- `07c6e7c` — 목록류 production 마커를 own-content로 편입 (Issue #38 슬라이스 10, RD-003 DELTA-01)

## 변경한 계약과 파일

- `packages/io/src/html/sanitize-schema.ts` — `div` 허용 속성에 존재 마커 4개(`dataBeBulletListItem`/`dataBeNumberedListItem`/`dataBeCheckListItem`/`dataBeToggleListItem`) + 상태 마커 3개(`dataBeChecked`/`dataBeStartNumber`/`dataBeCollapsed`) 추가.
- `packages/io/src/html/import-html.ts`:
  - `ProductionListItemType`·`productionListItemMarkerProperty`·`productionListItemType`(신규) — div 마커 존재만으로(값은 항상 빈 문자열) 목록류 4타입을 판정한다.
  - `isOwnBoundaryTag`가 tagName 대신 노드 전체를 받도록 시그니처 변경 — 목록류는 전부 `div` 태그라 tagName만으로는 wrapper div와 구분할 수 없다. 호출부 2곳(`findChildrenWrapper`의 1-child·2-child 분기) 갱신.
  - `buildProductionListItemBlock`(신규) — `findChildrenWrapper`가 넘긴 own-content div를 목록 블록으로 직접 구성한다. `blocksFromSegments`(범용 `segmentBlocks`)를 거치지 않는다 — 그 정책은 tagName 기반이라 generic div를 항상 paragraph로만 보고 목록류 4타입을 낼 수 없다(readiness probe에서 실측 확인). li 기반 `blocksFromListItem`, `<details>` 기반 `findDetailsWrapper` 소비부와 같은 "own-format은 직접 구성" 패턴.
  - `blocksFromNodes`의 `findChildrenWrapper` 소비 지점 — 목록류면 위 함수로, 아니면 기존 `blocksFromSegments` 경로로 분기.
  - id 우선순위·children 결합은 RD-002 wrapper 편입과 동일 계약을 재사용(own-content 자신에 id 없으면 바깥 wrapper id로 보충, 중첩은 children으로 보존).
- `packages/io/test/html-list-item-marker-import.test.ts`(신규) — 10건. bulletListItem/numberedListItem(기본·명시 startNumber)/checkListItem(기본·true·false)/toggleListItem(기본·collapsed=true), block-group 안 부모+자식 중첩(상태 포함), 마커 없는 임의 div 오인식 방지.

## 구현 중 계획과 달랐던 사실

1. `buildProductionListItemBlock`의 반환 타입을 처음엔 `Document["blocks"][number]`(전체 `Block` 유니온)로 뒀더니 소비부의 `{...ownBlock, children}` 스프레드가 `TableBlock`까지 유니온에 섞여 `children` 필드 부재로 타입 오류(`pnpm --filter @cp949/geul-io typecheck` 실측) — 반환 타입을 목록류 4개 Block 유니온으로 좁혀 해소.
2. 셀프 리뷰에서 `textBlockPropsFromElement(ownNode)` 호출이 죽은 코드임을 발견해 제거했다 — `div` 허용 속성에 textColor 3종을 올리지 않아 항상 `{}`만 반환했다(TextBlockProps는 이 DELTA 범위 밖, production 확장이 아직 노출하지 않는다).

## 검증

- RED: `pnpm --filter @cp949/geul-io test -- html-list-item-marker-import` → 9 failed / 1 passed(구현 전).
- GREEN: 같은 명령 10 passed.
- `pnpm --filter @cp949/geul-io test`(전체) → 64 files / 520 tests passed(회귀 없음, 기존 own-format `html-check-list-item-import.test.ts`·`html-toggle-import.test.ts` 재실행 포함).
- `pnpm --filter @cp949/geul-io typecheck` → 통과.
- `npx eslint`·`npx prettier --check`(변경 파일 3개) → 발견 0건.
- 변이 검증 3건 모두 계획대로 검출 확인 후 원상 복구: 마커 판정 항상 미인식(9건 실패), `checked` 비교 반전(checkListItem 관련 4건 실패), children 병합 비활성화(신규 1건 + RD-002 회귀 6개 파일 16건 실패 — 공유 로직).

## 등록한 이슈

없음. Issue #38 완료 댓글은 roadmap(RD-001~006) 전체 완료 시점까지 보류한다(`_works/roadmap/roadmap.md` "전체 완료 조건").

## 남은 제한

- RD-003은 이 DELTA로 `DONE`이 아니다 — DELTA-02(core 상태 노출 attribute + 통합 fixture)가 남았다. 완료 조건 1~3은 아직 `<미충족>`(io 쪽만 hand-authored fixture로 충족), 조건 4(기존 own-format 회귀 PASS)만 이 DELTA로 충족.
- 존재 마커(`data-be-bullet-list-item` 등)는 core가 이미 내고 있어 실제 production DOM과의 통합 위험은 낮다. 상태 마커(`data-be-checked` 등)는 core가 아직 내지 않아 DELTA-02 전까지 실제로 동작하지 않는다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 07c6e7c`. 위험: 낮음 — `io` 패키지 내부 2파일 확장(신규 분기 추가, 기존 경로는 회귀 스위트로 무변경 확인)과 신규 테스트 파일 1개뿐, 소비자 없음(RD-003 DELTA-02·RD-005 미착수).
