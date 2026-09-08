# Issue #162 BLK-017 RD-003 DELTA-05 — showcase sugar-high 구문 강조 예제

## 목표

RD-003(showcase 예제 5개 + README + 문서 갱신)의 다섯 번째(마지막)
DELTA. `apps/showcase`에 `sugar-high`(zero-dependency 경량 구문 강조
라이브러리)로 만든 `SyntaxHighlighter`를 `EditorProvider`에 연결하는
다섯 번째 구문 강조 예제를 추가한다.

## 확정 커밋

- `7c0907e` — feat(showcase): sugar-high 구문 강조 예제 추가

## 변경한 계약과 파일

- `apps/showcase/package.json`: devDependencies에 `sugar-high@2.3.1`
  (MIT, zero-dependency) 추가(production 의존성 아님).
- 신규 `apps/showcase/src/examples/14-syntax-highlighting-sugar-high/`:
  `example.tsx`(sugar-high 어댑터를 자체 포함, `SyntaxHighlighter` 타입을
  별도 import하지 않고 구조적으로 구현), `theme.css`(`generate()`가
  만드는 `sh__token--*` class 7종의 색상 매핑 — sugar-high는 CodeMirror6
  계열과 마찬가지로 독립 배포 정적 테마 CSS 자산이 없어 이 DELTA가
  직접 작성), `page.tsx`(기존 `ExamplePage` wiring 패턴).
  `sugar-high/core`의 `parse()`+`generate()`가 오프셋 없는 줄→토큰
  트리만 돌려준다는 사실을 scratchpad 실측으로 확인해, 각 줄의 토큰
  텍스트 길이를 누적하고 줄 사이에 개행 문자 1개를 되돌려 넣는 방식으로
  source offset을 재구성하는 어댑터를 구현했다(DELTA-01·03의 hast
  평탄화, DELTA-04의 콜백 기반 접근과 또 다른 세 번째 형태).
- `apps/showcase/src/routes.tsx`: 기존 `"Syntax Highlighting"` 그룹에
  항목 추가(그룹 자체는 DELTA-01이 이미 신설).
- `apps/showcase/test/routes-smoke.test.tsx`: 예제 개수 기대값
  14→15 갱신(두 곳).
- 신규 `e2e/showcase-syntax-highlighting-sugar-high.spec.ts`:
  `e2e/support/showcase.ts`의 `openShowcaseExample` helper를 재사용
  (G-TST-002). 코드 블록에 `span[class*="sh__token--"]`가 렌더되고
  source 텍스트는 바뀌지 않음을 확인. "function" 키워드 토큰의 computed
  color가 이 예제의 `theme.css` `.sh__token--keyword` 색상(`rgb(207,
  34, 46)`)과 일치하는지 구체적으로 검증.
- `tests/workspace-boundaries.test.ts`: `allowedDependencies["apps/showcase"].devDependencies`에
  `sugar-high` 추가.

## 언어 커버리지 조사(착수 조건)

`codeBlockLanguages` 기본 11개 언어(`text` 제외) 전부 `sugar-high`가
대응 프리셋을 제공한다 — `javascript`·`typescript`·`html`·`css`·
`json`·`python`·`java`·`kotlin`·`sql`·`markdown`은 동일 이름으로
존재하고, `bash`는 `sugar-high`의 정규화 함수 `lang('bash')`가
`'shell'`로 매핑해 `shell` 프리셋이 대신 처리한다. DELTA-04(lezer,
8/11)와 대조적으로 11/11 전부 커버한다 — 그래도 기존 DELTA들이 확립한
판단(완료 조건은 "라이브러리당 동작 예제 1개")을 그대로 적용해
javascript 단일 예제로 범위를 확정했다.

## 검증

- RED→GREEN: 신규 e2e spec을 구현 전 먼저 실행해 route 미등록으로
  실패(`pre[data-geul-code-block] code` element(s) not found) 확인 →
  구현 후 재실행 GREEN.
- 구현 중 타입 이슈 1건 발견·해결: `sugar-high/lang/javascript`의
  `tokenize`가 패키지 내부 전용 `HighlightOptions` 타입(공개 export
  아님)으로 선언돼 있고 그 `onCommentEnd`가 4-파라미터인 반면 공개
  `sugar-high/core`의 `ParseOptions.onCommentEnd`는 5-파라미터라
  `parse(source, { tokenize })`가 `tsc`에서 거부됐다(패키지 자체
  `.d.ts` 간 불일치). 런타임 영향 없음을 scratchpad 실측으로 확인한 뒤
  `{ tokenize } as ParseOptions`로 좁은 범위 cast를 적용해 해결했다.
