# Issue #156 슬라이스2 RD-003 DELTA-01 — `exportHtml`/`exportMarkdown` `customBlockToHtml`/`customBlockToMarkdown` + `CUSTOM_BLOCK_LOST` strict/lossy 정책

## 목표

roadmap-workflow RD-003(io HTML/GFM `CUSTOM_BLOCK_LOST` 손실 정책)의 첫 DELTA. RD-002가 `DONE`으로 전환된 직후, `READY` 상태였던 RD-003으로 전환해 착수했다. `io`의 `exportHtml`/`exportMarkdown`이 선택적 파라미터로 커스텀 block 렌더러(`customBlockToHtml`/`customBlockToMarkdown`)를 받아 등록된 타입은 정상 변환하고, 미등록 타입은 신규 손실 카테고리 `CUSTOM_BLOCK_LOST`로 처리한다(spec §4.5). `io`는 여전히 `core`의 registry를 모르는 순수 함수로 남는다(ADR-0002).

착수 전 판단(그릴링 없이 결정, 근거는 `_works/roadmap/result/RD-003-DELTA-01.md` "착수 전 판단"):

1. `exportHtml`은 spec §4.5 시그니처상 strict/lossy 모드가 없어 미등록 타입은 항상 즉시 거절로 충분하다(계약 변경 없음, 기존 `HTML_DOCUMENT_INVALID` 그대로 재사용). `exportMarkdown`은 기존 `mode: "strict"|"lossy"` 오버로드와 `MarkdownLoss`/`MarkdownLossNotAllowedError` 이분법에 `CUSTOM_BLOCK_LOST` `kind`만 얹어 재사용한다 — 새 에러 코드 없음.
2. `exportMarkdown`의 기존 `MARKDOWN_DOCUMENT_INVALID` 무조건 거절(RD-002-DELTA-05/07이 "RD-003이 나중에 진짜 정책으로 교체한다"고 예고해 둔 임시 정지 동작)을 제거하고 `analyzeMarkdownLoss` 기반 `CUSTOM_BLOCK_LOST`로 완전히 교체한다 — 기존 `unsupported-block-markdown-export.test.ts`의 계약을 의도적으로 바꾼다(회귀 아님). `exportHtml`은 애초에 손실 메커니즘이 없어 대응 테스트는 문구만 다듬고 코드/결과는 그대로 둔다.
3. HTML 출력에 raw passthrough 노드(`HtmlRawNode`)를 추가하고 `rehypeStringify`에 `allowDangerousHtml: true`를 켠다 — `customBlockToHtml`은 완성된 HTML 문자열을 반환하는 계약이라 구조화된 트리로 재파싱할 필요가 없다(사전 스크립트로 hast 표준 동작 확인).
4. Markdown 출력은 mdast 표준 `{type:"html", value:string}` 노드를 그대로 쓴다(신규 타입 불필요, CommonMark 표준 raw HTML block).
5. `blocksInlineContentViolation`에 `!isKnownBlockType(block.type)`이면 건너뛰는 방어 분기를 추가한다 — 이 함수의 "top-level 게이트 뒤라 CustomBlock 없음" 전제가 이 DELTA로 깨지므로(등록된 CustomBlock은 이제 게이트를 통과해 이 함수까지 도달) 크래시를 막는 필수 수정이다.

## 확정 커밋

- `163b507` — feat(io): exportHtml/exportMarkdown customBlockToHtml/customBlockToMarkdown + CUSTOM_BLOCK_LOST 정책(RD-003-DELTA-01)

## 변경한 계약과 파일

