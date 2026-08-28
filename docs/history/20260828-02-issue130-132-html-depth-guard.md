# Issue #130·#132 HTML 파이프라인 깊이 방어와 상한 초과 평탄화 보존

- 레인: qq-workflow (`fix/130-html-depth-guard`, `_works/20260828-02-issue130-html-depth-guard`)
- 확정 커밋: `0cf12b2` (dev)
- 종료 이슈: #130, #132 · 등록 이슈: #135(markdown import 경로 깊이 방어 조사)

## 목표

HTML import·clipboard 경로의 무제한 깊이 재귀 크래시(#130)를 결정적 방어로 제거하고, 65단 이상 모델 중첩 import의 전면 거절(#132)을 평탄화+경고로 바꿔 보이는 텍스트를 보존한다.

## 바꾼 계약

- `parseHtmlFragment`(`packages/io/src/html/parse-html.ts`) = `parse5.parseFragment` → 반복형 깊이 캡(`MAX_HTML_TREE_DEPTH = 256`, io 소유 — 모델 `MAX_NESTING_DEPTH` 64와 별개 축) → `fromParse5`. 캡 이후의 모든 자체 재귀(`walk`·`containsAnyTable`·`textValue`·`readInlineNodes`·sanitize)가 이 상수로 유계. 기존 재귀 함수는 비수정.
- 캡 도달 서브트리는 블록 경계 개행을 유지한 보이는 텍스트로 평탄화 보존 + `DEEP_TREE_FLATTENED` 경고(`G-CNV-002`).
- 파서 수준 실패(닫히지 않은 중첩 `<template>` — parse5 `eofInTemplate` 상호 재귀, 약 10,000단부터 결정적 RangeError)는 `parseHtmlFragment`의 의도된 경계 catch가 `undefined`로 수렴 → 소비자가 `HTML_PARSE_FAILED`/`NOT_TABULAR`로 변환. 보존 대상이 아니라 기존 "파서 실패" 계약으로 흡수.
- #132: `blocksFromNodes` 가드 `depth < MAX_NESTING_DEPTH` — 65단 이상 모델 중첩은 평탄화 + `NESTED_CHILDREN_FLATTENED` 경고, 64단 산출 불변. `DOCUMENT_LIMIT_EXCEEDED` 거절은 JSON 로드 계약으로 남는다(spec §3.2·§7.1·§8 갱신).
- `parseClipboardTable`에 의도된 경계 catch(예상 밖 예외 → `NOT_TABULAR` 폴백) — 종전에는 clipboard 경로에 catch가 전무해 RangeError가 DOM paste 이벤트 밖으로 샜다.
- 의존성: `parse5@7.3.0`·`hast-util-from-parse5@8.0.3` 직접 의존 추가, `rehype-parse` 제거(ADR-0002·`dependency-licenses.md`·워크스페이스 허용목록 동기 갱신). lockfile 전이 의존을 `@types/hast@3.0.5`·`property-information@7.2.0` 단일 해상도로 통일.
- HTML hast에 source `position` 없음(`fromParse5`를 `file` 없이 호출) — 현재 소비자 없음, position 기반 기능이 HTML로 확장되면 재고.

## 검증

- `pnpm --filter @cp949/geul-io test` 251/251, `pnpm --filter @cp949/geul-io typecheck`, `pnpm --filter @cp949/geul-core test` 524/524, `tests/workspace-boundaries.test.ts` 40/40 — 전부 통과.
- `pnpm verify` 전량: E2E `formatting-toolbar.spec.ts` "키보드만으로 굵게 버튼에 도달해 토글한다" 1건 실패 — **dev baseline에서 동일 재현 확인**(격리 worktree 실측). 이번 변경이 만든 실패 0건. 해당 표면은 Issue #131이 추적한다.
- 리뷰(IMPL-REVIEW-01): BLOCKER 1(워크스페이스 허용목록)·MAJOR 2(캡 평탄화 블록 경계 소실, parse5 template 상호 재귀) 발견·수정 완료. MINOR 4건 중 lockfile 통일·ADR 서술 2건 수정, 2건(title 스킵 경로 갈림, 경고 위치 축 부재)은 등록 기준 미달로 종결.

## 남은 제한

- 미폐쇄 template 4,000~8,000단 비결정 구간은 결과가 `ok`/`HTML_PARSE_FAILED` 어느 쪽이든 구조화 Result로 수렴(테스트는 결정 구간 3,000·30,000만 고정).
- markdown import 경로의 깊이 방어는 미조사 — #135로 분리.
