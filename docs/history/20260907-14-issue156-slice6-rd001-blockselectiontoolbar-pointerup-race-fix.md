# Issue #156 슬라이스6 RD-001 — BlockSelectionToolbar pointerup 재조회 레이스 수정

## 목표

RD-001 DELTA-04(MediaResizeHandles touch e2e) 작업 중 `dev`에 이미 존재하던 회귀를 발견해 즉시 수정한다. 사용자 확인(AskUserQuestion, "지금 근본 수정까지 진행") 하에 진행 — DELTA 계획 밖의 별도 결함 수정이라 이 문서로 분리한다.

## 발견 경위

RD-001 DELTA-04 착수 시 `pnpm exec playwright test --project=chromium` 전체를 재확인하던 중 `e2e/block-selection.spec.ts`(다중 블록 선택, Issue #38 슬라이스7) 8개 테스트 전부 실패를 발견했다. 이 세션(DELTA-03·04)이 만든 변경과는 무관 — isolation 실험으로 원인이 이전 세션 커밋 `bf6b971`(RD-001 DELTA-02, 블록 드래그 핸들에 `touch-action:none`+`preventDefault()` 추가)임을 확정했다.

## 확정 커밋

- `b6e99a1` — fix(react): BlockSelectionToolbar 재조회를 pointerup microtask에서 setTimeout(0)으로 변경

## 근본 원인

`handlePointerDownOnHandle`(`block-side-menu.tsx`)의 `event.preventDefault()`가 pointerdown에서 호출되면 그 인터랙션의 호환 mouse 이벤트(mousedown/mousemove/mouseup/click)가 전부 억제된다(Pointer Events 스펙). `BlockSelectionToolbar`는 `mouseup`으로 selection을 재조회하는데 이게 억제됐다.

이를 위한 `pointerup` 백업 경로(`handleDeferredPointerUp` → `queueMicrotask(updateFromSelection)`, 주석에 "트랙-6 결함 탐지, IMPL-REVIEW-02 F1"로 도입 배경 기록)가 이미 있었지만, 그 설계의 전제("마이크로태스크로 미루면 같은 pointerup 디스패치 안에서 동기 실행되는 다른 리스너(그 커밋)가 먼저 끝난 뒤에 읽으므로 이 경쟁이 사라진다")가 틀렸다 — 실제 브라우저는 dispatch 전체가 끝난 뒤가 아니라 **각 리스너 콜백이 반환할 때마다** microtask checkpoint를 돈다. e2e 실측(콘솔 로그 계측)으로, 먼저 등록된 `BlockSelectionToolbar`의 microtask가 나중에 등록된 `BlockSideMenu`의 `selectBlockRange` 커밋보다 먼저 실행돼 stale(`null`) selection을 읽음을 직접 확인했다.

DELTA-02 이전에는 `mouseup`(pointerup 뒤에 브라우저가 별도로 dispatch하는 호환 이벤트)이 이미 커밋이 끝난 뒤 동기적으로 최신 상태를 다시 읽어 이 결함을 가려 왔다 — `preventDefault()`가 그 mouseup을 억제하면서 비로소 드러났다.

## 변경한 계약과 파일

- `packages/react/src/block-selection-toolbar.tsx` — `handleDeferredPointerUp`의 `queueMicrotask(updateFromSelection)`을 `setTimeout(updateFromSelection, 0)`으로 변경. 매크로태스크는 해당 pointerup dispatch 전체(그 안의 모든 동기 리스너와 그 사이 microtask)가 완전히 끝난 뒤에만 실행되므로 두 리스너의 상대적 등록 순서와 무관하게 항상 최신 상태를 읽는다. 예약된 타이머 id를 `ref`로 추적해 언마운트 시 취소한다(stale 클로저로 실행되는 것 방지, `media-resize-handles.tsx`의 rAF 취소와 같은 패턴).
- `packages/react/test/block-selection-toolbar.test.tsx` — 기존 "pointerup 리스너 등록 순서와 무관하게..." 테스트가 `await Promise.resolve()`(microtask 1틱)만 기다리도록 작성돼 있었다. jsdom의 `dispatchEvent`는 실제 브라우저와 달리 이 리스너 순서 경쟁 자체를 재현하지 못함을 확인했다(mutation 확인: `setTimeout`이든 `queueMicrotask`든 `setTimeout(0)` 매크로태스크까지 기다리면 둘 다 통과) — 이 테스트는 "재조회가 결국 일어난다"는 sanity check일 뿐이라고 정직하게 재문서화하고, 실제 매크로태스크 tick(`await new Promise((resolve) => setTimeout(resolve, 0))`)을 기다리도록 고쳤다. 순서 경쟁 자체의 회귀 방지는 `e2e/block-selection.spec.ts`가 담당한다고 명시.

## 검증

- Mutation 확인(메인 세션 직접): `setTimeout` → `queueMicrotask`로 되돌리면 `e2e/block-selection.spec.ts` 8개 전부 RED — 원복 후 GREEN 재확인.
- `pnpm --filter @cp949/geul-react test` 41 files / 559 tests 통과.
- `pnpm --filter @cp949/geul-react typecheck` clean.
- `pnpm test:e2e`(chromium + mobile 전체) 188 passed, 0 failed.

## 등록한 이슈

없음 — 발견 즉시 원인 규명·수정·검증(unit+e2e)까지 이번 세션에서 완료돼 추적할 미해결 항목이 남지 않았다.

## 게시

없음 — roadmap 전체(슬라이스6, RD-001)가 미완료라 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- `queueMicrotask` vs `setTimeout(0)` 같은 이벤트 리스너 실행 순서 경쟁은 jsdom unit 테스트로 재현되지 않는다 — 이런 종류의 회귀는 e2e(실제 브라우저)만이 잡을 수 있다는 사실을 이번에 실측으로 확인했다. 유사 패턴(마운트 시 등록된 폴링 리스너가 나중에 등록되는 다른 컴포넌트의 커밋을 앞서 읽는 구조)이 다른 컴포넌트(TableSelectionToolbar 등)에도 있을 수 있으나, 이번 조사 범위 밖이라 확인하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert b6e99a1`. 위험: 낮음(다만 `preventDefault()`가 유지된 상태로 되돌리면 다중 블록 선택 회귀가 재발한다) — rollback이 필요하다면 `bf6b971`의 `preventDefault()`도 함께 재검토해야 한다.
