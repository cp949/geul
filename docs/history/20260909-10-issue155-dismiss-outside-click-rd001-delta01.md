# Issue #155 RD-001-DELTA-01 — 바깥 클릭 dismiss가 클릭 대상의 동작을 함께 실행하게 한다

## 목표

해제형 오버레이가 바깥 클릭으로 닫힐 때 그 클릭 대상 자신의 onClick이 조용히 무시되는 결함(Issue #155)을 없앤다.

## 커밋

- `806eb83` docs(context,adr): 해제형 오버레이 바깥 클릭 실행 계약을 결정한다 (Issue #155)
- `4a240f6` fix(dismiss-overlay): 바깥 클릭 dismiss가 클릭 대상의 동작을 함께 실행하게 한다 (Issue #155)

## 바꾼 계약과 파일

- `packages/react/src/use-dismiss-on-outside-or-escape.ts` — `onOutsideDismiss()`의 state 커밋을 `startTransition`으로 감싸 discrete 우선순위인 click 처리 뒤로 미룬다. `useDismissOnOutsideOrEscape` 호출부 12곳(11개 파일, `formatting-toolbar.tsx` 2회) 전체에 균일 적용.
- `packages/react/test/use-dismiss-on-outside-or-escape.test.tsx` — 실제 `pointerdown → mouseup → click` 순서 기반 계약 고정 케이스 추가.
- `e2e/media-toolbar.spec.ts` — mutation-provable 회귀 e2e로 확장(수정 전 RED, 수정 후 GREEN 실측).
- `e2e/media-file-panel.spec.ts`, `e2e/table-handle.spec.ts`, `e2e/slash-menu.spec.ts` — ADR-0013 계약 고정 회귀 e2e 추가.
- `docs/guides/G-UI-001-build-dismissible-overlays.md` — 구현 규칙에 실행 계약 한 줄 추가.
- `CONTEXT.md`의 "해제형 오버레이" 정의에 실행 계약 반영.
- `docs/adr/0013-dismissible-overlay-outside-click-runs-target-action.md` — 신규 ADR.

## 진단(계획 가설과 다름)

가설(React 18 자동 배칭)은 틀렸다. 실제 원인: `media-toolbar.tsx`에 전용 `position: fixed` scss가 없어 `position: static`으로 렌더된다 — 바깥 클릭이 dismiss를 커밋하면 문서 `scrollHeight`가 줄어 브라우저가 `scrollTop`을 clamp하고, 같은 물리적 클릭의 `mouseup`/`click`이 다른 엘리먼트로 hit-test된다. `file-panel.tsx`도 같은 CSS 결함을 공유하지만, e2e로 검증한 시나리오(빈 File Panel)에서는 스크롤이 필요 없어 증상이 재현되지 않았다.

## 실행한 검증과 결과

```
pnpm --filter @cp949/geul-react test -- use-dismiss-on-outside-or-escape
→ 632 passed

pnpm exec playwright test e2e/media-toolbar.spec.ts e2e/table-handle.spec.ts e2e/slash-menu.spec.ts e2e/media-file-panel.spec.ts --project=chromium
→ 개별 실행 전량 GREEN

pnpm verify (전량: lint, format, build, typecheck, unit, e2e 203건, boundaries, licenses)
→ exit 0
```

## 남은 제한

- `media-toolbar.tsx`·`file-panel.tsx`의 CSS 근본 결함(전용 scss 부재로 `G-UI-001` viewport clamp 무효화)은 이번 변경 범위 밖이다 — roadmap RD-002로 추적 중, 별도 이슈 등록 예정(readiness probe 후 착수 시).
- `startTransition`은 12곳 전체의 dismiss 커밋을 한 프레임 정도 늦출 수 있다(체감 불가 수준 확인).
- `e2e/media-toolbar.spec.ts`의 MED-009 계열 테스트는 병렬 다중 워커 실행 시 `insertFilledImage` 헬퍼의 가시성 대기가 간헐 flake — 이번 변경과 무관한 기존 환경 문제(단독 실행 시 재현 안 됨, `pnpm verify` 전량 실행에서도 재현 안 됨).

## 등록한 이슈

- #155 — 완료 댓글 등록, 종료.
