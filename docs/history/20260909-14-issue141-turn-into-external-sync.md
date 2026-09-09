# Issue #141 — 열린 Turn into 메뉴가 외부 block type 변경을 즉시 반영하도록 동기화

## 목표

열린 Block 메뉴(Turn into)가 가리키는 block의 type이 외부 `EditorController` command로 바뀌면, stale option을 계속 보여주지 않고 메뉴가 스스로 닫히게 한다.

## 확정 커밋

- `f676720` — `fix(react): 열린 Turn into 메뉴가 외부 controller 변경 시 자동으로 닫히게 한다 (Issue #141)`

## 변경

- `packages/react/src/use-editor-revision.ts`(신규) — 내부 전용 `EditorRevisionContext`/`useEditorRevision`. `index.ts`에 export하지 않는다.
- `packages/react/src/editor-provider.tsx` — `EditorProvider`가 `initialDocument`로 컨트롤러를 직접 만드는 "internal ownership" 경로에서 문서 변경마다 revision을 갱신해 `EditorRevisionContext`로 공급한다.
- `packages/react/src/block-side-menu-menu.tsx` — 메뉴 open 시점 target block의 type을 캡처하고, revision이 바뀔 때마다 같은 block을 재조회해 비교한다. 다르면 메뉴를 닫는다(옵션 재계산이 아니다). `findBlockTypeDescriptor`·`handleTurnInto`의 클릭 시점 최신 source guard(RD-005)는 변경 없이 유지.
- `packages/react/test/block-side-menu.test.tsx` — 회귀 테스트 2건("같은 block 외부 변경 시 닫힘", "다른 block 외부 변경 시 유지") 추가.
- 그릴링(mattpocock-skills:grilling + domain-modeling 병행)으로 확정한 4개 결정: (1) 재계산 대신 닫기, (2) packages/react 내부 전용 primitive(공개 API 아님, packages/core 비수정), (3) target block 기준 판정(문서 전체 변경 아님), (4) ADR·CONTEXT.md 문서화는 보류(소비처 2곳 이상 확인되면 재판단).

## 검증

- 결함 탐지 리뷰(읽기 전용 subagent, `IMPL-REVIEW-01.md`): F1(MAJOR, prettier 포맷 위반) 발견·수정, 그 외 발견 없음.
- `pnpm --filter @cp949/geul-react exec vitest run test/block-side-menu.test.tsx`: RED(구현 3파일 stash 제거, 2 failed) → GREEN(복원 후 49 passed) 메인 세션이 직접 재현.
- `pnpm --filter @cp949/geul-react test`: 45 files, 634 passed.
- `pnpm --filter @cp949/geul-react typecheck`, `git diff --check`: 통과.
- `pnpm verify` 전량: 통과(lint, format:check, build 7패키지, escompat 215개 파일, typecheck 11패키지, unit test 313 files/3533 tests, package boundaries, licenses, e2e 205 tests[chromium+mobile]).

## 남은 제한

이 보호는 `EditorProvider`가 `initialDocument`로 컨트롤러를 직접 만드는 "internal ownership" 경로에서만 동작한다. `editor` prop으로 컨트롤러를 외부에서 만들어 전달하는 "external ownership"은 `EditorController`에 subscribe API가 없어 `EditorProvider`가 그 변경을 관측할 수단이 없다 — 이 보호를 받지 못한다(클릭 시점 최신 source guard는 두 경로 모두 계속 방어선을 맡는다). 실제 프로덕션 사용처(`apps/demo`, `apps/showcase`)는 모두 internal ownership이라 당장 영향은 없다.

`block-selection-toolbar.tsx:158`도 render-time `getDocument()` 패턴을 갖고 있으나 재트리거 경로가 훨씬 많아(selectionchange/mouseup/keyup/scroll/resize) 실제 stale 버그로 재현 확인하지 못했다 — 이번 범위에서 제외했고 별도 이슈로 등록하지 않았다(`issue-tracker.md` 등록 기준 미충족).

## GitHub

- Issue #141 완료 댓글: `issuecomment-5600841004`
- Issue #141 종료.
- commit·`dev` ff-only merge 완료. push·tag·PR 생성은 수행하지 않았다.
