# Issue #65 항목 8 — disabled 메뉴 항목 사유 미설명, RD-004(roadmap-workflow)

## 목표

Issue #65 항목 8의 네 번째 결과(RD-004)를 완료한다 — 서식 툴바 Indent/Outdent 블록(`formatting-toolbar.tsx`)에 `G-UI-004` 패턴을 적용한다. RD-003이 신설한 공유 dictionary key를 재사용하고 `packages/core`는 건드리지 않는다. 전체 계획은 `_works/roadmap/roadmap.md`(gitignored)를 원본으로 한다.

## 확정 커밋

- `586425b` — `fix(react): 서식 툴바 Indent/Outdent 블록 버튼이 aria-disabled로 비활성 사유를 설명한다 (Issue #65)`

## 변경

- `packages/react/src/formatting-toolbar.tsx` — Indent/Outdent(`IconButton`)에서 네이티브 `disabled` 속성을 제거했다. 기존 `aria-disabled`+`disabled` 병기(2026-09-04 커밋 `c9f0d5e0`, `git blame` 확인)는 `disabled`가 남아 hover/tab을 막고 `title`도 "Indent"/"Outdent" 고정이라 항목8을 해소하지 못했다. `canIndent`/`canOutdent=false`면 `title`이 RD-003의 공유 key(`dictionary.nesting.indentDisabledReason`/`outdentDisabledReason`), `true`면 기존 라벨이다. 두 `onClick`에 신규 no-op 가드(`if (canIndent/canOutdent !== true) return;`)를 추가했다 — 렌더 시점 `toolbarState.nestingActions`를 그대로 쓴다(RD-002의 `block-selection-toolbar.tsx`와 같은 관용구). `table-handles.tsx`(RD-003)의 fresh 재계산은 외부 controller 무재렌더 문제 때문이라 이 사이트에는 해당하지 않는다 — 기존 `getBlockNestingActionState` 호출 횟수 불변 테스트로 이 판단을 실측 고정했다.
- `packages/react/src/_formatting-toolbar.scss` — `.geul-formatting-toolbar__mark-button`에 `&[aria-disabled="true"] { cursor: not-allowed; opacity: 0.4; }` 규칙을 신설했다(기존에 disabled 시각 규칙 자체가 없었다, 실측).
- `packages/react/test/formatting-toolbar-nesting.test.tsx` — 기존 `.disabled` 단언 5곳(L49, 51, 85, 92, 219)을 `aria-disabled`로 전환했다. title 유무 검증 2건(첫 테스트에 통합), no-op 가드 회귀 테스트 2건(`controller.commands.indentBlock`/`outdentBlock` mock 호출 여부로 검증 — 이 테스트는 fake controller라 spy 없이 mock을 직접 확인할 수 있다)을 추가했다.

## 검증

- RED: title 신규 단언이 구현 전 코드에서 label 텍스트("Indent")를 반환해 실패 → 구현 후 GREEN. 나머지(aria-disabled, no-op 가드, 호출 횟수)는 기존 병기·핸들러 구조가 이미 만족해 RED가 아니었다.
- 메인 세션이 직접 완료 조건 4개(RD-004.md)를 실측 대조. 확정 결함 0건.
- `pnpm --filter @cp949/geul-react exec vitest run test/formatting-toolbar-nesting.test.tsx`: 9 passed. `pnpm --filter @cp949/geul-react test`: 660 passed(45 files). `pnpm --filter @cp949/geul-react typecheck`, `pnpm lint`, `npx prettier --check`(변경 파일 전체): 통과(exit 0).
- 재그룹화(단일 커밋, dev 미이동): 트리 diff 무손실.

## 남은 제한

Issue #65 항목 8은 이번 커밋으로도 완료되지 않았다 — 나머지 1개 RD(RD-005 `block-side-menu-menu.tsx` Indent/Outdent)와 e2e 보정 + `pnpm verify` 전량 게이트(RD-006)가 roadmap-workflow로 계속 진행 중이다. Issue #65의 나머지 항목(9 교차 통합 테스트, 10 테스트 픽스처 중복)도 이번 범위 밖으로 열려 있다.

## GitHub

- Issue #65 진행 댓글(항목 8, RD-004/6): `issuecomment-5609671164`
- Issue #65는 닫지 않았다 — 항목 8 자체가 미완료(RD-005~006 남음)이고 항목 9·10도 분리되지 않은 채 남아 있다.
- commit·`dev` ff-only merge 완료(단일 커밋, dev 미이동으로 재그룹화 트리 diff 완전히 무손실). push·tag·PR 생성은 수행하지 않았다.
