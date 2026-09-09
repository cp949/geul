# Issue #65 항목 8 — disabled 메뉴 항목 사유 미설명, RD-003(roadmap-workflow)

## 목표

Issue #65 항목 8의 세 번째 결과(RD-003)를 완료한다 — 표 Indent/Outdent(`table-handle-overlays.tsx`)에 `G-UI-004` 패턴을 적용하고, 표/블록 Indent-Outdent 3곳(RD-003·004·005)이 공유할 비활성 사유 dictionary key를 신설한다. 전체 계획은 `_works/roadmap/roadmap.md`(gitignored)를 원본으로 한다.

## 확정 커밋

- `f35108f` — `fix(react): 표 Indent/Outdent 버튼이 aria-disabled로 비활성 사유를 설명한다 (Issue #65)`

## 변경

- `packages/react/src/table-handle-overlays.tsx` — Indent/Outdent table(`IconButton`)에서 네이티브 `disabled` 속성을 제거했다. 기존 `aria-disabled` 문자열 삼항(`canIndentTable ? "false" : "true"`)은 이미 있었지만(2026-09-08 커밋 `cb35086d`, `disabled`와 병기) `disabled`가 남아 hover/tab을 막고 `title`도 없어 항목8을 해소하지 못했다(실측, `git blame`). `canIndentTable`/`canOutdentTable=false`면 `title`에 신규 공유 key, `true`면 `title`은 기존 라벨(`IconButton` fallback)이다.
- `packages/react/src/table-handles.tsx` — `handleIndentTable`/`handleOutdentTable`에 신규 no-op 가드를 추가했다. `readFreshGeometry`와 같은 이유로 `editor.getBlockNestingActionState(fresh.tableBlockId)`를 fresh 기준으로 다시 계산해 판정한다.
- `packages/core/src/dictionary.ts`/`dictionary-ko.ts` — 최상위 `nesting` 네임스페이스를 신설해 `indentDisabledReason`/`outdentDisabledReason` en/ko 신규 key 2쌍을 추가했다. `table-handle-overlays.tsx`·`formatting-toolbar.tsx`(RD-004)·`block-side-menu-menu.tsx`(RD-005) 셋 다 `editor.getBlockNestingActionState`를 같은 의미로 써 이 key를 공유한다 — 컨트롤마다 라벨 네임스페이스(`handle`/`toolbar.formatting`/`menu`)가 달라 그 어느 쪽에도 넣지 않고 별도 최상위 네임스페이스로 뒀다.
- `packages/react/src/_table-handles.scss` — `.geul-table-nesting-button`의 `&:disabled`를 `&[aria-disabled="true"]`로 바꿨다.
- `packages/react/test/table-handles.test.tsx` — Indent/Outdent 비활성 회귀 테스트를 신규 작성했다(기존 0건). `table` 노드는 `group: "block"`뿐이라(`table-extension.ts`) `isNestableBlockContainer`의 `blockContainer` 조건을 만족하지 못한다(실측) — 표 바로 뒤에 표를 하나 더 이어붙여 `canIndent=false`를 만든다. 문서 맨 앞에 표를 두는 방식은 시도했으나 에디터가 canonicalization으로 자동으로 빈 문단을 앞에 끼워 넣어(실측) 그 조건을 만들 수 없었다. no-op 가드는 `editor.commands.indentBlock`/`outdentBlock` spy로 검증했다 — 이 사이트는 알림 인프라가 없어 문서 상태만으로는 "가드가 막았는지"와 "명령이 호출됐지만 내부적으로 안전하게 거절됐는지"를 구분할 수 없다.

## 검증

- RED: `title` 신규 단언이 구현 전 코드에서 label 텍스트("Indent table"/"Outdent table")를 반환해 실패 → 구현 후 GREEN. `aria-disabled` 단언은 기존 커밋(`cb35086d`)이 이미 만족해 RED가 아니었다(실측 확인 후 진행).
- `pnpm --filter @cp949/geul-core build` 선행 필요(RD-002-DELTA-01 결과에 남긴 위험 그대로 재확인 — 이번에도 먼저 실행).
- 메인 세션이 직접 완료 조건 4개(RD-003.md)를 실측 대조. 확정 결함 0건.
- `pnpm --filter @cp949/geul-react exec vitest run test/table-handles.test.tsx`: 22 passed. `pnpm --filter @cp949/geul-react test`: 658 passed(45 files). `pnpm --filter @cp949/geul-react typecheck`, `pnpm --filter @cp949/geul-core typecheck`, `pnpm lint`: 통과(exit 0). `npx prettier --check`(변경 파일 전체): 통과 — `pnpm lint`가 prettier 포맷을 검사하지 않는다는 사실을 이번에 확인해(`verify:packages`만 `format:check`을 포함) 이후 DELTA부터 매번 별도로 돌린다.
- 재그룹화(단일 커밋, dev 미이동): 트리 diff 무손실.

## 남은 제한

Issue #65 항목 8은 이번 커밋으로도 완료되지 않았다 — 나머지 2개 RD(RD-004 `formatting-toolbar.tsx` Indent/Outdent 블록, RD-005 `block-side-menu-menu.tsx` Indent/Outdent)와 e2e 보정 + `pnpm verify` 전량 게이트(RD-006)가 roadmap-workflow로 계속 진행 중이다. Issue #65의 나머지 항목(9 교차 통합 테스트, 10 테스트 픽스처 중복)도 이번 범위 밖으로 열려 있다.

## GitHub

- Issue #65 진행 댓글(항목 8, RD-003/6): `issuecomment-5609614724`
- Issue #65는 닫지 않았다 — 항목 8 자체가 미완료(RD-004~006 남음)이고 항목 9·10도 분리되지 않은 채 남아 있다.
- commit·`dev` ff-only merge 완료(단일 커밋, dev 미이동으로 재그룹화 트리 diff 완전히 무손실). push·tag·PR 생성은 수행하지 않았다.
