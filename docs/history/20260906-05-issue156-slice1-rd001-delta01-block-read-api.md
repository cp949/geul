# Issue #156 슬라이스1 RD-001 DELTA-01 — 블록 읽기·순회 API 추가, RD-001 DONE

## 목표

roadmap-workflow RD-001(블록 읽기·순회 API, `DOC-004`)의 유일한 DELTA. `EditorController`에 `getBlock`/`getPrevBlock`/`getNextBlock`/`getParentBlock`/`forEachBlock`을 추가한다(spec §3.2, `docs/specs/2026-09-06-r4-extensibility-integration-parity-design.md`).

## 확정 커밋

- `5987cd4` — feat(core): 블록 읽기·순회 API 추가

## 변경한 계약과 파일

`EditorController` 공개 인터페이스에 5개 메서드 추가(순수 조회, 문서 변경 없음).

- `packages/core/src/block-tree.ts`(신규) — 저장 `Block[]` 트리 순회 공용 프리미티브 `walkBlockTree`/`findBlockInTree`/`findParentInTree`/`findAdjacentInTree`. `getPrevBlock`/`getNextBlock`은 형제 범위로 좁히지 않고 `forEachBlock`과 동일한 문서 순서(pre-order DFS: 자신 → 자식 → 다음 형제)를 공유한다(spec 미명시, 이 DELTA 확정 — `_works/roadmap/result/RD-001-DELTA-01.md` "설계 결정").
- `packages/core/src/editor-controller.ts` — 인터페이스 선언 5개, `createEditor` 반환 객체 구현(전부 `session.getDocument()`에 대한 순수 delegation).
- `packages/core/test/editor-controller-block-read.test.ts`(신규) — 15 tests.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/editor-controller-block-read.test.ts` — 15 passed.
- `pnpm --filter @cp949/geul-core test`(전체, 이번 로드맵 실행에서 이 패키지 첫 진입) — 105 files / 1473 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-core typecheck` — clean.
- `pnpm --filter @cp949/geul-core build`(`tsc -b`) — clean.
- post-fix mutation 검증: `walkBlockTree`의 전진 재귀 반환값을 일시적으로 무시하게 바꿔 재실행 → "콜백이 false를 반환하면 중첩 순회 전체를 즉시 중단한다"와 `getNextBlock("parent-1")` 테스트 2건이 정확히 실패함을 확인 후 원복·재검증(15 passed).

## 구현 중 계획과 달랐던 사실

fixture 구성에서 `{ ...paragraphBlock(...), children: [...] }` 스프레드가 `paragraphBlock`의 반환 타입(`Block` 유니온)에 대한 초과 속성 검사에 걸려 `tsc -p tsconfig.test.json`이 실패했다(vitest만으로는 무신호, G-WKS-003/PIT-0038과 같은 경계). `paragraphBlock`의 기존 3번째 인자(`children?: Block[]`)를 그대로 써서 해소했다 — 재발 방지 가치가 낮아 함정으로 승격하지 않았다.

## 등록한 이슈

없음. 범위 밖 발견 없음.

## 남은 제한

- RD-001 완료 조건 2개 전부 실측 증거로 재대조 완료 → RD-001 `DONE`(`_works/roadmap/RD-001.md`).
- Issue #156 슬라이스1의 나머지 RD-002~RD-005(범용 조작 API, 커서·선택 setter, lifecycle 이벤트, 읽기 전용)가 남아 있다 — roadmap-workflow "다음 DELTA 선택" 절차로 이어서 진행한다.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — 이슈의 완료 기준(슬라이스1 전체, 나아가 Issue 전체)에 비해 진행분이 작아 `issue-tracker.md`의 완료 댓글 기준(완료 보고에 미충족 완료 기준이 없어야 함)을 충족하지 않는다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 5987cd4`. 위험: 낮음 — 신규 파일 추가와 인터페이스 확장뿐, 기존 메서드·동작 변경 없음. 되돌리면 `getBlock` 등 5개 메서드가 사라진다.
