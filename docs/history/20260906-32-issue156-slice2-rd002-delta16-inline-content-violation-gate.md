# Issue #156 슬라이스2 RD-002 DELTA-16 — `io` html/markdown export의 인라인 레벨 커스텀 원소·마크 거절 게이트 신설 + 잔여 typecheck 정리

## 목표

roadmap-workflow RD-002의 열여섯 번째 DELTA. `export-html.ts`/`export-markdown.ts`의 top-level 게이트(`isKnownBlockType`, DELTA-05/07)는 최상위 block 타입만 걸러 block **내부** inline 콘텐츠(커스텀 inline 원소·`CustomTextMark`)는 전혀 검사하지 않는다 — 겉보기엔 평범한 문단인데 안에 커스텀 inline 원소가 든 문서를 넘기면 `inlineContentToNodes`/`inlineNodes`가 `item.text`/`item.marks`에 무가드 접근해 크래시하는 실사용 버그였다(DELTA-15가 `tabular-data.ts`에서 찾은 것과 같은 급). `core`의 DELTA-14(`inlineContentViolation`/`validateEditableContent`)와 동형인 판정을 `io`에 신설해 막고, `InlineContent` 위젠(DELTA-13)이 깨뜨린 `io` src 잔여 5파일/27곳(html 3·markdown 2)의 typecheck도 함께 정리했다.

착수 전 그릴링(`mattpocock-skills:grilling`, 사용자 승인)으로 네 가지를 결정했다: (1) html·markdown을 한 DELTA에서 함께 처리, (2) 판정 로직을 공유 헬퍼로 분리, (3) 기존 `HTML_DOCUMENT_INVALID`/`MARKDOWN_DOCUMENT_INVALID` 재사용(신규 코드 없음), (4) markdown은 `analyzeMarkdownLoss`(손실 보고)에 얹지 않고 `exportMarkdown` 진입점에서 mode 분기 이전에 강제 거절.

## 확정 커밋

- `dc011d1` — feat(io): html/markdown export의 인라인 레벨 커스텀 원소·마크 거절 게이트 신설(RD-002-DELTA-16)

## 변경한 계약과 파일

- `packages/io/src/inline-content-violation.ts`(신규): `inlineContentViolation`(아이템 레벨 판정, `isTextRunItem`/`isKnownTextMarkType` 재사용) + `blocksInlineContentViolation`(`core`의 `validateEditableContent`와 동형 재귀 — divider/codeBlock/4종 미디어는 skip, table은 cell마다, 나머지는 content+children 재귀).
- `packages/io/src/html/export-html.ts`: `exportHtml`의 top-level 게이트 직후 `blocksInlineContentViolation` 호출 추가, 위반 시 기존 `HTML_DOCUMENT_INVALID`로 거절. `codeBlockNode`의 `block.content[0]?.text`(false widening, CodeBlock은 model 계약상 항상 텍스트 런 1개뿐)는 계약 전제 캐스트로 정리.
- `packages/io/src/markdown/export-markdown.ts`: `exportMarkdown`의 top-level 게이트 직후(mode 분기 이전) 동일 호출 추가, `MARKDOWN_DOCUMENT_INVALID`로 거절(mode 무관). `inlineNodes`(15곳)와 codeBlock 노드의 `content[0]`은 계약 전제 캐스트로 정리.
- `packages/io/src/html/inline-content.ts`: `inlineContentToNodes`(export 방향, 게이트 뒤에서만 호출되는 내부 전용 함수 — `packages/io/src/index.ts`에 재수출되지 않음을 grep으로 확인)를 계약 전제 캐스트로 정리.
- `packages/io/src/html/import-html.ts`: `sanitizeInlineContentText`(2곳)는 false widening 캐스트로 정리(HTML 파서는 커스텀 원소를 만드는 경로가 없음, DELTA-06과 동일 근거).
- `packages/io/src/markdown/loss-analysis.ts`: `hasUnderline`/`hasColorMark`/`hasInlineCodeNewline`(7곳)은 "계약 전제 캐스트"가 아니라 `isTextRunItem` 가드 후 skip으로 정리 — `analyzeMarkdownLoss`가 `exportMarkdown` 게이트를 우회해 직접 호출 가능한 공개 API이기 때문(DELTA-07이 top-level CustomBlock에 이미 적용한 자체 방어 원칙의 대칭 적용).
- `packages/io/test/unsupported-block-export.test.ts` / `unsupported-block-markdown-export.test.ts`: 기존 top-level CustomBlock 거절 테스트와 같은 파일에 인라인 레벨 거절 테스트 8건 추가(html 3 — paragraph 안 커스텀 원소·미등록 마크·table cell 재귀, markdown 5 — strict/lossy 커스텀 원소·CustomTextMark 양쪽 모드·`analyzeMarkdownLoss` 직접 호출 시 크래시 없음 2건).

