# Issue #38 슬라이스 10 RD-001 DELTA-01 — GFM Markdown 클립보드 감지, RD-001 DONE

## 목표

roadmap-workflow RD-001의 유일한 DELTA. 클립보드 `text/plain`이 GFM Markdown으로 해석해야 할 구조인지 `io.importMarkdown` 결과의 구조 복잡도로 판정하는 `detectMarkdownPaste`를 `@cp949/geul-io` package root에 추가한다. RD-004(core `ClipboardPasteExtension`)가 이 함수를 그대로 소비할 라우팅 seam이다.

## 확정 커밋

- `bf0a418` — GFM Markdown 클립보드 감지 함수 추가 (Issue #38 슬라이스 10, RD-001 DELTA-01)

## 변경한 계약과 파일

- `packages/io/src/clipboard/markdown-paste-detection.ts`(신규) — `detectMarkdownPaste(source, options?)`, `MarkdownPasteDetection` 타입. 판정: `importMarkdown`을 1회 호출하고, 결과가 단일 plain paragraph보다 복잡하면(블록 2개 이상, 또는 블록 1개의 type이 `paragraph`가 아니면) 감지됨으로 본다. 별도 정규식 사전 휴리스틱은 두지 않는다(RD-001.md "## 결정").
- `packages/io/src/index.ts` — 위 값·타입 export 추가.
- `packages/io/test/clipboard-markdown-detection.test.ts`(신규) — 유닛 테스트 13건. 단일 paragraph 미감지, GFM 전용 타입 7종(heading/quote/bulletListItem/numberedListItem/checkListItem/codeBlock/divider) 각 1블록 감지, 2블록 이상 감지, 빈/공백 입력, `importMarkdown` 실패(중복 id로 `MARKDOWN_DOCUMENT_INVALID` 실제 재현, mock 없음) 안전 처리, 재파싱 금지(id-factory 호출 횟수로 간접 검증)를 다룬다.

## 검증

- RED: `pnpm --filter @cp949/geul-io exec vitest run --root ../.. packages/io/test/clipboard-markdown-detection.test.ts` → 13 failed(구현 전, `detectMarkdownPaste is not a function`).
- GREEN: 같은 명령 → 13 passed.
- 변이 검증 2건 모두 계획대로 검출 확인(판정식 축소 → 8건 실패, 재파싱 흉내 → 1건 실패). 상세는 `_works/roadmap/result/RD-001-DELTA-01.md`.
- `pnpm --filter @cp949/geul-io test`(전체, 이 DELTA가 처음 건드리는 패키지) → 62 files / 495 tests passed(회귀 없음).
- `pnpm --filter @cp949/geul-io typecheck` → 통과.
- `pnpm exec eslint`·`pnpm exec prettier --check`(변경 파일 3개) → 발견 0건.

## 등록한 이슈

없음. Issue #38 완료 댓글은 roadmap(RD-001~006) 전체 완료 시점까지 보류한다(`_works/roadmap/roadmap.md` "전체 완료 조건", 슬라이스 8·9와 같은 처리).

## 남은 제한

- RD-001은 이 DELTA로 `DONE`이다(완료 조건 1~4 전부 실측 증거 충족, `_works/roadmap/RD-001.md`).
- RD-004(core `ClipboardPasteExtension`)가 아직 이 함수를 소비하지 않는다 — 라우팅 통합은 RD-004 범위.
- 실제 브라우저 clipboard `text/plain`의 잡음(트레일링 공백, 개행 정규화 등)과의 상호작용은 RD-004/RD-006 fixture 통합 시점에 재확인 필요.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert bf0a418`. 위험: 낮음 — 신규 파일 2개 추가와 export 2줄뿐, 기존 소비자 없음(RD-004 미착수).
