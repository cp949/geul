# Issue #156 슬라이스2 RD-002 DELTA-15 — `io` src 클립보드 도메인 typecheck 정리 + `TabularData` 커스텀 inline 원소 크래시 수정

## 목표

roadmap-workflow RD-002의 열다섯 번째 DELTA. `model`의 `InlineContent` 위젠(DELTA-13)으로 깨진 `io` src 8파일/39곳 중 클립보드 도메인 3파일(`cell-text.ts`/`clipboard-table-parser.ts`/`tabular-data.ts`, 12곳)을 정리한다. 단순 타입 정리가 아니다 — `tabular-data.ts`의 `validateTabularData`가 `core`의 `inlineContentViolation`(DELTA-14)보다 먼저 커스텀 inline 원소의 `item.text`에 무가드 접근해 `TypeError`로 크래시하는 실사용 버그(DELTA-14 "남은 위험" 1번)를 이 DELTA가 고친다. `pasteTabularData`/`pasteClipboardContent`(공개 API)가 클립보드 파서를 거치지 않은 `TabularData`를 직접 받을 수 있어, `customStyles`/`customInlineContent` registry가 배선되기 전인 지금도 실제로 도달 가능한 경로였다.

## 확정 커밋

- `b8bc1cb` — fix(io): TabularData 커스텀 inline 원소 크래시 수정 + 클립보드 typecheck 정리(RD-002-DELTA-15)

## 변경한 계약과 파일

- `packages/io/src/clipboard/tabular-data.ts`:
  - `validateTabularData`의 텍스트 검증 루프에 `isTextRunItem` 가드 추가 — 텍스트 런이 아닌 원소(커스텀 inline)는 `continue`로 건너뛴다(거절 아님). model 계약상 커스텀 원소는 완전히 유효하므로 구조 검증 단계에서 거절하는 것 자체가 부정확하다 — 수용 여부 판정(등록되지 않은 타입이라 `EDITOR_FEATURE_UNAVAILABLE`로 거절할지)은 이 함수 다음에 실행되는 `core`의 `inlineContentViolation`에 위임한다(관심사 분리).
  - `appendInlineRuns`/`joinInlineSegments`(내부 헬퍼, `withParagraphsMergedIntoCells`가 사용) — 호출자(`core`의 `pasteClipboardContent`)가 이미 leading/trailing과 표 자신의 셀을 `inlineContentViolation`으로 검증했다는 계약을 전제로 `Extract<InlineContentItem, {text:string}>` 캐스트로 전환(`model-to-tiptap.ts`의 `inlineContentToTiptap`, DELTA-14 설계 결정 3과 동일 패턴).
- `packages/io/src/clipboard/cell-text.ts`: `normalizeCellContent`(유일한 호출부가 항상 HTML 파서 산출물만 넘기는 false widening) — 상단 1회 캐스트로 정리.
- `packages/io/src/clipboard/clipboard-table-parser.ts`: 지역 헬퍼 `visibleText`(캐스트 포함) 신설, `content.map((item) => item.text).join("")` 3개 호출부를 이걸로 교체.
- **계획에 없던 추가 발견**: `appendOrMergeInlineItem`(model, `inline-content-merge.ts`)의 `marks` 매개변수가 이미 `readonly TextMark[] | undefined`로 `CustomTextMark`를 배제하고 있어(그 파일 자체 주석이 "io 소비처가 CustomTextMark를 만들지 않는다, DELTA-14+ 대상"이라고 예고), 위 캐스트만으로는 `item.marks`/`run.marks`(`(TextMark|CustomTextMark)[]|undefined`)를 그대로 넘길 수 없었다 — `cell-text.ts`·`tabular-data.ts` 각 1곳씩 `as TextMark[] | undefined` 캐스트를 추가로 적용(계획 결정 2·3의 연장, 새 설계 결정 아님).
- `packages/io/test/tabular-data.test.ts` — 신규 테스트 1건: 커스텀 inline 원소가 든 셀에서 `validateTabularData`가 예외 없이 `{ok:true}`로 통과시킴을 확인(수용 판정은 io 몫이 아님).
- `packages/core/test/table-paste-validation.test.ts` — DELTA-14가 이월해 둔 placeholder 주석(완료 조건 5)을 실제 테스트로 교체: `pasteTabularData`(공개 API)에 커스텀 inline 원소가 든 셀을 넘기면 예외 없이 `TABULAR_DATA_INVALID`로 거절하고 문서를 바꾸지 않음을 확인.

