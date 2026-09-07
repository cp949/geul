# Issue #156 슬라이스9 RD-002 — Markdown 진입점 DOM-free 판정, roadmap 종료

## 목표

`IO-009`(서버 측 parse/render)의 두 번째이자 마지막 결과. `exportMarkdown`/`importMarkdown`이 순수 Node 환경(DOM 전역 없음)에서 왕복 동작함을 회귀 fixture로 고정하고, `packages/io/README.md`의 Markdown 절을 채운다.

## 확정 커밋

- `b731a85` — test(io): Markdown 서버 렌더 DOM-free 회귀 fixture 추가, README Markdown 절 작성 (DELTA-01)

## 변경한 계약과 파일

- 신규 `packages/io/test/server-render-markdown.test.ts` — DOM 전역 부재 assertion + `exportMarkdown`(strict)→`importMarkdown` 왕복 보존 테스트 2건.
- `packages/io/README.md` — RD-001이 남긴 자리표시 절을 `exportMarkdown`/`importMarkdown` 사용 예제, strict/lossy 모드, `CUSTOM_BLOCK_LOST` 손실 카테고리(strict 거절/lossy 폐기+경고) 문서로 교체.

## 구현 중 발견·재검토

- `exportMarkdown`의 미등록 커스텀 블록 처리는 `exportHtml`의 단순 `HTML_DOCUMENT_INVALID` 거절과 다르다 — `analyzeMarkdownLoss`가 `{ kind: "CUSTOM_BLOCK_LOST" }` 손실 항목을 만들고, strict 모드는 `{ code: "MARKDOWN_LOSS_NOT_ALLOWED", losses }`로 거절, lossy 모드는 블록을 폐기하고 `warnings`로 반환한다(`export-markdown.ts:481-494`, `loss-analysis.ts:390`). README에 두 함수의 손실 정책 차이를 각각 정확히 기술했다 — RD-001-DELTA-01의 결과(코드 대조 없이 스펙 문구만 보고 썼다면 `exportHtml`도 `CUSTOM_BLOCK_LOST` 전용 코드를 쓴다고 오기했을 뻔한 실수, 결과 절 참고)와 같은 패턴의 확인을 반복했다.
- RD-001 관례(`globalThis` 인덱싱, 파일 개요 주석, 한글 제목)를 그대로 재사용해 새로운 설계 판단 없이 완료했다.

## 검증

- RED/GREEN: 신규 구현이 아니므로 RED 없음(characterization) — 작성 즉시 GREEN 확인.
- `pnpm --filter @cp949/geul-io test`: 78 files / 660 tests(기존 77/658 + 신규 1/2) 전부 통과, 회귀 없음.
- `pnpm --filter @cp949/geul-io typecheck` clean.
- `prettier --check` clean.

## RD-002 진행 상태, roadmap 종료

RD-002의 예상 DELTA 1개(DELTA-01) 완료 — **RD-002 DONE.** **RD-001·RD-002 둘 다 DONE — roadmap 전체(Issue #156 슬라이스9, `IO-009`)도 완료.**

전체 완료 조건 5개 재대조(`_works/roadmap/roadmap.md`):

- HTML DOM-free 판정(RD-001) — `server-render-html.test.ts`.
- Markdown DOM-free 판정(RD-002) — `server-render-markdown.test.ts`.
- `packages/io/README.md` 4개 진입점 문서화 — HTML 절(RD-001)+Markdown 절(RD-002).
- `pnpm --filter @cp949/geul-io test` 통과 — 78 files / 660 tests.
- `docs/product/blocknote-free-feature-inventory.md`의 `IO-009` `NOT_STARTED` → `VERIFIED` 갱신 완료(별도 커밋, 아래 참고).

## 등록한 이슈

없음.

## 게시

Issue #156에 슬라이스9 완료 댓글 게시, 체크리스트 슬라이스9 항목 `[x]` 갱신(roadmap-workflow 완료 게이트 통과, `docs/agents/issue-tracker.md` "게시 승인" 넷째 bullet). 이슈는 닫지 않는다 — 슬라이스 10·11이 남아 있다.
