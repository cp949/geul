# Issue #156 슬라이스9 RD-001 — HTML 진입점 DOM-free 판정

## 목표

RD-001(HTML 서버 환경 판정, `IO-009`의 절반)의 유일한 DELTA. `exportHtml`/`importHtml`이 순수 Node 환경(DOM 전역 없음)에서 왕복 동작함을 회귀 fixture로 고정하고, `packages/io/README.md`에 서버 사용법을 문서화한다. 신규 변환 로직은 없다 — 판정 작업이다(spec §12.2).

## 확정 커밋

- `0e78c1e` — test(io): HTML 서버 렌더 DOM-free 회귀 fixture 추가, README 신규 작성 (DELTA-01)

## 변경한 계약과 파일

- 신규 `packages/io/test/server-render-html.test.ts` — DOM 전역 부재 assertion(`globalThis` 인덱싱) + `exportHtml`→`importHtml` 왕복 보존 테스트 2건.
- 신규 `packages/io/README.md` — 패키지 소개, 서버 환경 사용 안내, `exportHtml`/`importHtml` 사용 예제, `customBlockToHtml` 미등록 시 `HTML_DOCUMENT_INVALID` 거절 경계.

## 구현 중 발견·재검토

- `packages/io/tsconfig.json`/`tsconfig.test.json`은 `lib: ["ES2022"]`만 포함하고 `DOM`이 없다(`packages/core/tsconfig.test.json`은 `DOM`/`DOM.Iterable` 포함 — 비대칭 확인). bare `document`/`window` 식별자가 io 테스트에서 컴파일 자체가 안 되므로, DOM 부재 assertion은 `(globalThis as Record<string, unknown>).document` 인덱싱으로 작성했다 — `packages/core/test/production-editor-ssr-smoke.test.ts`(슬라이스8 RD-001, bare `document` 사용 가능한 core 환경)와 다른 이유다.
- `exportHtml`의 미등록 커스텀 블록 거절 코드는 spec §4.5가 언급한 `CUSTOM_BLOCK_LOST` 전용 코드가 아니라 기존 `HTML_DOCUMENT_INVALID`를 재사용함을 소스(`export-html.ts:564`)로 확인 — README에 정확한 코드로 기술했다.
- `packages/io/test/**`는 루트 `vitest.config.ts`의 `node` 프로젝트에 이미 속해 있어(jsdom 아님) `// @vitest-environment` 오버라이드가 불필요했다.

## 검증

- RED/GREEN: 신규 구현이 아니므로 RED 없음(characterization) — 작성 즉시 GREEN 확인.
- `pnpm --filter @cp949/geul-io test`: 77 files / 658 tests(기존 76/656 + 신규 1/2) 전부 통과, 회귀 없음.
- `pnpm --filter @cp949/geul-io typecheck` clean.
- `prettier --check` clean(1건 자동 포맷 수정 후).

## RD-001 진행 상태

예상 DELTA 1개(DELTA-01) 모두 완료 — **RD-001 DONE.** RD-002(Markdown)로 이어서 진행.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스9, RD-001·RD-002)가 RD-002까지 끝난 뒤 통합 완료 시점에 한 번만 Issue #156에 게시한다.
