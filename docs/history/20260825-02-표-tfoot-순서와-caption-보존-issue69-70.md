# 20260825-02 표 tfoot 순서와 caption 등 직속 텍스트 보존(#69·#70)

- 레인: ff-workflow (트랙 0~8)
- 대상 이슈: #69(종료), #70(종료)
- 작업 브랜치: `fix/69-70-table-tfoot-caption`(`dev` ff-only 이전 후 삭제)

## 목표

`packages/io/src/html/table-layout.ts`의 `tableRows`가 만드는 논리 표 구조의 두 결함을 처리한다.

- **#69** — `tfoot` 행이 소스 문서 순서를 그대로 따라 `tbody`보다 앞에 오면 헤더와 데이터 사이에 합계 행이 끼어든다. head→body→foot 논리 순서로 고정한다.
- **#70** — `<table>` 직속 자식 중 thead/tbody/tfoot/tr/colgroup이 아닌 텍스트(대표 사례: sanitize가 unwrap한 `caption`)가 경고 없이 조용히 사라진다. 표 앞 문단으로 보존한다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `df493d8` | fix(io): tfoot 행이 소스 순서와 무관하게 head→body→foot 순서로 파싱되게 한다 |
| `d4f37ba` | fix(io): 표 직속 비섹션 자식(caption 등)을 표 앞 문단으로 보존한다 |
| `c5118f1` | fix(io): import 경로 caption 문단이 표 직속 구조적 공백까지 삼키지 않게 한다 |

