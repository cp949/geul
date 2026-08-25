# 20260825-06 클립보드 표 파서: 다중 표·heading 경계·과대 colspan·TSV 정책(#72·#73·#35·#34)

- 레인: ff-workflow (트랙 0~8)
- 대상 이슈: #72(종료), #73(종료), #35(종료), #34(종료)
- 작업 브랜치: `fix/72-73-35-34-clipboard-table-parser-fixes`(`dev` ff-only 이전 후 삭제)

## 목표

`packages/io/src/clipboard/clipboard-table-parser.ts`(와 인접 헬퍼)를 대상으로 슬라이스 11 최종 리뷰에서 범위 밖으로 분리됐던 잔여 결함·정책 공백 4건을 해소한다.

- **#73** — 혼합 클립보드에 데이터 표가 2개 이상이면 두 번째 표부터 문단으로 뭉개진다.
- **#72** — 표 밖 인접 heading(h1~h6)이 문단 경계 없이 병합된다.
- **#35** — 과대 `colspan`(예: `colspan="500"`)이 `columnCount`를 부풀려도 상한 검사를 통과한다.
- **#34** — TSV 클립보드 경로가 HTML 경로와 whitespace 처리에서 의도적으로 비대칭인데 spec에 정책 기록이 없다(코드 변경 없음, 문서화만).

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `800c355` | fix(io): 클립보드 HTML 다중 데이터 표를 각각 표 블록으로 탐지한다 |
| `e833b59` | fix(core): 표 안 붙여넣기에서 다중 표 시퀀스를 명시적으로 거절한다 |
| `c6fdb1a` | fix: 클립보드 h1~h6 heading을 블록 경계로 인식하고 표 밖 삽입·표 안 병합으로 소비한다 |
| `f60d619` | fix(io): 클립보드 표에서 표 자신의 실제 구조를 넘는 colspan을 거절한다 |
| `8cc7bd2` | style: DELTA-01~04가 남긴 biome 포맷팅 위반을 정리한다 |
| `539fc65` | docs(specs): TSV 클립보드 whitespace 보존 정책을 spec §4.3에 기록한다 |
| `5bc8e44` | fix(io): heading 안에 중첩된 표가 뭉개지지 않고 표 블록으로 보존되게 한다 |
| `a354fb0` | docs(specs): 표 안 다중 표 붙여넣기 관련 구식 서술을 정정한다 |
| `4ffd797` | fix(io): colspan 상한 검사가 rowSpan과 상호작용할 때 정상 표를 오탐 거절하지 않게 한다 |
| `4b5aad8` | style: 트랙-6이 추가한 테스트의 biome 포맷팅 위반을 정리한다 |

작업 브랜치 커밋 14개(트랙-4 구현·정리 10개 + 트랙-6 수정·정리 4개)를 10개 그룹으로 재조립했다. 상쇄 쌍은 없었다. DELTA-03(`d73d430`, io h1~h6 인식)과 DELTA-04(`b380de4`, core heading 소비) + 즉시 리뷰 수정(`0a1c6e7`)은 discriminated union 의존 때문에 하나의 그룹(`c6fdb1a`)으로 결합했다 — 트랙-6이 발견한 F3(`d73d430` 단독이면 `core` typecheck가 즉시 깨짐)을 재발시키지 않기 위해서다. `refs/backup/<브랜치>-pre-squash` 대비 트리 diff 2회(재조립 직후, 병합 직전) 모두 빈 출력. 재조립 그룹 경계 10곳 전부 `pnpm typecheck` 통과(F3 재발 없음 확인). 기준선은 `5426809`, `dev`는 fast-forward됐다(`5426809..4b5aad8`).

가이드 정비로 별도 커밋 `0449a37`(docs)을 `dev`에 직접 추가했다 — 아래 "등록한 이슈와 pitfall" 참고.

## 바꾼 계약과 파일

공개 계약 변경: `ClipboardContentBlock`에 `heading` variant 추가(io→core 소비). spec §4.1(TBL-012 인용 정정 + heading 정책)·§4.2(colspan 거절 규칙 + 경계 사례 각주)·§4.3(TSV whitespace 보존 정책) 갱신.

