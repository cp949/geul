# Issue #156 슬라이스6 RD-001 DELTA-03 — FormattingToolbar/LinkToolbar 가상 키보드 회피

## 목표

RD-001(mobile/touch 입력 지원, `UI-015`)의 세 번째 DELTA. `useClampedMenuPosition`이 `visualViewport`(가용 시)를 기준으로 clamp해, 모바일 가상 키보드가 뜬 상태에서도 FormattingToolbar·LinkToolbar가 화면 밖(키보드 뒤)으로 밀려나지 않게 한다(roadmap 그릴링 결정 — spec §9.2는 완료 조건 문장으로만 명시, 구현 방식은 이번 roadmap이 원본).

## 확정 커밋

- `444226d` — feat(react): useClampedMenuPosition에 visualViewport 클램프 추가

## 변경한 계약과 파일

- `packages/react/src/use-clamped-menu-position.ts` — `view.visualViewport`가 있으면 그 `offsetLeft`/`offsetTop`/`width`/`height`로 clamp 경계(`bounds`)를 계산(없으면 기존 `innerWidth`/`innerHeight` 폴백 그대로), 같은 `useLayoutEffect` 안에서 `visualViewport.addEventListener("resize"/"scroll", clampToViewport)` 등록·언마운트 시 해제.
- `packages/react/test/use-clamped-menu-position.test.tsx` — `stubVisualViewport`/`notifyVisualViewport` 헬퍼(전 세션에서 스캐폴딩만 커밋 안 된 채로 존재)를 실제로 쓰는 신규 테스트 3건: visualViewport 경계 기준 clamp, `resize` 이벤트 재클램프, 언마운트 시 리스너 해제.

8개 소비자(TableHandleMenu, TableCellFormatMenu, SlashMenu, BlockSideMenu, FormattingToolbar, TableSelectionToolbar, LinkToolbar, BlockSideMenu 사이드 버튼)가 같은 훅을 공유해 전부 자동 적용된다.

## 구현 중 발견·수정

언마운트 테스트 초안은 `stub.listeners.resize`가 `unmount()` 후 길이 0인지만 확인했다 — 구현 전에도 리스너를 애초에 등록 안 하므로 공허하게 통과하는 약한 assertion이었다. `unmount()` 호출 전에 `listeners.resize.length > 0`(등록됐음)을 먼저 확인하도록 보강해 실제로 해제를 증명하게 했다.

## 검증

- RED: 신규 테스트 3건 모두 구현 전 실패 확인(언마운트 테스트는 보강 후 재확인).
- GREEN: `pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/use-clamped-menu-position.test.tsx` 15 passed(기존 12 + 신규 3, 회귀 없음).
- Mutation 확인(메인 세션 직접, subagent 없음) 2건:
  - `bounds`를 항상 `innerWidth`/`innerHeight` 폴백으로 고정 → 신규 테스트 2건 RED(완료 조건 1) → 원복.
  - `visualViewport.addEventListener` 등록을 삭제 → resize 재클램프·언마운트 해제 테스트 2건 RED(완료 조건 2·4) → 원복(`diff` 없음으로 원복 확인).
- `pnpm --filter @cp949/geul-react typecheck` clean(`noUncheckedIndexedAccess`로 인한 타입 에러 1건을 `stub.listeners.resize ?? []`로 해결).
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-001 진행 상태

DELTA-03 완료. 남은 것은 DELTA-04(MediaResizeHandles touch e2e).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스6, RD-001)가 미완료라 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- 실제 브라우저 가상 키보드 e2e 검증은 범위 밖(Playwright가 실제 OS 가상 키보드를 띄우지 못함, RD-001-DELTA-03.md에 이미 명시) — unit 테스트의 `visualViewport` 시뮬레이션이 유일한 자동 검증이다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 444226d`. 위험: 낮음 — `visualViewport` 없는 환경(기존 e2e 전체 포함)은 기존 `innerWidth`/`innerHeight` 폴백 경로를 그대로 타 회귀가 없다(신규 테스트 3건 + 기존 12건 GREEN으로 검증).
