# Issue #38 슬라이스 10 RD-006 DELTA-01 — 우선순위·전체 블록 타입 fixture 교차 고정

## 목표

roadmap-workflow RD-006(전체 블록 타입 fixture-locked 통합 테스트 + e2e, io/core/e2e)의 첫 DELTA(core 담당). Issue #38 슬라이스 10의 두 완료 기준(우선순위·fallback이 fixture로 고정, 슬라이스 2~9 전체 블록 타입이 붙여넣기 대상)을 RD-001~005가 이미 개별로 검증한 위에 core 레벨에서 교차로 고정한다. 기존 커버리지(표 단독·혼합, Markdown 단독, plain 위임, 목록 4종, 비목록 5종)를 재작성하지 않고, 다중 MIME 동시 존재 시 우선순위·11종 전체 교차·own+production wrapper 중첩 교차·비표 own HTML id 유일성처럼 실제로 비어 있던 지점만 새로 채웠다. io·core 소스는 바꾸지 않았다 — RD-001~005 구현이 이미 옳게 처리하고 있음을 fixture로 확인만 했다.

## 확정 커밋

- `f4f5350` — 클립보드 붙여넣기 우선순위·전체 블록 타입 fixture 통합 테스트 추가 (Issue #38 슬라이스 10, RD-006 DELTA-01)

## 변경한 계약과 파일

- `packages/core/test/clipboard-paste-priority.test.ts`(신규, 290줄) — 4개 describe:
  - 우선순위 교차(다중 MIME): 표 HTML(101×101셀, 10,000셀 상한 초과로 `CLIPBOARD_TABLE_INVALID`)과 Markdown처럼 보이는 plain text가 동시에 있으면 `onPasteRejected`가 표 거절만 전달하고 heading/bulletListItem이 새지 않는다. 비표 HTML과 Markdown 문법 plain text가 동시에 있으면 HTML이 반영되고 Markdown 감지 결과는 버려진다.
  - 슬라이스 2~9 전체 블록 타입(완료 조건 3): 11종(heading/quote/divider/codeBlock/bulletListItem/numberedListItem/checkListItem/toggleListItem/토글 heading/인라인 textColor/블록 textColor+textAlignment) 한 문서를 `io.exportHtml`로 own export document HTML을 만들어 붙여넣고 타입·상태·content 전부 일치를 확인.
  - 중첩 보존 교차(완료 조건 5): own-export `data-be-children`(비목록)과 생산 편집기 `data-be-block-group`(비목록+목록)이 정상 깊이에서 부모+자식을 `children`으로 보존.
  - id 유일성(완료 조건 6): 대상 문서와 **같은** `data-be-block-id`("block-1")를 담은 own HTML을 붙여넣어도 최종 id가 유일하고, undo 1회로 blocks가 원본과 일치.
- `packages/core/test/clipboard-test-support.ts` — `clipboard-paste-extension.test.ts`의 로컬 `nestedParagraphWrapperHtml`을 export로 승격(`G-TST-002`, 새 파일이 두 번째 소비처).
- `packages/core/test/clipboard-paste-extension.test.ts` — 로컬 정의 삭제, 승격된 import로 교체(동작 변경 없음).

## 구현 중 계획과 달랐던 사실

1. **"표 블록 존재 여부"만으로는 어느 확장이 처리했는지 구별하지 못한다** — `io.importHtml`도 일반 `<table>`을 table 블록으로 파싱할 수 있어, 애초 계획한 "순수 `<table>` HTML" 우선순위 fixture는 `TablePasteExtension`/`ClipboardPasteExtension` 등록 순서를 실제로 뒤바꿔도(로컬 mutation, 미커밋) RED가 재현되지 않았다. `TablePasteExtension`만 갖는 고유 계약(10,000셀 상한 초과 시 `CLIPBOARD_TABLE_INVALID`를 `onPasteRejected`로 전달, `editor-controller-table-paste.test.ts`와 같은 기준)으로 fixture를 다시 설계해 해결했다.
2. **codeBlock `language`는 model 계층에서 별칭이 정규형으로 접힌다** — `canonicalizeCodeBlockLanguages`(model/src/code-block.ts)가 `parseDocument` 때 "ts"→"typescript"를 적용한다. fixture 소스에 별칭("ts")을 쓰면 왕복 결과("typescript")와 어긋나 거짓 RED가 났다 — fixture를 정규형으로 직접 써서 해결(이 DELTA는 별칭 정규화 자체를 검증 대상으로 삼지 않는다).
3. **`revision`은 undo 자신도 하나 발행하는 명령 카운터라 undo 뒤 원본 값으로 되돌아가지 않는다**(`editor-controller-revision.test.ts` "undo와 redo마다 revision을 하나씩 발행한다"와 일치) — id 유일성 테스트의 undo 단언을 `getDocument()` 전체가 아니라 `blocks`만 비교하도록 수정.
4. **토글 heading의 상태(`isToggleable`/`collapsed`)는 own export document HTML에만 있다** — 생산 편집기 in-editor copy(`data-be-block-group`)의 상태 보존은 RD-003 범위(목록류 4종)에 한정되고 토글 heading에는 없다(own export만 `<details data-be-toggleable>`로 표현). 애초 `productionHtml`로 11종을 조립하려던 계획을 own export document HTML(`io.exportHtml`) 기반으로 바꿨다 — 결과적으로 codeBlock `language`, 토글 heading `isToggleable`/`collapsed`, 블록 textColor/textAlignment까지 production 경로에서는 보이지 않던 필드도 함께 정확히 반영됨을 확인했다.
5. **`reassignNonTableBlockIds`가 없어도 id 유일성은 `BlockIdExtension`의 사후 중복 보정(appendTransaction)이 안전망으로 지켜준다** — "createId() 대신 원본 id 재사용" mutation만으로는 id 유일성 테스트가 RED로 재현되지 않았다(두 레이어가 독립적으로 같은 결과를 낸다는 뜻, 원래 `clipboard-paste-extension.test.ts`의 관련 주석이 이미 시사한 사실). 이 DELTA는 이 발견을 결과 문서에만 남기고 소스를 바꾸지 않았다 — 완료 조건 6은 단일 레이어가 아니라 시스템 전체의 "id 유일성 유지" 불변식을 검증하는 것이 맞는 목표라 그대로 두었다.

## 검증

- `pnpm --filter @cp949/geul-core test`(전체) 95 files/1258 tests passed(회귀 없음, 1252 + 6신규 = 1258).
- `pnpm --filter @cp949/geul-core typecheck` 통과.
- `npx eslint` 대상 3파일 발견 0건(1건 수정 — 구조분해 미사용 변수를 spread+override 패턴으로 교체). `npx prettier --write` 재확인 0건(신규 파일 1건만 자동 정렬).
- 변이 검증 5건 모두 계획대로(또는 재설계 후) 검출 확인:
  1. 등록 순서 뒤바꿈(Table↔Clipboard) → "표 우선" 테스트 RED(`rejections` 길이 0).
  2. `ClipboardPasteExtension`의 `if (html.length > 0)` 분기 무력화 → HTML 의존 테스트 4건 RED.
  3. `checkListItem`의 `dataBeChecked` 마커 오타(io, 재빌드 후) → 11종 fixture 테스트 RED(판별력 1개 샘플 확인, 나머지 10종은 변이하지 않음).
  4. `reassignNonTableBlockIds`에서 children 키 자체를 제거(스프레드가 아니라 실제 삭제) → 중첩 보존 테스트 2건 RED.
  5. `reassignNonTableBlockIds`가 `createId()` 대신 원본 id 재사용 → RED 재현 안 됨(위 "계획과 달랐던 사실" 5번, `BlockIdExtension` 안전망 발견).
- 모든 mutation은 로컬 실험 후 `git checkout --`으로 즉시 되돌렸다(io 마우테이션은 `pnpm --filter @cp949/geul-io build` 재실행으로 dist도 원복 확인). 최종 커밋 diff에는 포함되지 않는다.

## 등록한 이슈

없음. Issue #38 완료 댓글은 roadmap(RD-001~006) 전체 완료 시점까지 보류한다(`_works/roadmap/roadmap.md` "전체 완료 조건").

## 남은 제한

- RD-006 완료 조건 1(표 우선, 부분 — core 레벨 로직 증거만, 실제 Chromium `ClipboardEvent` 회귀는 DELTA-02), 2(core 증거로 충족), 3(충족), 4(파일 단독 무시, DELTA-02 전용 — 실제 `ClipboardEvent` 필요), 5(충족), 6(충족), 7(Playwright PASS, DELTA-02 전용) — `RD-006.md` 완료 조건 갱신은 이 DELTA 종료 직후 별도로 수행한다.
- e2e `dispatchPaste` 헬퍼 추출, `e2e/clipboard-paste.spec.ts` 대표 시나리오는 DELTA-02가 담당한다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert f4f5350`. 위험: 낮음 — core test 파일만(신규 1개+수정 2개), io·core 소스·공개 계약 변경 없음. DELTA-02(미착수)만 이 결과를 이어받을 예정이라 소비자 영향 없음.
