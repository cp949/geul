# Issue #65 항목 8 — disabled 메뉴 항목 사유 미설명, RD-001(roadmap-workflow)

## 목표

Issue #65 항목 8을 해소한다 — `packages/react/src`의 `disabled` 컨트롤이 네이티브 `disabled`로 hover/tab을 막아 비활성 사유를 설명하지 못하는 결함을, 사용자 확정으로 넓힌 5곳에 통일된 패턴으로 고친다. 이 roadmap의 첫 결과(RD-001)는 패턴을 확립하고 컴포넌트 계약 변경이 필요 없는 가장 단순한 사례(`table-handle-menu.tsx`의 Delete row/column, `MenuItemButton`)에 적용한다. 전체 계획은 `_works/roadmap/roadmap.md`(gitignored)를 원본으로 한다.

## 확정 커밋

- `bdeae07` — `fix(react): 표 핸들 메뉴 Delete row/column이 aria-disabled로 비활성 사유를 설명한다 (Issue #65)`(구현·가이드·회귀 테스트 1커밋, 재그룹화 불필요 — 애초 한 커밋으로 정리됨)

## 변경

- `docs/guides/G-UI-004-explain-disabled-control-reasons.md`(신규) — 네이티브 `disabled` 대신 `aria-disabled` + 조건부 `title` + 클릭 핸들러 명시적 no-op 가드 + CSS `[aria-disabled="true"]`(`pointer-events` 금지) 패턴을 문서화했다. `docs/guides/INDEX.md`에 카테고리 `UI`로 등록.
- `packages/react/src/table-handle-menu.tsx` — Delete row/column(`MenuItemButton`)에 이 패턴을 적용했다. `canDelete=false`면 `aria-disabled="true"` + `title`에 `dictionary.error.lastRow`/`lastColumn`, `canDelete=true`면 `aria-disabled="false"` + `title` 속성 없음(`undefined`). `remove` 핸들러 맨 앞에 `if (!canDelete) return;` 가드를 추가했다 — `aria-disabled`는 `disabled`와 달리 클릭 이벤트를 막지 않는다.
- `packages/react/src/_table-handle-menu.scss` — `&--danger:disabled`를 `&--danger[aria-disabled="true"]`로 바꾸고 `pointer-events: none`을 제거했다(포인터 이벤트를 막으면 hover가 걸리지 않아 `title` 툴팁이 뜨지 않는다).
- `packages/react/test/table-handle-menu.test.tsx` — 기존 count 재활성화 회귀 테스트 2건(Issue #65 항목7)의 `.disabled` 단언을 `aria-disabled` 판정으로 교체하고, `canDelete=false`일 때 title 문구, `canDelete=true`일 때 title 부재를 검증하는 회귀 테스트 4건을 추가했다.

## 검증

- RED: 갱신·추가한 assertion 6건이 구현 전 코드에서 `expected null to be 'true'`/`'false'`(aria-disabled 미부여)로 실패 → 구현 후 GREEN.
- 메인 세션이 직접 완료 조건 6개(RD-001.md)를 실측 대조: `aria-disabled` true/false 전환, `title` 유무, no-op 가드(클릭 후 alert 없음 + 행/열 id 불변으로 검증), `pointer-events` 제거(grep 확인), 기존 재활성화 테스트 갱신, `G-UI-004` 등록. 확정 결함 0건.
- `pnpm --filter @cp949/geul-react exec vitest run test/table-handle-menu.test.tsx`: 42 passed. `pnpm --filter @cp949/geul-react typecheck`, `pnpm lint`: 통과(exit 0).
- 재그룹화 tip에서 동일 검증 재실행 후 `dev` ff-only 병합, 병합 전후 트리 diff(대상 5파일)로 무손실 확인.
- `pnpm verify` 전량: 이번 세션에서 실행하지 않음(RD-006이 최종 통합 검증을 소유 — 나머지 4개 RD·전량 게이트가 남아 있어 지금 실행해도 이 항목의 완료를 의미하지 않는다).

## 남은 제한

Issue #65 항목 8은 이번 커밋으로 완료되지 않았다 — 같은 결함이 있는 나머지 4곳(RD-002 `block-selection-toolbar.tsx` Move up/down + `IconButton` title override 계약, RD-003 `table-handle-overlays.tsx`/`table-handles.tsx` Indent/Outdent 표, RD-004 `formatting-toolbar.tsx` Indent/Outdent 블록, RD-005 `block-side-menu-menu.tsx` Indent/Outdent)와 e2e 보정 + `pnpm verify` 전량 게이트(RD-006)가 roadmap-workflow로 계속 진행 중이다. Issue #65의 나머지 항목(9 교차 통합 테스트, 10 테스트 픽스처 중복)도 이번 범위 밖으로 열려 있다.

## GitHub

- Issue #65 진행 댓글(항목 8, RD-001/6): `issuecomment-5609395704`
- Issue #65는 닫지 않았다 — 항목 8 자체가 미완료(RD-002~006 남음)이고 항목 9·10도 분리되지 않은 채 남아 있다.
- commit·`dev` ff-only merge 완료(단일 커밋, 재그룹화 절차는 dev가 branch 생성 이후 1커밋 앞서 있어 그 차이만 흡수— 대상 5파일 diff는 무손실 확인). push·tag·PR 생성은 수행하지 않았다.
