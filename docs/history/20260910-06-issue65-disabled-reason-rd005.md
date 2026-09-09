# Issue #65 항목 8 — disabled 메뉴 항목 사유 미설명, RD-005(roadmap-workflow)

## 목표

Issue #65 항목 8의 다섯 번째이자 마지막 사이트 변경(RD-005)을 완료한다 — 블록 메뉴 Indent/Outdent(`block-side-menu-menu.tsx`)에 `G-UI-004` 패턴을 적용하고, 명령 거절 시에도 메뉴가 무조건 닫히는 부작용을 없앤다. 전체 계획은 `_works/roadmap/roadmap.md`(gitignored)를 원본으로 한다.

## 확정 커밋

- `7564803` — `fix(react): 블록 메뉴 Indent/Outdent가 aria-disabled로 비활성 사유를 설명하고 무조건 닫힘을 없앤다 (Issue #65)`

## 변경

- `packages/react/src/block-side-menu-menu.tsx` — Indent/Outdent(`MenuItemButton`)에서 `disabled`를 `aria-disabled`로 바꿨다. `nestingActions?.canIndent`/`canOutdent`가 `true`가 아니면 `title`이 RD-003 공유 key(`dictionary.nesting.indentDisabledReason`/`outdentDisabledReason`), `true`면 `title` 속성을 생략한다 — `MenuItemButton`은 children으로 텍스트를 이미 보여주므로 RD-001(Delete row/column)과 같은 관용구를 따른다(`IconButton` 계열인 RD-002~004의 "title이 라벨로 폴백" 관용구와 다르다). `handleIndentBlock`/`handleOutdentBlock`이 기존에는 명령 `Result`를 버리고 무조건 `onClose()`를 호출해(5곳 중 가장 원시적인 패턴, 실측) 명령이 거절돼도 메뉴가 닫혀 사유를 볼 틈이 없었다 — 신규 no-op 가드로 이 부작용을 없앴다.
- `packages/react/src/_block-side-menu.scss` — `&:disabled`를 `&[aria-disabled="true"]`로 바꿨다.
- `packages/react/test/block-side-menu.test.tsx` — Indent/Outdent 비활성·활성 혼합 상태(형제 유무로 canIndent, depth 유무로 canOutdent) 회귀 테스트와, no-op 가드(문서 트리 불변 + 메뉴가 열린 채 유지) 회귀 테스트를 신규 작성했다(기존 0건).
- `docs/guides/G-UI-004-explain-disabled-control-reasons.md` — RD-002가 결정했던 "`IconButton`은 활성 시 `title`이 라벨로 폴백한다" 예외가 가이드 원문에 반영되지 않았던 것을 발견해 보강했다. `MenuItemButton`류(활성 시 `title` 생략)와 `IconButton`류(활성 시 `title`이 라벨로 폴백)를 구분해 명시한다.

## 검증

- RED: `aria-disabled`/`title` 신규 단언이 구현 전 코드에서 속성 자체가 없어(`null`) 실패 → 구현 후 GREEN. no-op 가드 테스트는 기존 네이티브 `disabled`가 이미 클릭을 막고 있어 RED가 아니었다(실측 확인 후 진행).
- 메인 세션이 직접 완료 조건 3개(RD-005.md)를 실측 대조. 확정 결함 0건.
- 계획 문서(RD-005-DELTA-01.md) 완료 조건 1의 "활성 시 title이 기존 라벨"이라는 문구가 `IconButton`(RD-004) 표현을 그대로 옮긴 부정확한 서술이었음을 실행 중 발견 — `MenuItemButton`은 RD-001 선례(활성 시 title 생략)를 따라야 가이드·기존 구현과 일관된다고 판단해 그쪽으로 구현하고, 가이드를 보강해 두 관용구를 명문화했다(RD 결과·완료 조건의 의미 자체는 바뀌지 않음 — "title로 비활성 사유를 설명한다"는 그대로다).
- `pnpm --filter @cp949/geul-react exec vitest run test/block-side-menu.test.tsx`: 54 passed. `pnpm --filter @cp949/geul-react test`: 665 passed(45 files). `pnpm --filter @cp949/geul-react typecheck`, `pnpm lint`, `npx prettier --check`(변경 파일 전체): 통과(exit 0).
- 재그룹화(단일 커밋, dev 미이동): 트리 diff 무손실.

## 남은 제한

Issue #65 항목 8은 이번 커밋으로 5곳 전체 사이트 변경이 끝났지만 완료되지 않았다 — RD-006(e2e 보정 + `pnpm verify` 전량 게이트, 최종 통합 검증)이 남아 있다. Issue #65의 나머지 항목(9 교차 통합 테스트, 10 테스트 픽스처 중복)도 이번 범위 밖으로 열려 있다.

## GitHub

- Issue #65 진행 댓글(항목 8, RD-005/6): `issuecomment-5609740057`
- Issue #65는 닫지 않았다 — 항목 8 자체가 미완료(RD-006 남음)이고 항목 9·10도 분리되지 않은 채 남아 있다.
- commit·`dev` ff-only merge 완료(단일 커밋, dev 미이동으로 재그룹화 트리 diff 완전히 무손실). push·tag·PR 생성은 수행하지 않았다.
