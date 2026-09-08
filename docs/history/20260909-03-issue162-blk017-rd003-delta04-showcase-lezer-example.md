# Issue #162 BLK-017 RD-003 DELTA-04 — showcase CodeMirror(lezer) 구문 강조 예제

## 목표

RD-003(showcase 예제 5개 + README + 문서 갱신)의 네 번째 DELTA.
`apps/showcase`에 `@lezer/javascript` + `@lezer/highlight`(CodeMirror6의
문법 파서/구문 강조 엔진)로 만든 `SyntaxHighlighter`를 `EditorProvider`에
연결하는 네 번째 구문 강조 예제를 추가한다.

## 확정 커밋

- `b0ba4dc` — feat(showcase): CodeMirror(lezer) 구문 강조 예제 추가

## 변경한 계약과 파일

- `apps/showcase/package.json`: devDependencies에
  `@lezer/highlight@1.2.3`(MIT), `@lezer/javascript@1.5.4`(MIT) 추가
  (production 의존성 아님).
- 신규 `apps/showcase/src/examples/13-syntax-highlighting-lezer/`:
  `example.tsx`(lezer 어댑터를 자체 포함, `SyntaxHighlighter` 타입을
  별도 import하지 않고 구조적으로 구현), `theme.css`(`classHighlighter`가
  만드는 `tok-*` class 9종의 색상 매핑 — CodeMirror6 생태계는
  highlight.js·Prism과 달리 독립 배포 정적 테마 CSS 자산이 없어 이
  DELTA가 직접 작성), `page.tsx`(기존 `ExamplePage` wiring 패턴).
  `@lezer/highlight`의 `highlightTree(tree, classHighlighter, (from, to,
  classes) => {...})`가 hast 트리 없이 소스 오프셋 기준으로 겹치지 않는
  flat 구간을 직접 콜백으로 준다는 사실을 scratchpad 실측으로 확인해,
  DELTA-01·03의 hast 평탄화 헬퍼(`flattenHastToTokens`)가 필요 없는
  더 단순한 어댑터로 구현했다.
- `apps/showcase/src/routes.tsx`: 기존 `"Syntax Highlighting"` 그룹에
  항목 추가(그룹 자체는 DELTA-01이 이미 신설).
- `apps/showcase/test/routes-smoke.test.tsx`: 예제 개수 기대값
  13→14 갱신.
- 신규 `e2e/showcase-syntax-highlighting-lezer.spec.ts`:
  `e2e/support/showcase.ts`의 `openShowcaseExample` helper를 재사용
  (G-TST-002). 코드 블록에 `span[class*="tok-"]`가 렌더되고 source
  텍스트는 바뀌지 않음을 확인. "function" 키워드 토큰의 computed
  color가 이 예제의 `theme.css` `.tok-keyword` 색상(`rgb(215, 58, 73)`)과
  일치하는지 구체적으로 검증.
- `tests/workspace-boundaries.test.ts`: `allowedDependencies["apps/showcase"].devDependencies`에
  `@lezer/highlight`·`@lezer/javascript` 추가.

## 언어 커버리지 조사(착수 조건)

`codeBlockLanguages` 기본 11개 언어(`text` 제외) 중 공식 `@lezer/*`
문법 패키지가 있는 언어는 8개(javascript·typescript(`@lezer/javascript`의
`dialect: "ts"`로 커버)·html·css·json·python·java·markdown)뿐이다.
`bash`·`kotlin`·`sql` 3개는 공식 패키지가 없다(`npm view` 404). 기존
DELTA-01·03이 확립한 판단(완료 조건은 "라이브러리당 동작 예제 1개")을
그대로 적용해 javascript 단일 언어로 범위를 확정했다 — 3개 언어 미지원
사실은 완료 조건 달성에 영향이 없다.

## 검증

