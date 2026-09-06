# Issue #156 슬라이스2 RD-002 DELTA-17 — `core` test(7파일)·`io` test(3파일) typecheck 정리(`InlineContent` 위젠 잔여)

## 목표

roadmap-workflow RD-002의 열일곱 번째 DELTA. DELTA-13(`model`의 `InlineContent` 위젠)이 깨뜨린 소비처 typecheck 에러 중 `core` src(DELTA-14)·`io` src(DELTA-15/16)는 이미 정리됐고, 남은 `core` test 7파일(32곳)·`io` test 3파일(7곳)만 이 DELTA가 정리한다. 전부 `.content[N].text`/`.marks`를 `InlineContentItem`(텍스트 런 | 커스텀 원소 유니온)에 무가드로 접근하는 동형 패턴이다. 새 동작을 추가하지 않는 순수 타입 정리다(DELTA-08/10/10a와 동일 성격).

착수 전 판단(그릴링 없이 결정): 핸드오프가 남긴 지점 — 이 typecheck 정리를 `customInlineContent`/`customStyles` registry 배선(새 동작)과 같은 DELTA로 묶을지. DELTA-12가 `enabledBlockTypes`와 `customInlineContent`/`customStyles`를 분리한 것과 같은 근거(RED/GREEN·mutation 필요 여부가 다름)로 분리했다 — 애매한 판단이 아니라 확립된 패턴의 재적용이라 그릴링을 생략했다. registry 배선은 DELTA-18로 미뤘다.

## 확정 커밋

- `deb58ac` — fix(core,io): InlineContent 위젠 잔여 test typecheck 정리(RD-002-DELTA-17)

## 변경한 계약과 파일

공개 계약 변경 없음 — 전부 테스트 파일 내부의 "계약 전제 캐스트"(DELTA-06/07/15/16 선례, `Extract<InlineContentItem, { text: string }>`로 좁힘)다.

- `packages/core/test/table-paste-commands.test.ts`(16곳, 압도적 다수): 전부 `table.value.rows[R]?.cells[C]?.content[N]?.text`류의 동일 형태 반복 접근이라 공유 헬퍼 `cellItemAt(table, row, col, itemIndex = 0)`(파일 로컬)를 신설해 한 번에 해소(DELTA-08/10a의 "공유 헬퍼로 연쇄 해소" 전략 재사용). 중간 변수 `cells`/`cellContent` 2곳은 헬퍼 호출로 대체하며 제거.
- `packages/core/test/{clipboard-paste-list,clipboard-paste-priority,editor-controller-revision,editor-controller-table-paste,media-drop-paste-extension,table-paste-sequence}.test.ts`(6파일, 16곳): 사이트별 인라인 캐스트.
- `packages/io/test/clipboard-table-normalization.test.ts`(4곳): `content`/`text` 변수 선언부에 배열 캐스트.
- `packages/io/test/html-depth-support.ts`(2곳): `documentVisibleText`의 table cell·일반 block 두 순회 분기에 배열 캐스트.
- `packages/io/test/html-round-trip.test.ts`(1곳): `known.content` 배열 캐스트.

## 검증

- 착수 전 재측정(`pnpm --filter @cp949/geul-model build` 후 `core`/`io` stale tsbuildinfo 삭제): 핸드오프 실측과 정확히 일치 — 드리프트 없음.
- RED/GREEN·mutation 생략(계획서 명시 근거): 이 DELTA는 캐스트만 추가하고 판별·가드 로직을 신설하지 않아 vitest 런타임 동작이 캐스트 전후로 동일하다 — vitest는 tsc 전체 typecheck를 타지 않아 test 파일 타입 에러가 런타임 test 실행을 막지 않는다(DELTA-05 발견, DELTA-08/10/10a 선례).
- `pnpm --filter @cp949/geul-io typecheck` 0건, `pnpm --filter @cp949/geul-core typecheck` 0건, `pnpm --filter @cp949/geul-react typecheck` 0건 — **`core`·`io`·`react` 세 패키지 전부 typecheck clean 마일스톤 재달성**(DELTA-13이 깨뜨린 이후 처음, DELTA-10a 이후 두 번째).
- `pnpm --filter @cp949/geul-io test` 648 passed(변화 없음) · `pnpm --filter @cp949/geul-core test` 1569 passed(변화 없음) · `pnpm --filter @cp949/geul-react test` 505 passed(변화 없음).
- `npx eslint`(변경 10파일) 0 문제. `git diff --check` 0건.

## 등록한 이슈

없음.

## 남은 위험

- `customInlineContent`(PM inline atom, NodeView)·`customStyles`(PM Mark, addAttributes/renderHTML) registry 배선은 아직 미착수 — DELTA-18(백로그)이 이어받는다. `RD-002.md`가 남긴 지침(DELTA-11 재확인, `io`의 `blocksInlineContentViolation` 게이트를 등록된 타입 통과하도록 조건부화)이 여전히 유효하다.
- `Document`/`Block[]`/`InlineContent` 위젠 계열 typecheck 정리 백로그는 이 DELTA로 전부 소진됐다 — 남은 RD-002 백로그는 registry 배선(새 동작)뿐이다.
- RD-002는 아직 `ACTIVE`. 완료 조건 3개 중 "PM 노드가 스키마에 등록되지 않는다"만 DELTA-12로 충족, 나머지 둘(registry 배선 자체, 회귀 없음 전체 재대조)은 미충족.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-002 전체 완료 기준 대비 부분 진행이다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert deb58ac`. 위험: 낮음 — 캐스트 정리만 있고 신규 판정·가드 로직이 없어 되돌려도 기존 텍스트 런 문서에 대한 판정 결과(코드·문구)에 영향이 없다(`pnpm --filter @cp949/geul-io test`/`pnpm --filter @cp949/geul-core test`/`pnpm --filter @cp949/geul-react test`가 기존 개수 그대로 통과함을 확인). 되돌리면 `core`/`io` test 10파일 typecheck 39건이 다시 나타난다.