- `packages/io/src/html/export-html.ts` — `ExportHtmlOptions`(`customBlockToHtml?`) 신설, `exportHtml`이 두 번째 인자로 받음. top-level 게이트를 "등록되지 않았을 때만" 거절로 좁힘. `blockNodes`가 등록된 CustomBlock을 만나면 렌더러 출력을 `{type:"raw", value}`로 삽입. 재귀 호출(children)은 `knownBlockNodes`(신규, `blockNodes(blocks) as HtmlElementContent[]`)로 분리해 raw가 섞이지 않는다고 좁힌다. `stringifyProcessor`에 `allowDangerousHtml: true` 추가, `stringify(root)` 호출에 계약 전제 캐스트 추가(hast-util-raw 타입 확장 없이는 "raw"가 공식 `RootContent`에 없음, 런타임은 스크립트로 사전 검증).
- `packages/io/src/html/inline-content.ts` — `HtmlRawNode = {type:"raw"; value:string}` 신설. 공유 타입(`HtmlElementContent`/`HtmlRoot`, import·clipboard 파싱 소비처와 공유)에는 합류시키지 않는다(아래 "발견" 참고).
- `packages/io/src/inline-content-violation.ts` — `blocksInlineContentViolation`에 `if (!isKnownBlockType(block.type)) continue;` 분기 추가(divider/media와 동일 자리).
- `packages/io/src/markdown/loss-analysis.ts` — `MarkdownLoss["kind"]`에 `"CUSTOM_BLOCK_LOST"` 추가. `analyzeMarkdownLoss(document, customBlockTypes?: ReadonlySet<string>)`로 시그니처 확장 — 생략 시 모든 top-level CustomBlock을 미등록으로 간주(안전한 기본값).
- `packages/io/src/markdown/export-markdown.ts` — 3개 `exportMarkdown` 오버로드 전부에 `customBlockToMarkdown?` 필드 추가. top-level 무조건 거절 블록 제거(`analyzeMarkdownLoss`가 대신함). `flattenBlocks`가 미등록 CustomBlock을 폐기(`[]`)하고 등록된 것은 통과시킨다. `blockNodes`가 등록된 CustomBlock을 `{type:"html", value}`(mdast raw HTML block)로 렌더.
- `packages/io/test/unsupported-block-export.test.ts`/`unsupported-block-markdown-export.test.ts` — 기존 첫 `describe`(markdown 쪽 3개 assertion)를 새 계약으로 고쳐 쓰고, 등록된 렌더러 렌더·`content:"inline"` 안전성·다른 타입만 등록됐을 때의 거절을 검증하는 신규 테스트 8개(html 3, markdown 5) 추가.

## 발견(계획에 없던 typecheck 마찰, 착수 중 즉시 해소)

계획서는 `HtmlRawNode`를 공유 타입 `HtmlElementContent`/`HtmlRoot`에 직접 합류시키는 안을 세웠는데, 실제 적용 시 `import-html.ts`/`clipboard-table-parser.ts`/`import-warnings.ts`/`block-segmenter.ts`(HTML **파싱** 소비처, "raw" 노드를 절대 만들지 않는다)에서 8건의 새 typecheck 에러가 났다 — 파싱 결과가 항상 `HtmlElementNode`라고 전제한 `.tagName`/`.properties`/`.children` 접근이 유니온 확장으로 깨졌다. `HtmlRawNode`를 `export-html.ts` 로컬 타입(`HtmlExportRoot`)으로 분리하고, 재귀 호출 전용 `knownBlockNodes` 헬퍼로 4개 children 렌더링 지점만 안전하게 좁혀 해소했다 — `customBlocks`(RD-002-DELTA-11)가 이미 확립한 "shared 타입 오염 대신 로컬 타입 분리" 원칙의 재적용이다. 부수적으로 `stringifyProcessor.stringify(root)`도 hast 공식 타입에 `"raw"`가 없어 타입 에러가 나 `export-markdown.ts`의 `documentNode(...) as Parameters<...>[0]`과 동일한 계약 전제 캐스트로 해소했다.

## 검증

- 착수 전 조사로 기존 코드(`export-html.ts`/`export-markdown.ts`/`loss-analysis.ts`/`inline-content-violation.ts`)의 정확한 게이트 위치·주석("RD-003이 나중에 교체한다")을 재확인하고, hast/mdast raw-node passthrough 동작을 독립 스크립트로 사전 검증(둘 다 별도 플러그인 없이 지원 확인)한 뒤 착수.
- RED: 기존 markdown 테스트 3건이 계획대로 새 계약과 불일치를 보임(`MARKDOWN_DOCUMENT_INVALID` 기대 vs 구현이 이미 `MARKDOWN_LOSS_NOT_ALLOWED`/성공+경고) — 계획된 계약 변경이라 테스트를 새 계약으로 고쳐 씀. 신규 테스트 8개(html 3, markdown 5)는 구현과 함께 작성해 1차 실행 GREEN.
- post-fix mutation 6건 전부 의도한 대로 정확히 실패 확인 후 원복:
  1. html `blockNodes`의 등록 렌더러 호출 분기 제거 → 등록 렌더러 테스트 2건만 정확히 실패(`HTML_SERIALIZE_FAILED`).
  2. markdown `analyzeMarkdownLoss`의 등록 여부 확인 제거(무조건 손실 보고) → 등록 시나리오 4건 실패.
  3. html top-level 게이트의 등록 여부 확인 제거(무조건 통과) → 미등록 거절 테스트 2건이 명시적 거절 대신 `HTML_SERIALIZE_FAILED` 크래시로 새는 것을 확인.
  4. markdown `analyzeMarkdownLoss`를 RD-003 이전 동작(무조건 skip)으로 되돌림 → strict 모드가 손실 없음으로 오판해 4건 실패.
  5. markdown `flattenBlocks`의 lossy 폐기 분기 제거 → 해당 시나리오 1건만 정확히 격리되어 실패.
  6. `blocksInlineContentViolation`의 신규 skip 분기 제거 → **가장 넓게 퍼지는 결함**(html 2건 + markdown 6건, 총 8건) — `TypeError`가 `exportMarkdown`의 try/catch **바깥**에서 발생해 `Result`로 감싸지지 않고 그대로 전파됨을 확인(이 방어가 없으면 `Result` 계약 자체가 깨진다).