- RED→GREEN: 신규 e2e spec을 구현 전 먼저 실행해 route 미등록으로
  실패(`pre[data-geul-code-block] code` element(s) not found) 확인 →
  구현 후 재실행 GREEN.
- GREEN: `pnpm --filter @cp949/geul-showcase`의 `typecheck`(3-tsconfig,
  PIT-0038)/`build`(단일 청크 2.19MB/gzip 644KB, DELTA-03의 2.06MB 대비
  `@lezer/javascript` 문법 테이블만큼 증가, WASM·언어별 chunk 분열
  없음)/`test`(13 files/31 tests), `pnpm exec vitest run
  tests/workspace-boundaries.test.ts`(41 tests), `pnpm
  check:boundaries`(8 manifests)/`check:escompat`(214개 파일)/`check:licenses`(160
  external transitive production packages, 아래 "부수 발견" 참고), `pnpm
  lint`/`prettier --check`(변경 파일), `pnpm typecheck:e2e`.
- 신규 e2e spec 단독 GREEN(`--project=chromium`), 형제 spec 3건
  (lowlight·shiki·refractor)도 함께 재실행해 회귀 없음 확인(4 passed).
  `pnpm test:e2e` 전량과 루트 `pnpm test`(vitest 전체) 재실행은
  스킵했다 — DELTA-01·02가 이미 각각의 첫 실행을 완료했고 이 DELTA는
  그 대상(webServer 배열, apps/showcase 최초 전체 실행)을 바꾸지 않는다.
- 검출력 검증(변이) 1건: `example.tsx`에서
  `syntaxHighlighter={lezerSyntaxHighlighter}`를 제거하면 신규 e2e의
  `span[class*="tok-"]` 단언이 "element(s) not found"로 실패 → 원복 후
  재통과 확인.
- 재조립: 처음부터 단일 커밋, `dev`에 `--ff-only` 병합.

## 리뷰 발견과 처리(메인 세션 직접 검증, subagent 미사용)

계획대로 구현됐다. `pnpm check:licenses` 카운트가 158→160으로 늘어난
원인을 조사했다 — 신규 devDependency `@lezer/highlight`가
`packages/core`의 production dependency `prosemirror-highlight@0.16.0`의
**optional peerDependency**(`@lezer/common@^1.0.0`,
`@lezer/highlight@^1.0.0`)를 우연히 만족시켜 pnpm이 그 peer 조합을
링크했다(`@lezer/javascript`는 이 패키지의 peer가 아니라 영향 없음).
그 결과 `@lezer/common`·`@lezer/highlight` 두 패키지가 `--prod` 스캔
대상에 새로 포함됐다(둘 다 MIT라 게이트 영향 없음). 런타임 영향은
없다 — `prosemirror-highlight`의 메인 entry는 lezer 코드를 import하지
않고(`prosemirror-highlight/lezer`라는 별도 optional subpath에만
있음), `packages/core`의 `code-block-highlight-extension.ts`는 메인
entry만 쓴다(패키지 `exports` map과 소스 정적 분석으로 확인) —
`packages/core` 재테스트는 생략했다. 다른 발견 없음.

## RD-003 진행 상태 — `ACTIVE`(완료 조건 1의 5개 중 4개 충족)

완료 조건 1("5개 예제 각각이 Playwright Chromium E2E로 검증된다")의
4/5(lowlight, shiki, refractor, lezer)를 충족했다. 나머지 완료 조건
(2~4)과 예제 1개(sugar-high)는 후속 DELTA(RD-003.md "예상 DELTA"
DELTA-05~06) 몫이다.

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

`git revert b0ba4dc`. 위험: 낮음 — 이 커밋은 `apps/showcase`에 새
example 폴더·route 하나, `e2e/`에 신규 spec 하나, 두 test 파일의
기대값 갱신만 담았다. 기존 예제·라우트·webServer 항목·PM 관련 계약을
바꾸지 않아 단독 revert가 다른 커밋에 영향을 주지 않는다.