작업 브랜치 커밋 3개를 그대로 3개 그룹으로 재조립했다 — 상쇄 쌍이 없고 이미 DELTA·트랙 경계(#69, #70, 트랙-6 발견 회귀)와 의미 단위가 일치했다(`refs/backup/<브랜치>-pre-squash` 대비 트리 diff 2회 모두 빈 출력). `dev`는 fast-forward됐다(`5fba801..c5118f1`).

## 바꾼 계약과 파일

내부 io 타입 확장 — `TableRowSource.section`에 `"foot"` 추가(`packages/model`에는 비노출, 소비처는 `import-html.ts` 1곳뿐). 그 외 공개 계약 변경 없음.

- `packages/io/src/html/table-layout.ts` — `tableRows`를 head/body/foot 버킷으로 분리 후 논리 순서 병합. 표 직속 비섹션 자식을 뽑는 `tableNonSectionChildren` 헬퍼와 `hasSubstantialText`/`INSUBSTANTIAL_TEXT`(clipboard에서 이관)를 추가해 clipboard·import 양쪽이 공유.
- `packages/io/src/html/sanitize-schema.ts` — `tfoot`을 허용 목록·`ancestors`에 추가(unwrap 방지).
- `packages/io/src/clipboard/clipboard-table-parser.ts` — `walk()`의 `table` 분기가 caption 등을 표 앞 문단(flush)으로 보존.
- `packages/io/src/html/import-html.ts` — `documentFromRoot`의 `table` 분기가 같은 헬퍼로 표 앞 문단을 삽입, 노드 단위 `hasSubstantialText` 필터로 caption과 tbody 사이 구조적 공백은 제외.
- `docs/specs/2026-08-18-r1-slice11-clipboard-paste-design.md` §4.1·§4.2 — 표 직속 비섹션 자식 보존 정책과 `importHtml` 영향 서술 추가.
- 회귀 테스트 11건 추가(`clipboard-table-parser-structure.test.ts`+9, `html-round-trip.test.ts`+4 중복 제외 실제 배치는 io test 3파일에 분산, `clipboard-table-normalization.test.ts`+1).

파일 8개(`+287/-25`).

## 실행한 검증과 결과

트랙-5 진입, 트랙-8 병합 직전 `pnpm verify` 전량 2회, 모두 통과(biome lint 203 files·turbo build 5/5·typecheck 10/10·루트 vitest 966/966·boundary 7 manifests/4 core declarations·license 6 manifests/140 패키지·playwright e2e 112/112 — chromium 전량+firefox/webkit `@core`).

```
pnpm --filter @cp949/geul-io test     Test Files 17 passed(17) / Tests 151 passed(151)
pnpm --filter @cp949/geul-core test   Test Files 22 passed(22) / Tests 394 passed(394)
```

재조립 그룹 경계 3곳 모두 `pnpm --filter @cp949/geul-io typecheck` 통과.

## 남은 제한

- 여러 데이터 표가 한 클립보드에 섞인 경우의 처리, 표 직속 텍스트가 여러 조각으로 흩어진 경우의 순서 세분화(하나의 문단으로 단순 병합만 적용)는 범위 밖이다.
- tfoot 시각적 스타일링(합계 행 강조 등)은 범위 밖이다 — 파싱 순서만 다뤘다.
- caption→문단 다운그레이드에 `SAFE_BLOCK_DOWNGRADED`류 warning을 붙이지 않기로 결정했다 — 그 제약이 nested 위치 전반의 기존 gap이라 caption만 예외 취급하는 것은 일관성이 없다고 판단했다(Ruling, `_meta.md`). warning을 nested 위치까지 넓힐지는 가이드 결정이 필요한 사안(`pending-guides/01.md`)으로 미승격 남겨뒀다.
- clipboard 전용 텍스트 정규화 유틸리티를 `io/html`과 공유할 배치 기준도 미확정으로 미승격 남겨뒀다(`pending-guides/02.md`) — 방향이 갈리는 결정이라 실제 필요가 생겼을 때 사용자와 확정하기로 했다.
- 테스트 커버리지 갭 3건(caption+tfoot 동시 존재, 비섹션 자식 2개 이상 병합, 중첩 표와의 상호작용)을 트랙-6이 코드 추적으로 결함 아님을 확인했으나 자동 테스트는 없다. 등록 기준(제품 동작·게이트 구멍·거짓 통과) 미달로 이슈 등록하지 않았다.

## 등록한 이슈와 pitfall

- 신규 이슈 #111 등록 — `import-html.ts`의 문단·헤딩 생성이 `isValidInlineText` 정규화 없이 이뤄지는 기존 gap(caption에 국한되지 않음, `Result<T,E>` 대신 throw 가능성).
- 완료 댓글 2건 게시 후 #69, #70 종료.
- pitfall·가이드 신규 승격 없음(위 "남은 제한"의 두 미확정 가이드 초안 참고).

## 절차상 기록

- 리뷰 트랙을 생략하지 않았다 — 트랙-5(누락 탐지)와 트랙-6(결함 탐지)을 모두 실행했고 `IMPL-REVIEW-01`·`IMPL-REVIEW-02`가 남았다.
- 완료 댓글 초안(`pending-issues/02~03.md`)은 트랙-8이 `04-작업결과.md`의 검증된 내용을 근거로 작성했다 — `20260824-02`·`20260824-03`·`20260825-01`과 같은 이유로, `ff-workflow.md`가 이 초안 작성을 명시적으로 어느 트랙에도 배정하지 않은 절차상 공백이 이제 **3회째**(ff-workflow 2회 + qq-workflow 1회) 반복됐다. 이번 실행에서도 절차 문서 자체는 고치지 않고 여기에만 기록한다 — 3회 반복됐다는 사실은 최종 보고에서 사용자에게 별도로 알린다.
- 트랙-2 계획 리뷰가 5라운드까지 반복됐다(`PLAN-REVIEW-01~05.md`) — 라운드마다 세부(파일 목록·절차·수치)가 아니라 구조적 결함만 게이트로 세는 규칙이 정상 작동했다. 트랙-7 완료 보고 작성 중 "커밋 해시 참조" 규칙 위반 3건(작업 브랜치 해시가 이전 전 산출물 3곳에 인용됨)을 발견해 트랙 범위와 무관하게 즉시 수정했다 — `ff-workflow.md`의 "예외 — 이전 전 hash" 절이 의도한 대로 동작했다.
