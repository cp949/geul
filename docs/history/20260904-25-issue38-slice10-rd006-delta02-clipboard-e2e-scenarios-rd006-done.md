# Issue #38 슬라이스 10 RD-006 DELTA-02 — 클립보드 e2e 대표 시나리오, RD-006 DONE

## 목표

roadmap-workflow RD-006(전체 블록 타입 fixture-locked 통합 테스트 + e2e, io/core/e2e)의 두 번째이자 마지막 DELTA(e2e 담당). DELTA-01(core)이 jsdom 수준에서 고정한 우선순위·전체 블록 타입 계약이 실제 Chromium `ClipboardEvent`·DOM에서도 성립함을 대표 시나리오 4개(구조 보존 HTML, Markdown 텍스트, 표 우선 회귀, 파일 단독 무시)로 재확인한다. 특히 완료 조건 4(파일 단독 무시)와 조건 7(Playwright PASS)은 이 DELTA에서만 충족 가능하다 — jsdom은 Clipboard API를 완전히 구현하지 않는다(`clipboard-test-support.ts` 폴리필 주석). 이 DELTA로 RD-006 완료 조건 1~7이 전부 충족돼 RD-006이 `DONE`이고, Issue #38 슬라이스 10 roadmap(RD-001~006) 전체가 완료된다.

## 확정 커밋

- `dfe376a` — 클립보드 붙여넣기 e2e 대표 시나리오 4개 추가 (Issue #38 슬라이스 10, RD-006 DELTA-02, RD-006 DONE)

## 변경한 계약과 파일

- `e2e/support/clipboard.ts`(신규) — `e2e/table-paste.spec.ts`의 `dispatchPaste`(text/html·text/plain 붙여넣기 이벤트 dispatch)를 그대로 옮기고, 파일 단독 시나리오를 위해 `fileNames?: string[]` 입력을 추가했다(`DataTransfer.items.add(new File(...))`). 기존 `{html, text}` 동작은 바꾸지 않았다.
- `e2e/table-paste.spec.ts` — 로컬 `dispatchPaste` 정의 삭제, `./support/clipboard.js` import로 교체(순수 이동, 기존 7개 시나리오 동작 변경 없음).
- `e2e/clipboard-paste.spec.ts`(신규) — 4개 대표 시나리오:
  - own-export `data-be-children` 중첩 wrapper HTML을 붙이면 실제 DOM에 `[data-be-block-group]` 중첩이 반영된다(완료 조건 5 실브라우저 보강).
  - Markdown 문법 plain text만 붙이면 `h1`·`[data-be-bullet-list-item]`(production 목록 마커, `<li>`가 아니다)으로 반영된다(완료 조건 2·3 보강).
  - raw `style` 배경색이 있는 표 HTML과 Markdown처럼 보이는 plain text가 동시에 있으면 `TablePasteExtension`이 처리하고(배경색 보존) undo 1회로 복원된다(완료 조건 1, 이 슬라이스 유일의 실제 Chromium 표 우선 회귀).
  - 파일 단독 클립보드는 실제 `ClipboardEvent`로도 무시되고 문서가 바뀌지 않는다(완료 조건 4, 이 슬라이스 유일의 실제 `ClipboardEvent` 필요 시나리오).

## 구현 중 계획과 달랐던 사실

1. **"표 블록 존재"만으로는 실제 브라우저에서도 판별력이 없다** — DELTA-01(core)이 jsdom에서 먼저 겪은 문제가 e2e에서도 동일하게 재현됐다. 순수 `<table>` fixture는 `TablePasteExtension`/`ClipboardPasteExtension` 등록 순서를 실제로 뒤바꿔도(로컬 mutation, 미커밋) RED가 재현되지 않았다 — `io.importHtml`의 일반 HTML 경로도 `<table>`을 table 블록으로 파싱할 수 있기 때문이다. `td`에 raw `style` 속성이 있는 표로 fixture를 바꿔 해결했다 — `sanitize-schema.ts`의 `htmlAllowedAttributes.td`는 `style`을 허용하지 않아 일반 경로는 배경색을 잃는데, `TablePasteExtension`의 `parseClipboardTable`은 `style`을 직접 읽어 배경색을 보존한다(기존 `table-paste.spec.ts`의 Google Sheets/Excel 테스트와 같은 원리).
2. **ProseMirror가 파일 단독 붙여넣기에서 화면 밖 임시 contenteditable을 순간적으로 만든다** — 파일 단독 시나리오의 최초 assertion이 `getByRole('textbox',{name:'Editor'}).locator('[contenteditable="true"]')`가 2개 엘리먼트에 매치되는 strict mode 위반으로 실패했다. `page.locator(".geul-editor").innerHTML()`로 실측한 결과 `<div contenteditable="true" style="position: fixed; left: -10000px; ...">`가 순간적으로 나타났다가 500ms 안에 사라짐을 확인 — ProseMirror가 clipboardData만으로 읽을 수 없는 콘텐츠(파일)를 판정하려고 쓰는 내부 캡처 기법으로, Geul 코드가 만드는 DOM이 아니다. 대상 locator를 실제 편집기 root 클래스(`.tiptap.ProseMirror`, 임시 노드는 이 클래스가 없다)로 좁혀 해결했다.

## 검증

- `npx playwright test --project=chromium e2e/table-paste.spec.ts` 7/7 passed(추출 회귀 없음).
- `npx playwright test --project=chromium e2e/clipboard-paste.spec.ts` 4/4 passed.
- `pnpm typecheck:e2e` 통과.
- `pnpm test:e2e --project=chromium`(최종 게이트) 145 tests passed(전체, 회귀 없음).
- `npx eslint`/`npx prettier --write` 대상 3파일(`clipboard-paste.spec.ts`, `support/clipboard.ts`, `table-paste.spec.ts`) 발견 0건.
- 변이 검증 2건: (1) `production-editor-assembly.ts`의 확장 등록 순서를 임시로 뒤바꾸면(로컬 실험) "표 우선" 시나리오가 raw 배경색 불일치로 RED 재현. (2) `ClipboardPasteExtension`이 html/text 둘 다 빈 문자열이어도 무조건 `insertContent`를 호출하도록 만들면(로컬 실험) "파일 단독 무시" 시나리오가 RED 재현. 둘 다 `git checkout --`으로 즉시 원복, 최종 커밋 diff에는 포함되지 않는다.

## 등록한 이슈

없음.

## 남은 제한

- RD-006 완료 조건 1~7 전부 충족(`_works/roadmap/RD-006.md` "완료 조건 최종 재대조"). RD-006 `DONE`.
- **Issue #38 슬라이스 10 roadmap(RD-001~006) 전체가 완료됐다.** roadmap-workflow "RD 완료와 roadmap 종료" 절차(Issue 진행 계획 동기화, 제품 문서 갱신, `_works/roadmap/` archive, Issue 완료 댓글)를 이 DELTA 직후 별도로 수행한다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert dfe376a`. 위험: 낮음 — e2e 파일만(신규 2개+수정 1개), io·core·model 소스 변경 없음. 다른 e2e spec이나 core/io 공개 계약에 영향 없음.