- `packages/io/src/clipboard/clipboard-table-parser.ts`(+215/-) — `findDataTable`→`findDataTables`(다중 표, #73), `blockSequenceFromNodes` h1~h6 경계 인식 + heading이 표를 품을 때 통과 분기(#72, 트랙-6 F1), colspan 상한 판별식 재설계(#35, 트랙-6 F2).
- `packages/io/src/html/sanitize-schema.ts`(+16) — clipboard 전용 sanitize 허용 목록에 `h4`~`h6` 추가(#72).
- `packages/io/src/clipboard/clipboard-content.ts`(+11/-) — heading `ClipboardContentBlock` variant 추가(#72).
- `packages/core/src/table-commands.ts`(+51/-) — 표 안 다중 표 명시 거절 가드(#73), heading variant 소비 3곳(#72).
- `packages/core/test/table-test-support.ts`(+6/-) — 공유 fixture `heading:false`→`heading:{levels:[1,2,3]}`.
- `e2e/table-paste.spec.ts`(+29), `packages/io/test/clipboard-mixed-content.test.ts`(+199), `packages/io/test/clipboard-table-parser-structure.test.ts`(+65), `packages/io/test/clipboard-table-normalization.test.ts`(+63), `packages/io/test/html-security.test.ts`(+25), `packages/core/test/table-paste-commands.test.ts`(+104) — 회귀 테스트.
- `docs/specs/2026-08-18-r1-slice11-clipboard-paste-design.md`(+10) — §4.1/§4.2/§4.3 구현 반영 각주.

파일 12개(`+740/-54`).

## 실행한 검증과 결과

트랙-5 진입, 트랙-8 병합 직전 `pnpm verify` 전량 2회, 모두 통과(biome 4 infos·build 5/5·typecheck 10/10·vitest 68 files/997 passed·boundary·license 통과·e2e chromium+firefox+webkit 115 passed 39.5s).

```
pnpm --filter @cp949/geul-io test        Test Files 17 passed(17) / Tests 173 passed(173)
```

재조립 그룹 경계 10곳 전부 `pnpm typecheck` 통과.

트랙-6(결함 탐지, Full 3렌즈)이 F1~F5 5건 발견 — F1(heading 안 중첩 표가 뭉개짐, BLOCKER)·F2(colspan 상한 검사가 rowSpan과 상호작용해 정상 표 오탐 거절, MAJOR)·F4(spec이 구식 서술 유지, MAJOR)는 수정 반영·재검증 GREEN, F5(다중 표+heading 조합 테스트 갭, MINOR)는 F1 회귀 테스트에 포함해 해소, F3(중간 커밋 typecheck 파손, MAJOR)은 코드 결함이 아닌 히스토리 상태라 트랙-8 재그룹화 그룹 경계 게이트로 처리(위 "확정 커밋 해시" 참고).

## 남은 제한

- colgroup 없음 + 뒷받침하는 다른 셀·행이 전혀 없는 단일 셀 표에서는 colspan 거절 판별식이 "과대"와 "그냥 2 이상"을 구분하지 못한다(spec §4.2 각주에 명시, 재현 사례 없어 보수적 설계로 승인됨).
- 범위 제외(코드 변경 없음, 01-계획.md "제외 범위"): h4~h6 실제 heading level 저장(model 제약, R2), 진짜 중첩 `<table>` 별도 표현, TSV 경로 collapse/trim 신설, `MAX_TABLE_COLUMNS`/`MAX_TABLE_LOGICAL_CELLS` 상수 값 변경.

## 등록한 이슈와 pitfall

- 신규 이슈 3건 등록: #113(div/li/blockquote 미포함), #114(rowSpan 과대값 구조적 위험), #115(`import-html.ts` colspan 정책 통일).
- 완료 댓글 4건 등록 후 #72, #73, #35, #34 종료.
- 가이드 보강 1건: `docs/agents/ff-workflow.md` 트랙-7에 완료 댓글 초안 작성 책임을 명시(커밋 `0449a37`, `dev` 직접) — 트랙-8이 게시 직전 완료 댓글을 직접 작성하던 절차상 공백이 두 번째로 재발해 이번에 트랙-7 출력·절차에 반영했다. pitfall 승격은 없음(반복 2회지만 원인이 문서 공백이지 실행자의 오해가 아니라 가이드 보강으로 충분).

## 절차상 기록

- 리뷰 트랙을 생략하지 않았다 — 트랙-5(발견 0건)와 트랙-6(Full 3렌즈, F1~F5)을 모두 실행했고 `IMPL-REVIEW-01`·`IMPL-REVIEW-02`가 남았다.
- 완료 댓글 초안(`pending-issues/04~07.md`)은 이번 실행에서도 트랙-8이 `04-작업결과.md`의 검증된 내용을 근거로 작성했다 — 트랙-7 절차 보강은 이번 실행 이후부터 적용된다.
