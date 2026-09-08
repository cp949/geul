# Issue #162 BLK-017 RD-003 DELTA-02 — showcase shiki 구문 강조 예제(비동기 경로 실증)

## 목표

RD-003(showcase 예제 5개 + README + 문서 갱신)의 두 번째 DELTA.
`apps/showcase`에 `shiki`(VS Code 문법 엔진)로 만든 `SyntaxHighlighter`를
`EditorProvider`에 연결하는 두 번째 구문 강조 예제를 추가한다. 문법
엔진 초기화가 실제로 비동기라 `SyntaxHighlighter`의 `Promise` 반환
분기를 실제 라이브러리로 처음 실증한다(DELTA-01의 lowlight는 동기).

## 확정 커밋

- `56ef1fb` — feat(showcase): shiki 구문 강조 예제 추가(비동기 경로 실증)

## 변경한 계약과 파일

- `apps/showcase/package.json`: devDependencies에 `shiki@4.4.3`(MIT)
  추가(production 의존성 아님 — showcase만 쓰는 예제 라이브러리,
  `check-licenses.mjs`/`check-package-boundaries.mjs` 둘 다 `--prod`만
  스캔해 게이트 영향 없음).
- 신규 `apps/showcase/src/examples/11-syntax-highlighting-shiki/`:
  `example.tsx`(shiki 어댑터를 자체 포함, `SyntaxHighlighter` 타입을
  별도 import하지 않고 구조적으로 구현), `page.tsx`(기존 `ExamplePage`
  wiring 패턴). 어댑터는 색상(hex)+fontStyle을 `className`으로
  변환하고, 실제로 만들어진 토큰의 (color, fontStyle) 조합만 module
  scope registry에 등록해 `useSyncExternalStore`로 구독하는 `<style>`을
  렌더한다 — 테마 `settings`를 정적으로 순회해 팔레트를 미리 계산하는
  최초 설계는 vscode-textmate의 scope cascade가 color/fontStyle을
  서로 다른 규칙에서 가져올 수 있어 커버리지를 보장 못한다는 사실을
  자체 검토 중 발견해 폐기했다.
- `apps/showcase/src/routes.tsx`: 기존 `"Syntax Highlighting"` 그룹에
  항목 추가(그룹 자체는 DELTA-01이 이미 신설).
- top-level `shiki`(`createHighlighter`)로 빌드하면 지원 언어 100개+
  chunk와 WASM 622KB가 산출물에 생김을 `pnpm build`로 직접 확인해,
  `shiki/core` + 순수 JS 정규식 엔진(`shiki/engine/javascript`) +
  언어·테마 개별 import("fine-grained bundle")로 바꿨다 — WASM 자산
  자체가 사라지고 main chunk가 1.96MB(gzip 560KB)로 축소됐다.
- `apps/showcase/test/routes-smoke.test.tsx`: 예제 개수 기대값
  11→12 갱신.
- 신규 `e2e/support/showcase.ts`: `openShowcaseExample(page, path)`.
  두 번째 example e2e spec을 추가하는 시점이라 `G-TST-002`에 따라
  DELTA-01이 인라인으로 갖고 있던 페이지 이동 로직을 공용화했다.
  `SYNTAX_HIGHLIGHTING_SAMPLE_SOURCE`도 함께 두었다 — `pnpm
  scan:test-helpers`가 두 spec의 동일 이름·동일 값 상수를 중복으로
  감지해 추출.
- `e2e/showcase-syntax-highlighting-lowlight.spec.ts`: 위 helper를
  쓰도록 리팩터(동작 변경 없음, 순수 추출).
- 신규 `e2e/showcase-syntax-highlighting-shiki.spec.ts`: 코드 블록에
  `shiki-tok-` 접두 class가 렌더되고 source 텍스트는 바뀌지 않음을
  확인. "function" 키워드 토큰의 computed color가 github-light 테마
  실제 값(`rgb(215, 58, 73)`)과 일치하는지 구체적으로 검증.
- `tests/workspace-boundaries.test.ts`: `allowedDependencies["apps/showcase"].devDependencies`에
  `shiki` 추가.

## 검증

- GREEN: `pnpm --filter @cp949/geul-showcase`의 `typecheck`(3-tsconfig,
  PIT-0038)/`build`/`test`(13 files/29 tests), `pnpm exec vitest run
  tests/workspace-boundaries.test.ts`(41 tests), `pnpm
  check:boundaries`(8 manifests)/`check:escompat`(214개 파일)/`check:licenses`(150
  external transitive production packages, `shiki`는 devDependency라
  미포함), `pnpm lint`/`format:check`(변경 파일), `pnpm typecheck:e2e`.
- 신규·리팩터된 e2e spec 2건 단독 GREEN(`--project=chromium`).
  `pnpm test:e2e` 전량 재실행은 스킵했다 — DELTA-01이 이미
  `playwright.config.ts`의 `webServer` 배열을 전량 실행했고 이
  DELTA는 그 배열을 바꾸지 않는다(계획에 기록한 판단).
- 검출력 검증(변이) 1건: `example.tsx`에서
  `syntaxHighlighter={shikiSyntaxHighlighter}`를 제거하면 신규 e2e의
  `span[class*="shiki-tok-"]` 단언이 "element(s) not found"로 실패 →
  원복 후 재통과 확인.
- 재조립: 처음부터 단일 커밋, `dev`에 `--ff-only` 병합.

## 리뷰 발견과 처리(메인 세션 직접 검증, subagent 미사용)

1. 최초 구현의 정적 테마 팔레트 계산(`getTheme().settings` 순회)이
   vscode-textmate cascade 매칭 특성상 모든 (color, fontStyle) 조합을
   보장하지 못하는 이론적 결함 — 실제 토큰에서 직접 registry에 등록하는
   방식으로 재작성해 구조적으로 제거(위 "변경한 계약과 파일" 참고).
2. `SAMPLE_SOURCE` 중복(`pnpm scan:test-helpers`가 탐지) —
   `e2e/support/showcase.ts`로 추출.
3. top-level `shiki` import의 번들 크기(언어 100개+ chunk, WASM
   622KB) — `shiki/core` fine-grained 경로로 교체.
4. 다른 발견 없음.

## RD-003 진행 상태 — `ACTIVE`(완료 조건 1의 5개 중 2개 부분 충족)

완료 조건 1("5개 예제 각각이 Playwright Chromium E2E로 검증된다")의
2/5(lowlight, shiki)를 충족했다. 나머지 완료 조건(2~4)과 예제 3개는
후속 DELTA(RD-003.md "예상 DELTA" DELTA-03~06) 몫이다.

## 등록한 이슈

없음(신규). 기존 `pending-issues/01.md`(원 이슈 초안)와 `05.md`(표
핸들 오버레이 구조 문제 — 2026-09-09 Issue #163으로 이미 게시)는 이
DELTA와 무관하다.

## 게시

없음 — roadmap 전체(RD-001~003)가 미완료라 통합 완료 시점에 한 번만
Issue #162에 게시한다.

## 남은 위험

- 이 DELTA 범위 안에서는 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 56ef1fb`. 위험: 낮음 — 이 커밋은 `apps/showcase`에 새
example 폴더·route 하나, `e2e/`에 신규 spec 하나·공용 helper 하나,
두 test 파일의 기대값 갱신만 담았다. 기존 예제·라우트·webServer
항목·PM 관련 계약을 바꾸지 않아 단독 revert가 다른 커밋에 영향을
주지 않는다.
