# Issue #38 슬라이스 8 RD-004 DELTA-02 — HTML 블록 props(`data-be-*`) 왕복

## 목표

roadmap-workflow RD-004의 두 번째 DELTA. `TextBlockProps`(`textColor`/`backgroundColor`/`textAlignment`)를 가진 7개 블록 타입(`paragraph`/`heading`/`quote`/목록 4종)이 HTML export/import에서 표 셀과 같은 `data-be-*` 패턴으로 왕복하게 한다.

## 확정 커밋

- `0ecacce` — HTML 블록 props(data-be-*) 왕복 구현 (Issue #38 슬라이스 8, RD-004 DELTA-02)

## 변경한 계약과 파일

- `packages/io/src/html/export-html.ts`: `textBlockPropsAttributes` 헬퍼 신설(표 셀 색상·정렬과 같은 패턴). `listItemNode`(li)·toggleListItem summary·quote(blockquote)·paragraph/heading(ownNode) 4곳에 `dataBeTextColor`/`dataBeBackgroundColor`/`dataBeTextAlignment` 병합.
- `packages/io/src/html/import-html.ts`: `textBlockPropsFromElement` 헬퍼 신설(정의된 필드만 통과, 검증은 `parseDocument` 한 곳). `blocksFromSegments`(paragraph/heading/quote)·`blocksFromListItem`(목록 3종)·toggleListItem 구성에 병합. `htmlImportSanitizeSchema.attributes.li`/`summary`(document-import 전용 로컬 override, 계획 시점엔 모르고 있던 사실 — 착수 중 발견) 확장 + raw-vs-sanitized 오탐 억제(`consumePreservedAttributeWarning`) 6개 추가.
- `packages/io/src/html/sanitize-schema.ts`: `p`/`h1`~`h6`/`blockquote`(공유 목록)에 3개 attrs 추가.
- `packages/io/test/html-block-props.test.ts`(신규 14건): export/import/round-trip, 부분 props·DELTA-01 공존·isToggleable heading 케이스 포함.

## 검증

- `pnpm --filter @cp949/geul-io test` → 60 files, 475 passed(기존 461 + 신규 14).
- `pnpm --filter @cp949/geul-io typecheck`, 루트 `pnpm typecheck`(전체) — 통과.
- 변경 파일 `eslint` — 0 findings.
- `model`/`core`/`react` 전체 test — 무변경 확인(337/1145/406).
- 단일 커밋이라 재그룹화 대상 없음. 백업 ref·트리 diff 재대조(빈 출력) 후 ff-only 병합.
- RD-004 완료 조건 갱신: 조건 2(블록 색상·정렬 props HTML round-trip)를 이 DELTA가 충족.

## 등록한 이슈

- 완료 댓글 미게시(RD-004 미완료 — DELTA-03 남음).
- 범위 밖 신규 이슈 등록 없음 — `li`/`summary`가 공유 스키마가 아니라 `import-html.ts` 로컬 override라는 사실은 이 DELTA 안에서 바로 흡수(별도 가이드·pitfall 승격 대상 아님, 국소 구현 세부).

## 남은 제한

- RD-004 완료 조건 2개(GFM strict/lossy)가 남았다 — DELTA-03이 이어서 처리.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 1개를 `dev`에서 `git revert`한다. 위험: 낮음 — io 패키지 국소 변경, 공개 계약 변경 없음.
