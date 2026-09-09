# Issue #65 항목 7 — 표 메뉴 canDelete 증가 방향 재렌더 트리거(qq-workflow)

## 목표

Issue #65(Issue #18 whole-branch 리뷰 후속) 항목 7을 해소한다 — 표 핸들 메뉴가 열린 채 대상 행/열 개수가 1개에서 2개 이상으로 늘어나도(대상 자신의 index는 그대로인 경로) Delete가 근거 없이 비활성인 채로 남던 문제를 막는다.

## 확정 커밋

- `bc3a5d8` — `fix(react): 표 핸들 메뉴가 열린 채 행/열이 늘어나면 Delete를 재활성화한다 (Issue #65)`(구현·회귀 테스트 1커밋, 재그룹화 불필요 — 단계-2·3 전 과정이 이미 한 커밋으로 정리됨)

## 조사

원 이슈 본문이 세운 "`table-layout:fixed`류 레이아웃에서 열 추가가 표 outer rect를 안 바꾼다"는 CSS 가설은 채택하지 않았다 — 실제 표 CSS(`packages/react/src/_editor.scss`)에 `table-layout` 선언이 없어(기본값 `auto`) 근거가 약했다. 대신 `table-handle-menu.test.tsx`의 기존 테스트 주석(감소 방향 실패 알림 테스트, Issue #65 항목3 세션이 이미 실측으로 남긴 것)이 실제 재현 경로를 이미 밝혀 두었다 — `EditorProvider`가 외부 `editor` prop(external ownership, Issue #160 R4 확장성 옵션)을 받으면 문서 변경에 `onChange` 재렌더가 걸리지 않는다. 이 경로에서 `TableHandles`는 문서 변경을 구독하지 않고, 유일한 감시자인 `reconcileMenuState`의 `MutationObserver`도 지금까지는 index 무효화만 보고 count 증가는 무시했다 — 이것이 "드문 경로"의 실체다.

## 변경

- `packages/react/src/table-handles.tsx` — `resolveMenuTargetIndex`(모듈 스코프 함수)의 반환 타입을 `number | null`에서 `{ index: number | null; count: number }`로 확장했다. 두 분기 모두 기존에 이미 `readTableRowIds`/`readTableColumnIds`로 `ids` 배열을 읽고 있어 그 반환값을 재사용해 `count`를 함께 돌려준다(새 DOM 읽기 없음). `reconcileMenuState`가 effect 인스턴스별 `knownCount` 클로저로 "대상 index는 그대로인데 count만 늘었다"를 감지해 기존 `setGeometryVersion` 카운터를 올려 강제 재렌더시킨다. 감소 방향은 건드리지 않았다.
- `packages/react/test/table-handle-menu.test.tsx` — 1행/1열 표에서 메뉴를 연 뒤 실제 `insertTableRow`/`insertTableColumn`으로 행/열이 늘어나면, 재조준 없이도 Delete가 재활성화됨을 확인하는 회귀 테스트 2건 추가.

## 검증

- RED(단계-2): 신규 테스트 2건이 구현 전 코드에서 `expected true to be false`(`deleteItem.disabled`)로 실패 → 구현 후 GREEN.
- 단계-3 결함 탐지(읽기 전용 subagent, `IMPL-REVIEW-01.md`): 확정 결함 0건. `knownCount` 클로저의 effect 생명주기 정합성, `setGeometryVersion`을 MutationObserver 콜백에서 부르는 안전성(기존 `setMenuState` 선례와 동일 패턴, 관찰 대상 서브트리 밖 렌더라 피드백 루프 없음), 새 테스트가 "재조준 없이 count만 증가" 경로를 실제로 격리해 검증함(외부 controller라 onChange 재렌더 경로 자체가 없음을 확인)을 모두 코드 추적·재실행으로 재확인했다.
- `pnpm --filter @cp949/geul-react test -- table-handle-menu`: 650 passed(45 files). `typecheck`, `pnpm lint`: 통과(메인 세션이 각각 독립 재실행, exit 0 확인).
- `pnpm verify` 전량(메인 세션이 직접 실행, exit 0): `Tasks: 7 successful, 7 total` / `Tasks: 11 successful, 11 total`, e2e(chromium+mobile) `209 passed`, lint·format·build·typecheck·package boundary·license 전부 통과.

## 남은 제한

count가 줄어드는 방향은 이번 범위 밖이다(이슈 원문이 "늘어나는 방향"만 명시) — 대상 자신은 살아있고 다른 행/열이 삭제돼 개수가 줄어도 `canDelete`가 즉시 재계산되지 않고 낡은(더 관대한) 값으로 남을 수 있다. 데이터 손실로 이어지지는 않는다 — 실제 삭제 명령이 `LAST_ROW`/`LAST_COLUMN`으로 거절되고 실패 알림이 뜨는 기존 흐름이 이를 흡수한다(이 diff 이전부터 있던 트레이드오프이며 새로 만들지 않았다). Issue #65의 나머지 항목(8 `disabled` 이유 미설명, 9 교차 통합 테스트 부재, 10 테스트 픽스처 4중 중복)은 이번 범위 밖으로 그대로 열려 있다.

## GitHub

- Issue #65 완료 댓글(항목 7만): `issuecomment-5608337199`
- Issue #65는 닫지 않았다 — 나머지 항목(8·9·10)이 별도 이슈로 분리되지 않은 채 남아 있어 이슈 트래커 종료 판단 기준("분리되지 않았으면 닫지 않는다")에 따른다.
- commit·`dev` ff-only merge 완료(단일 커밋, 재그룹화 불필요). push·tag·PR 생성은 수행하지 않았다.
