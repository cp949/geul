# Issue #156 슬라이스4 RD-001 DELTA-03 — `MediaToolbar` `component` override

## 목표

RD-001의 세 번째 DELTA. DELTA-01/02와 동일 계약을 `MediaToolbar`에 적용한다.

## 확정 커밋

- `ae11582` — feat(react): MediaToolbar component override 지원(EXT-006/EXT-007)

## 변경한 계약과 파일

- `packages/react/src/media-toolbar.tsx` — `MediaToolbarProps`에 `component` 필드 추가, `mode === "closed"` 게이트 직후 조기 return 분기.
- `packages/react/test/media-toolbar.test.tsx` — 신규 top-level `describe("MediaToolbar component override(슬라이스4 RD-001 DELTA-03)", ...)` 2건.

## 검증

- RED: "지정하면 소비자 컴포넌트가 렌더되고 editor를 받는다" 1건 구현 전 실패 확인.
- GREEN: 42개 테스트 전부 통과.
- `pnpm --filter @cp949/geul-react typecheck` clean.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-001 진행 상태

DELTA-03/04 완료. 남은 것은 FilePanel 하나.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체 미완료.

## 남은 위험

- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert ae11582`. 위험: 낮음 — 신규 optional prop, 기본값 동작 불변 확인.
