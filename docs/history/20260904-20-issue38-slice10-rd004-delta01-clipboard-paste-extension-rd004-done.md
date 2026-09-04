# Issue #38 슬라이스 10 RD-004 DELTA-01 — `ClipboardPasteExtension`, RD-004 DONE

## 목표

roadmap-workflow RD-004의 유일한 DELTA. `io.importHtml`/`detectMarkdownPaste` + `modelToTiptap`을 재사용하는 신규 `ClipboardPasteExtension`으로, 목록이 아닌 HTML(heading·quote·codeBlock·paragraph·divider `<hr>`, `BLK-006` 해소)과 Markdown 텍스트 감지 붙여넣기를 중첩(RD-002)·안정 id까지 보존해 완성한다.

## 확정 커밋

- `877d516` — ClipboardPasteExtension 추가 — 비목록 HTML·Markdown 통합 붙여넣기 (Issue #38 슬라이스 10, RD-004 DELTA-01)

## 변경한 계약과 파일

- `packages/core/src/clipboard-paste-extension.ts`(신규) — `ClipboardPasteExtension`. 표 셀 안 가드 → `text/html` 있으면 `io.importHtml` → 비표 블록 id 전부 재발급(`reassignNonTableBlockIds`) → `modelToTiptap` → depth-clamp(`clampDepth`, `list-paste-fallback-extension.ts`와 같은 정책의 독립 구현) → `insertContent`. `text/html` 없고 Markdown 감지되면 같은 경로. 감지 실패·파일 단독 클립보드는 이벤트 미소비(PM 기본 위임).
- `packages/core/src/production-editor-assembly.ts` — 등록 추가. **Tiptap 3.30.1의 `ExtensionManager.plugins`가 `addProseMirrorPlugins` 결과를 `extensions` 배열 선언의 역순으로 모아 `handlePaste` 우선순위를 매긴다**(소스 직접 확인, `sortExtensions([...extensions].reverse())`) — 이 확장을 `TablePasteExtension`/`ListPasteFallbackExtension`보다 배열상 **먼저** 선언해야 실제 실행이 **나중**이 된다(둘의 자기-콘텐츠 판정이 먼저 걸리게 하려면).
- `packages/io/src/clipboard/markdown-paste-detection.ts`(RD-001 edge case 보정) — GFM 전용 타입 단일 블록이어도 content가 완전히 비어 있으면(예: `"- "` 하나만) 감지하지 않는다. `list-input-rule-extension.test.ts`의 기존 회귀("paste insertion은 exact shorthand를 변환하지 않는다")가 이 보정 없이 깨졌다.
- `packages/core/test/quote-paste-fallback.test.ts` — 이 시나리오를 이제 PM 기본 폴백이 아니라 이 확장이 가로챈다. `io.importHtml`이 캐럿의 기존 문단과 병합하지 않고 클립보드 HTML 전체를 독립 document로 삽입해 id 시퀀스가 늘어난다(quote 블록 보존·에러 없음이라는 의미는 유지, RD-004 "## 결정"이 이미 이 여지를 승인).
- `packages/core/test/clipboard-test-support.ts`/`editor-controller-support.ts` — `withUnhandledErrorTracking`/`maxBlockDepth`를 `list-paste-fallback.test.ts`의 로컬 헬퍼에서 공유 위치로 승격(세 번째 소비 파일 등장, `G-TST-002`).
- `packages/core/test/clipboard-paste-extension.test.ts`(신규) — 12건. 표 셀 가드, heading/quote/codeBlock/paragraph/divider 타입별 반영, Google Docs 잡음 내성(스파이크 회귀 편입), Markdown 감지 라우팅, plain text 위임, 빈 클립보드 무변화, 비표 id 전역 재발급, depth-clamp.

## 구현 중 계획과 달랐던 사실

1. Tiptap의 `handlePaste` 우선순위가 `extensions` 선언 역순이라는 사실 — `list-paste-fallback.test.ts`의 `ol[start]` 회귀가 실측으로 드러냈다. 등록 순서를 정정하고 근거 주석을 남겼다.
2. `@cp949/geul-io`는 `package.json` `exports`가 `dist/index.js`를 가리켜, RD-001·RD-002가 추가한 export가 **재빌드 전에는 core에서 보이지 않았다**(`G-WKS-002`). `pnpm --filter @cp949/geul-io build`로 해소했다 — 이후 io 변경을 core가 처음 소비하는 시점마다 이 재빌드가 필요하다.
3. RD-001 `detectMarkdownPaste`의 미검증 edge case(빈 content GFM 단일 블록)를 이 DELTA에서 함께 보정했다 — RD-001의 기존 완료 조건·통과 테스트는 그대로 유지된다(첨언 수정, 계약 변경 아님).

## 검증

- RED→GREEN: `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/clipboard-paste-extension.test.ts` → 12 passed(구현 중 위 3건을 순차 발견·수정).
- 회귀 목록(`quote-paste-fallback`·`list-paste-fallback`·`editor-controller-table-paste`·`table-paste-commands`·`table-paste-sequence`) → 6 files / 77 tests passed.
- 변이 검증 3건(모두 계획대로 검출, 상세는 `_works/roadmap/result/RD-004-DELTA-01.md`) — 특히 id 재발급 변이는 첫 시도에서 `BlockIdExtension`의 사후 중복 보정 덕에 통과해버려(약한 테스트) 비충돌 리터럴 id로 테스트를 강화한 뒤 재검증했다.
- `pnpm --filter @cp949/geul-io test`(전체) → 63 files / 510 tests passed.
- `pnpm --filter @cp949/geul-core test`(전체, roadmap이 core를 처음 건드림) → 93 files / 1241 tests passed(회귀 없음).
- `pnpm --filter @cp949/geul-io typecheck`·`pnpm --filter @cp949/geul-core typecheck` → 둘 다 통과.
- `pnpm exec eslint`·`pnpm exec prettier --check`(변경 파일 9개) → 발견 0건.

## 등록한 이슈

없음. Issue #38 완료 댓글은 roadmap(RD-001~006) 전체 완료 시점까지 보류한다.

## 남은 제한

- RD-004는 이 DELTA로 `DONE`이다(완료 조건 1~6 전부 실측 증거 충족, `_works/roadmap/RD-004.md`).
- RD-005(목록 경로 흡수)가 `ListPasteFallbackExtension`을 제거할 때 이 DELTA의 "배열 선언 역순 = 실행 순서" 지식을 반드시 반영해야 한다 — 반영하지 않으면 표 붙여넣기가 조용히 깨질 위험이 있다.
- Markdown 텍스트가 GFM 표 구문만으로 이뤄진 경우는 이 DELTA·RD-001 어느 완료 조건에도 명시되지 않았다(실제 발생 가능성 낮음, 발견 시 별도 이슈).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 877d516`. 위험: 중간 — core 신규 확장 1개 + 등록 순서 변경 + io 파일 1개(RD-001 edge case 보정) + 기존 회귀 테스트 2개 파일 갱신을 되돌린다. 되돌리면 `list-input-rule-extension.test.ts`/`list-paste-fallback.test.ts`/`quote-paste-fallback.test.ts`가 이 커밋 이전 상태로 정확히 복원된다(전부 같은 커밋 안에서 함께 바뀌었다).
