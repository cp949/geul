# PIT-0015 composite tsconfig 패키지는 test 전용 tsconfig.test.json을 따로 둔다

- 상태: `ACTIVE`
- 적용 영역: workspace, build
- 최초 근거: Issue #32

## 상황과 징후

`packages/{core,io,model,react}/tsconfig.json`은 전부 `composite: true` + `rootDir: "src"` + `include: ["src/**/*.ts"]`(react는 `.tsx` 포함) 구조이고, 각 패키지의 `typecheck` 스크립트는 `tsc -p tsconfig.json --noEmit`이다. `test/` 디렉터리는 `include`에 없어 한 번도 typecheck 대상이 아니었다 — 테스트 파일이 깨진 타입으로 잘못된 것을 단언해도 `pnpm --filter <pkg> typecheck`도 `pnpm typecheck`(turbo 경유)도 잡지 못한다. `packages/core/test/table-grid.test.ts`에 `const _pit32TypecheckProbe: number = "intentional-type-error-for-issue-32-verification";`를 추가해도 수정 전 `typecheck`는 조용히 통과했다(node 직접 확인함, Issue #32).

## 근본 원인

`rootDir: "src"`는 `tsc -b`가 `dist/`를 만들 때 소스 트리 구조를 그대로 미러링하기 위한 설정이다(`dist/index.d.ts`가 `package.json`의 `exports.types` 계약). `test/**/*.ts`를 같은 `include`에 추가하면 두 가지 중 하나가 깨진다: `rootDir: "src"`를 유지하면 TypeScript가 "File is not under 'rootDir'" 에러를 낸다. `rootDir`을 없애거나 넓히면 `tsc -b`가 공통 루트(`.`)를 기준으로 `dist/src/index.d.ts`, `dist/test/*.d.ts`를 만들어 기존 `dist/index.d.ts` 경로가 사라지고 패키지의 공개 타입 진입점이 깨진다. 그래서 "test도 typecheck하고 싶다"는 요구를 메인 tsconfig 하나로는 풀 수 없다 — `composite`/`rootDir`이 있는 빌드 대상 tsconfig와 typecheck 전용 tsconfig는 애초에 다른 책임이다.

## 예방 규칙

- `packages/*` 아래 새 패키지를 만들 때, 또는 기존 패키지에 `test/` 디렉터리를 처음 추가할 때 — 메인 `tsconfig.json`의 `include`에 `test/`를 끼워 넣지 않는다. 대신 그 패키지 전용 `tsconfig.test.json`을 만든다: `tsconfig.base.json`을 직접 extends(메인 `tsconfig.json`을 extends하지 않는다 — `composite`/`rootDir`/`references`가 같이 딸려온다), `noEmit: true`, `include: ["test/**/*.ts"]`(해당 패키지가 `.tsx` 테스트를 쓰면 `test/**/*.tsx`도 추가하고 `jsx: "react-jsx"`를 넣는다), `lib`은 메인 tsconfig와 동일하게 맞춘다. `composite`, `rootDir`, `outDir`, `references`, `tsBuildInfoFile`은 넣지 않는다 — `tsc -b` 빌드 파이프라인에 절대 연결하지 않는다.
- 패키지의 `typecheck` 스크립트를 `tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit`로 두 config를 순차 실행하게 만든다. `build` 스크립트(`tsc -b`)는 건드리지 않는다 — 빌드 대상은 여전히 `src`만이다.
- 새 tsconfig를 추가·수정하면 반드시 의도적으로 깬 타입 오류(테스트 파일에 타입이 안 맞는 임시 줄 추가)로 실제로 잡히는지 확인한 뒤 되돌린다. 확인 없이 "include를 넓혔으니 됐다"고 넘어가면 config 문법 오류나 include 패턴 실수로 여전히 아무것도 안 잡힐 수 있다.
- `tsc -b`(build) 실행 후 해당 패키지의 `dist/`에 `dist/test/` 디렉터리나 `*.test.js`/`*.test.d.ts` 산출물이 새로 생기지 않았는지 확인한다(단순히 테스트 파일과 이름이 겹치는 `dist/table-grid.js` 같은 정상 src 산출물과 혼동하지 않는다) — 생겼다면 `tsconfig.test.json`이 실수로 빌드 파이프라인(`references`나 `tsc -b`)에 섞였다는 신호다.

## 검증 방법

```bash
pnpm --filter @cp949/geul-core typecheck
```

변이 절차: `packages/core/test/table-grid.test.ts` 맨 끝에 `const _pit32TypecheckProbe: number = "intentional-type-error-for-issue-32-verification";`를 추가하고 위 명령을 재실행해 실패하는지 확인한다. 확인 후 즉시 되돌리고 `git diff -- packages/core/test/table-grid.test.ts`가 무출력인지 재확인한다.

## 실제 근거

- 커밋 `ac00583`+`747e295`(Issue #32) — `packages/core/tsconfig.test.json` 신설과 `typecheck` 스크립트 변경. 수정 전 `_pit32TypecheckProbe` 삽입이 조용히 통과(PASS)하고, 수정 후 같은 삽입이 실패(FAIL, `string`을 `number`에 대입 불가 에러)하는 것을 직접 확인했다.
- 같은 PR에서 config를 켜자마자(별도 유예 기간 없이) `packages/core/test/`에 숨어있던 실제 타입 오류 38건이 드러났다 — `test/public-types.test.ts`의 Node 앰비언트 타입(`node:fs`, `process` 등) 미해결 7건(`tsconfig.test.json`에 `"types": ["node"]` 누락이 원인), `test/table-commands.test.ts`(30건)와 `test/table-keyboard-extension.test.ts`(1건)의 `Editor.getJSON()` 유니온 타입(`@tiptap/core@3.30.1`의 `DocumentType<..., (NodeType|TextType)[]>`) 좁히기 누락 31건. 이론적 위험이 아니라 실제 발생 사례다 — 새로 켜는 test-typecheck config는 이미 존재하던 진짜 버그를 즉시 드러낼 가능성이 높다.
- `io`/`model`/`react` 3개 패키지도 동일 구조라 같은 결함이 있었다 — Issue #56에서 적용 완료했다. `io`: 커밋 `e8c534e`+`ab09c3d`, 숨어있던 타입 오류 2건(삼항식에 잘못 적용한 `as const`, `exactOptionalPropertyTypes` 아래 `undefined`가 섞인 캐스트). `model`: 커밋 `4c6ee04`+`58437e0`, 1건(`noUncheckedIndexedAccess` 아래 배열 인덱스 접근 미가드). `react`: 커밋 `bf8a09e`+`b031702`, 6건(옵셔널 체이닝 결과의 `undefined`를 `=== null` 가드가 걸러내지 못함 — 타입 수정이자 잠재 런타임 버그 수정이었다). core의 38건과 달리 tiptap `Editor.getJSON()` 유니온 타입 좁히기 패턴은 이번 3개 패키지에서 재현되지 않았다(해당 API를 쓰는 test 파일이 없었다).

## 관련 문서

- [PIT-0006 배포 산출물 검증 전 build 수행](./PIT-0006-build-before-distribution-verification.md)
