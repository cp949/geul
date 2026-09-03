# Issue #38 슬라이스 8 RD-004 DELTA-01 — HTML 인라인 색상 mark span/style 왕복

## 목표

roadmap-workflow RD-004(HTML/GFM 입출력)의 첫 DELTA. 인라인 `textColor`/`backgroundColor` mark(RD-001이 model에 이미 추가)를 HTML export/import에서 `<span style="color:...">`/`<span style="background-color:...">`로 왕복시킨다.

## 확정 커밋

- `4b0d529` — HTML 인라인 색상 mark span/style 왕복 구현 (Issue #38 슬라이스 8, RD-004 DELTA-01)

## 변경한 계약과 파일

- `packages/io/src/html/sanitize-schema.ts`: `htmlAllowedTagNames`에 `span` 추가, `htmlAllowedAttributes`에 `span: ["style"]` 추가(공유 목록 — 클립보드도 자동 수혜).
- `packages/io/src/html/inline-content.ts`: `wrapMark`의 `textColor`/`backgroundColor` case를 명시적 `throw`(RD-001 DELTA-01이 남긴 자리)에서 실제 `<span style="...">` 구현으로 교체. `markForElement`를 `marksForElement`로 개명(단일 `TextMark | undefined` 반환 → `TextMark[]` 반환) — 외부 HTML의 한 `<span>`에 `color`+`background-color`가 동시에 있어도 두 mark 모두 보존(`parseStyleDeclarations` 재사용).
- `packages/io/test/html-inline-color.test.ts`(신규 12건): export/import/round-trip 3개 describe. D1(마크당 span 1개 중첩, 병합 단일 span 아님)을 실측 고정.

## 검증

- `pnpm --filter @cp949/geul-io test` → 59 files, 461 passed(기존 449 + 신규 12).
- `pnpm --filter @cp949/geul-io typecheck`, 루트 `pnpm typecheck`(전체) — 통과.
- 변경 파일 `eslint` — 0 findings.
- `model`/`core`/`react` 전체 test — 무변경 확인(337/1145/406).
- 단일 커밋이라 재그룹화 대상 없음. 백업 ref·트리 diff 재대조(빈 출력) 후 ff-only 병합.
- RD-004 완료 조건 갱신: 조건 1(인라인 색상 mark HTML round-trip)을 이 DELTA가 충족.

## 등록한 이슈

- 완료 댓글 미게시(RD-004 미완료, DELTA 단위 보고 대상 아님 — RD-001~003과 같은 기준).
- 범위 밖 신규 이슈 등록 없음.

## 남은 제한

- RD-004 완료 조건 3개(블록 props round-trip, GFM strict/lossy 2개)가 남았다 — DELTA-02·03이 이어서 처리.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 1개를 `dev`에서 `git revert`한다. 위험: 낮음 — io 패키지 국소 변경, 공개 계약(export/import 함수 시그니처) 변경 없음.
