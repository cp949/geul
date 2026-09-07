# Issue #156 슬라이스4 RD-003 DELTA-04 — `FilePanel` `portalTarget`

## 목표

RD-003(`portalTarget` 5개 컴포넌트 공통 적용, `UI-013`)의 네 번째 DELTA. DELTA-01~03과 동일 계약을 `FilePanel`에 적용한다.

## 확정 커밋

- `7c90ae0` — feat(react): FilePanel portalTarget 지원(EXT-006/UI-013)

## 변경한 계약과 파일

- `packages/react/src/file-panel.tsx` — `FilePanelProps`(`portalTarget?: HTMLElement | null`) 신설, 조건부 `createPortal`.
- `packages/react/src/index.ts` — `FilePanelProps` 공개 export.
- `packages/react/test/file-panel.test.tsx` — 신규 top-level `describe` 2건.

## 검증

- RED: "지정하면 그 요소 하위에 렌더한다" 1건 구현 전 실패 확인.
- GREEN: 24개 테스트 전부 통과.
- `pnpm --filter @cp949/geul-react typecheck` clean.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-003 진행 상태

DELTA-04/05 완료. 남은 것은 `SlashMenu`(DELTA-05) 하나 — 완료되면 RD-003 완료 조건을 재대조한다.

## 등록한 이슈

없음.

## 게시

없음 — RD-003·roadmap 전체 미완료.

## 남은 위험

- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 7c90ae0`. 위험: 낮음 — 신규 optional prop, 기본값 동작 불변 확인.
