# Issue #65 항목 8 — disabled 메뉴 항목 사유 미설명, RD-002(roadmap-workflow)

## 목표

Issue #65 항목 8의 두 번째 결과(RD-002)를 완료한다 — `IconButton`(`packages/react/src/icon-button.tsx`)에 선택적 `title` override 계약을 추가하고, 그 계약을 `block-selection-toolbar.tsx`의 Move up/down 버튼에 적용해 `G-UI-004`(RD-001) 패턴을 실증한다. 전체 계획은 `_works/roadmap/roadmap.md`(gitignored)를 원본으로 한다.

## 확정 커밋

- `e67a19e` — `test(react): style-build 테스트의 표 메뉴 disabled 셀렉터 단언을 aria-disabled로 갱신한다`(RD-001이 남긴 게이트 구멍 수정, RD-002 범위 밖이지만 `pnpm --filter @cp949/geul-react test` 전체 실행 중 발견해 즉시 고쳤다)
- `5b689e2` — `fix(react): 블록 선택 툴바 위/아래 이동 버튼이 aria-disabled로 비활성 사유를 설명한다 (Issue #65)`

## 변경

- `packages/react/src/icon-button.tsx` — 선택적 `title` prop을 추가했다. 생략하면 기존처럼 `label`을 쓴다. `aria-label`은 override 대상이 아니고 항상 `label` 단일 소스로 남는다(기존 "accessible name과 tooltip은 같은 label에서 파생" 불변식 유지).
- `packages/react/src/block-selection-toolbar.tsx` — Move up/down(`IconButton`)에 `G-UI-004`를 적용했다. `canMoveUp`/`canMoveDown=false`면 `aria-disabled="true"` + `title`에 신규 dictionary key, `true`면 `aria-disabled="false"` + `title`은 `IconButton`의 기본 fallback(라벨)이다. 기존 no-op 가드(`if (!toolbarState.canMoveUp) return;`)를 그대로 재사용했다 — 핸들러 변경 없음.
- `packages/core/src/dictionary.ts`/`dictionary-ko.ts` — `toolbar.blockSelection.moveUpDisabledReason`/`moveDownDisabledReason` en/ko 신규 key 2쌍.
- `packages/react/src/_block-selection-toolbar.scss` — `&:disabled`를 `&[aria-disabled="true"]`로 교체(`pointer-events` 없음, 대상 아님).
- `packages/react/test/block-selection-toolbar.test.tsx` — `isMoveButtonDisabled` 헬퍼를 `aria-disabled` 판정으로 바꿔 기존 6개 호출부를 함께 갱신했다. title 유무 검증 2건, 비활성 상태 클릭이 명령을 호출하지 않는 회귀 테스트 2건을 추가했다.
- `packages/react/test/style-build.test.ts` — RD-001이 바꾼 CSS 셀렉터를 옛 `:disabled` 문자열로 단언하던 게이트 구멍을 고쳤다(별도 커밋).

## 검증

- RED: `isMoveButtonDisabled` 헬퍼 변경과 신규 title 단언이 구현 전 코드에서 `expected false to be true` / `expected 'Move selection up' to be "Can't move up..."`으로 실패 → 구현 후 GREEN.
- `packages/core`가 dist 빌드 소비 패키지라 dictionary 변경 후 `pnpm --filter @cp949/geul-core build`를 먼저 실행해야 `packages/react` 테스트가 새 key를 본다(실측 확인 — 빌드 전엔 옛 dist로 title fallback이 계속 라벨을 반환해 RED가 아니라 다른 원인처럼 보이는 실패가 났다).
- `IconButton`을 처음 건드리는 RD라 `pnpm --filter @cp949/geul-react test` 전체를 1회 독립 실행했다 — 이 과정에서 RD-001이 남긴 `style-build.test.ts` 게이트 구멍(옛 `:disabled` 셀렉터 문자열 단언)을 발견해 별도 커밋으로 즉시 고쳤다.
- 메인 세션이 직접 완료 조건 4개(RD-002.md)를 실측 대조: `IconButton` title override(override 있음/없음 양쪽), `aria-disabled`+`title` 토글, no-op 가드(문서 순서 불변으로 검증), `_block-selection-toolbar.scss` 셀렉터 교체(grep 확인). 확정 결함 0건.
- `pnpm --filter @cp949/geul-react exec vitest run test/block-selection-toolbar.test.tsx`: 21 passed. `pnpm --filter @cp949/geul-react test`: 654 passed(45 files). `pnpm --filter @cp949/geul-react typecheck`(`exactOptionalPropertyTypes: true`라 `title?: string | undefined`로 명시해야 통과), `pnpm lint`: 통과(exit 0).
- 재그룹화 tip에서 그룹 경계마다(스타일 수정 커밋, feature 커밋) 동일 검증 재실행 후 병합, 병합 전후 트리 diff 무손실 확인(dev가 분기 이후 움직이지 않아 diff 완전히 비어 있었다).

## 남은 제한

Issue #65 항목 8은 이번 커밋으로도 완료되지 않았다 — 나머지 3개 RD(RD-003 `table-handle-overlays.tsx`/`table-handles.tsx` Indent/Outdent 표, RD-004 `formatting-toolbar.tsx` Indent/Outdent 블록, RD-005 `block-side-menu-menu.tsx` Indent/Outdent)와 e2e 보정 + `pnpm verify` 전량 게이트(RD-006)가 roadmap-workflow로 계속 진행 중이다. Issue #65의 나머지 항목(9 교차 통합 테스트, 10 테스트 픽스처 중복)도 이번 범위 밖으로 열려 있다.

## GitHub

- Issue #65 진행 댓글(항목 8, RD-002/6): `issuecomment-5609481405`
- Issue #65는 닫지 않았다 — 항목 8 자체가 미완료(RD-003~006 남음)이고 항목 9·10도 분리되지 않은 채 남아 있다.
- commit·`dev` ff-only merge 완료(2커밋, 재그룹화 절차 실행 — dev가 분기 이후 움직이지 않아 트리 diff 완전히 무손실). push·tag·PR 생성은 수행하지 않았다.
