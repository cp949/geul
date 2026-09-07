# Issue #156 슬라이스6 RD-001 DELTA-02 — 블록 드래그 핸들 `touch-action`/`preventDefault`

## 목표

RD-001(mobile/touch 입력 지원, `UI-015`)의 두 번째 DELTA. 블록 드래그 핸들(`block-side-menu.tsx`)에 `touch-action: none`과 `preventDefault()`를 추가해 실기기 터치의 스크롤 제스처 가로채기를 방어한다(spec §9.2 승인).

## 확정 커밋

- `bf6b971` — feat(react): 블록 드래그 핸들에 touch-action:none·preventDefault 추가

## 변경한 계약과 파일

- `packages/react/src/_block-side-menu.scss` — `.geul-block-gutter__button--drag`에 `touch-action: none` 추가.
- `packages/react/src/block-side-menu.tsx` — `handlePointerDownOnHandle`에 `event.preventDefault()` 추가(재정렬 핸들 관용구의 의도적 예외 — spec §9.2가 방어적 수정으로 명시 승인).
- `e2e/block-handle.spec.ts` — 신규 테스트 1건(`@core`, 프로젝트 무관): computed `touch-action`이 `"none"`인지, 실제 pointerdown이 `defaultPrevented === true`가 되는지 검증.

## 구현 중 재검토(RD-001.md 계획 대비 범위 축소)

RD-001.md 초안은 이 DELTA에 "터치 이벤트로 신규 검증"을 배정했으나, 실제로는 `touch-action`(computed style)과 `preventDefault()` 호출 여부 둘 다 pointerType과 무관한 사실이라(코드가 `event.button`만 확인, pointerType 분기 없음) 기존 mouse 기반 재정렬 테스트가 이미 증명한 `usePointerDragGesture` 경로를 `pointerType: "touch"`로 재현해도 새 증명이 없다고 판단했다. `setPointerCapture`를 합성 `PointerEvent`의 임의 pointerId에 호출하는 저수준 기법은 이 저장소에 선례가 없어 이 Micro DELTA에 들이지 않았다. 대신 `getComputedStyle`+실제 `page.mouse` 상호작용의 `event.defaultPrevented`로 두 방어 자체를 증명했다 — `mobile` project·`@mobile` 태그는 쓰지 않고 `chromium`에서 돈다. 완료 조건 실질은 좁히지 않았다(상세 근거는 `_works/roadmap/result/RD-001-DELTA-02.md`).

## 구현 중 발견·수정

테스트 작성 중 `event.defaultPrevented`를 리스너 콜백 안에서 곧바로 읽으면 항상 `false`가 관찰되는 것을 발견했다 — 내가 `handle`(target)에 직접 붙인 리스너는 AT_TARGET phase에서, React의 위임 핸들러(root container의 bubble-phase 리스너)보다 먼저 실행되기 때문이다(테스트 방법론 결함, 프로덕션 결함 아님). 이벤트 객체를 `window`에 보관해 두고 dispatch가 전부 끝난 뒤(mouse.up 이후) 별도 `page.evaluate`로 읽도록 수정해 해결했다.

## 검증

- Mutation 확인(메인 세션 직접, subagent 없음): `event.preventDefault()`를 임시로 지우면 신규 테스트가 `Expected: true, Received: false`로 RED — 원복 후 GREEN 재확인.
- `pnpm test:e2e --project=chromium -g "block-handle"` 20 passed(기존 19 + 신규 1).
- `pnpm --filter @cp949/geul-react typecheck`·`pnpm typecheck:e2e` clean(`exactOptionalPropertyTypes`로 인한 타입 에러 2건을 `PointerEvent | undefined`·`HTMLButtonElement` 명시로 해결).
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-001 진행 상태

DELTA-02 완료. 남은 것은 DELTA-03(가상 키보드 회피), DELTA-04(MediaResizeHandles touch e2e).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스6, RD-001)가 미완료라 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert bf6b971`. 위험: 낮음 — `touch-action`/`preventDefault` 추가는 기존 mouse/pointer 재정렬 동작을 바꾸지 않는다(mutation 확인으로 회귀 없음 검증).
