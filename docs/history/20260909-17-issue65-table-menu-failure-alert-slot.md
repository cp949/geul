# Issue #65 항목 3 — 표 메뉴 실패 알림 위치(qq-workflow)

## 목표

Issue #65(Issue #18 whole-branch 리뷰 후속) 항목 3을 해소한다 — `table-handle-menu.tsx`의 `role="alert"`가 메뉴 첫 항목이라, 실패 직후 같은 화면 좌표를 재클릭하면 알림이 밀어낸 다른 항목(예: "Insert row below")을 맞출 수 있는 결함을 막는다.

## 확정 커밋

- `e3544dc` — `fix(react): 표 메뉴 실패 알림을 항목 뒤 고정 슬롯으로 옮긴다 (Issue #65)`(1차 구현·단계-3 결함 수정 2커밋을 재그룹화)
- `28135cd` — `docs(guides): G-UI-001에 스크롤 overlay 보조 요소 sticky 겹침 규칙을 추가한다`(단계-4 가이드 정비)

## 변경

- `packages/react/src/table-handle-menu.tsx`, `packages/react/src/table-cell-format-menu.tsx` — 실패 알림(`actionError`)을 항목·구분선·색상 팔레트 뒤로 옮기고, 항목·색상 팔레트를 `.geul-menu-panel__scroll` 래퍼로 감쌌다. 이슈 원문은 `table-handle-menu.tsx`만 명시하지만, `table-cell-format-menu.tsx`도 같은 `useTableCommandFeedback`+`geul-menu-panel`+`geul-menu-error` 구조를 공유해 동일 결함이 있어 함께 고쳤다(사용자 확인).
- `packages/react/src/_menu-shared.scss` — `.geul-menu-panel--with-footer`(overflow-y: hidden)와 `.geul-menu-panel__scroll`(flex: 1 1 auto, 실제 스크롤 컨테이너)을 신설해 패널을 flex 2단으로 나눴다. 알림은 스크롤 컨테이너 밖 형제로 둬 배타적 공간을 갖는다. `.geul-menu-panel` 자체(다른 소비자 `formatting-toolbar.tsx`와 공유)는 건드리지 않았다.
- `packages/react/test/table-handle-menu.test.tsx`, `packages/react/test/table-cell-format-menu.test.tsx` — 알림이 DOM 순서상 메뉴 항목 뒤에 옴을 확인하는 회귀 테스트 추가.
- `e2e/table-handle.spec.ts` — (1) 실패 유발 전/후 다른 메뉴 항목의 화면 좌표가 그대로 유지되고 그 좌표 재클릭이 여전히 그 항목에 맞아떨어짐, (2) 메뉴가 실제로 스크롤되는 뷰포트에서 스크롤 전(scrollTop=0) 상태에도 뷰포트 하단에 걸린 콘텐츠가 알림에 가려지지 않음(`elementFromPoint`)을 확인하는 시나리오 2건 추가.
- `docs/guides/G-UI-001-build-dismissible-overlays.md` — "스크롤되는 overlay 안 보조 요소는 `position: sticky`로 스크롤 콘텐츠와 겹치게 하지 말고 flex column 2단으로 분리한다"는 규칙 추가(단계-3이 드러낸 빠진 문구).

## 검증

- RED(단계-2, 1차 구현): 두 컴포넌트 단위 테스트에서 "실패 알림이 항목 뒤" DOM 순서 단언 실패 → alert를 항목 뒤로 옮긴 뒤 GREEN. e2e는 소스를 되돌려 재클릭 좌표 어긋남(27px, 알림 높이만큼)으로 RED → 되돌리기 해제 후 GREEN.
- 단계-3 결함 탐지(읽기 전용 subagent, `IMPL-REVIEW-01.md`): 1차 구현(`.geul-menu-error`에 `position: sticky; bottom: 0`)에서 BLOCKER 1건(메뉴가 실제로 오버플로되는 상태에서 sticky alert가 스크롤되는 마지막 콘텐츠 위에 겹쳐 클릭을 가로챔) + MAJOR 1건(1차 e2e가 그 오버플로 상황 자체를 피하도록 설계돼 결함을 못 잡음) 발견. 메인 세션이 실제 Chromium에서 `scrollHeight - clientHeight = 64px`(진짜 오버플로)와 `scrollTop=0` 상태의 `elementFromPoint` 결과(`role="alert"`)로 재확인해 CONFIRMED 판정.
- 수정: flex column 2단 분리로 교체. 소스에 같은 결함을 임시로 재주입해(alert를 스크롤 컨테이너 안으로 되돌리고 sticky 복원) 신규 e2e가 `Expected: not "alert"`로 RED가 남을 확인한 뒤 되돌려 GREEN 재확인.
- `pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/table-handle-menu.test.tsx test/table-cell-format-menu.test.tsx`: 45 passed. `typecheck`, `pnpm lint`: 통과(1차 실행에서 prettier 서식 경고 1건 → `--write` 후 통과).
- `pnpm exec playwright test e2e/table-handle.spec.ts --project=chromium`: 19 passed(기존 18건 + 신규 오버플로 가림 회귀 1건).
- `pnpm verify` 전량(메인 세션이 직접 실행, exit 0): unit `Test Files 313 passed (313)` / `Tests 3545 passed (3545)`, e2e(chromium+mobile) `209 passed`, lint·format·build·typecheck·package boundary·license 전부 통과.

## 남은 제한

Issue #65의 나머지 항목(4 자동 닫힘 초점 이동, 7 `canDelete` 증가 방향 미반영, 8 `disabled` 이유 미설명, 9 교차 통합 테스트 부재, 10 테스트 픽스처 4중 중복)은 이번 범위 밖으로 그대로 열려 있다. `table-cell-format-menu.tsx`도 같은 CSS 구조로 고쳤지만, 오버플로 가림 회귀 e2e는 `table-handle-menu.tsx` 것 하나만 추가했다 — 같은 클래스(`.geul-menu-panel--with-footer`/`.geul-menu-panel__scroll`)를 공유하므로 별도 이슈로 등록할 기준(게이트 구멍)에는 못 미친다고 판단했다. 이슈는 닫지 않았다.

## GitHub

- Issue #65 완료 댓글(항목 3만): `issuecomment-5603413311`
- Issue #65는 닫지 않았다 — 나머지 항목이 별도 이슈로 분리되지 않은 채 남아 있어 이슈 트래커 종료 판단 기준("분리되지 않았으면 닫지 않는다")에 따른다.
- commit·`dev` ff-only merge 완료(재그룹화 2커밋 → 1커밋 + 가이드 정비 1커밋). push·tag·PR 생성은 수행하지 않았다.
