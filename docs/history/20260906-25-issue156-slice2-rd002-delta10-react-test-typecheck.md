# Issue #156 슬라이스2 RD-002 DELTA-10 — react: test 파일 7개 typecheck 정리

## 목표

roadmap-workflow RD-002의 열 번째 DELTA. `packages/react/test/`의 7개 파일(62곳 typecheck 에러)을 정리한다. 새 동작 없음. 이 DELTA로 `react` 패키지 전체(src+test+configs) typecheck가 clean해진다.

## 확정 커밋

- `2314111` — test(react): test 파일 7개 typecheck 정리(RD-002-DELTA-10)

## 변경한 계약과 파일

- `packages/core/src/index.ts` — `CodeBlock`/`HeadingBlock`/`ParagraphBlock`/`TableBlock`을 model 재수출 목록에 추가(`react`는 model에 직접 의존하지 않아 `core`가 통과시킨다 — DELTA-09의 `isKnownBlockType` 재수출과 동일 경로).
- `packages/react/test/mount-editor.tsx` — 공유 헬퍼 `tableBlockOf`(여러 파일이 import)의 반환 타입을 `TableBlock`으로 명시 + `as TableBlock` 캐스트. 이 한 곳 수정으로 `table-handle-menu.test.tsx`(25)·`table-handles.test.tsx`(6)·`table-selection-toolbar.test.tsx`(7) 세 파일의 38곳이 연쇄로 해소됐다 — DELTA-08의 `documentVisibleText` 발견과 같은 패턴("공유 헬퍼부터 확인"이 다시 효율적이었음).
- `packages/react/test/{slash-menu.test.tsx,code-block-language-combobox.test.tsx,block-side-menu.test.tsx}` — heading/codeBlock/paragraph/table 예약 리터럴 캐스트(다수, DELTA-05~09에서 반복 검증된 패턴).

## 검증

- `pnpm --filter @cp949/geul-react test`(전체) — 34/34 파일, 505 tests passed(변화 없음). `pnpm --filter @cp949/geul-core test`(전체) — 112/112 파일, 1550 tests passed(변화 없음, index.ts 재수출 추가만). 회귀 없음.
- `pnpm --filter @cp949/geul-react exec tsc`(3개 tsconfig: json/test.json/configs.json, stale tsbuildinfo 삭제 후) — **`react` 패키지 전체 0건**(착수 전 62곳).
- `npx eslint packages/react/test/*.tsx packages/core/src/index.ts` — 0 문제.
- post-fix mutation 생략(DELTA-08과 동일 근거 — 새 동작 없는 정적 typecheck 정리).

## 등록한 이슈

없음.

## 남은 제한(중요 — 신규 발견)

이 DELTA 종료 시점에 `pnpm --filter @cp949/geul-core typecheck`(project reference 전량)를 처음 실행해 **`core` 패키지 자체의 test 파일에 미해결 typecheck 에러 92곳/17파일**이 있음을 발견했다. RD-002.md의 원래 DELTA-05~10 계획에 이 범위가 전혀 없었다 — DELTA-02~04는 `core`의 **src**만 다뤘고, `core`의 test 파일은 지금까지 한 번도 typecheck 대상으로 실측되지 않았다(io/react는 DELTA-08/10에서 test까지 다뤘지만 core는 순서상 test 차례가 오지 않았다). 다음 세션이 `_works/roadmap/RD-002.md`의 "예상 DELTA" 백로그에 이 항목을 추가해야 한다(가칭 DELTA-10a 또는 재번호, 상세 내용은 `/tmp/geul-issue156-slice2-roadmap-handoff-20260906c.md` 핸드오프 참고).

- GitHub Issue #156에는 댓글을 게시하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 2314111`. 위험: 낮음 — 재수출 추가 + 테스트 파일 타입 캐스트뿐, production 코드·런타임 동작 무변경(505+1550 tests 그대로 통과로 확인).
