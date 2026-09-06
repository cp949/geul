# Issue #156 슬라이스2 RD-002 DELTA-09 — react: block-side-menu.tsx typecheck 정리

## 목표

roadmap-workflow RD-002의 아홉 번째 DELTA. `block-side-menu.tsx`(1곳 typecheck 에러)를 정리한다. `findBlockTypeDescriptor`가 top-level CustomBlock을 만나면 "찾지 못함"과 동일하게 취급한다.

## 확정 커밋

- `5d43985` — feat(react): block-side-menu.tsx의 top-level CustomBlock을 찾지 못함으로 처리(RD-002-DELTA-09)

## 변경한 계약과 파일

- `packages/core/src/index.ts` — `isKnownBlockType`을 model 재수출 목록에 추가. `react`는 `@cp949/geul-model`에 직접 의존하지 않아(`isNestableBlockType` 등 기존 재수출 선례와 동일 경로) `core`가 통과시킨다.
- `packages/react/src/block-side-menu.tsx` — `findBlockTypeDescriptor`가 top-level CustomBlock(DELTA-01)을 만나면 `blockTypeDescriptorFromBlock`(`BlockTypeSource` 판별 유니온, `editor-controller.ts:500-517`가 "model Block 유니온이 늘 때마다 이 유니온도 같은 멤버를 갖춰야 한다"고 이미 예고했던 계약)에 넘기지 않고 `null`(찾지 못함)로 처리한다 — `generic-block-commands.ts`(DELTA-03)와 동일 패턴. `document.blocks`에 CustomBlock이 있으면 `createEditor`/`replaceDocument`가 이미 DELTA-04에서 거절해 이 분기는 오늘 시점엔 도달 불가능한 타입 계약 정리다(post-fix mutation 생략, DELTA-03과 동일 근거).

## 검증

- `pnpm --filter @cp949/geul-core build` → `pnpm --filter @cp949/geul-react exec tsc -p tsconfig.json --noEmit` — 0건(이전 1건).
- `pnpm --filter @cp949/geul-core test`(전체) — 112/112 파일, 1550 tests passed(변화 없음). `pnpm --filter @cp949/geul-react test`(전체) — 34/34 파일, 505 tests passed(변화 없음). 회귀 없음.
- post-fix mutation 생략(도달 불가능한 코드 경로, 패턴은 DELTA-03·05·06·07·08에서 이미 검증됨).

## 등록한 이슈

없음.

## 남은 제한

- `react` test 파일 typecheck 정리(DELTA-10)가 이어진다.
- CustomBlock의 실제 Turn into UI 지원은 registry(DELTA-11)가 PM atom 노드를 등록해야 처음 도달 가능해진다 — 이 DELTA는 다루지 않았다.
- GitHub Issue #156에는 댓글을 게시하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 5d43985`. 위험: 낮음 — 재수출 추가 + 도달 불가능한 분기의 타입 계약 정리뿐, 기존 동작 변경 없음(회귀 테스트로 확인).
