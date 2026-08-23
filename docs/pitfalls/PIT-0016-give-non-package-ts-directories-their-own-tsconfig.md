# PIT-0016 추적 소스 파일 전량을 루트 typecheck 체인의 컴파일 대상에 넣는다

- 상태: `ACTIVE`
- 적용 영역: workspace·build
- 최초 근거: Issue #57

## 상황과 징후

`pnpm-workspace.yaml`의 `packages`는 `apps/*`·`fixtures/*`·`packages/*`뿐이다. 루트 `typecheck` 스크립트(`turbo run typecheck`)는 이 workspace 패키지 목록만 도는 turbo 태스크 그래프를 따라간다. 저장소 루트의 `e2e/`(`*.spec.ts` 10개 + `e2e/support/` 2개)는 `pnpm-workspace.yaml`에도 없고 전용 tsconfig도 없어 turbo 태스크 그래프 밖이다 — `pnpm typecheck`도 `pnpm verify`도 이 디렉터리를 한 번도 typecheck하지 않았다. config를 켜자마자 8개 파일에서 16건의 실제 타입 오류가 드러났다(전부 같은 계열 — `openDemo`/`insertTable`의 `page` 파라미터를 `Parameters<typeof test>[0]["page"]`로 잘못 타입 지정해 playwright `test`의 첫 호출 시그니처(제목 `string`)를 가리켰다).

## 근본 원인

turbo의 workspace 인식은 `pnpm-workspace.yaml`의 `packages` glob과 각 패키지의 `turbo.json` 태스크 정의에 의존한다. 저장소 루트에 `packages: [...]` glob에 걸리지 않는 디렉터리(예: `e2e/`, 향후 `scripts/`나 `tools/` 등)를 TypeScript로 만들면, 그 디렉터리는 pnpm workspace 패키지도 turbo 태스크 그래프의 노드도 아니라서 `turbo run typecheck`가 존재를 모른다. PIT-0015가 다루는 "패키지 안의 `test/`가 메인 `tsconfig.json`의 `include` 밖"과 증상은 같지만(타입 오류가 조용히 통과), 원인은 다르다 — PIT-0015는 같은 패키지 안 `include` 누락이고 이쪽은 애초에 turbo/workspace 그래프에 편입되지 않은 디렉터리다.

## 예방 규칙

