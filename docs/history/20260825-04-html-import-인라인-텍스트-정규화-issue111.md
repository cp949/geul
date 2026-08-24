# 20260825-04 HTML import 문단·헤딩·caption 인라인 텍스트 정규화(#111)

- 레인: qq-workflow (단계 1~4)
- 대상 이슈: #111(종료), 후속 #112(신규 등록, 미종료)
- 작업 브랜치: `fix/111-html-import-inline-sanitize`(`dev` ff-only 이전 후 삭제)

## 목표

`packages/io/src/html/import-html.ts`의 HTML import 경로(`parseBlock`의 p/heading 분기, `documentFromRoot`의 `flushInlineNodes`, 표 직속 비섹션 자식 caption 등 문단 생성)가 만드는 인라인 텍스트에 model의 `isValidInlineText`가 금지하는 코드포인트(LF 제외 C0 제어문자, DEL, 짝 없는 surrogate)가 섞여 있으면 import 시점 또는 이후 editor 로드 시점(`readEditorDocument`)에서 예상치 못한 throw로 이어지던 결함을 고친다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `345dd57` | fix(io): HTML import 문단·헤딩·caption 텍스트에 model 인라인 정규화를 적용한다 |
| `42dca08` | fix(io): sanitize 후 빈 인라인 조각을 걸러낼 때 같은 mark 이웃을 병합한다 |

작업 브랜치 커밋 2개를 그대로 2개 그룹으로 재조립했다 — 상쇄 쌍 없음(구현 커밋 + 단계-3 리뷰가 찾은 정확성 결함 수정 커밋으로 의미가 다름). `refs/backup/<브랜치>-pre-squash` 대비 트리 diff 2회 모두 빈 출력. `dev`는 fast-forward됐다(`5b44ce1..42dca08`).

## 바꾼 계약과 파일

공개 계약 변경 — `@cp949/geul-model`에 `sanitizeInlineText` 신규 export(기존 `isValidInlineText`는 시그니처 불변). `HtmlImportWarning` union에 `UNSAFE_CODE_POINT_REMOVED` kind 추가.

- `packages/model/src/string-invariants.ts`, `index.ts` — `isValidInlineText`/`isValidDocumentId`가 공유하던 predicate를 분리해 `sanitizeInlineText`를 신설·export(G-CNV-001).
- `packages/io/src/clipboard/cell-text.ts` — 자체 구현하던 disallowed-codepoint predicate를 제거하고 model의 `sanitizeInlineText`로 위임(공백 run 접기 등 clipboard 전용 정책은 유지).
- `packages/io/src/html/import-html.ts` — 문단/헤딩/표 직속 caption 등 세 지점에 `sanitizeInlineText` 적용. sanitize로 빈 조각이 생기면 걸러내고 같은 mark를 가진 이웃 조각을 재병합(`appendText`/`normalizeCellContent`가 지키는 "인접 동일 mark 병합" 불변식 유지 — 단계-3 리뷰에서 발견해 즉시 수정).
- `packages/io/src/html/import-warnings.ts` — `UNSAFE_CODE_POINT_REMOVED` warning 신규, raw HAST 텍스트 노드 기준으로 수집(G-CNV-002).
- 회귀 테스트: `html-security.test.ts`+5(문단/헤딩/caption sanitize+warning, 무경고 케이스, 인접 mark 재병합), `model/document.test.ts`+4(`sanitizeInlineText` 단위).

파일 7개(`+219/-34`).

## 실행한 검증과 결과

단계-3 진입, 단계-4 병합 직전 `pnpm verify` 전량 실행(재조립이 트리를 바꾸지 않아 동일 결과), 모두 통과(biome lint 203 files·turbo build·typecheck·루트 vitest 976/976·boundary·license·playwright e2e 112/112 — 3엔진).

```
pnpm --filter @cp949/geul-model test        Test Files 9 passed(9) / Tests 104 passed(104)
pnpm --filter @cp949/geul-io test           Test Files 17 passed(17) / Tests 156 passed(156)
```

재조립 그룹 경계 2곳 모두 `pnpm --filter @cp949/geul-model typecheck`·`pnpm --filter @cp949/geul-io typecheck` 통과.

## 남은 제한

- 표 셀(`td`/`th`) 텍스트 경로는 같은 gap이 남아 있다 — 이슈 #111 원문·완료 조건이 처음부터 문단·헤딩(과 표 직속 caption)으로 범위를 좁혀 이번 변경에 섞지 않았다. 별도 이슈 [#112](https://github.com/cp949/geul/issues/112)로 분리했다.
- 완전히 제거되는 요소(`script` 등) 내부 텍스트에도 `UNSAFE_CODE_POINT_REMOVED`가 `UNSAFE_ELEMENT_REMOVED`와 함께 중복 발생할 수 있다(단계-3 리뷰 F3) — 기존 `UNSAFE_ATTRIBUTE_REMOVED` 등도 같은 패턴이라 이번 diff만의 비일관성은 아니고, product 출력에 영향 없이 warning 노이즈만 추가한다. 등록 기준(제품 동작·게이트 구멍·거짓 통과) 미달로 이슈 등록하지 않았다.

## 등록한 이슈와 pitfall

- 신규 이슈 #112 등록 — HTML import 표 셀 텍스트도 `isValidInlineText` 정규화 없이 생성되는 동일 gap(#111과 같은 근본 원인, 다른 코드 경로).
- 완료 댓글 1건 게시 후 #111 종료.
- pitfall·가이드 신규 승격 없음.

## 절차상 기록

- 단계-4 재조립 1차 시도에서 `git commit -m "..." -F -`를 함께 써 실패(`fatal: options '-m' and '-F' cannot be used together`)했고, `set -e`가 걸린 스크립트임에도 이후 명령이 계속 실행돼 두 그룹이 의도치 않게 한 커밋(`800ed02`, 어느 브랜치에도 연결되지 않은 채 방치)으로 합쳐졌다. `git diff refs/backup/<브랜치>-pre-squash HEAD --stat`로 트리는 온전함을 먼저 확인한 뒤, `git switch --detach dev`부터 다시 시작해 두 그룹을 올바르게 재조립했다 — 백업 ref와 트리 diff 재대조 없이 진행했다면 커밋 메시지와 그룹 경계가 조용히 사라질 뻔했다.
