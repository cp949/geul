# Issue #156 슬라이스4 RD-003 DELTA-03 — `MediaToolbar` `portalTarget`

## 목표

RD-003(`portalTarget` 5개 컴포넌트 공통 적용, `UI-013`)의 세 번째 DELTA. DELTA-01/02와 동일 계약을 `MediaToolbar`에 적용한다.

## 확정 커밋

- `c3fb46f` — feat(react): MediaToolbar portalTarget 지원(EXT-006/UI-013)

## 변경한 계약과 파일

- `packages/react/src/media-toolbar.tsx` — `MediaToolbarProps`(`portalTarget?: HTMLElement | null`) 신설, 조건부 `createPortal`.
- `packages/react/src/index.ts` — `MediaToolbarProps` 공개 export.
- `packages/react/test/media-toolbar.test.tsx` — 신규 top-level `describe("MediaToolbar portalTarget(슬라이스4 RD-003 DELTA-03)", ...)` 2건. 기존 파일에 이름이 우연히 겹치는 `describe("MediaToolbar Replace 트리거(RD-003 DELTA-03)", ...)`(무관한 과거 roadmap의 RD-003)가 있어 혼동을 피하려 별도 top-level describe로 뒀다.

## 검증

- RED: "지정하면 그 요소 하위에 렌더한다" 1건 구현 전 실패 확인.
- GREEN: 40개 테스트 전부 통과.
- `pnpm --filter @cp949/geul-react typecheck` clean.
- `useDismissOnOutsideOrEscape`의 `allowSelectors`(`.geul-media-toolbar` 포함, `use-dismiss-on-outside-or-escape.ts:37-46`)는 `target.closest()`로 실제 DOM 조상을 검사해 portal 이동과 무관하게 그대로 동작함을 코드로 확인 — 별도 방어 불필요.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-003 진행 상태

DELTA-03/05 완료.

## 등록한 이슈

없음.

## 게시

없음 — RD-003·roadmap 전체 미완료.

## 남은 위험

- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert c3fb46f`. 위험: 낮음 — 신규 optional prop, 기본값 동작 불변 확인.
