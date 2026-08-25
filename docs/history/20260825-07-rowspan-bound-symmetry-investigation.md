# 20260825-07 rowSpan 상한 대칭성 조사(#114)

- 레인: qq-workflow (단계 1~4)
- 대상 이슈: #114(종료)
- 작업 브랜치: `fix/114-rowspan-bound-symmetry`(`dev` ff-only 이전 후 삭제)

## 목표

`layoutRowSpan`(`packages/io/src/html/table-layout.ts`)이 [#35](https://github.com/cp949/geul/issues/35)가 확정한 colspan 거절 정책과 대칭인 구조적 위험(상한 없이 값을 그대로 통과시켜 행 수를 부풀림)을 실제로 갖는지 조사하고, 재현되면 같은 방향(거절)을 적용해 spec에 기록한다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `6a4df47` | docs(io): rowSpan이 colspan과 대칭인 행/열 수 부풀림 위험을 갖지 않음을 확인한다 |

작업 브랜치 커밋 2개(구현 1 + 단계-3 결함 탐지 수정 1)를 단일 그룹으로 재조립했다 — 두 번째 커밋이 첫 번째 커밋 자신이 삽입한 주석의 줄 번호 인용 오류를 바로잡는 수정이라 별도 그룹으로 둘 이유가 없었다. `refs/backup/<브랜치>-pre-squash` 대비 트리 diff 2회(재조립 직후, 병합 직전) 모두 빈 출력. `dev`는 fast-forward됐다(`1815e8d..6a4df47`).

## 바꾼 계약과 파일

공개 계약·코드 로직 변경 없음 — 조사 결론(재현 안 됨)을 주석·characterization 테스트·spec 문서로 고정했을 뿐이다.

- `packages/io/src/html/table-layout.ts` — `layoutRowSpan` 주석에 "왜 상한이 필요 없는가"(rowCount가 rowSpan에서 파생되지 않음, model `validateGridCoverage`가 이미 `SPAN_OUT_OF_BOUNDS`로 거절)를 추가.
- `packages/io/test/clipboard-table-normalization.test.ts` — characterization 테스트 2개 추가: 과대 rowSpan(500)이 `inferredColumnCount`를 부풀리지 않음, 과대 rowSpan이 `CLIPBOARD_TABLE_INVALID`(`SPAN_OUT_OF_BOUNDS`)로 거절됨.
- `docs/specs/2026-08-18-r1-slice11-clipboard-paste-design.md` §4.2 — 기존 "rowSpan 동일 구조 위험은 범위 밖"이라던 문구 뒤에 조사 결론(재현 안 됨, 근거) 문단 추가.

파일 3개(`+93`, 로직 변경 0줄).

## 실행한 검증과 결과

단계-3 진입, 단계-4 병합 직전 `pnpm verify` 전량 2회 모두 통과(e2e 115/115, 39.2~39.3s).

```
pnpm --filter @cp949/geul-io exec vitest run --root ../.. test/clipboard-table-normalization.test.ts   Test Files 1 passed(1) / Tests 19 passed(19)
```

재조립 그룹 경계(그룹 1개) `pnpm --filter @cp949/geul-io typecheck` 통과.

결함 탐지 리뷰(단계-3, 읽기 전용 subagent, Light): G-CNV-002·G-TBL-001, AGENTS.md 아키텍처 불변식 대조 — MINOR 1건(신규 주석·spec의 파일:줄 인용이 자기 삽입 오프셋 미반영) 발견, 같은 실행에서 메인 세션이 직접 수정. 핵심 안전성 주장(자기 강화 구조 비대칭)과 테스트 헬퍼가 프로덕션 코드와 동일 조합을 재현함은 결함 탐지에서 별도로 확인했다.

## 남은 제한

없음. 완료 조건 5개 전부 `PASS`(`IMPL-REVIEW-01.md`). `import-html.ts` 쪽 정책 적용은 이번 완료 기준에 없어 범위 밖으로 유지했다(colspan 쪽은 #115가 별도로 다룬다).

## 등록한 이슈와 pitfall

- 신규 이슈·pitfall·가이드 등록 없음.
- 완료 댓글 1건 게시([issuecomment-5403827869](https://github.com/cp949/geul/issues/114#issuecomment-5403827869)) 후 #114 종료.
