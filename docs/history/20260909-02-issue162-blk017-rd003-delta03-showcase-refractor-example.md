# Issue #162 BLK-017 RD-003 DELTA-03 — showcase refractor(Prism) 구문 강조 예제

## 목표

RD-003(showcase 예제 5개 + README + 문서 갱신)의 세 번째 DELTA.
`apps/showcase`에 `refractor`(Prism 문법 엔진의 hast 어댑터)로 만든
`SyntaxHighlighter`를 `EditorProvider`에 연결하는 세 번째 구문 강조
예제를 추가한다.

## 확정 커밋

- `d058099` — feat(showcase): refractor(Prism) 구문 강조 예제 추가

## 변경한 계약과 파일

- `apps/showcase/package.json`: devDependencies에 `refractor@5.0.0`(MIT,
  강조 엔진), `prismjs@1.30.0`(MIT, 테마 CSS 전용) 추가(production
  의존성 아님 — `check-licenses.mjs`/`check-package-boundaries.mjs`
  둘 다 `--prod`만 스캔해 게이트 영향 없음).
- 신규 `apps/showcase/src/examples/12-syntax-highlighting-refractor/`:
  `example.tsx`(refractor 어댑터를 자체 포함, `SyntaxHighlighter`
  타입을 별도 import하지 않고 구조적으로 구현), `page.tsx`(기존
  `ExamplePage` wiring 패턴). `refractor.highlight()`가 lowlight와
  동일한 hast Root를 반환함을 scratchpad 실측으로 확인해 DELTA-01의
  `flattenHastToTokens` 순회 로직을 그대로 재사용했다(예제 파일은
  복사해 쓰는 자기완결적 파일이라는 기존 관례에 따라 import 대신 다시
  둔다). `refractor`의 default export 싱글턴은 이미 common 언어 62개
  (javascript 포함)가 등록돼 있어 별도 초기화 호출이 필요 없다.
- `apps/showcase/src/routes.tsx`: 기존 `"Syntax Highlighting"` 그룹에
  항목 추가(그룹 자체는 DELTA-01이 이미 신설).
- `apps/showcase/test/routes-smoke.test.tsx`: 예제 개수 기대값
  12→13 갱신.
- 신규 `e2e/showcase-syntax-highlighting-refractor.spec.ts`:
  `e2e/support/showcase.ts`의 `openShowcaseExample` helper를 재사용
  (G-TST-002, DELTA-02가 이미 공용화). 코드 블록에 `span.token`이
  렌더되고 source 텍스트는 바뀌지 않음을 확인. "function" 키워드
  토큰의 computed color가 Prism 기본 테마(`prism.css`) 실제 값
  (`rgb(0, 119, 170)`, `#07a`)과 일치하는지 구체적으로 검증.
- `tests/workspace-boundaries.test.ts`: `allowedDependencies["apps/showcase"].devDependencies`에
  `refractor`·`prismjs` 추가.

## 검증

- RED→GREEN: 신규 e2e spec을 구현 전 먼저 실행해 route 미등록으로
  실패(`pre[data-geul-code-block] code` element(s) not found) 확인 →
  구현 후 재실행 GREEN.
- GREEN: `pnpm --filter @cp949/geul-showcase`의 `typecheck`(3-tsconfig,
  PIT-0038)/`build`(단일 청크 2.06MB/gzip 594KB, shiki 같은 언어별
  chunk·WASM 폭증 없음)/`test`(13 files/30 tests), `pnpm exec vitest
  run tests/workspace-boundaries.test.ts`(41 tests), `pnpm
  check:boundaries`(8 manifests)/`check:escompat`(214개 파일)/`check:licenses`(158
  external transitive production packages, `refractor`·`prismjs`는
  devDependency라 미포함), `pnpm lint`/`prettier --check`(변경 파일),
  `pnpm typecheck:e2e`.
- 신규 e2e spec 단독 GREEN(`--project=chromium`), 형제 spec 2건
  (lowlight·shiki)도 함께 재실행해 회귀 없음 확인(3 passed). `pnpm
  test:e2e` 전량과 루트 `pnpm test`(vitest 전체) 재실행은 스킵했다 —
  DELTA-01·02가 이미 각각의 첫 실행을 완료했고 이 DELTA는 그 대상
  (webServer 배열, apps/showcase 최초 전체 실행)을 바꾸지 않는다.
- 검출력 검증(변이) 1건: `example.tsx`에서
  `syntaxHighlighter={refractorSyntaxHighlighter}`를 제거하면 신규
  e2e의 `span.token` 단언이 "element(s) not found"로 실패 → 원복 후
  재통과 확인.
- 재조립: 처음부터 단일 커밋, `dev`에 `--ff-only` 병합.

## 리뷰 발견과 처리(메인 세션 직접 검증, subagent 미사용)

계획대로 구현됐다. `packages/react`의 기존 CSS에 Prism의 전역
`.token` class와 충돌하는 선택자가 없는지 grep으로 확인(발견 없음).
다른 발견 없음.

## RD-003 진행 상태 — `ACTIVE`(완료 조건 1의 5개 중 3개 충족)

완료 조건 1("5개 예제 각각이 Playwright Chromium E2E로 검증된다")의
3/5(lowlight, shiki, refractor)를 충족했다. 나머지 완료 조건(2~4)과
예제 2개(lezer, sugar-high)는 후속 DELTA(RD-003.md "예상 DELTA"
DELTA-04~06) 몫이다.

## 등록한 이슈

없음(신규). 기존 `pending-issues/01.md`(원 이슈 초안)는 이 DELTA와
무관하다.

## 게시

없음 — roadmap 전체(RD-001~003)가 미완료라 통합 완료 시점에 한 번만
Issue #162에 게시한다.

## 남은 위험

- 이 DELTA 범위 안에서는 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert d058099`. 위험: 낮음 — 이 커밋은 `apps/showcase`에 새
example 폴더·route 하나, `e2e/`에 신규 spec 하나, 두 test 파일의
기대값 갱신만 담았다. 기존 예제·라우트·webServer 항목·PM 관련 계약을
바꾸지 않아 단독 revert가 다른 커밋에 영향을 주지 않는다.
