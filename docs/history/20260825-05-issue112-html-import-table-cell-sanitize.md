# 20260825-05 HTML import 표 셀(td/th) 텍스트 정규화(#112)

- 레인: qq-workflow (단계 1~4)
- 대상 이슈: #112(종료)
- 작업 브랜치: `fix/112-html-import-table-cell-sanitize`(`dev` ff-only 이전 후 삭제)

## 목표

`packages/io/src/html/import-html.ts`의 `parseTable`이 만드는 표 셀(`td`/`th`) 인라인 텍스트에 model의 `isValidInlineText`가 금지하는 코드포인트(LF 제외 C0 제어문자, DEL, 짝 없는 surrogate)가 섞이면 `HTML_DOCUMENT_INVALID`로 문서 전체가 거부되던 결함을 고친다. [#111](https://github.com/cp949/geul/issues/111)이 문단·헤딩·표 직속 caption에 이미 적용한 정규화를 표 셀 경로에도 적용한다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `46fe70b` | fix(io): HTML import 표 셀(td/th) 텍스트에 model 인라인 정규화를 적용한다 |

작업 브랜치 커밋 1개를 그대로 재조립했다(상쇄 쌍 없음, 그룹 1개). `refs/backup/<브랜치>-pre-squash` 대비 트리 diff 2회(재조립 직후, 병합 직전) 모두 빈 출력. `dev`는 fast-forward됐다(`130e732..46fe70b`).

## 바꾼 계약과 파일

공개 계약 변경 없음 — 기존 `sanitizeInlineContentText` 헬퍼(#111이 신설)와 `UNSAFE_CODE_POINT_REMOVED` warning kind(#111이 신설)를 표 셀 경로에도 재사용했을 뿐, 신규 함수·타입은 없다.

- `packages/io/src/html/import-html.ts` — `parseTable`의 셀 `content` 생성 지점(`inlineContentFromNodes(layout.element.children)`)에 `sanitizeInlineContentText`를 적용. 헬퍼 상단 주석의 재사용 지점 수를 "세 곳"에서 "네 곳"으로 갱신.
- `packages/io/test/html-security.test.ts` — 회귀 테스트 2건(td, th 각각): C0 제어문자·짝 없는 surrogate가 섞인 셀 텍스트가 throw 없이 sanitize되고 `UNSAFE_CODE_POINT_REMOVED`(`element: "td"`/`"th"`) 경고를 만드는지 확인.

파일 2개(`+44/-2`).

## 실행한 검증과 결과

단계-3 진입, 단계-4 병합 직전 `pnpm verify` 전량 2회 모두 통과(biome lint 203 files·turbo build 5/5·typecheck 10/10·unit test 978/978·package boundary·license·e2e 112/112 — 3엔진, 각 40.4s·42.7s).

```
pnpm --filter @cp949/geul-io test        Test Files 17 passed(17) / Tests 158 passed(158)
```

재조립 그룹 경계(그룹 1개) `pnpm --filter @cp949/geul-io typecheck` 통과.

결함 탐지 리뷰(단계-3, 읽기 전용 subagent): 변경 파일 2개 전문, 직접 의존 계약 5개(`sanitizeInlineContentText`, `inlineContentFromNodes`, `collectHtmlImportWarnings`, `TableBlock`/`InlineContent` 타입, `sanitizeInlineText`), G-CNV-001·G-CNV-002, AGENTS.md 아키텍처 불변식 대조 — BLOCKER·MAJOR·MINOR 0건.

## 남은 제한

없음. 완료 조건 4개 전부 `PASS`(`IMPL-REVIEW-01.md`).

## 등록한 이슈와 pitfall

- 신규 이슈·pitfall·가이드 등록 없음.
- 완료 댓글 1건 게시([issuecomment-5401704725](https://github.com/cp949/geul/issues/112#issuecomment-5401704725)) 후 #112 종료.
