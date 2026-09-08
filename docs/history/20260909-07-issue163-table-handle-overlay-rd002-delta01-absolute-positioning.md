# Issue #163 표 핸들 오버레이 뷰포트 도달성 RD-002 DELTA-01 — position: absolute 전환

## 목표

roadmap-workflow RD-002(오버레이 6종 뷰포트 도달성 확보)의 첫 실행 DELTA. 표 핸들 오버레이 6종(행/열 재정렬 핸들, 열 리사이즈 스트립, 행/열 확장 버튼, indent/outdent 버튼)의 CSS `position`을 `fixed`→`absolute`로 바꾸고 `table-handle-geometry.ts`의 좌표 계산을 page-relative(`rect + window.scrollX/scrollY`)로 갱신해 앞선 그릴링 세션이 확정한 ADR-0012·`G-UI-003`을 코드에 반영한다.

## 확정 커밋

- `81c8544` — fix(table-handle): 오버레이 6종을 position: absolute + page-relative 좌표로 전환
- `2fdcfd5` — test(table-format): Add row 버튼 Tab 포커스 테스트를 스크롤 수정 확인으로 전환

## 변경한 계약과 파일

- `packages/react/src/table-handle-geometry.ts`: `readPageRect(element)` 신설, `readRowBoxes`·`readTableGeometry`가 사용.
- `packages/react/src/table-handle-overlays.tsx`: inline `style.position` 6곳 `fixed`→`absolute`.
- `packages/react/src/_table-handles.scss`: `.geul-table-resize-handle`·`.geul-table-reorder-guide` `fixed`→`absolute`.
- `packages/react/src/table-handle-helpers.ts`: `computeReorderTargetIndex` 좌표 파라미터 `clientX/clientY`→`pageX/pageY`(계약 문서화), `computeMenuPosition`이 스크롤 오프셋을 받아 page-relative geometry를 viewport-relative로 되돌리도록 갱신.
- `packages/react/src/table-handles.tsx`: Issue #15 레이아웃 보정 비교를 `readPageRect` 기반으로 통일, `handleReorderMove`가 `event.pageX/pageY` 사용, `computeMenuPosition` 호출에 스크롤 오프셋 전달, 스크롤 강제 재렌더 리스너를 메뉴가 열려 있을 때만으로 좁힘(resize 리스너는 유지).
- `packages/react/test/table-handle-geometry.test.ts`, `table-handles.test.tsx`: 신규 단위 테스트(스크롤 오프셋 page-relative 반환, 오버레이 4종 `style.position === "absolute"`).
- `e2e/table-format.spec.ts`: RD-001 DELTA-01이 추가한 characterization("Tab 포커스 이동해도 화면 밖에 남는다")을 이번 수정으로 뒤집힌 실제 동작에 맞춰 회귀 방지 테스트로 전환(제목·assertion 갱신, 헬퍼·구조는 그대로).

공개 계약(패키지 export shape) 변경 없음 — `TableHandles` 컴포넌트 시그니처·동작 계약은 그대로다.

## 검증