- 요구의 단위는 **파일**이다 — 추적 소스 파일 전량이 루트 `typecheck` 체인이 실행하는 프로그램의 컴파일 대상에 들어야 한다. workspace 패키지가 아닌 위치(예: `e2e/`, `scripts/`, 루트의 `*.config.ts`)에 `.ts`/`.tsx`/`.mjs` 파일을 새로 두더라도 디렉터리마다 전용 `tsconfig.json`을 자동으로 강제하지 않는다 — `docs/` 아래 `.ts` 파일 하나가 `docs/tsconfig.json` 신설을 강제하지는 않는다. 이미 체인에 연결된 tsconfig의 `include`가 그 파일을 이미 덮는다면 그것으로 충분하고, 덮는 tsconfig가 없을 때만 그 위치 전용 `tsconfig.json`을 새로 만든다 — 루트 `tsconfig.base.json`을 extends, `noEmit: true`, 필요한 `lib`을 명시(브라우저 API를 쓰면 `DOM`을 넣는다), `types`는 실제 필요한 것만 명시(불필요하면 `types: []`로 자동 포함을 막아 의도를 드러낸다). 패키지 **안**이라도 같은 사각지대가 생길 수 있다 — 대표 `tsconfig.json`이 `rootDir`/`include`로 그 패키지의 config 파일(예: `vite.config.ts`)까지 덮지 못하면 workspace 밖과 똑같이 아무 프로그램도 그 파일을 컴파일하지 않는다(`apps/demo/vite.config.ts`가 실증, Issue #105) — workspace 밖만의 문제가 아니다. 어떤 tsconfig도 루트 `typecheck` 체인에 연결되지 않으면 커버로 치지 않는다 — "tsconfig는 있는데 아무도 안 돌린다"는 별개의 무력화 갈래다. `.js`/`.mjs`/`.cjs`/`.jsx` 소스는 그 파일을 담는 프로그램의 `checkJs`가 켜져 있어야 커버로 센다 — 멤버십(`--listFilesOnly` 결과에 있다)만으로는 과대평가다. `tests/tsconfig.json`은 `checkJs: false`인 채로 `scripts/*.mjs`를 `import`로 끌어와 컴파일 대상에 담지만 아무도 그 파일의 타입을 검사하지 않는다(Issue #105 실측). 부득이하게 예외를 두면 `{ 파일, 실제로 컴파일하는 tsconfig }` 쌍으로 등록하고, 그 쌍마다 파일 존재·실제 컴파일·체인 커버리지 밖 여부를 각각 확인한다 — 파일 이름만 나열한 목록은 늘어나며 게이트를 조용히 좁힌다.
- 루트 `package.json`의 `typecheck` 스크립트가 그 디렉터리를 거치도록 직접 연결한다(`turbo run typecheck`는 workspace 패키지만 돌기 때문에 별도로 이어 붙여야 한다) — `"typecheck": "turbo run typecheck && pnpm typecheck:e2e"`처럼 `&&`로 순차 실행하고, `pnpm verify`가 그 스크립트를 거치는지 확인한다.
- 새 최상위 디렉터리를 workspace에 편입할지, 아니면 이 패턴처럼 독립 tsconfig+스크립트로만 typecheck에 편입할지는 그 디렉터리가 다른 패키지에 의존하는지로 가른다. workspace 패키지를 import한다면(예: `@cp949/geul-model`) PIT-0015의 `references`/`dist` 해석 문제가 그대로 적용된다. `e2e/`는 소스를 직접 import하지 않고 브라우저에서 구동 중인 앱을 playwright로 조작할 뿐이라 이 문제가 없다.
- 새 tsconfig를 추가·수정하면 반드시 의도적으로 깬 타입 오류로 실제로 잡히는지 확인한 뒤 되돌린다(PIT-0015와 동일 절차).
- **`turbo run typecheck`가 workspace 안을 덮는다는 전제도 검증 대상이다.** turbo는 그 태스크를 **정의한 패키지에서만** 돈다. 패키지가 `scripts.typecheck`를 잃으면 turbo는 그 패키지를 조용히 빼고 남은 태스크만 실행해 `exit 0`으로 통과한다 — 게이트 출력에 남는 차이는 태스크 수 하나뿐이다. workspace **밖** 디렉터리를 다루는 규칙은 이 전제 위에 서 있으므로, 전제 자체를 계약 테스트로 고정한다(`tests/workspace-boundaries.test.ts`의 `describe("workspace 패키지의 typecheck 편입")`).

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
- 재발을 구조로 막기 위해 `tests/workspace-boundaries.test.ts`에 `describe("workspace 밖 소스 디렉터리의 typecheck 편입")`를 두었다. 처음에는(위 항목들 당시) `it` 셋이 디렉터리 단위로 도달성·include 포함·allowJs/checkJs를 각각 봤다. Issue #105가 발견 축을 디렉터리에서 **파일 커버리지**로 교체하면서 같은 자리의 `it` 셋을 다시 짰다 — 아래가 현재 구성이다.
  1. `it("추적 소스 파일 전량이 체인 프로그램의 컴파일 대상에 들거나 예외 목록에 있다")` — `git ls-files`로 추적 소스 파일 전량(`.js`/`.mjs`/`.cjs`/`.ts`/`.jsx`/`.tsx`)을 뽑고, 루트 `package.json`의 `typecheck` 체인이 실제로 실행하는 tsc 프로그램 전량(`turbo run typecheck`가 있으면 workspace 패키지 열거까지 펼친다)에 대해 파일마다 `tsc --listFilesOnly` 컴파일 대상 포함 여부를 본다. `.js`/`.mjs`/`.cjs`/`.jsx`는 담는 프로그램의 `checkJs`가 켜져 있어야 커버로 센다. 차집합(미커버)이 예외 목록의 파일 집합과 정확히 같아야 통과한다 — `include`/`exclude` glob을 흉내 내지 않고 tsc에게 그대로 묻는다.
  2. `it.each(TYPECHECK_COVERAGE_EXCEPTIONS)(...)` — 예외 목록 항목마다 그 파일이 여전히 존재하고, 짝지은 tsconfig가 실제로 컴파일하며, 체인 커버리지 밖에 있는지 셋을 확인한다. 사라진 예외, 더는 컴파일하지 않는 짝, 체인이 이미 덮게 됐는데 예외로 남아 게이트 면적을 조용히 갉는 것을 항목별로 잡는다. 오늘 유일한 항목은 `tests/fixtures/dom-lib-forbidden.ts` / `tests/fixtures/io-dom-forbidden.tsconfig.json`이다(일부러 타입 오류를 담은 DOM 전역 차단 fixture라 체인에 넣으면 게이트가 항상 실패한다).
  3. `it("소유 기준으로 뽑은 체인 프로그램은 allowJs·checkJs를 켜고 include로 확장자를 거르지 않는다")` — 판정 1(소유 기준: 프로그램 P가 대상이다 ⟺ P의 tsconfig 디렉터리에 직접 속한 추적 JS 소스가 있고 그 파일이 P의 컴파일 대상에 실제로 든다)로 대상 프로그램을 추려(오늘은 `scripts/tsconfig.json` 하나 — `tests/tsconfig.json`은 `scripts/*.mjs`를 `import`로 컴파일 대상에 담지만 그 디렉터리를 소유하지 않아 탈락한다), 그 프로그램들의 `allowJs`·`checkJs`가 켜져 있고 `include` 패턴 중 확장자로 끝나지 않는 것이 하나 이상 있는지 본다. 리터럴 동등이 아니라 그 속성만 본다 — `["./**/*"]`와 `include` 생략은 `["**/*"]`와 컴파일 대상이 같으므로 거짓 실패로 만들지 않는다.

  workspace 패키지 열거는 `scripts/workspace-roots.mjs`의 `workspacePackageDirectories()`를 재사용해 사본을 늘리지 않는다.
- 닫힌 사각지대(Issue #105): 루트의 `playwright.config.ts`·`vitest.config.ts`와 `apps/demo/vite.config.ts` 셋 다 이 pitfall과 회귀 테스트가 다루던 단위가 디렉터리였을 때는 어떤 tsconfig의 `include`에도 잡히지 않았다. 셋 모두 typecheck 체인에 편입해 닫았다 — 아래 Issue #105 항목이 그 근거다.
- Issue #106 — **같은 증상이 디렉터리가 아니라 "게이트가 스스로 정하는 범위"에서 재발했다.** 두 갈래였다.
  1. workspace 루트 목록이 3벌이고 2벌(`check-package-boundaries.mjs`·`check-licenses.mjs`의 익명 인라인 리터럴)은 어떤 테스트도 참조하지 않았다. `scripts/workspace-roots.mjs`가 목록과 패키지 열거를 단독 소유하고 `tests/workspace-roots.test.ts`가 `pnpm-workspace.yaml`과 대조한다. 구현이 yaml을 파싱하지 않는 것은 의도다 — 파싱하면 계약 테스트가 파서를 자기 자신과 대조하는 동어반복이 된다(`PIT-0022`).
  2. 위 "예방 규칙"의 turbo 전제. `apps/demo`의 `scripts.typecheck`를 지우면 `turbo run typecheck`가 `Tasks: 9 successful, 9 total`로 exit 0이고(기준선 10) 당시 `tests/` 51건은 전량 통과했다. `--dry=json`의 총 태스크 수는 **줄지 않는다** — turbo가 그 태스크를 계속 나열하고 `command`만 `<NONEXISTENT>`로 바꾼다. 수가 주는 것은 실행이다.
- Issue #106 — **감시 장치 자신이 cwd에 걸려 눈감았다.** `findUnlistedTestDirectories()`가 존재 판정을 cwd 상대로 해, 잘못된 cwd에서는 워크스페이스 루트가 전부 없는 것으로 보여 후보가 0건이 되고 `expect(...).toEqual([])`이 공허하게 참이 됐다. 차집합의 빈 배열은 "전부 목록에 있다"와 "후보를 못 모았다" 둘 다에서 나오므로, 수집 결과를 `collectTestDirectoryCandidates()`로 따로 내보내야 계약 테스트가 그 둘을 가른다. 검증은 `process.chdir` 대신 cwd만 다른 자식 프로세스 두 벌을 대조한다 — `chdir`는 프로세스 전역이라 같은 워커의 다른 테스트를 오염시킨다.
- 무변화 증거의 함정: `pnpm scan:test-helpers` 출력 sha1을 그대로 대조하면 안 된다. 탐지기의 기본 대상에 `tests/`가 들어 있어, 회귀 테스트를 추가하는 것만으로 헬퍼 선언 수가 움직인다. 탐지기 동작 무변화를 보이려면 **코퍼스를 고정한 채**(테스트 파일을 이전 판으로 되돌려) 스크립트만 바꿔 비교한다.
- Issue #105 — **같은 증상이 디렉터리도 workspace 밖도 아닌 "config 파일"에서 재발했다.** 루트의 `playwright.config.ts`·`vitest.config.ts`와 `apps/demo/vite.config.ts` 셋 다 `tsconfig.base.json`을 뺀 어떤 프로그램의 컴파일 대상에도 없었다. `apps/demo/vite.config.ts`는 workspace 패키지 **안**에 있는데도 빠졌다 — `apps/demo/tsconfig.json`이 `rootDir: "src"` + `include: ["src/**/*.ts", "src/**/*.tsx"]`라 `src/` 밖 파일을 담을 수 없어서다. workspace 밖만의 문제가 아니라는 실증이다. 커밋 `19949b2` — `tsconfig.configs.json`·`apps/demo/tsconfig.configs.json` 신설(`allowJs`/`checkJs` 켬, `include: ["*"]`, `noEmit: true`), 루트 `typecheck`에 `typecheck:configs` 연결, `apps/demo`의 `typecheck`를 `tsc --noEmit && tsc -p tsconfig.configs.json --noEmit` 두 번의 tsc 호출로 연결.
- 세 파일을 켜서 드러난 타입 오류는 0건이었다. #95(implicit any 41건, 실제 결함 0건)와 같은 계열이고 #57(실제 결함 8개 파일 16건)과는 대비된다 — 이 pitfall이 매번 잡는 것은 "결함이 있다"가 아니라 "있어도 안 보인다"다. 확인은 각 파일 끝에 `const _pit105Probe: number = "intentional-type-error-for-issue-105";`를 추가해 `pnpm typecheck`가 실패하는지, 되돌리면 통과하는지로 했다(저장소 트리 밖 scratchpad에서 사전 확인, `PIT-0024`).
- **판정 1의 실측** — 커버리지 판정의 입력을 "컴파일 대상에 그 파일이 있는 프로그램"(멤버십)만으로 뽑으면 안 된다. `tsc -p tests/tsconfig.json --listFilesOnly`는 `scripts/*.mjs` 3개를 담는다 — `tests/`가 그 파일들을 `import`하기 때문이다(`tests/tsconfig.json`이 있는 디렉터리에 추적 JS 소스는 없다). 소유 기준(프로그램 P가 대상이다 ⟺ P의 tsconfig 디렉터리에 직접 속한 추적 JS 소스가 있고 그 파일이 P의 컴파일 대상에 실제로 든다)을 더해야 `tests/tsconfig.json`이 JS include 단언의 대상에서 빠지고, 오늘 대상이 `scripts/tsconfig.json` 하나로 좁혀진다.
- **`include: ["*"]`가 정당한 형태다** — 신설 두 tsconfig는 최상위 파일 전용(하위 미포함) `include: ["*"]`를 쓴다. 루트 config 전용 프로젝트에서 `["**/*"]`를 쓰면 저장소 전체를 훑는다. 그래서 JS include 단언(위 3번 `it`)에서 "하위 디렉터리까지 덮는다"를 요구 조건에서 뗐다 — 그 자리는 파일 커버리지 축(1번 `it`)이 대신 진다: `include`가 하위 디렉터리를 빼면 그 아래 파일이 미커버로 잡힌다.

## 관련 문서

- [PIT-0015 composite tsconfig 패키지는 test 전용 tsconfig.test.json을 따로 둔다](./PIT-0015-separate-tsconfig-for-composite-package-tests.md)
- [PIT-0022 테스트 헬퍼는 두 번째 파일에서 복제하지 말고 공용 모듈이 단독 소유한다](./PIT-0022-own-test-helpers-in-a-shared-module.md)
