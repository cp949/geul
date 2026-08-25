# 20260825-08 import-html.ts colspan 거절 정책 통일(#115)

- 레인: qq-workflow (단계 1~4)
- 대상 이슈: #115(종료)
- 작업 브랜치: `fix/115-html-import-colspan-policy`(`dev` ff-only 이전 후 삭제)

## 목표

`import-html.ts`의 `parseTable`(colgroup 우선 정책)이 colgroup이 없을 때 Issue #35(클립보드 경로)와 동일한 열 수 자기강화 부풀림 위험에 노출되는지 확인하고, 재현되면 같은 방향(거절)을 적용한다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `1d77446` | fix(io): import-html.ts colgroup 없는 표의 과대 colspan 열 수 부풀림을 거절한다 |

작업 브랜치 커밋 2개(단계-2 구현 1 + 단계-3 결함 탐지 수정 1)를 단일 그룹으로 재조립했다 — 두 번째 커밋이 첫 번째 커밋이 이식한 판별식 자체의 회귀(rowSpan 오탐 거절)를 고치는 후속 수정이라 별도 그룹으로 둘 이유가 없었다. `refs/backup/<브랜치>-pre-squash` 대비 트리 diff 2회(재조립 직후, 병합 직전) 모두 빈 출력. `dev`는 fast-forward됐다(`1a83964..1d77446`).

## 바꾼 계약과 파일

공개 계약 변경 없음(내부 파서 동작만 변경 — 이전에는 부풀려진 columnCount로 통과하던 입력이 이제 `HTML_DOCUMENT_INVALID`로 거절됨).

- `packages/io/src/html/import-html.ts`(+75) — `parseTable`에 `oversizedColumnSpanCell`류 선제 검사 이식(`cols.length === 0`일 때만 적용), `maxReachCount`를 셀 개수 대신 `layoutRowSpan(rowSpan)` 가중 합으로 계산.
- `packages/io/test/html-round-trip.test.ts`(+76) — 회귀 테스트 4건(과대 colspan 거절 재현, colgroup 경계 통과, rowSpan 뒷받침 정당 colspan 통과, 위조 rowSpan 거절).
- `docs/specs/2026-08-18-r1-slice11-clipboard-paste-design.md`(+4) — §4.2에 Issue #115 결론 문단(재현 확정, 판별식 이식 근거)과 단계-3 결함 탐지 수정 반영 문단 추가.

파일 3개(`+155`).

## 실행한 검증과 결과

단계-3 진입, 단계-4 병합 직전 `pnpm verify` 전량 2회 모두 통과(biome 4 infos 범위 밖·build 5/5·typecheck 10/10·vitest 68 files/1003 passed·boundary·license 통과·e2e chromium+firefox+webkit 115 passed 39.5s).

```
pnpm --filter @cp949/geul-io exec vitest run --root ../.. test/html-round-trip.test.ts   Tests 22 passed (22)
pnpm --filter @cp949/geul-io test                                                        Test Files 17 passed(17) / Tests 179 passed(179)
```

재조립 그룹 경계(그룹 1개) `pnpm --filter @cp949/geul-io typecheck` 통과.

결함 탐지 리뷰(단계-3, 읽기 전용 subagent, Light) — G-CNV-002·G-TBL-001, `Result<T,E>` 계약, `AGENTS.md` 아키텍처 불변식 대조. **F1 MAJOR**(이식한 판별식이 rowSpan으로 여러 행에 걸친 셀의 정당한 colspan을 "혼자 주장"으로 오인해 거절 — 완전한 격자인데도 회귀) 발견, 메인 세션이 직접 수정(Micro)하고 재검증 GREEN. F2(테스트 갭, MINOR)는 F1 회귀 테스트로 함께 해소. 수정의 안전성(위조 rowSpan이 완화를 악용하지 못함)은 model의 `validateGridCoverage`(`SPAN_OUT_OF_BOUNDS`, Issue #114 안전망)로 별도 확인하고 회귀 테스트로 고정했다.

## 남은 제한

- 뒷받침하는 다른 셀·행이 전혀 없는 단일 셀 표는 여전히 "과대"와 "그냥 2 이상"을 구분하지 못한다(§4.2 기존 문서화 한계, Issue #35 원본과 동일 트레이드오프 — 이번 작업이 새로 만든 위험 아님).
- 범위 제외(01-계획.md "범위 밖"): `clipboard-table-parser.ts` 자체 로직 변경, rowSpan 대칭성(#114에서 완료), `MAX_TABLE_COLUMNS`/`MAX_TABLE_LOGICAL_CELLS` 상수 값 변경, colgroup 우선 정책 자체의 재설계.

## 등록한 이슈와 pitfall

- 신규 이슈 1건 등록: [#116](https://github.com/cp949/geul/issues/116)(`clipboard-table-parser.ts`의 동일 rowSpan 오탐 거절 결함 — 이식 원본에 남은 latent 결함, 이번 범위 밖).
- 완료 댓글 1건 등록([issuecomment-5404112341](https://github.com/cp949/geul/issues/115#issuecomment-5404112341)) 후 #115 종료.
- 가이드·pitfall 등록 없음.

## 절차상 기록

- 단계-3 결함 탐지에서 이식 당시엔 몰랐던 MAJOR 회귀(F1)를 실제로 잡았다 — 계획 리뷰가 없는 qq-workflow에서도 결함 탐지 트랙이 실질적으로 기능함을 보여주는 사례. 원인은 원본 판별식을 이식하며 `CellLayout` 배열이 rowSpan으로 덮인 행에 별도 항목을 만들지 않는다는 사실을 놓친 것 — 이식 시 원본의 암묵적 전제(각 셀은 정확히 한 번만 계산에 등장한다)가 새 맥락(같은 셀이 여러 행의 근거를 홀로 떠맡을 수 있음)에서도 성립하는지 별도로 검증하지 않았다. 이번 발견·수정으로 충분히 해소돼 pitfall 승격은 하지 않는다(1회 관측, 재발 조건이 "다른 파서의 판별식을 이식할 때"로 한정적이고 다음 이식(있다면) 때 결함 탐지 트랙이 다시 잡을 수 있는 성격).
