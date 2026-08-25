# 20260825-09 clipboard-table-parser.ts colspan-rowSpan 오탐 거절 수정(#116)

- 레인: qq-workflow (단계 1~4)
- 대상 이슈: #116(종료)
- 작업 브랜치: `fix/116-clipboard-oversized-colspan-rowspan`(`dev` ff-only 이전 후 삭제)

## 목표

`clipboard-table-parser.ts`의 `oversizedColumnSpanCell` 판별식이 rowSpan으로 여러 행에 걸친 셀의 정당한 colspan을 "자기 혼자 최대 reach를 주장"으로 오인해 거절하는지 확인하고, 재현되면 `import-html.ts`(#115)에 적용한 것과 같은 방향으로 고친다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `ce4332f` | fix(io): clipboard-table-parser.ts의 colspan 상한 검사가 rowSpan으로 뒷받침되는 정당한 colspan을 오탐 거절하지 않게 한다 |

작업 브랜치 커밋 2개(단계-2 구현 1 + 단계-3 결함 탐지 수정 1)를 단일 그룹으로 재조립했다 — 두 번째 커밋이 첫 번째 커밋이 도입한 가중치 방식 자체의 BLOCKER를 고치는 후속 수정이라 별도 그룹으로 둘 이유가 없었다(#115와 같은 패턴). `refs/backup/<브랜치>-pre-squash` 대비 트리 diff 2회(재조립 직후, 병합 직전) 모두 빈 출력. `dev`는 fast-forward됐다(`45f505c..ce4332f`).

## 바꾼 계약과 파일

공개 계약 변경 없음(내부 파서 동작만 변경 — 이전에는 뒷받침 없는 rowSpan 홑 셀의 과대 colspan이 `CLIPBOARD_TABLE_INVALID`로 거절되던 것과, 정당한 rowSpan 뒷받침 colspan이 오탐 거절되던 것을 함께 고쳤다).

- `packages/io/src/clipboard/clipboard-table-parser.ts`(+66/-14) — `maxReachCount` 가중 근거를 "rowSpan 값 자체"가 아니라 "rowSpan이 덮는 다른 행에 자기 자신이 아닌 다른 셀이 실제로 있는가"로 변경(`rowHasOwnCell`/`hasIndependentRowBacking`/`cellRowWeight` 헬퍼 추가, 메인 루프를 행 인덱스 포함 이중 순회로 변경).
- `packages/io/test/clipboard-table-normalization.test.ts`(+89) — "이슈 116" describe 블록에 회귀 테스트 3건(정당한 rowSpan 뒷받침 colspan 통과, 뒷받침 없는 rowSpan은 여전히 거절, 뒷받침 있어도 위조된 rowSpan은 그리드 검증이 거절).
- `docs/specs/2026-08-18-r1-slice11-clipboard-paste-design.md`(+8) — §4.2에 재현 확정 문단, 단계-3 BLOCKER 발견·수정 문단, 남은 위험(import-html.ts 동일 결함) 문단 추가.

파일 3개(`+163/-14`).

## 실행한 검증과 결과

단계-3 진입, 단계-4 병합 직전 `pnpm verify` 전량 2회 모두 통과(biome 4 infos 범위 밖·unit `vitest run` 68 files/1006 tests 통과·boundary·license 통과·e2e chromium+firefox+webkit 115 passed 39.2~39.7s).

```
pnpm --filter @cp949/geul-io exec vitest run --root ../.. test/clipboard-table-normalization.test.ts   Tests 22 passed (22)
pnpm --filter @cp949/geul-io test                                                                       Test Files 17 passed(17) / Tests 182 passed(182)
```

재조립 그룹 경계(그룹 1개) `pnpm --filter @cp949/geul-io typecheck` 통과.

결함 탐지 리뷰(단계-3, 읽기 전용 subagent) — G-CNV-002·G-TBL-001, `Result<T,E>` 계약, `AGENTS.md` 아키텍처 불변식 대조. **F1 BLOCKER**(구현 subagent가 반환한 첫 시도 — `import-html.ts`를 그대로 따라 `maxReachCount`를 rowSpan 값 자체로 가중 — 는 뒷받침하는 다른 셀이 전혀 없는 rowSpan>=2 홑 셀의 과대 colspan을 그대로 통과시켰다. Issue #35가 막으려던 것을 rowSpan 하나만 붙이면 우회하는 셈이라 원래 결함보다 나빴다), **F2 MAJOR**(첫 시도의 "위조 rowSpan 방어" 테스트가 F1의 실제 취약 지점을 가리지 못함), **F3 MAJOR**(spec 문단의 안전성 서술이 실측과 어긋남) 발견 — 메인 세션이 근거를 "rowSpan 값"에서 "다른 행의 독립 셀 존재"로 재설계해 세 발견 모두 함께 처리하고 재검증 GREEN. `import-html.ts`(dev, #115 병합분)에도 같은 패턴의 동일 BLOCKER가 있음을 메인 세션이 스크래치 vitest 테스트로 직접 재현 확인했다.

## 남은 제한

- 뒷받침하는 다른 셀·행이 전혀 없는 단일 셀 표는 여전히 "과대"와 "그냥 2 이상"을 구분하지 못한다(spec §4.1 기존 문서화 한계, Issue #35 원본과 동일 트레이드오프 — 이번 작업이 새로 만든 위험 아님).
- 서로 다른 두 실제 셀이 각각 큰 reach를 주장해 "서로를 뒷받침"하는 시나리오는 원래 #35 스킴부터 통과한다 — clipboard 고유 정책의 알려진 한계로, 이번 리뷰 중 확인했으나 이번 작업이 만들거나 악화한 것은 아니라 범위 밖으로 남긴다.
- 범위 제외(01-계획.md "범위 밖"): `import-html.ts` 자체 변경(#115에서 완료, 단 동일 BLOCKER는 #117로 별도 등록), rowSpan 대칭성 재조사(#114에서 완료), `MAX_TABLE_COLUMNS`/`MAX_TABLE_LOGICAL_CELLS` 상수 값 변경, `columnSpanBoundFor`의 `cols.length` 우선순위 정책 재설계.

## 등록한 이슈와 pitfall

- 신규 이슈 1건 등록: [#117](https://github.com/cp949/geul/issues/117)(`import-html.ts`의 동일 BLOCKER — 이미 병합된 #115 코드에 남은 결함, 이번 범위 밖).
- 완료 댓글 1건 등록([issuecomment-5404387128](https://github.com/cp949/geul/issues/116#issuecomment-5404387128)) 후 #116 종료.
- 가이드·pitfall 등록 없음.

## 절차상 기록

- 단계-3 결함 탐지가 #115 선례를 그대로 따른 첫 구현 시도 자체의 설계 결함(BLOCKER)을 잡았다 — "이미 완료된 대칭 사례를 그대로 이식하면 안전하다"는 암묵적 전제가 틀렸던 사례. 원인은 `import-html.ts`의 `cellRowWeight`(rowSpan 값 자체로 가중)가 "다른 셀의 독립된 증거"와 "검사 대상 셀 자기 자신의 rowSpan"을 구분하지 않았다는 점 — #115의 결함 탐지(Light)가 정당한 rowSpan 뒷받침 케이스(2개 이상의 서로 다른 셀이 관여)만 확인했고, "표에 셀이 하나뿐이고 rowSpan만 있는" 퇴화 케이스는 검증하지 않아 넘어갔다.
- 이 발견으로 이미 `dev`에 병합된 #115의 코드(`import-html.ts`)에도 같은 BLOCKER가 실사용 가능한 상태로 남아 있음을 확인했다 — #117로 등록. pitfall 승격은 하지 않는다(재발 조건이 "이미 검증됐다고 알려진 대칭 사례를 그대로 이식할 때"로 한정적이고, 다음 이식 때도 결함 탐지 트랙이 독립적으로 재검증하는 것이 이미 절차상 기본값이라 별도 함정 기록 없이도 같은 실수가 반복될 가능성이 낮다).