- `pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/table-handle-geometry.test.ts test/table-handles.test.tsx test/table-handle-menu.test.tsx` — 58/58 통과.
- `pnpm --filter @cp949/geul-react test`(패키지 전체, 이 세션에서 첫 실행) — 45 파일 629/629 통과.
- `pnpm --filter @cp949/geul-react typecheck` — clean.
- `pnpm exec playwright test e2e/table-format.spec.ts --project=chromium` — 20/20 통과.
- `pnpm exec playwright test e2e/table-handle.spec.ts --project=chromium`(이 세션에서 첫 실행, Issue #15 회귀 포함) — 14/14 통과.
- `grep -n "position: fixed" packages/react/src/_table-handles.scss packages/react/src/table-handle-overlays.tsx` — 빈 출력.
- `pnpm exec prettier --check`·`eslint` — clean.

## 발견과 처리(메인 세션 직접 검증, DELTA 규모상 subagent dispatch 없이 진행)

계획 단계에서 코드를 직접 읽고 문서(RD-002.md·progress.md)가 예고하지 않은 결합 2건을 발견해 이 DELTA 안에서 같이 고쳤다(둘 다 새 사용자 결정이 필요한 범위 확장이 아니라 page-relative 전환이 요구하는 구현 세부로 판단):

1. `table-handles.tsx`의 Issue #15 레이아웃 보정 `useLayoutEffect`가 `table.getBoundingClientRect()`(viewport-relative)와 page-relative가 된 `geometry`를 직접 비교하고 있었다 — 방치하면 스크롤이 있는 페이지에서 매 렌더 무한 재렌더가 났을 것이다. `readPageRect`로 통일해 해소.
2. 행/열 옵션 메뉴(`table-handle-menu.tsx`, G-UI-001 dismissible/clamp 대상이라 오버레이 6종에 포함 안 됨)가 같은 `geometry`로 앵커 좌표를 계산해 `useClampedMenuPosition`(뷰포트 기준 clamp, `position: fixed` 유지)에 넘긴다 — `computeMenuPosition`이 스크롤 오프셋을 받아 다시 viewport-relative로 되돌리도록 바꾸고, 기존 e2e("메뉴를 연 채 스크롤해도 메뉴가 핸들 위치를 따라간다")와 단위 테스트("스크롤하면 메뉴 위치가 갱신된 핸들 geometry를 따라간다")로 회귀 없음을 확인했다.

BLOCKER·MAJOR·MINOR 0건(전체 diff의 좌표 비교 지점 전수 grep으로 확인).

## RD-002.md 완료 조건 대조

- 조건 1(오버레이 6종 도달성): 코드 전환은 완료됐으나 6종 전체의 실측 증거는 아직 Add row 버튼 1종(위 e2e)뿐이다 — 미체크 유지.
- 조건 2(회귀 e2e): 위 e2e 1건이 기여했으나 "우회 처리된 두 테스트" 복원은 DELTA-02 몫 — 미체크 유지.
- 조건 3(`QA-056` 갱신): 미착수 — DELTA-02 몫.

`RD-002.md`의 "예상 DELTA" DELTA-01 체크박스만 이 DELTA로 체크했다.

## roadmap(Issue #163) 상태

`_works/roadmap/roadmap.md` 진행 표는 RD-001 `DONE`, RD-002 `ACTIVE`로 갱신(이 DELTA로 DELTA 사이클 착수). `_works/roadmap/progress.md`에 이번 실행을 append했다.

## 등록한 이슈

없음. `media-resize-handles.tsx`의 동일 결함(RD-002.md "결정"에서 이미 범위 제외 기록됨)은 이번 실행에서 새로 이슈화하지 않았다 — 그릴링 세션의 결정("사용자 별도 지시가 있을 때만")을 유지한다.

## 게시

`_works/roadmap/pending-issues/01.md`(상태: 미등록)에 RD-002 DELTA-01 진행 내용을 추가했다. 게시는 사용자 확인 후 수행한다(roadmap-workflow DELTA 사이클은 qq 단계-4·ff 트랙-8과 달리 게시 무확인 예외 대상이 아님 — RD-001 DELTA-01 완료 시 세운 선례를 따름).

## 남은 위험

- 재정렬 드래그 히트테스트(`computeReorderTargetIndex`)의 `pageX/pageY` 좌표계 통일은 소스 리뷰로만 확인했다 — jsdom `MouseEvent.pageX/pageY`가 `clientX/clientY`를 그대로 반환하는 미구현 상태(jsdom 30)라 유닛 테스트로 RED 고정이 불가능하고, 이 DELTA의 chromium e2e도 스크롤 없는 환경(`scrollY=0`)이라 이 좌표계 차이를 구분하지 못한다. 실제 스크롤 상태에서의 재정렬 드래그 정확성은 DELTA-02가 추가할 "신규 회귀 e2e"의 다음 후보로 남긴다.
- Firefox/WebKit·mobile 교차 검증은 하지 않았다(RD-002.md 결정 — 구현 후 최종 회귀에서 확인).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.
- RD-002 완료 조건 1~3(6종 전체 실측·회귀 e2e 복원·`QA-056` 갱신)은 DELTA-02가 남아 있다.

## rollback

`git revert 2fdcfd5 81c8544`(순서대로). 위험: 낮음 — `packages/react/src` 내부 좌표계·CSS 변경뿐, 공개 계약이나 다른 패키지에 영향 없음. 되돌리면 Issue #163의 원 결함(네이티브 scroll-into-view no-op)이 재현된다.