## 검증

- 착수 전 재측정(`pnpm --filter @cp949/geul-model build` 후 `io`/`react`의 stale `tsbuildinfo` 삭제, 핵심 함정 2번): `io` src 정확히 8파일/39곳 — DELTA-13/14 실측과 정확히 일치(드리프트 없음).
- RED→GREEN(정석 순서): 신규 테스트 2건(io 1·core 1) 작성 → 둘 다 계획대로 `TypeError: value is not iterable`(`hasDisallowedCodePoint`가 `item.text` undefined를 순회)로 크래시 확인 → 구현 → 2/2 GREEN.
- `pnpm --filter @cp949/geul-io test` — 640 passed(기존 639 + 신규 1).
- `pnpm --filter @cp949/geul-io build` 후 `pnpm --filter @cp949/geul-core test` — 1568 passed + 1 skipped(기존 1567 + 신규 1). `public-types.test.ts`(`tsc -b`) 1건만 계속 fail — 남은 원인은 `io` src 5파일(html 3·markdown 2, 27곳)·`core` test 7파일뿐(회귀 아님, DELTA-13/14 실측 그대로).
- `pnpm --filter @cp949/geul-io exec tsc -p tsconfig.json --noEmit` — 39→27곳(정확히 12곳 해소), `cell-text.ts`/`clipboard-table-parser.ts`/`tabular-data.ts` 3파일 typecheck clean.
- `pnpm --filter @cp949/geul-react test`(505)·`typecheck`(0건) — 변화 없음.
- `npx eslint`(변경 5파일) — 0 문제.
- post-fix mutation: `isTextRunItem` 가드(유일한 실제 신규 동작)를 `git stash`로 제거 → io 신규 테스트가 원래 크래시(`TypeError: value is not iterable`)로 정확히 재실패 확인 → 복원, `pnpm --filter @cp949/geul-io build` 재실행 후 GREEN 재확인. 나머지 캐스트 4곳(false widening/계약 전제)은 런타임 코드가 바뀌지 않는 순수 타입 정리라 mutation 생략(DELTA-06/07/08/12와 동일 근거).

## 등록한 이슈

없음.

## 남은 위험

- `io` src 나머지 5파일(html 3·markdown 2, 27곳)·`io` test 3파일·`core` test 7파일 typecheck 에러는 여전히 남아 있다 — html 도메인(`export-html.ts`/`import-html.ts`/`inline-content.ts`)과 markdown 도메인(`export-markdown.ts`/`loss-analysis.ts`)이 DELTA-05~07과 같은 도메인 경계로 다음 후보다.
- `appendOrMergeInlineItem` 호출부마다 이번에 발견한 `marks` 캐스트가 추가로 필요할 수 있다 — `import-html.ts`/`import-markdown.ts`가 유력 후보, 다음 DELTA 착수 시 재확인.
- `withParagraphsMergedIntoCells`가 `io` 공개 API로 core 검증을 우회해 직접 호출되는 위험은 새로 생기지 않은 기존 위험 범주로 남겨 뒀다(DELTA-14 설계 결정 3과 동일 판단).
- RD-002는 아직 `ACTIVE`(DELTA-16+: `io` src 나머지 5파일·`core` test 7파일·`io` test 3파일 typecheck 정리 → `customInlineContent`/`customStyles` registry 배선 남음). 완료 조건 3개 중 "PM 노드가 스키마에 등록되지 않는다"만 DELTA-12로 충족, 나머지 둘은 미충족.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-002 전체 완료 기준 대비 부분 진행이다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert b8bc1cb`. 위험: 낮음 — `validateTabularData`의 가드 추가와 나머지 캐스트 4곳은 기존 텍스트 런·8종 마크 문서에 대한 판정 결과(코드·문구)를 그대로 보존한다(`pnpm --filter @cp949/geul-io test`/`pnpm --filter @cp949/geul-core test`가 기존 개수 그대로 통과함을 확인). 되돌리면 클립보드 3파일 typecheck 12건과 `TabularData` 크래시가 다시 나타난다.
