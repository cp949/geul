# PIT-0016 workspace 밖 TS 디렉터리는 전용 tsconfig로 typecheck 대상에 넣는다

- 상태: `ACTIVE`
- 적용 영역: workspace·build
- 최초 근거: Issue #57

## 상황과 징후

`pnpm-workspace.yaml`의 `packages`는 `apps/*`·`fixtures/*`·`packages/*`뿐이다. 루트 `typecheck` 스크립트(`turbo run typecheck`)는 이 workspace 패키지 목록만 도는 turbo 태스크 그래프를 따라간다. 저장소 루트의 `e2e/`(`*.spec.ts` 10개 + `e2e/support/` 2개)는 `pnpm-workspace.yaml`에도 없고 전용 tsconfig도 없어 turbo 태스크 그래프 밖이다 — `pnpm typecheck`도 `pnpm verify`도 이 디렉터리를 한 번도 typecheck하지 않았다. config를 켜자마자 8개 파일에서 16건의 실제 타입 오류가 드러났다(전부 같은 계열 — `openDemo`/`insertTable`의 `page` 파라미터를 `Parameters<typeof test>[0]["page"]`로 잘못 타입 지정해 playwright `test`의 첫 호출 시그니처(제목 `string`)를 가리켰다).

## 근본 원인

turbo의 workspace 인식은 `pnpm-workspace.yaml`의 `packages` glob과 각 패키지의 `turbo.json` 태스크 정의에 의존한다. 저장소 루트에 `packages: [...]` glob에 걸리지 않는 디렉터리(예: `e2e/`, 향후 `scripts/`나 `tools/` 등)를 TypeScript로 만들면, 그 디렉터리는 pnpm workspace 패키지도 turbo 태스크 그래프의 노드도 아니라서 `turbo run typecheck`가 존재를 모른다. PIT-0015가 다루는 "패키지 안의 `test/`가 메인 `tsconfig.json`의 `include` 밖"과 증상은 같지만(타입 오류가 조용히 통과), 원인은 다르다 — PIT-0015는 같은 패키지 안 `include` 누락이고 이쪽은 애초에 turbo/workspace 그래프에 편입되지 않은 디렉터리다.

## 예방 규칙

- workspace 패키지가 아닌 최상위 디렉터리에 `.ts`/`.tsx` 파일을 새로 두게 되면(예: `e2e/`), 그 디렉터리 전용 `tsconfig.json`을 만든다 — 루트 `tsconfig.base.json`을 extends, `noEmit: true`, 필요한 `lib`을 명시(브라우저 API를 쓰면 `DOM`을 넣는다), `types`는 실제 필요한 것만 명시(불필요하면 `types: []`로 자동 포함을 막아 의도를 드러낸다).
- 루트 `package.json`의 `typecheck` 스크립트가 그 디렉터리를 거치도록 직접 연결한다(`turbo run typecheck`는 workspace 패키지만 돌기 때문에 별도로 이어 붙여야 한다) — `"typecheck": "turbo run typecheck && pnpm typecheck:e2e"`처럼 `&&`로 순차 실행하고, `pnpm verify`가 그 스크립트를 거치는지 확인한다.
- 새 최상위 디렉터리를 workspace에 편입할지, 아니면 이 패턴처럼 독립 tsconfig+스크립트로만 typecheck에 편입할지는 그 디렉터리가 다른 패키지에 의존하는지로 가른다. workspace 패키지를 import한다면(예: `@cp949/geul-model`) PIT-0015의 `references`/`dist` 해석 문제가 그대로 적용된다. `e2e/`는 소스를 직접 import하지 않고 브라우저에서 구동 중인 앱을 playwright로 조작할 뿐이라 이 문제가 없다.
- 새 tsconfig를 추가·수정하면 반드시 의도적으로 깬 타입 오류로 실제로 잡히는지 확인한 뒤 되돌린다(PIT-0015와 동일 절차).

## 검증 방법

```bash
pnpm typecheck:e2e
```

변이 절차: `e2e/block-handle.spec.ts` 맨 끝에 `const _pit57TypecheckProbe: number = "intentional-type-error-for-issue-57-verification";`를 추가하고 위 명령을 재실행해 실패하는지 확인한다. 확인 후 즉시 되돌리고 `git diff -- e2e/block-handle.spec.ts`가 무출력인지 재확인한다.

