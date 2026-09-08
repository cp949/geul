# Issue #162 BLK-017 RD-003 DELTA-01 — showcase lowlight 구문 강조 예제 + example별 e2e 패턴 신설

## 목표

RD-003(showcase 예제 5개 + README + 문서 갱신)의 첫 번째 DELTA.
`apps/showcase`에 `lowlight`(+ `highlight.js`)로 만든 `SyntaxHighlighter`를
`EditorProvider`에 연결하는 첫 번째 구문 강조 예제를 추가하고, 이
저장소 최초의 example별 전용 Playwright E2E 패턴을 연다.

## 확정 커밋

- `bf5b9cf` — feat(showcase): lowlight 구문 강조 예제 + example별 e2e
  패턴 신설

## 변경한 계약과 파일

- `apps/showcase/package.json`: devDependencies에 `lowlight@3.3.0`,
  `highlight.js@11.12.0` 추가(production 의존성 아님 — showcase만
  쓰는 예제 라이브러리, `check-licenses.mjs`/`check-package-boundaries.mjs`
  둘 다 `--prod`만 스캔해 게이트 영향 없음).
- 신규 `apps/showcase/src/examples/10-syntax-highlighting-lowlight/`:
  `example.tsx`(hast 트리를 source 오프셋 기준 token으로 평탄화하는
  어댑터를 자체 포함, `SyntaxHighlighter` 타입을 별도 import하지
  않고 구조적으로 구현), `page.tsx`(기존 `ExamplePage` wiring 패턴).
- `apps/showcase/src/routes.tsx`·`root-layout.tsx`: 새 사이드바 그룹
  `"Syntax Highlighting"` 신설(향후 DELTA-02~05는 그룹을 다시 만들지
  않고 항목만 추가).
- `apps/showcase/test/routes-smoke.test.tsx`: 예제 개수 기대값
  10→11 갱신.
- `playwright.config.ts`: `webServer` 배열에 showcase(5174) 항목
  추가. demo 항목과 동시에 `pnpm --filter @cp949/geul-react build`를
  각자 실행하면 `dist/_styles.raw.css` 경합으로 실패함을 실측해(별도
  셸 두 개로 재현), showcase 항목은 자체 빌드하지 않고
  `packages/react/dist/styles.css`가 생길 때까지 폴링한 뒤 자신의
  dev 서버를 띄운다.
