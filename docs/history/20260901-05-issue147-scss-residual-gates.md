# Issue #147 SCSS 마이그레이션 잔여 게이트

## 목표

Issue #4(Tailwind v4 → SCSS+PostCSS 대체, `e40d4be`)의 완료 기준 중 대체 이후 채워지지 않은 게이트 2개를 구현한다 — 유틸리티 없는 소비자가 `styles.css`만 import해 번들러 설정 없이 build되는 characterization, 배포 CSS의 Chrome 75(ADR 0008) 미지원 문법 자동 검사.

## 확정 커밋

- `cab2b59` — feat(fixtures): consumer fixture가 styles.css를 실제로 build해 소비한다
- `f3dcf61` — test(react): 컴파일 CSS가 @container·:has()를 쓰지 않음을 고정한다

## 변경한 계약과 파일

- `fixtures/consumer`에 `esbuild` build 스크립트(0.28.2 exact, `packages/react`와 동일 버전)를 신규 추가하고 `styles.css` import를 넣었다. `turbo.json`의 `build` 태스크는 패키지 allowlist가 없어 `scripts.build` 정의만으로 자동 편입된다 — 루트 `package.json` 배선은 불필요했다(계획 시점엔 필요하다고 봤으나 트랙-4 실측으로 정정).
- `packages/react/test/style-build.test.ts`(기존 파일)에 `@container`·`:has()` 부재 검증을 추가했다. `postcss`(이미 이 패키지의 devDependency)로 컴파일 CSS AST를 순회한다.
- 트랙-2 라운드 1에서 원안(루트 `scripts/check-csscompat.mjs`가 `postcss`를 재사용)이 BLOCKER 판정을 받았다 — `postcss`는 `packages/react`만의 devDependency라 pnpm 비-hoist 구조상 루트 스크립트에서 즉시 `MODULE_NOT_FOUND`. 세 리뷰 렌즈 전원이 독립적으로 `require.resolve` 실측으로 확인해 위 형태(기존 패키지 테스트 확장)로 재설계했다.
- 트랙-6 결함 탐지에서 MAJOR 2건 발견·수정 — (1) `:has()` 오탐 방지 테스트가 "아래에서 고정한다"고 주석에 썼지만 실제로 없었다(합성 selector 테스트 추가로 해소). (2) `@container`·`:has()` 두 게이트 모두 vacuous-predicate였다 — 실제 CSS에 대상 문법이 이미 0건이라 검출 로직을 통째로 비워도 통과했다(합성 at-rule/selector로 참-양성 테스트 추가해 해소). 부수로 `tests/workspace-typecheck-coverage.test.ts`의 주석 드리프트(`fixtures/consumer`가 이제 `build` 스크립트도 가짐)도 정정했다.
- 신규 devDependency는 `esbuild@0.28.2`(`fixtures/consumer`) 1개뿐. `docs/product/dependency-licenses.md`는 production dependency만 추적하는 문서라 갱신 대상 아님(범위 명시 확인).
- 패키지 경계, 공개 API shape, 저장 포맷 변경 없음.

## 검증

- 트랙-5(누락 탐지): 완료 체크리스트 6개 항목 전부 `PASS`.
- 트랙-6(결함 탐지, Focused 2-lens): MAJOR 2건 수정·검증(변이로 RED 재현 후 원복 GREEN 확인), MINOR 1건 함께 수정. BLOCKER 0건.
- `pnpm --filter consumer-fixture build`/`typecheck` `PASS`. `pnpm --filter @cp949/geul-react test` 최종 339/339 `PASS`(`style-build.test.ts` 단독 17/17).
- `pnpm verify` 전량(트랙-6 종료 후 1회): lint·format:check·build·check:escompat·typecheck·test(165 files/2080 tests)·check:boundaries·check:licenses·test:e2e(chromium, 115건) 전부 `PASS`, exit 0.
- 재그룹화 경계: DELTA-01 그룹(`cab2b59`)까지 `consumer-fixture` typecheck `PASS`. 재조립 tip(`f3dcf61`)에서 `@cp949/geul-react` typecheck `PASS`. 원본 pre-squash 백업과 최종 tree diff는 빈 출력(완전 일치).

## 상태와 남은 제한

- Issue #147 완료 댓글: `https://github.com/cp949/geul/issues/147#issuecomment-5486832073`. 완료 기준 3개 전부 충족해 이슈를 닫았다.
- 후속 이슈 없음 — 이 작업 범위 밖에서 발견한 미해결 항목 없음.
- 가이드·함정 신규 등록 없음. 트랙-2에서 드러난 "루트 `scripts/`는 워크스페이스 멤버 패키지의 devDependency를 resolve할 수 없다(pnpm 비-hoist)"는 리뷰 단계에서 한 번 관측·수정된 사례라 pitfall 승격 기준("반복" 요구)에 못 미친다고 판단했다 — 지배 가이드(`G-WKS-001`)는 이미 있고 계획이 인용을 놓쳤을 뿐이다.
- 참고(결함 아님): 이 작업은 실행 DELTA 2개로 끝났다. ff-workflow의 "1~2개로 충분하면 qq-workflow 적합성을 다시 판정한다" 규칙이 있었으나, 레인은 트랙-0에서 이미 확정했고 AGENTS.md에 따라 재판정하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 2개와 이 이력 커밋을 `dev`에서 역순으로 `git revert`한다.