- GREEN: `pnpm --filter @cp949/geul-showcase`의 `typecheck`(3-tsconfig,
  PIT-0038)/`build`(단일 청크 2,207.02KB/gzip 649.87KB, DELTA-04의
  2.19MB 대비 sugar-high 파서 코드만큼 증가)/`test`(13 files/32
  tests), `pnpm exec vitest run tests/workspace-boundaries.test.ts`(41
  tests), `pnpm check:boundaries`(8 manifests)/`check:escompat`(214개
  파일)/`check:licenses`(161 external transitive production packages,
  아래 "부수 발견" 참고), `pnpm lint`/`prettier --check`(변경 파일),
  `pnpm typecheck:e2e`.
- 신규 e2e spec 단독 GREEN(`--project=chromium`), 형제 spec 4건
  (lowlight·shiki·refractor·lezer)도 함께 재실행해 회귀 없음 확인(5
  passed). `pnpm test:e2e` 전량과 루트 `pnpm test`(vitest 전체) 재실행은
  스킵했다 — DELTA-01·02가 이미 각각의 첫 실행을 완료했고 이 DELTA는
  그 대상(webServer 배열, apps/showcase 최초 전체 실행)을 바꾸지 않는다.
- 검출력 검증(변이) 1건: `example.tsx`에서
  `syntaxHighlighter={sugarHighSyntaxHighlighter}`를 제거하면 신규
  e2e의 `span[class*="sh__token--"]` 단언이 "element(s) not found"로
  실패 → 원복 후 재통과 확인.
- 재조립: 처음부터 단일 커밋, `dev`에 `--ff-only` 병합.

## 리뷰 발견과 처리(메인 세션 직접 검증, subagent 미사용)

두 건 발견·처리했다.

1. 위 "구현 중 타입 이슈"의 cast를 적용한 뒤, `flattenLinesToTokens`가
   `line.children`을 `GeneratedToken[]`로 다시 캐스트하던 코드가
   불필요함을 확인했다 — `GeneratedLine.children`이 이미
   `GeneratedToken[]`로 선언돼 있었다. 캐스트와 미사용
   `GeneratedToken` 타입 import를 제거하고 `typecheck`/`lint`/`build`/`test`/e2e
   전부 재통과를 확인했다.
2. `pnpm check:licenses` 카운트가 160→161로 늘어난 원인을 조사했다 —
   DELTA-04의 `@lezer/highlight`와 정확히 같은 메커니즘이다. 신규
   devDependency `sugar-high`가 `packages/core`의 production
   dependency `prosemirror-highlight@0.16.0`의 **optional
   peerDependency**(`sugar-high: ^2.0.0`)를 만족시켜 pnpm이 그 peer를
   링크했고, `--prod` 스캔 대상에 `sugar-high`가 새로 포함됐다(MIT라
   게이트 영향 없음). 런타임 영향은 없다 — `prosemirror-highlight`의
   메인 entry는 sugar-high 코드를 import하지 않고(별도 optional
   subpath `prosemirror-highlight/sugar-high`에만 있음),
   `packages/core`의 `code-block-highlight-extension.ts`는 메인
   entry만 쓴다(패키지 `exports` map과 소스 정적 분석으로 확인) —
   `packages/core` 재테스트는 생략했다. 다른 발견 없음.

## RD-003 진행 상태 — `ACTIVE`(완료 조건 1의 5/5 충족, 나머지 완료 조건은 DELTA-06 몫)

완료 조건 1("5개 예제 각각이 Playwright Chromium E2E로 검증된다")이
이 DELTA로 5/5(lowlight, shiki, refractor, lezer, sugar-high) 전부
충족됐다. 나머지 완료 조건(2~4: README 문서화, 인벤토리 `VERIFIED`
갱신, `pnpm test`/`pnpm verify` 전체 통과)은 후속 DELTA-06 몫이다.

## 등록한 이슈

없음(신규). 기존 `pending-issues/01.md`(원 이슈 초안)는 이 DELTA와
무관하다.

## 게시

없음 — roadmap 전체(RD-001~003)가 미완료라 통합 완료 시점에 한 번만
Issue #162에 게시한다.

## 남은 위험

- `sugar-high` 자체 `.d.ts`(presets 내부 `HighlightOptions` vs 공개
  `ParseOptions`)의 타입 불일치는 업스트림 패키지 이슈다 — 이 DELTA는
  좁은 범위 캐스트로 우회했을 뿐 업스트림에 보고하거나
  patch-package로 고치지 않았다. 런타임 영향 없음이 실측으로 확인돼
  비용 대비 이득이 낮다고 판단했다 — 제품 동작·게이트 구멍·거짓
  통과에 해당하지 않아 이슈로 등록하지 않는다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 7c0907e`. 위험: 낮음 — 이 커밋은 `apps/showcase`에 새
example 폴더·route 하나, `e2e/`에 신규 spec 하나, 두 test 파일의
기대값 갱신만 담았다. 기존 예제·라우트·webServer 항목·PM 관련 계약을
바꾸지 않아 단독 revert가 다른 커밋에 영향을 주지 않는다.
