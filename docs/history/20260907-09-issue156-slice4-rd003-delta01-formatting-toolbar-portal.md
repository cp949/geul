# Issue #156 슬라이스4 RD-003 DELTA-01 — `FormattingToolbar` `portalTarget`

## 목표

roadmap-workflow RD-003(`portalTarget` 5개 컴포넌트 공통 적용, `UI-013`)의 첫 DELTA. `FormattingToolbar`에 `portalTarget?: HTMLElement | null` prop을 추가해, 지정 시 `createPortal`로 그 요소 하위에 렌더하고 미지정 시 기존 inline 렌더를 유지한다.

착수 전 그릴링 결정(`_works/roadmap/roadmap.md` "결정", 2026-09-07): `portalTarget`을 5개 컴포넌트(Formatting/Link/Media/FilePanel/SlashMenu) 전체에 적용, 미지정 시 기존 동작 유지(non-breaking additive). 5개 중 후속 edge(RD-004 emoji picker의 선행 조건)가 가장 큰 RD-003을 먼저 착수했다("다음 DELTA 선택" 절차).

## 확정 커밋

- `eac4984` — feat(react): FormattingToolbar portalTarget 지원(EXT-006/UI-013)

## 변경한 계약과 파일

- `packages/react/src/formatting-toolbar.tsx` — `FormattingToolbarProps`(`portalTarget?: HTMLElement | null`, 기본값 `null`) 신설. 기존 반환 JSX를 `content` 변수로 추출하고 `portalTarget === null ? content : createPortal(content, portalTarget)`로 감쌌다 — 툴바 본체와 색상 팔레트 팝오버가 같은 `content` 트리 안에 있어 둘 다 같은 `portalTarget`으로 이동한다.
- `packages/react/src/index.ts` — `FormattingToolbarProps` 타입을 `FormattingToolbar`와 함께 공개 export. RD-001 DELTA-01(같은 컴포넌트의 `component` override)이 이 타입에 필드를 추가할 예정 — 신규 타입을 또 만들지 않는다.
- `packages/react/test/formatting-toolbar.test.tsx` — `describe("portalTarget", ...)` 3건 추가(지정 시 툴바 이동, 색상 팔레트도 같이 이동, 미지정 시 기존 위치 유지).

## 검증

- RED: 신규 테스트 3건 중 2건(지정 시 이동)이 구현 전 실패 확인(`portalTarget.contains(...)` → `false`). "미지정 시 기존 위치" 1건은 기존 동작 characterization이라 구현 전에도 통과.
- GREEN: 구현 후 3개 파일(`formatting-toolbar.test.tsx`/`-colors.test.tsx`/`-nesting.test.tsx`) 45개 테스트 전부 통과.
- `pnpm --filter @cp949/geul-react test`(이 세션에서 패키지 첫 실행) — 38 files / 508 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-react typecheck` — clean.
- e2e는 이 DELTA에서 실행하지 않았다 — RD-003의 5개 DELTA가 모두 끝난 뒤 `pnpm test:e2e --project=chromium` 1회로 묶어 확인한다(계획).
- 재그룹화: 커밋이 이미 1개(구현+테스트+export 동시 커밋)라 cherry-pick 재조립 없이 `git switch dev && git merge --ff-only`로 바로 이전. 트리 변경은 커밋 diff와 동일.

## RD-003 진행 상태

DELTA-01/05 완료. 완료 조건("5개 컴포넌트 모두 `portalTarget` 지정 시 지정 DOM 노드 하위 렌더", "미지정 시 e2e 회귀 없음")은 5개 DELTA가 모두 끝나야 판정한다 — 아직 미충족(`_works/roadmap/RD-003.md`).

## 등록한 이슈

없음.

## 게시

없음 — RD-003, roadmap 전체 모두 미완료라 이 DELTA 단독으로는 GitHub 게시 기준(issue-tracker.md "종료 판단")을 충족하지 않는다. 슬라이스4 전체 완료 시점에 통합 완료 댓글로 게시한다(슬라이스1~3 전례와 동일 패턴).

## 남은 위험

- `BlockSideMenu`/`TableHandles`는 이 RD 범위 밖이다(roadmap.md "결정" — `EXT-007` `PARTIAL` 이월).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert eac4984`. 위험: 낮음 — `portalTarget`은 신규 optional prop이고 기본값 `null`일 때 동작이 이전과 동일함을 회귀 테스트로 확인했다. 되돌리면 이 prop과 export 타입이 사라진다.