- 신규 `e2e/showcase-syntax-highlighting-lowlight.spec.ts`: 코드
  블록에 highlight.js token class(`hljs-*`)가 렌더되고 source
  텍스트는 바뀌지 않음을 확인. 페이지 이동 로직은 이 파일에
  인라인(G-TST-002 미적용 판단 — 최초의 example별 spec이라 "두 번째
  파일" 조건 미충족).
- `tests/workspace-boundaries.test.ts`: `allowedDependencies["apps/showcase"].devDependencies`에
  두 패키지 추가 — 이 파일이 devDependencies까지 정확 일치로 검사하는
  세 번째 게이트임을 이번 DELTA에서 실측 확인(RD-003 readiness
  probe는 `check-licenses.mjs`/`check-package-boundaries.mjs` 두
  스크립트만 확인했었다).
- `tests/playwright-webserver-isolation.test.ts`: showcase 항목
  추가로 `webServer` 배열 길이·인덱스가 바뀌어 갱신(1→2, chrome83
  포함 시 2→3).

## 검증

- GREEN: `pnpm --filter @cp949/geul-showcase`의 `typecheck`(3-tsconfig,
  PIT-0038)/`build`/`test`(13 files/28 tests), `pnpm exec vitest run
  tests/workspace-boundaries.test.ts`(apps/showcase 항목)·
  `tests/playwright-webserver-isolation.test.ts`, `pnpm
  check:boundaries`(8 manifests)/`check:escompat`/`check:licenses`,
  `pnpm lint`/`format`(변경 파일), `pnpm build`/`pnpm typecheck`(turbo
  전체), `pnpm typecheck:e2e`/`typecheck:configs`.
- 신규 e2e spec 단독 GREEN. `pnpm test:e2e`(chromium+mobile) 전량
  1회(playwright.config.ts의 webServer 배열을 이 DELTA가 처음
  건드려 필요) — 187 passed, pre-existing 3건 실패는 `git worktree`로
  복원한 `dev`(`dc6097c`)에서도 동일 재현돼 이 DELTA와 무관함을
  확인(`pending-issues/04.md`).
- 루트 `pnpm test`(vitest 전체, 313 files/3504 tests) — 최종 1건만
  실패, `packages/core`의 `prosemirror-highlight` 미등재(RD-001부터
  누적)로 `dev`에 이미 있던 pre-existing 실패(`pending-issues/03.md`).
- 검출력 검증(변이) 1건: `syntaxHighlighter` prop을 제거하면 신규
  e2e의 강조 span 단언이 "element(s) not found"로 실패 확인 → 원복.
- 재조립: 처음부터 단일 커밋, `dev`에 `--ff-only` 병합.

## 리뷰 발견과 처리(메인 세션 직접 검증)

1. `routes-smoke.test.tsx`의 하드코딩된 예제 개수(10) — 신규 route로
   깨짐, 11로 갱신.
2. `tests/workspace-boundaries.test.ts`의 devDependencies 정확 일치
   게이트 — 신규 발견, 갱신.
3. `tests/playwright-webserver-isolation.test.ts`의 webServer 배열
   길이·인덱스 하드코딩 — 신규 항목으로 깨짐, 갱신.
4. `tests/worktree-lint.test.ts`가 커밋 전 상태에서만 일시 실패
   (신규 미추적 다중 파일 디렉터리를 `git status --porcelain` 기본
   모드가 한 줄로 접어 `copyFile`이 EISDIR) — 커밋 후 자연 해소,
   이 세션이 만든 결함 아님, 별도 조치 없음.
5. `tests/workspace-typecheck-coverage.test.ts`가 전체 스위트 동시
   실행 중 1회만 실패, 단독·재실행 모두 통과 — 원인 미확정 flake,
   조치 없음.

## RD-003 진행 상태 — `ACTIVE`(완료 조건 1의 5개 중 1개 부분 충족)

완료 조건 1("5개 예제 각각이 Playwright Chromium E2E로 검증된다")의
1/5(lowlight)을 이 DELTA가 충족했다. 나머지 완료 조건(2~4)과 예제
4개는 후속 DELTA(RD-003.md "예상 DELTA" DELTA-02~06) 몫이다.

## 등록한 이슈

없음(신규). `pending-issues/02.md`(`format:check` 9→8개 파일,
RD-002-DELTA-01에서 발견, `code-block-language-combobox.tsx`가
RD-002-DELTA-02에서 재포맷돼 개수 정정)는 여전히 미등록. 이 DELTA가
새로 발견한 `pending-issues/03.md`(`packages/core`의
`prosemirror-highlight` 미등재)·`04.md`(e2e PIT-0011류 3건)도
미등록 — 등록 여부는 사용자 지시 대기.

## 게시

없음 — roadmap 전체(RD-001~003)가 미완료라 통합 완료 시점에 한 번만
Issue #162에 게시한다.

## 남은 위험

- 이 DELTA 범위 안에서는 없음.
- (참고, 이 DELTA 밖) `pending-issues/02.md`·`03.md`·`04.md` 3건 모두
  `dev`에 이미 있던 pre-existing 게이트 실패다 — RD-003 완료 조건
  4("`pnpm test`, `pnpm verify`가 전체 통과한다")를 완전히 충족하려면
  RD-003 최종 DELTA 전에 해소하거나 사용자 승인으로 예외 처리해야
  한다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert bf5b9cf`. 위험: 낮음 — 이 커밋은 `apps/showcase`에 새
example 폴더·route 하나, `e2e/`에 신규 spec 하나, 세 test 파일의
기대값 갱신만 담았다. 기존 예제·라우트·webServer 항목·PM 관련 계약을
바꾸지 않아 단독 revert가 다른 커밋에 영향을 주지 않는다.
