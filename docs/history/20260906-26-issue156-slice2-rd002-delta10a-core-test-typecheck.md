# Issue #156 슬라이스2 RD-002 DELTA-10a — core: test 파일 typecheck 정리(마일스톤: 3패키지 전부 clean)

## 목표

roadmap-workflow RD-002의 신규 발견 DELTA(DELTA-10 종료 시점 발견). `packages/core/test/`의 typecheck 에러(착수 전 실측 91곳/18파일)를 정리한다. 새 동작 없음. 이 DELTA로 `pnpm --filter @cp949/geul-core typecheck`(project reference 전량, src+test)가 처음 통과하고 **`core`·`io`·`react` 세 패키지 전부 typecheck clean**이 된다.

## 확정 커밋

- `b80da74` — feat(core): test 파일 13개 typecheck 정리(RD-002-DELTA-10a)

## 변경한 계약과 파일

- `packages/core/test/editor-controller-support.ts` — 공유 헬퍼 `tableBlockIn`/`tableBlockOf`/`firstTableBlockIn`을 `TableBlock`으로 캐스트("table" 리터럴 가드 뒤에도 `TableBlock | CustomBlock`으로 남는 예약 리터럴 잔여분기), `maxBlockDepth`를 `readonly DocumentBlock[]`로 위젠(순수 탐색, CustomBlock을 안전한 leaf로 처리). 이 두 수정만으로 91→41(50곳, `editor-controller-table.test.ts`·`editor-controller-table-format.test.ts`·`editor-controller-table-load.test.ts`·`editor-controller-support.test.ts` 4파일 완전 해소) 연쇄 해소 — DELTA-08·10과 동일 "공유 헬퍼부터 확인" 전략 3연속 재확인.
- `packages/core/test/{clipboard-paste-list,clipboard-paste-priority,quote-paste-fallback}.test.ts` — `.filter()`/`.find()` 콜백을 `(block): block is X => ...` 명시적 타입 프레디케이트로 전환.
- `packages/core/test/{editor-controller-heading-paste,editor-controller-revision,editor-controller-subtree-commands,editor-controller-table-paste,list-input-rule-extension,media-drop-paste-extension,placeholder-extension}.test.ts` — 필드 접근 지점에 `as X` 캐스트(예약 리터럴 패턴, DELTA-05~10과 동일).
- `packages/core/test/media-block-codec.test.ts` — `it.each` 케이스 리터럴 유니온 붕괴(DELTA-08 최초 발견 패턴, 3번째 재현)를 `as FileBlock | ImageBlock | VideoBlock | AudioBlock` 캐스트로 해소.
- `packages/core/test/quote-divider-round-trip.test.ts` — `roundTripBlocks` 반환 타입 `Block[]`→`DocumentBlock[]` 위젠(`.toEqual()` 비교 전용, 필드 접근 없음).

## 검증

- `pnpm --filter @cp949/geul-core typecheck`(project reference 전량, stale tsbuildinfo 삭제 후) — **0건**(착수 전 91곳).
- `pnpm --filter @cp949/geul-core test`(전체) — 112/112 파일, 1550 tests passed(변화 없음). 회귀 없음.
- `pnpm --filter @cp949/geul-io typecheck`·`pnpm --filter @cp949/geul-react typecheck` — 둘 다 0건(회귀 아님, DELTA-08·10부터 이어온 clean 상태 재확인).
- `npx eslint`(변경 파일 13개) — 0 문제.
- post-fix mutation 생략(DELTA-08·10과 동일 근거 — 새 동작 없는 정적 typecheck 정리, 런타임 로직 무변경).

## 등록한 이슈

없음.

## 마일스톤

이 DELTA로 **`core`·`io`·`react` 세 패키지 전부 typecheck clean**이 됐다 — DELTA-02(2026-09-06 세션 시작)부터 이어온 `Document`/`Block[]` 위젠에 따른 typecheck 정리가 완결된 지점이다. 다음은 DELTA-11(registry 저장 + PM atom 노드 조건부 등록)부터 실제 새 동작을 추가한다.

- 실제 수정 파일은 착수 전 실측 17~18개 중 13개(4개는 공유 헬퍼 수정만으로 해소돼 무변경) — ff-workflow 크기 규칙(소스 파일 6개 상한)을 초과했지만, DELTA-08(16파일) 선례("새 동작 없는 정적 typecheck 정리"는 파일 수 상한을 기계적으로 적용하지 않는다)에 따라 재분할하지 않았다.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-002는 아직 `ACTIVE`(DELTA-11·12 남음), 완료 조건 3개 모두 미충족.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert b80da74`. 위험: 낮음 — 테스트 파일 타입 캐스트·시그니처 위젠뿐, production 코드·런타임 동작 무변경(1550 tests 그대로 통과로 확인).
