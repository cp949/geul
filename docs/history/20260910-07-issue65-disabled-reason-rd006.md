# Issue #65 항목 8 — disabled 메뉴 항목 사유 미설명, RD-006(roadmap-workflow, 최종)

## 목표

Issue #65 항목 8 roadmap의 마지막 RD(RD-006)를 완료한다 — `aria-disabled` 전환이 깨는 기존 e2e 전제(`e2e/table-format.spec.ts`)를 새 동작에 맞게 고치고, RD-001~005 전체 변경에 대해 `pnpm verify` 전량 게이트를 통과시켜 roadmap을 마감한다. 전체 계획은 `_works/roadmap/roadmap.md`(gitignored, archive 예정)를 원본으로 한다.

## 확정 커밋

- `5fab8c3` — `style(react): style-build 테스트의 table-menu CSS 문자열 리터럴을 prettier 규칙에 맞춘다`
- `cfe671c` — `test(e2e): outdent 버튼도 indent와 같은 focus 경로로 도달성을 검증한다 (Issue #65 항목8 RD-006)`

## 변경

- `e2e/table-format.spec.ts` — "indent·outdent 버튼도 표를 지나쳐 스크롤한 뒤..." 테스트(L630-671)를 재작성했다. RD-003이 outdent 버튼을 `aria-disabled`로 바꿔 "outdent는 disabled라 focus 불가"라는 전제가 사라졌다 — 이 변화 자체가 이슈 항목 8의 수정 목표다. 초기 상태 확인을 `toBeDisabled()`/`toBeEnabled()`에서 `aria-disabled` 속성 직접 확인(`toHaveAttribute`)으로 바꾸고, outdent도 indent와 같은 `.focus()` 경로(scroll-into-view + `toBeFocused()`)로 도달성을 검증한다. 기존 `scrollIntoViewIfNeeded()` 특수 경로는 제거했다.
- `packages/react/test/style-build.test.ts` — RD-002 커밋(`e67a19e`)이 남긴 잔여 format:check 게이트 구멍(`.geul-table-menu__item--danger[aria-disabled=true] {` 단언이 single-quote였다)을 발견해 수정했다. 문자열 내용은 바뀌지 않는다(따옴표만 double로 통일). RD-006 범위와 무관한 발견이지만 `pnpm verify` 전량 게이트를 통과시키는 것 자체가 이 RD의 목적이라 즉시 수정했다(별도 이슈로 미루지 않음).

## 검증

- `pnpm test:e2e --project=chromium` 전량: 209 passed, 0 failed(재작성한 테스트 `table-format.spec.ts:637` 포함, baseline 회귀 없음). `table-handle.spec.ts`/`block-side-menu.spec.ts`(`block-handle.spec.ts`)/`formatting-toolbar.spec.ts`의 기존 `toBeDisabled()`/`toBeEnabled()` 단언은 계획 문서 실측대로(Playwright `isNativelyDisabled(element) || hasExplicitAriaDisabled(element)`) `disabled`→`aria-disabled` 전환으로 깨지지 않았다.
- `pnpm verify` 전량(lint, format:check, build, check:escompat, typecheck, unit test, check:boundaries, check:licenses, e2e chromium+mobile): 최초 실행에서 `style-build.test.ts`의 `format:check` 실패(위 RD-002 잔여 구멍) 발견 → 수정 후 재실행 EXIT_CODE=0. unit test 3564개(313 파일) 전부 통과, e2e 209개 전부 통과, package boundary·license 검사 통과.
- 완료 조건 4(`docs/guides/INDEX.md`의 `G-UI-004` 등록, `dictionary.ts`/`dictionary-ko.ts` 양쪽의 `nesting.indentDisabledReason`/`outdentDisabledReason` 존재) 재확인 — RD-001·RD-003이 이미 충족해 둔 상태 그대로였다.
- 메인 세션이 직접 RD-006.md 완료 조건 4개를 실측 대조. 확정 결함 0건(위 prettier 잔여 구멍은 RD-006의 검증 목적 자체가 잡아야 하는 대상이라 결함이 아니라 RD-006이 설계대로 동작한 사례로 본다).
- 재그룹화(2커밋: 잔여 구멍 수정 1 + e2e 재작성 1, dev 미이동): 트리 diff 무손실.

## roadmap 종료

RD-001~006 전부 `DONE` — Issue #65 항목 8 roadmap 전체 완료. 5곳(`table-handle-menu.tsx`/`block-selection-toolbar.tsx`/`table-handle-overlays.tsx`/`formatting-toolbar.tsx`/`block-side-menu-menu.tsx`) 전부가 `G-UI-004` 패턴(`aria-disabled` + 조건부 `title` + 명시적 no-op 가드)을 따르고, `pnpm verify` 전량이 통과한다. `_works/roadmap/`은 `_works/_completed/20260910-01-roadmap-issue65-disabled-reason/`으로 archive했다.

## 남은 제한

Issue #65 항목 8은 완료됐지만 이슈 자체는 닫지 않는다 — 항목 9(교차 태스크 통합 테스트), 항목 10(테스트 픽스처 중복)이 별도 이슈로 분리되지 않은 채 남아 있어 `docs/agents/issue-tracker.md` "종료 판단" 기준(분리되지 않았으면 닫지 않는다)에 걸린다.

## GitHub

- Issue #65 완료 댓글(항목 8, RD-006 + roadmap 전체 요약): `issuecomment-5609940521`
- Issue #65는 닫지 않았다 — 항목 9·10이 분리되지 않은 채 남아 있다.
- commit·`dev` ff-only merge 완료(2커밋, dev 미이동으로 재그룹화 트리 diff 완전히 무손실). push·tag·PR 생성은 수행하지 않았다.
