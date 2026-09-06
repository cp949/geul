# Issue #156 슬라이스2 RD-002 DELTA-08 — io: test 파일 16개 typecheck 정리

## 목표

roadmap-workflow RD-002의 여덟 번째 DELTA. `packages/io/test/`의 16개 파일(51곳 typecheck 에러)을 정리한다. 새 동작 없음, 이 DELTA로 `io` 패키지 전체(`src`+`test`) typecheck가 clean해진다.

## 확정 커밋

- `5d54874` — test(io): test 파일 16개 typecheck 정리(RD-002-DELTA-08)

## 변경한 계약과 파일

`packages/io/test/*.ts` 16개(테스트 전용, production 코드 무변경). 3가지 패턴으로 정리:

1. **예약 리터럴 캐스트**(다수 파일): `if (table?.type !== "table") throw ...` 이후 `table.rows`/`.columns`/`.headerColumns` 접근에 `as TableBlock`(또는 `as HeadingBlock`) 캐스트.
2. **공유 순회 헬퍼 위젠**: `html-depth-support.ts`의 `documentVisibleText`(여러 파일이 공유)에 재사용 가능한 `isBlock` type predicate(`block is Block`)를 신설해 `.filter(isBlock)`로 배열을 좁혔다. 5개 markdown 파일의 로컬 `blockMeaning` 헬퍼는 단순 파라미터 위젠(판정 로직 무변경 — `children in` 판정이 CustomBlock을 구조적으로 이미 배제).
3. **`it.each` 유니온 붕괴**(신규 발견 패턴, media 테스트 3개): `it.each`가 case별 객체 3개의 유니온이 아니라 단일 객체의 `type` 필드만 유니온으로 묶어 콜백에 넘긴다 — `Block` 유니온에 `CustomBlock`(비literal `type: string`)이 섞이자 TS의 판별 유니온 객체-리터럴 할당 특례가 깨졌다(최소 재현으로 확인). `as FileBlock | VideoBlock | AudioBlock` 캐스트로 해소.

## 검증

- `pnpm --filter @cp949/geul-io test`(전체) — 73/73 파일, 639 tests passed(변화 없음), 회귀 없음.
- `pnpm --filter @cp949/geul-io exec tsc -p tsconfig.json --noEmit` / `tsc -p tsconfig.test.json --noEmit`(stale tsbuildinfo 삭제 후) — **`io` 패키지 전체 0건**.
- `npx eslint packages/io/test/*.ts`(변경 파일 전체) — 0 문제.
- post-fix mutation 생략 — 새 동작 없는 정적 typecheck 정리라 RED/GREEN 대상 로직이 없다(DELTA-04의 "변이: 없음(정적 조건)" 선례와 동일 근거).

## 등록한 이슈

없음.

## 남은 제한

- `react` src(DELTA-09)·test(DELTA-10) typecheck 정리가 이어진다 — DELTA-08에서 발견한 `it.each` 유니온 붕괴 패턴이 `react` 테스트에도 나타날 수 있어 착수 시 우선 확인한다.
- `pnpm --filter @cp949/geul-core typecheck`(project reference)는 DELTA-09·10까지 끝나야 완전히 통과한다(react 미포함이면 core는 io까지만 재검사하므로 이미 clean할 가능성 높음 — 미확인).
- GitHub Issue #156에는 댓글을 게시하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 5d54874`. 위험: 낮음 — 테스트 파일 타입 캐스트뿐, production 코드·런타임 동작 무변경(639 tests 그대로 통과로 확인).
