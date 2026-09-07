# Issue #156 슬라이스8 RD-002 — react use client 지시어 + SSR self-guard 검증

## 목표

`EXT-013`(SSR/Next.js 통합)의 두 번째이자 마지막 결과. `react` 패키지 진입점에 `"use client"` 지시어를 추가하고, Next.js App Router client-only 통합 가이드를 작성하고, SSR 안전성을 실측으로 증명한다.

## 확정 커밋

- `fdb6040` — feat(react): 진입점에 use client 지시어 추가, Next.js 통합 가이드 작성 (DELTA-01)
- `d2cfeac` — test(react): EditorProvider SSR self-guard 검증, EXT-013 VERIFIED 갱신 (DELTA-02)
- `ae1b350` — style(core): production-editor-ssr-smoke.test.ts prettier 포맷 수정 (RD-001 산출물의 누락 보정, RD-002 terminal `pnpm verify`에서 발견해 `dev`에 직접 커밋)

## 변경한 계약과 파일

- `packages/react/src/index.ts` — 파일 첫 줄에 `"use client";` directive prologue 추가. `tsc -b` + `esbuild dist/*.js` 빌드 산출물(`dist/index.js`)에서 첫 줄로 보존됨을 실측 확인.
- 신규 `packages/react/README.md` — Next.js App Router client-only 통합 가이드.
- 신규 `packages/react/test/editor-provider-ssr-smoke.test.tsx` — `EditorProvider`/`EditorContent`를 `react-dom/server`의 `renderToString`으로 렌더링해도 크래시하지 않고 결과가 빈 문자열임을 고정(3 tests).
- `docs/product/blocknote-free-feature-inventory.md` — `EXT-013` `NOT_STARTED` → `VERIFIED`.

## 구현 중 발견·재검토(REPLAN_WITHIN_RD)

당초 계획은 "소비자가 직접 작성하는 client-only guard 컴포넌트"를 문서화하고 그 컴포넌트를 SSR 시뮬레이션 대상으로 삼는 것이었다. DELTA-02 착수 중 `EditorProvider`(`editor-provider.tsx:71-104`)의 실제 구현을 재확인한 결과, `createEditor()` 호출이 `useEffect` 안에서만 일어나고 `controller === null`이면 `null`을 반환함을 확인했다 — `useEffect`는 `renderToString`에서 절대 실행되지 않으므로 `EditorProvider`는 이미 자체적으로 서버 렌더에서 `null`을 반환하는 self-guard를 갖고 있다. 실측(`renderToString(<EditorProvider><EditorContent/></EditorProvider>)`)으로 크래시 없이 정확히 빈 문자열을 반환함을 확인했다.

이에 따라 계획을 좁혔다 — 소비자용 수동 guard 패턴은 불필요해 README에서 제거했고(`next/dynamic({ssr:false})`는 "필요"에서 "선택(서버 렌더 비용 절약)"으로 재분류), 당초 계획했던 신규 chromium e2e 시나리오(guard 패턴 client mount 증명)는 만들지 않았다 — `EditorProvider`/`EditorContent`의 client mount는 기존 e2e 전체(188개, `openDemo`를 쓰는 모든 spec)가 이미 증명한다. RD-002의 결과와 완료 조건 5개의 의미는 그대로 유지됐다 — 구현·문서 방법만 더 단순하고 정확해졌다(roadmap-workflow.md "자동 재계획" — DELTA 선택은 정상 동작이라 사용자 재승인 없이 진행, `_works/roadmap/RD-002.md` "결정"에 기록).

## 검증

- `pnpm --filter @cp949/geul-react test` 42 files / 563 tests(기존 560 + 신규 3) 통과.
- `pnpm --filter @cp949/geul-react typecheck` clean.
- **전체 monorepo 재검증(RD-002가 roadmap 마지막 DELTA)**: `pnpm typecheck`(6 packages + configs/e2e/tests/scripts) clean. `pnpm test` 292 files / 3386 tests 통과. `pnpm build`/`check:escompat`/`check:boundaries`/`check:licenses` clean. `pnpm test:e2e`(chromium+mobile) 188 passed, 0 failed. `eslint .` 전체 clean.
- `pnpm verify`의 `format:check`(prettier) 단계에서 이 세션이 만들지 않은 baseline 포맷 drift 4건을 발견했다 — `e2e/block-handle.spec.ts`, `e2e/media-resize-handle.spec.ts`, `packages/react/test/slash-menu/popup.test.tsx`, `packages/react/test/use-clamped-menu-position.test.tsx`. 이 세션 범위 밖이라 수정하지 않았다(아래 "남은 제한" 참고). RD-001 산출물 자신의 포맷 누락(`production-editor-ssr-smoke.test.ts`)은 이 세션 범위라 `dev`에 직접 수정 커밋했다.

## RD-002 진행 상태, roadmap 종료

RD-002의 예상 DELTA 2개(01~02) 모두 완료 — RD-002 DONE. **RD-001·RD-002 둘 다 DONE — roadmap 전체(Issue #156 슬라이스8, `EXT-013`)도 완료.**

## 등록한 이슈

없음. 위 baseline prettier drift 4건은 사용자에게 보고하고 등록 여부를 맡긴다(등록 기준 충족 여부 — 제품 동작·게이트 구멍·거짓 통과 중 무엇에 해당하는지 판단 필요, `docs/agents/arch-review-lane-closed-issue-criterion` 성격의 판단).

## 게시

Issue #156에 슬라이스8 완료 댓글 게시, 체크리스트 슬라이스8 항목 `[x]` 갱신(roadmap-workflow 완료 게이트 통과, `docs/agents/issue-tracker.md` "게시 승인" 넷째 bullet). 이슈는 닫지 않는다 — 슬라이스 9~11이 남아 있다.