## 검증

- 착수 전 재측정(`pnpm --filter @cp949/geul-model build` 후 stale tsbuildinfo 삭제): `io` src 정확히 5파일/27곳 — DELTA-13/14/15 실측과 정확히 일치(드리프트 없음).
- RED→GREEN(정석 순서): 신규 테스트 8건 작성 → 계획대로 6건은 `HTML_SERIALIZE_FAILED`/`MARKDOWN_SERIALIZE_FAILED`/크래시로 실패, 게이트가 있어야 통과하는 나머지는 미거절로 실패 확인 → 구현 → 8/8 GREEN.
- `pnpm --filter @cp949/geul-io test` — 648 passed(기존 640 + 신규 8).
- `pnpm --filter @cp949/geul-io exec tsc -p tsconfig.json --noEmit` — 27→0곳, **`io` src 전체 typecheck clean 마일스톤 재달성**(DELTA-13이 깨뜨린 이후 처음).
- `pnpm --filter @cp949/geul-io build` 후 `pnpm --filter @cp949/geul-core test`(1569 passed)·`pnpm --filter @cp949/geul-react test`(505 passed) — 둘 다 변화 없음(`io`만 변경, 회귀 없음).
- `pnpm --filter @cp949/geul-io typecheck`(복합 스크립트, src+test 둘 다 직접 실행 — `PIT-0038` 대응): src는 통과, test 단계는 기존 미해결 3파일(`clipboard-table-normalization.test.ts`/`html-depth-support.ts`/`html-round-trip.test.ts`, 7곳)만 남고 이번 DELTA가 추가한 두 테스트 파일 자체는 에러 0건.
- `npx eslint`(신규 1 + 변경 7파일) — 0 문제.
- post-fix mutation 4건(`export-html.ts` 게이트 무력화, `export-markdown.ts` 게이트 무력화, `loss-analysis.ts`의 `isTextRunItem` 가드 3곳 무력화, `blocksInlineContentViolation`의 table 분기 무력화) 전부 의도한 대로 정확히 재실패 확인 후 원복. 나머지 캐스트 지점(false widening/계약 전제)은 런타임 코드가 바뀌지 않는 순수 타입 정리라 mutation 생략(DELTA-06/07/08/12/15와 동일 근거). mutation 도중 `loss-analysis.ts` 상단 주석 오타(공백 누락)를 발견해 즉시 수정.

## 등록한 이슈

없음.

## 남은 위험

- `io` test 3파일(7곳)·`core` test 7파일 typecheck 에러는 여전히 남아 있다 — 후속 DELTA 대상.
- `customInlineContent`/`customStyles` registry(PM inline atom·Mark)가 실제로 배선되면 이번에 신설한 `blocksInlineContentViolation` 게이트가 등록된 타입은 통과시키도록 갱신돼야 한다 — `core`의 DELTA-11이 `modelToTiptap`의 top-level 거절을 조건부로 바꾼 것과 같은 성격의 후속 작업. 현재는 io가 core registry 정보를 알 방법이 없어 무조건 거절한다(에러 메시지에 "customInlineContent/customStyles registry is not supported yet" 명시).
- RD-002는 아직 `ACTIVE`(`io` test 3파일·`core` test 7파일 typecheck 정리 → `customInlineContent`/`customStyles` registry 배선 남음). 완료 조건 3개 중 "PM 노드가 스키마에 등록되지 않는다"만 DELTA-12로 충족, 나머지 둘은 미충족.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-002 전체 완료 기준 대비 부분 진행이다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert dc011d1`. 위험: 낮음 — 게이트 두 곳(html/markdown)이 유일한 실제 신규 동작이고 캐스트 정리 지점은 기존 텍스트 런·8종 마크 문서에 대한 판정 결과(코드·문구)를 그대로 보존한다(`pnpm --filter @cp949/geul-io test`/`pnpm --filter @cp949/geul-core test`/`pnpm --filter @cp949/geul-react test`가 기존 개수 그대로 통과함을 확인). 되돌리면 html/markdown 5파일 typecheck 27건과 인라인 레벨 커스텀 원소 크래시가 다시 나타난다.
