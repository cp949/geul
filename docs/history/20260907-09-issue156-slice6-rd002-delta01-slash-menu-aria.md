# Issue #156 슬라이스6 RD-002 DELTA-01 — SlashMenu `aria-activedescendant`

## 목표

RD-002(키보드 a11y, `UI-016`)의 첫 DELTA. `SlashMenu`가 열려 있을 때 실제 포커스를 쥔 편집 가능 요소(`[contenteditable="true"]`)에 현재 강조된 옵션의 `id`를 `aria-activedescendant`로 알린다.

readiness probe(2026-09-07)로 RD-001·RD-002 둘 다 `READY` 판정 후 RD-002를 먼저 착수 — RD-001(4 DELTA, playwright 인프라+CSS+훅)보다 컴포넌트 1개+e2e만 건드리는 이쪽이 더 단순·저위험이라 먼저 선택했다(슬라이스4·5 "더 단순한 RD 먼저" 전례와 동일 논리, `_works/roadmap/progress.md` 참고).

## 확정 커밋

- `dd2f8ef` — feat(react): SlashMenu에 aria-activedescendant 추가

## 변경한 계약과 파일

- `packages/react/src/slash-menu.tsx` — `useId()`로 메뉴 인스턴스 id 발급, 각 옵션 버튼에 `id={menuId-옵션id}` 부여, 강조 옵션이 바뀔 때마다 `element.querySelector('[contenteditable="true"]')`에 `aria-activedescendant` 설정, 메뉴가 닫히면 effect cleanup으로 제거. `code-block-language-combobox.tsx`가 이미 구현해 둔 같은 패턴(별도 팝업 listbox + `useId()` + `${id}-${optionId}`)을 그대로 따랐다 — `aria-owns` 없이 ID 참조만 쓰는 기존 선례도 그대로 유지(옵션 버튼은 `[contenteditable="true"]`의 DOM 자손이 아니라 형제 트리).
- `packages/react/test/slash-menu/popup.test.tsx` — 단위 테스트 1건 추가(강조 옵션 전환 시 `aria-activedescendant` 갱신, 닫힘 시 제거).
- `e2e/slash-menu.spec.ts` — e2e 테스트 1건 추가(같은 시나리오를 실제 브라우저에서 재확인).

## 검증

- RED: 신규 unit 테스트가 구현 전 `expect(firstOption.id).not.toBe("")`에서 실패 확인(id 미부여).
- GREEN: `pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/slash-menu/popup.test.tsx` 38/38 통과.
- `pnpm --filter @cp949/geul-react typecheck` clean.
- 첫 진입 패키지 전체 테스트: `pnpm --filter @cp949/geul-react test` 41 files / 556 tests 통과.
- e2e 신규 테스트: `pnpm test:e2e --project=chromium -g "aria-activedescendant"` 1 passed.
- `e2e/`를 이 roadmap에서 처음 건드려 전체 1회 실행: `pnpm test:e2e --project=chromium` 184 passed(기존 183 + 신규 1).
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-002 진행 상태

DELTA-01 완료. 완료 조건 "SlashMenu가 현재 하이라이트된 옵션을 `aria-activedescendant`로 알린다" 충족(증거: 위 검증). 남은 것은 DELTA-02(LinkToolbar keyboard-only e2e).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스6, RD-001·RD-002)가 미완료라 슬라이스1~5 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- 소비자가 `SlashMenuCustomItem.id`에 공백 등 HTML id 비허용 문자를 쓰면 옵션 `id`/`aria-activedescendant` 값이 비정형이 된다 — 기존에도 같은 값이 React `key`로 쓰여 유일성이 이미 전제였던 사전 존재 위험이라 이 DELTA가 새로 만든 위험은 아니다. 별도 이슈로 분리할 만큼(제품 동작을 바꾸거나 게이트 구멍을 막지 않음, `issue-tracker.md` 등록 기준 미충족) 크지 않아 이슈 등록은 하지 않는다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert dd2f8ef`. 위험: 낮음 — 신규 attribute·id 부여만 추가하고 기존 동작(선택·필터·키보드 이동)은 바꾸지 않았다.