- `pnpm --filter @cp949/geul-io test` 656 passed(기존 648+신규 8) · `pnpm --filter @cp949/geul-core test` 1579 passed(변화 없음) · `pnpm --filter @cp949/geul-react test` 505 passed(변화 없음).
- `pnpm --filter @cp949/geul-io typecheck`/`core typecheck`/`react typecheck` 전부 0건(project reference 전량 포함).
- `npx eslint`(변경 7파일) 0 문제. `git diff --check` 0건.

## 등록한 이슈

없음.

## 남은 위험

- `importHtml`/`importMarkdown`의 CustomBlock round-trip(재-import)은 다루지 않았다 — RD-003.md "포함 범위"가 export만 명시. `customBlockToHtml`/`customBlockToMarkdown`이 만든 raw 출력에는 재-import 마커(`data-be-block-id` 등)가 없다.
- `core`의 `EditorController` export 편의 메서드(registry→`customBlockToHtml`/`customBlockToMarkdown` 자동 연결)는 `dev`에 없다 — 완전 서버 사이드 경로(소비자가 `io` 함수를 직접 호출)만 검증했다(RD-003.md "제외 범위").
- HTML raw 출력은 sanitize하지 않는다(소비자 신뢰 경계) — `customBlockToHtml`을 등록하지 않으면 전혀 영향 없다.
- **의도적 계약 변경(회귀 아님)**: `exportMarkdown`이 미등록 top-level CustomBlock을 만났을 때 반환하던 `MARKDOWN_DOCUMENT_INVALID`(mode 무관 무조건 거절)가 `MARKDOWN_LOSS_NOT_ALLOWED`(strict)/성공+`CUSTOM_BLOCK_LOST` 경고(lossy)로 바뀌었다. `analyzeMarkdownLoss(document)`를 `customBlockTypes` 없이 호출하는 기존 소비자는 이제 `[]` 대신 `CUSTOM_BLOCK_LOST` 항목을 받는다. `exportHtml`은 계약을 바꾸지 않았다.
- `HtmlElementContent`/`HtmlRoot`가 import·export 양쪽에 공유되는 사실이 계획 단계에 드러나지 않았다 — 향후 다른 shared 타입을 export 전용으로 확장할 때는 착수 전 grep으로 소비처 전체를 먼저 확인할 것(이번 DELTA "발견" 참고, pitfall 등록 여부는 판단 결과 미등록 — 1회 관측이고 기존 가이드 위반이 아니라 새 사실 발견).
- RD-003 완료 조건 4개 중 4개 전부(등록 시 정상 변환·strict 거절·lossy 폐기+경고·회귀 없음) 이 DELTA로 충족됐다 — RD-003의 예상 DELTA 백로그(DELTA-01 하나)가 이걸로 소진됐다. 다음 세션은 완료 조건 재대조 후 RD-003 `DONE` 전환을 판단한다.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-003이 아직 `DONE`이 아니다(완료 조건 재대조 남음).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 163b507`. 위험: 낮음 — `exportHtml`/`exportMarkdown`/`analyzeMarkdownLoss`의 신규 옵션 파라미터는 전부 optional이라 기존 호출부(옵션 미전달)는 동작이 그대로다(전체 회귀 스위트로 확인). 되돌리면 `customBlockToHtml`/`customBlockToMarkdown` 자체가 사라지고 `exportMarkdown`의 top-level CustomBlock 처리는 다시 `MARKDOWN_DOCUMENT_INVALID` 무조건 거절(RD-002-DELTA-07 상태)로 복귀한다.
