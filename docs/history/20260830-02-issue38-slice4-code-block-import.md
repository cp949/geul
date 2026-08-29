# Issue #38 슬라이스 4 RD-003 — CodeBlock import

## 목표

HTML/GFM CodeBlock import, metadata warning과 production core round-trip을 완성하고 `BLK-011`을 검증 상태로 전환한다.

## 확정 커밋

- `5c8183a` — HTML sanitizer·semantic CodeBlock import
- `860c8d0` — GFM fenced·indented CodeBlock import
- `22af0b2` — production core load·save·export/re-import 통합 테스트
- `319eeb7` — parser U+0000과 table/pre warning 경계 리뷰 수정

## 변경한 계약

- HTML `<pre><code>`와 bare `<pre>`를 sanitized descendant source의 CodeBlock으로 import한다.
- language metadata 4단계 우선순위와 exact conflict warning을 적용한다. warning은 최종 `blockId`를 포함한다.
- GFM fenced·indented code를 CodeBlock으로 import하고 CRLF·CR만 LF로 정규화한다. non-empty meta 손실 warning은 최종 `blockId`를 포함한다.
- HTML/GFM parser가 U+0000을 제거·U+FFFD로 변형하기 전에 strict model validation까지 위반을 전달한다.
- table-cell `<pre>`는 일반 inline 제거 warning을, document CodeBlock `<pre>`는 literal Tab 보존·무경고를 유지한다.
- importer 결과는 production `createEditor`·`replaceDocument`·`getDocument`와 strict export/re-import를 무보정 왕복한다.

## 검증

- focused CodeBlock import: 3 files, 29 tests PASS.
- io 전체: 35 files, 329 tests PASS.
- `pnpm verify`: unit 140 files / 1,766 tests, package boundaries, licenses, Chromium E2E 99/99 PASS.
- 그룹 경계 HTML 19 tests, GFM 12 tests, core 42 tests와 각 package typecheck PASS.
- 재그룹화 전후 트리 diff와 `git diff --check` PASS.

## 상태와 제한

- `BLK-011=VERIFIED`, RD-003과 슬라이스 4 완료.
- 다음 작업: 슬라이스 5 목록 4종(`BLK-017`).
- Issue #38은 이후 R2 슬라이스가 남아 OPEN 유지.
- firefox·webkit 전체와 성능 프로젝트는 이번 import-only 변경의 기본 gate 밖이라 실행하지 않았다.
- 신규 이슈 없음.
