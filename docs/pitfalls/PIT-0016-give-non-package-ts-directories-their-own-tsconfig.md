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

## 관련 문서

- [PIT-0015 composite tsconfig 패키지는 test 전용 tsconfig.test.json을 따로 둔다](./PIT-0015-separate-tsconfig-for-composite-package-tests.md)
