# 20260825-10 import-html.ts oversizedColumnSpanCell rowSpan BLOCKER 수정(#117)

- 레인: qq-workflow (단계 1~4)
- 대상 이슈: #117(종료)
- 작업 브랜치: `fix/117-import-html-oversized-colspan-rowspan`(`dev` ff-only 이전 후 삭제)

## 목표

`import-html.ts`의 `parseTable`이 쓰는 `oversizedColumnSpanCell`(Issue #115 이식분)이 `rowSpan >= 2`이고 뒷받침하는 다른 셀이 전혀 없는 홑 셀의 과대 `colspan`을 통과시키는지 확인하고, 재현되면 `clipboard-table-parser.ts`에 적용한 것(Issue #116)과 같은 방향(`hasIndependentRowBacking` 기반 가중)으로 고친다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `a96a78c` | fix(io): import-html.ts의 oversizedColumnSpanCell이 rowSpan 값 자체로 가중해 뒷받침 없는 홑 셀의 과대 colspan을 통과시키던 BLOCKER를 고친다 |

작업 브랜치 커밋 2개(단계-2 구현 1 + 단계-3 결함 탐지 수정 1)를 단일 그룹으로 재조립했다 — 두 번째 커밋이 첫 번째 커밋과 같은 테스트 파일의 서술을 첫 번째 커밋이 바꾼 동작에 맞게 갱신하는 후속 수정이라 별도 그룹으로 둘 이유가 없었다(#115·#116과 같은 패턴). `refs/backup/<브랜치>-pre-squash` 대비 트리 diff 2회(재조립 직후, 병합 직전) 모두 빈 출력. `dev`는 fast-forward됐다(`753d91d..a96a78c`).

## 바꾼 계약과 파일

공개 계약 변경 없음(내부 HTML importer 파서 동작만 변경 — 뒷받침 없는 rowSpan 홑 셀의 과대 colspan이 이제 `HTML_DOCUMENT_INVALID`로 거절된다).

- `packages/io/src/html/import-html.ts`(+98/-27) — `parseTable`의 `cellRowWeight`를 `layoutRowSpan(cell.rowSpan)` 값 자체 가중에서 `hasIndependentRowBacking` 기반 가중(뒷받침 있으면 2, 없으면 1)으로 교체(`rowHasOwnCell`/`hasIndependentRowBacking` 헬퍼 추가, 메인 루프를 행 인덱스 포함 이중 순회로 변경). `HtmlDocumentInvalidError` throw 관례와 `columnSpanBoundFor`의 `cols.length` 미포함(colgroup 없을 때만 도는 구조, Issue #115 결정)은 그대로 유지.
- `packages/io/test/html-round-trip.test.ts`(+71/-7) — 회귀 테스트 2건 추가(뒷받침 없는 rowSpan 홑 셀의 과대 colspan 거절, 뒷받침 있어도 위조 rowSpan은 그리드 검증이 거절). 단계-3 결함 탐지에서 발견한 MINOR — Issue #115 당시 작성된 기존 위조 rowSpan 테스트(단일 행, `rowspan="500"`)가 이번 수정으로 거절 경로가 선제 검사 자신으로 바뀌어(단일 행 표는 `hasIndependentRowBacking`이 항상 뒷받침 없음으로 판정) 제목·주석을 실제 경로에 맞게 갱신(로직 변경 없음, 같은 커밋에서 처리).
- `docs/specs/2026-08-18-r1-slice11-clipboard-paste-design.md`(+6/-2) — §4.2에 Issue #117 결론 문단 추가, #116이 남긴 "남은 위험(범위 밖)" 항목을 "해소됨"으로 갱신.

파일 3개(`+141/-34`, 재조립 후 단일 커밋 기준).

## 실행한 검증과 결과

단계-3 진입, 단계-4 병합 직전 `pnpm verify` 전량 2회 모두 통과(biome 클린·unit `vitest run` 68 files/1008 tests 통과·boundary·license 통과·e2e chromium+firefox+webkit 115 passed 39.0~39.6s).

```
pnpm --filter @cp949/geul-io exec vitest run --root ../.. test/html-round-trip.test.ts   Tests 24 passed (24)
pnpm --filter @cp949/geul-io test                                                        Test Files 17 passed(17) / Tests 184 passed(184)
```

재조립 그룹 경계(그룹 1개) `pnpm --filter @cp949/geul-io exec tsc -p tsconfig.json --noEmit` 통과.

결함 탐지 리뷰(단계-3, 읽기 전용 subagent) — G-CNV-002·G-TBL-001, `AGENTS.md` 아키텍처 불변식 대조, `clipboard-table-parser.ts`(이미 고쳐진 대조군)와 텍스트 단위 대조, 빌드된 `dist`로 재현 입력 실제 실행. **F1 MINOR**(위 "바꾼 계약과 파일"의 기존 테스트 서술 갱신 건) 1건 발견, 같은 커밋에서 즉시 처리. BLOCKER·MAJOR 없음.

## 남은 제한

- `import-html.ts`와 `clipboard-table-parser.ts` 양쪽이 이제 동일한 `hasIndependentRowBacking` 정책을 쓴다 — 결함 탐지가 두 파일을 텍스트 단위로 대조해 의도된 두 차이(예외 throw 관례, `cols.length` 미포함)를 제외하면 동일함을 확인했다.
- 뒷받침하는 다른 셀·행이 전혀 없는 단일 셀 표는 여전히 "과대"와 "그냥 2 이상"을 구분하지 못한다(spec §4.1 기존 문서화 한계, Issue #35 원본과 동일 트레이드오프 — 이번 작업이 새로 만든 위험 아님).
- 범위 제외(01-계획.md "범위 밖"): `clipboard-table-parser.ts` 자체 변경(#116에서 완료), `MAX_TABLE_COLUMNS`/`MAX_TABLE_LOGICAL_CELLS` 상수 값 변경, colgroup 있는 경로(`cols.length > 0`)의 정책 재설계.

## 등록한 이슈와 pitfall

- 신규 이슈 등록 없음.
- 완료 댓글 1건 등록([issuecomment-5404542256](https://github.com/cp949/geul/issues/117#issuecomment-5404542256)) 후 #117 종료.
- 가이드·pitfall 등록 없음.

## 절차상 기록

- Issue #116이 남긴 "남은 위험(범위 밖)" 예측(`import-html.ts`도 같은 BLOCKER를 가질 가능성이 높다)이 그대로 재현 확정됐다 — 대칭 이식된 두 파일 중 한쪽만 먼저 고치면 반대쪽에 같은 결함이 남는다는 패턴이 #115→#116에 이어 #116→#117까지 두 번 반복됐다. 이번 결함 탐지는 새 BLOCKER를 만들지 않아 pitfall 승격 없음 — #116 이력의 결론과 같다("이미 검증된 대칭 사례를 그대로 이식할 때" 재발 조건은 결함 탐지 트랙이 매번 독립 재검증하는 것이 이미 절차 기본값이라 별도 함정 기록 없이도 재발 가능성이 낮다).