## 실제 근거

- 커밋 `522ba1e`(Issue #57) — `e2e/tsconfig.json` 신설과 루트 `typecheck` 스크립트 연결. 수정 전 `_pit57TypecheckProbe` 삽입이 조용히 통과(PASS)하고, 수정 후 같은 삽입이 실패(FAIL, `string`을 `number`에 대입 불가 에러)하는 것을 직접 확인했다.
- 커밋 `12a7965`(Issue #57) — config를 켜자마자 드러난 실제 타입 오류 8개 파일 16건을 고쳤다. `block-handle`·`editor-round-trip`·`formatting-toolbar`·`link-toolbar`·`slash-menu`·`table-cell-selection`·`table-handle`·`table-keyboard-navigation` 전부 `page` 파라미터 타입을 `Parameters<typeof test>[0]["page"]`(잘못됨, `test`의 첫 시그니처 파라미터는 제목 `string`)에서 `Page` 직접 import로 고쳤다. 그중 3개 파일은 파급으로 `ReturnType<typeof openDemo> extends Promise<infer T> ? T["editable"] : never`도 `T`를 못 좁혀 실패해 `Locator`로 단순화했고, `link-toolbar` 1건은 `.evaluate` 콜백 파라미터 암묵적 `any`를 `HTMLParagraphElement`로 명시했다.
- `pnpm typecheck`(전체) exit 0, `pnpm verify:packages` exit 0, `pnpm test:e2e` 113건 전부 통과를 커밋 후 확인했다.
- Issue #95 — `scripts/*.mjs` 3개(`check-licenses.mjs`, `check-package-boundaries.mjs`, `find-duplicate-test-helpers.mjs`)가 같은 이유로 게이트 밖이었다. 앞 둘은 `pnpm verify`가 실행하는 게이트 스크립트 자신이다 — 게이트 자신이 무검증이었다.
- `scripts/tsconfig.json`을 신설하고 루트 `typecheck`에 `pnpm typecheck:scripts`를 이었다. `e2e/` 때와 달리 `allowJs: true` + `checkJs: true`가 필요했다 — 대상이 `.mjs`이기 때문이다. `include`는 `["**/*"]`로 두어 확장자를 명시하지 않았다. `e2e/tsconfig.json`의 `["**/*.ts"]`와 다른 선택이고, 앞으로 `scripts/`에 다른 확장자가 들어와도 자동으로 게이트에 들어오게 하려는 것이다.
- 켜자 41건이 드러났다: TS7006 36, TS7005 3, TS7034 2. 전부 implicit any이고 실제 타입 결함은 0건이었다. `e2e/` 때(실제 타입 결함 8개 파일 16건)와 대비된다 — 이 pitfall이 막는 것은 "결함이 있다"가 아니라 "있어도 보이지 않는다"다.
- 41건은 JSDoc `@param`·`@returns`·`@typedef`·`@type`으로만 없앴다. `find-duplicate-test-helpers.mjs`의 diff는 JSDoc 주석 줄로만 이루어져 런타임 코드 줄의 추가·삭제가 0이다. 그 파일은 [`PIT-0022`](./PIT-0022-own-test-helpers-in-a-shared-module.md)의 탐지기라 동작이 바뀌면 안 됐고, 탐지기 수정 직전과 직후 같은 트리에서 실행한 `pnpm scan:test-helpers` 출력이 sha1까지 동일함(`8e341270534244f67534dcb59d5a4ec24d1b48fe`, 중복 그룹 2개 / 헬퍼 선언 164개)과 `tests/find-duplicate-test-helpers.test.ts` 34건 전량 통과로 확인했다.
- 그 뒤 같은 작업의 회귀 테스트가 `tests/workspace-boundaries.test.ts`에 헬퍼 `const`를 여럿 추가했다. `tests/`가 탐지기의 기본 대상 디렉터리라서 **헬퍼 선언 총계는 그때마다 움직인다** — 이 문서에 그 수를 적지 않는다. 실제로 이 작업 하나에서만 164 → 166 → 168 → 169로 세 번 밀렸고, 그때마다 문서에 박아둔 수치가 곧바로 낡았다. 고정할 값은 **중복 그룹 수 2개**이고 이것은 작업 내내 변하지 않았다 — 새 헬퍼들은 서로 다른 본문이라 중복군을 이루지 않는다. 위 sha1이 고정하는 것도 "탐지기 수정 직전과 직후 같은 트리"의 동일성이지 현재 트리의 불변량이 아니다.
- 위 검증 방법 절 절차를 그대로 실행한 실제 출력:

  ```console
  $ printf '\n/** @type {number} */\nconst _pit95TypecheckProbe = "intentional-type-error-for-issue-95-verification";\n' >> scripts/find-duplicate-test-helpers.mjs
  $ pnpm typecheck:scripts
  scripts/find-duplicate-test-helpers.mjs(784,7): error TS2322: Type 'string' is not assignable to type 'number'.
  exit=1
  $ git checkout -- scripts/find-duplicate-test-helpers.mjs
  $ pnpm typecheck:scripts
  exit=0
  ```

  `.mjs`는 타입 주석 문법을 파싱하지 않는다. `e2e/`의 `const x: number = "..."` 형태 대신 JSDoc `@type` 형태로 probe를 넣었다.
- 재발을 구조로 막기 위해 `tests/workspace-boundaries.test.ts`에 `describe("workspace 밖 소스 디렉터리의 typecheck 편입")`를 추가했다. `it` 셋이 각각 다른 무력화 경로를 막는다.
  1. `it("전용 tsconfig를 갖고 루트 typecheck 체인에서 도달할 수 있다")` — `git ls-files`로 대상 디렉터리를 발견하고(리터럴 목록을 쓰지 않는다) 루트 `package.json`의 `typecheck` 체인에서 `-p <dir>/tsconfig.json`을 찾는다. `pnpm run <스크립트명>` 표기도 펼친다.
  2. `it("각 디렉터리의 추적 소스 파일을 tsconfig의 실제 컴파일 대상에 전부 포함한다")` — tsconfig가 체인에서 참조만 되고 아무것도 검사하지 않는 상태를 막는다. `include`/`exclude` glob을 흉내 내지 않고 `tsc --listFilesOnly`에게 그대로 묻는다. **검사 대상 tsconfig 자신의 `exclude`를 기대값에서 깎지 않는다** — 그러면 `exclude` 한 줄로 파일을 게이트 밖에 두어도 기대값이 같이 줄어 단언이 구현을 되뇔 뿐이다. 빠진 파일은 같은 디렉터리의 다른 tsconfig가 실제로 컴파일할 때만 정당한 예외로 본다(`tests/fixtures/dom-lib-forbidden.ts`가 그 경우다).
  3. `it("JS 소스를 가진 디렉터리의 tsconfig는 allowJs·checkJs를 켜고 include로 확장자를 거르지 않는다")` — 2번은 그 확장자의 파일이 실제로 생겨야 발화하므로, `include`가 좁아지는 순간 자체는 이 단언이 더 먼저 잡는다. 리터럴 동등이 아니라 "확장자로 거르지 않고 하위 디렉터리까지 덮는 패턴이 있는가"라는 속성을 본다 — `["./**/*"]`와 `include` 생략은 `["**/*"]`와 컴파일 대상이 같으므로 거짓 실패로 만들지 않는다.

  workspace 루트 목록은 `scripts/find-duplicate-test-helpers.mjs`의 `WORKSPACE_ROOTS`를 재사용해 사본을 늘리지 않는다.
- 남은 사각지대: 루트의 `playwright.config.ts`와 `vitest.config.ts`는 여전히 어떤 tsconfig의 `include`에도 잡히지 않는다. 이 pitfall과 회귀 테스트가 다루는 단위가 디렉터리라 별도 후속으로 분리했다.

## 관련 문서

- [PIT-0015 composite tsconfig 패키지는 test 전용 tsconfig.test.json을 따로 둔다](./PIT-0015-separate-tsconfig-for-composite-package-tests.md)
- [PIT-0022 테스트 헬퍼는 두 번째 파일에서 복제하지 말고 공용 모듈이 단독 소유한다](./PIT-0022-own-test-helpers-in-a-shared-module.md)
