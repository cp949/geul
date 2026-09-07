# Issue #156 슬라이스4 RD-003 DELTA-02 — `LinkToolbar` `portalTarget`

## 목표

RD-003(`portalTarget` 5개 컴포넌트 공통 적용, `UI-013`)의 두 번째 DELTA. DELTA-01과 동일 계약을 `LinkToolbar`에 적용한다.

## 확정 커밋

- `209e9b4` — feat(react): LinkToolbar portalTarget 지원(EXT-006/UI-013)

## 변경한 계약과 파일

- `packages/react/src/link-toolbar.tsx` — `LinkToolbarProps`(`portalTarget?: HTMLElement | null`, 기본값 `null`) 신설. 반환 JSX를 `content`로 추출하고 조건부 `createPortal`로 감쌌다.
- `packages/react/src/index.ts` — `LinkToolbarProps` 공개 export.
- `packages/react/test/link-toolbar.test.tsx` — `describe("portalTarget", ...)` 2건 추가.

## 검증

- RED: "지정하면 그 요소 하위에 렌더한다" 1건 구현 전 실패 확인. "미지정 시 기존 위치" 1건은 characterization이라 이미 통과.
- GREEN: 14개 테스트 전부 통과.
- `pnpm --filter @cp949/geul-react typecheck` clean. 패키지 전체 테스트는 DELTA-01이 이미 이 세션에서 1회 실행해 반복하지 않았다(ff-workflow 트랙-4 규칙).
- 재그룹화: 단일 커밋이라 cherry-pick 없이 `git merge --ff-only`로 바로 이전.

## RD-003 진행 상태

DELTA-02/05 완료. 완료 조건은 5개 DELTA가 모두 끝나야 판정한다 — 아직 미충족.

## 등록한 이슈

없음.

## 게시

없음 — RD-003·roadmap 전체 미완료.

## 남은 위험

- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 209e9b4`. 위험: 낮음 — 신규 optional prop, 기본값 동작 불변 확인.
