# Issue #156 슬라이스4 RD-001 DELTA-01 — `FormattingToolbar` `component` override

## 목표

RD-001(최상위 오버레이 4종 `component` override prop, `EXT-006`/`EXT-007`)의 첫 DELTA. `FormattingToolbar`에 `component?: FC<{ editor: EditorController }>` prop을 추가한다.

착수 전 사용자 확인(2026-09-07, `AskUserQuestion`): `component` override payload 3안(editor만 / 계산된 상태 전체 / 완전 위임) 중 "editor만 전달" 채택 — `_works/roadmap/roadmap.md` "`component` override payload" 결정 참고.

## 확정 커밋

- `230b82e` — feat(react): FormattingToolbar component override 지원(EXT-006/EXT-007)

## 변경한 계약과 파일

- `packages/react/src/formatting-toolbar.tsx` — `FormattingToolbarProps`(RD-003 DELTA-01이 만든 타입)에 `component?: FC<{ editor: EditorController }>` 필드 추가. `toolbarState === null` 게이트 통과 직후 `Component !== undefined`면 조기 return으로 `<div role="toolbar" ...><Component editor={editor} /></div>`만 렌더(위치 계산·`portalTarget` 계약은 그대로 유지) — 기존 색상 팔레트 state 기계(`colorMenuState` 등)는 이 분기와 전혀 상호작용하지 않는다.
- `packages/react/test/formatting-toolbar.test.tsx` — 신규 `describe("component override", ...)` 2건.

## 검증

- RED: "지정하면 소비자 컴포넌트가 렌더되고 editor를 받는다" 1건을 `formatting-toolbar.tsx`를 일시적으로 HEAD로 되돌려 구현 전 실패 확인(`git stash` 왕복, 커밋 이력 영향 없음). "표시 판정 유지" 1건은 discriminate하지 않는 characterization(안전망 성격)이라 구현 전에도 통과.
- GREEN: 3개 파일 47개 테스트 전부 통과.
- `pnpm --filter @cp949/geul-react typecheck` clean.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-001 진행 상태

DELTA-01/04 완료. 남은 것은 LinkToolbar·MediaToolbar·FilePanel 3개.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스4) 미완료.

## 남은 위험

- `component` payload를 "editor만"으로 확정했다 — 나중에 계산된 state를 추가로 넘기고 싶어지면 additive로 필드를 늘릴 수 있지만(낮은 비용), wrapper의 위치·dismiss 소유를 소비자에게 완전히 넘기는 방향 전환은 이미 나간 계약을 깨는 변경이다(roadmap.md "결정" 참고).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 230b82e`. 위험: 낮음 — 신규 optional prop, 기본값(`component` 미지정) 동작 불변 확인.
