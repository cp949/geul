# Issue #38 슬라이스 8 RD-003 DELTA-01 — 서식 툴바 인라인 색상 팔레트

## 목표

roadmap-workflow RD-003(React UX)의 첫 DELTA. RD-002가 공개한 인라인 색상 명령 2개(`toggleInlineTextColor`/`toggleInlineBackgroundColor`)를 서식 툴바(`FormattingToolbar`)에서 실제로 호출하는 UI를 추가한다.

## 확정 커밋

- `c9f0d5e` — react 서식 툴바 인라인 색상 팔레트 추가 (Issue #38 슬라이스 8, RD-003 DELTA-01)

## 변경한 계약과 파일

- `packages/react/src/formatting-toolbar.tsx`: 기존 5개 mark 토글 버튼 뒤에 "Text color"(`Baseline` 아이콘)·"Background color"(`PaintBucket` 아이콘) 트리거 2개를 추가. 트리거 클릭 시 그 property의 8색 + None 팔레트(`role="menu"`, `TableCellColorPalettes.renderPalette`와 동형 마크업 — `TABLE_TEXT_COLORS`/`TABLE_BACKGROUND_COLORS`(`table-cell-colors.ts`) 값, `geul-menu-panel`/`geul-menu-swatch`/`geul-menu-palette`/`geul-menu-section-label`(`_menu-shared.scss`, 이미 `styles.scss`가 전역 `@use`) 클래스 재사용, 신규 scss 없음)이 뜬다. 스와치 클릭은 `toggleInlineTextColor`/`toggleInlineBackgroundColor(color | null)`을 호출하고 팔레트를 닫는다. 바깥 클릭·Escape·재클릭 닫기는 `useDismissOnOutsideOrEscape`+`useClampedMenuPosition`+`useFocusEditor`(모두 기존 훅, `block-side-menu.tsx`/`table-cell-format-menu.tsx`와 같은 계약, `G-UI-001`)로 구현했다. `updateFromSelection`의 selection-collapsed 조기 반환 분기에 `setColorMenuState(null)`을 추가해, 툴바가 숨었다 다시 뜰 때 이전 세션의 팔레트가 재등장하지 않게 했다. 반환 JSX를 단일 `<div role="toolbar">`에서 Fragment로 바꿔 팔레트 패널을 그 형제 `position: fixed` 요소로 뒀다(`role="toolbar"` 접근성 트리 안에 `role="menu"` 자식을 두지 않기 위해).
- 테스트(수정): `packages/react/test/formatting-toolbar.test.tsx` — `fakeController`에 `toggleInlineTextColor`/`toggleInlineBackgroundColor` mock 추가, 기존 아이콘 렌더링 테스트에 두 트리거 항목 추가, `describe("인라인 색상 팔레트", ...)` 신규(팔레트 열기·스와치 클릭→명령 호출+닫힘·재클릭 닫기·트리거 전환·Escape·바깥 클릭·selection collapse 시 동반 닫힘 8건).

## 검증

- TDD RED→GREEN: 신규 8개 테스트(+아이콘 테스트 수정분)가 트리거 버튼 부재로 전부 실패하는 것을 확인한 뒤 구현. 계획한 설계가 첫 시도에 그대로 통과(정정 없음 — 상세는 아래 "완료 조건 4 서술 정정" 참고).
- `pnpm --filter @cp949/geul-react test`(29 files, 399/399 — 기존 391 + 신규 8), `pnpm --filter @cp949/geul-react typecheck` — 통과.
- `pnpm --filter @cp949/geul-model test`(337/337)·`pnpm --filter @cp949/geul-io test`(449/449)·`pnpm --filter @cp949/geul-core test`(1145/1145) — 전부 무변경 확인.
- 루트 `pnpm typecheck`(전체 10 task, `@cp949/geul-react:build` 포함) — 전부 통과.
- 변경 파일 `eslint` — 0 findings.
- 단일 커밋이라 재그룹화 대상 없음. 백업 ref·트리 diff 재대조(빈 출력) 후 ff-only 병합.
- 계획 서술 정정 하나: `result/RD-003-DELTA-01.md` 완료 조건 4("재클릭 닫기")는 "트리거를 allowSelectors에 넣으면 바깥 pointerdown이 먼저 팔레트를 지우는 레이스가 안 생긴다"는 근거로 그 레이스 회귀도 잡는다고 적었지만, 구현 테스트는 `fireEvent.click`만 쓰고 jsdom의 `fireEvent.click`은 `pointerdown`을 합성하지 않는다 — 이 unit 테스트는 재클릭 토글-닫힘 의미만 고정하고, `allowSelectors` 누락이 만드는 실제 pointerdown 레이스는 재현하지 않는다. 코드 쪽 방어 자체는 계획대로 구현했고 실제 브라우저 이벤트 순서(pointerdown→click)에서 유효하다 — 그 회귀 검출은 DELTA-03의 Chromium e2e가 맡는다(상세는 `result/RD-003-DELTA-01.md` "## 결과").
- RD-003 완료 조건 갱신(roadmap-workflow "경량 DELTA 사이클" 9단계): 조건 1(인라인 팔레트 클릭 적용·해제)을 이 DELTA가 충족 — 근거는 `RD-003.md`. 조건 2·3(블록 메뉴 색상·정렬, table/divider/codeBlock 비노출)은 DELTA-02, 조건 4(e2e)는 DELTA-03이 남긴다 — RD-003은 계속 `ACTIVE`다.

## 등록한 이슈

- 완료 댓글: 게시하지 않음 — RD-003이 아직 `ACTIVE`(완료 조건 4개 중 1개만 충족)라 DELTA 단위 GitHub 게시 대상이 아니다(RD-001/RD-002 DELTA들과 같은 기준, RD 완료 시점에만 게시).
- 범위 밖 신규 이슈 등록 없음 — 가이드·pitfall 갭 없음(기존 `G-UI-001`/`G-TST-001` 그대로 적용).

## 남은 제한

- 블록 메뉴 색상·정렬 섹션(`block-side-menu.tsx`)은 DELTA-02, Chromium e2e는 DELTA-03이 남긴다.
- 팔레트가 열린 상태에서 페이지 스크롤이 일어나면 트리거 위치가 바뀌어도 팔레트 위치는 재계산되지 않는다 — `TableCellFormatMenu`/`TableHandleMenu`도 같은 한계를 가진 기존 패턴이라 이 DELTA가 새로 만든 문제는 아니다. 낮은 우선순위, e2e에서 실제로 문제가 관측되면 그때 고친다.
- 현재 활성 색상(스와치 하이라이트)은 표시하지 않는다 — RD-002가 노출한 5개 명령에 색상 조회 query가 없고 RD-003 완료 조건에도 이 요구가 없다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 1개를 `dev`에서 `git revert`한다. 위험: 낮음 — `FormattingToolbar` 컴포넌트 안에서 완결된 UI 추가만이라 다른 컴포넌트·core·model 계약을 바꾸지 않는다.
