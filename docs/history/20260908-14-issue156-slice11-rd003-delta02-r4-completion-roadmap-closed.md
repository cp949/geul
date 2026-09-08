# Issue #156 슬라이스11 RD-003 DELTA-02 — 인벤토리·roadmap.md R4 절·`R4-03` 판정 문서 동기화, roadmap 종료

## 목표

Issue #156(R4, 확장성과 제품 통합 parity)의 마지막 슬라이스(11, i18n)를 마무리한다. `EXT-009`를 `VERIFIED`, `EXT-010`을 `PARTIAL`로 인벤토리 갱신하고, `docs/product/roadmap.md` R4 절의 "보류" 문장을 완료 서술로 교체하며, `docs/reviews/r4-extensibility-integration-parity-completion.md`에 `R4-03` 단독 판정 회차를 추가한다. `docs/product/current-status.md`를 함께 동기화한다. 코드 변경은 없다 — 순수 문서 동기화(RD-003의 완료 조건 2·3·4번).

readiness probe(2026-09-08)에서 3-엔진 e2e 전체 재실행 여부를 판정했다 — dictionary override는 모든 e2e fixture가 `DEFAULT_DICTIONARY` 그대로 실행해 override 자체에는 새 신호가 없다고 보고, 대신 `pnpm test:e2e`(chromium+mobile)로 문구 추출이 원본 영어 카피를 훼손하지 않았는지만 재확인했다.

## 확정 커밋

- `f29b3b5` — docs(product): Issue #156 슬라이스11 R4-03 완료 판정, roadmap 종료 이력 기록(코드 변경 없는 순수 문서 동기화라 별도 작업 브랜치 없이 `dev`에 직접 커밋)

## 변경한 계약과 파일

- `docs/product/blocknote-free-feature-inventory.md` — `EXT-009`(`NOT_STARTED`→`VERIFIED`)·`EXT-010`(`NOT_STARTED`→`PARTIAL`) 갱신, 근거 열에 RD-001~003 요약과 23개 로케일 각주 유지.
- `docs/product/roadmap.md` — R4 절의 "i18n 보류" 문장을 "2026-09-08 재개해 완료" 서술로 교체, 20개 로케일 이월 조항을 확정형으로 갱신.
- `docs/reviews/r4-extensibility-integration-parity-completion.md` — 기존 "## 6. 최종 결론"을 "판정 회차 R4-01 시점"으로 제목 명확화(내용 불변), 신규 "## 7. 판정 회차 R4-02"(`R4-03` 단독 판정, `PASS`)와 "## 8. 최종 결론(판정 회차 R4-02 시점)" 추가.
- `docs/product/current-status.md` — 5·6·8·26행의 "i18n 슬라이스11... 보류 중" 서술을 "슬라이스1~11 전체 완료" 서술로 교체. 8행(압축 이력)에 기존에 없던 Issue #160 완료 사실도 함께 채워 26행(서술형)과 일관시켰다(RD-003 범위를 벗어난 선제적 정합화지만 8행을 이미 손대는 김에 반영).

## 검증

- readiness probe: `pnpm test:e2e`(chromium+mobile) 재실행 — 188 passed, `R4-01` 판정 시점 기준치(188 passed)와 동일, 회귀 없음. 문구 추출(RD-001/RD-002, 214건)이 원본 영어 카피를 보존했음을 이 결과로 확인했다 — dictionary override 자체는 unit test(RD-002 214건 + RD-003 ko 6개 네임스페이스)가 이미 전량 검증했으므로 e2e 재실행의 목적은 "override 검증"이 아니라 "추출 회귀 확인"이었다.
- 3-엔진(`pnpm test:e2e:full`) 재실행은 하지 않았다 — 근거는 위 readiness probe 절 참고.
- 문서 정확성 확인: `grep -n "EXT-009\|EXT-010"`(inventory), `grep -n "i18n\|EXT-009\|EXT-010"`(roadmap.md), `grep -n "슬라이스11\|EXT-009\|EXT-010\|보류"`(current-status.md) 각각 실행해 남은 "보류" 서술이 없음을 확인.

## RD-003 진행 상태, roadmap 종료

DELTA-02 완료로 RD-003 완료 조건 4개 전부 충족 — **RD-003 DONE**. RD-001·RD-002·RD-003 전부 `DONE` — **roadmap 전체(Issue #156 슬라이스11) 완료.**

전체 완료 조건 6개 재대조(`_works/roadmap/roadmap.md`):

- core/react 하드코딩 영어 문구 전부 `Dictionary` key 추출 — RD-001(core)+RD-002(react, 9개 네임스페이스) 완료.
- `dictionary` override로 실제 문구가 바뀜이 unit test로 검증 — RD-001-DELTA-01, RD-002-DELTA-01~10 각각 포함.
- en(기본)·ko 번역 완성 + override 검증 — RD-003-DELTA-01(`KO_DICTIONARY`).
- `EXT-009` `VERIFIED`·`EXT-010` `PARTIAL` 인벤토리 갱신 — RD-003-DELTA-02(이 DELTA).
- `roadmap.md` R4 절 20개 로케일 이월 조항 반영 — RD-003-DELTA-02(이 DELTA).
- `R4-03` 별도 판정 회차 기록 — RD-003-DELTA-02(이 DELTA), `r4-extensibility-integration-parity-completion.md` "판정 회차 R4-02" `PASS`.

이로써 Issue #156의 R4(확장성과 제품 통합 parity) 전체 범위(슬라이스1~11)가 완료됐다.

## 발견·재검토

- **`docs/history/` 기록 누락 발견과 소급**: roadmap-workflow "경량 DELTA 사이클" 8번(각 DELTA 병합 뒤 `docs/history/`에 기록)이 이번 슬라이스11의 RD-001-DELTA-01부터 RD-002-DELTA-01~10까지 11개 DELTA에서 누락됐던 것을 이 DELTA 진행 중 발견했다(슬라이스5~9는 DELTA당 파일 1개로 이미 지켜졌던 전례와 대조해 발견). subagent에 위임해 12개(`20260908-02`~`13`) 소급 기록을 작성했다 — 이 파일(`20260908-14`)이 13번째다. `_works/`가 `.gitignore` 대상이라 `docs/history/`가 유일한 커밋 기록이라는 점에서 실질적 손실이었다.

## 등록한 이슈

- [Issue #161](https://github.com/cp949/geul/issues/161) — 20개 비영어·비한국어 로케일의 실제 번역(spec §8.4 승인 이월). 초안은 `_works/roadmap/pending-issues/01.md`. 사용자에게 등록 여부를 확인받은 뒤(AskUserQuestion, "지금 등록") 등록했다.

## 게시

Issue #156에 슬라이스11(최종 슬라이스) 완료 댓글 게시(issuecomment-5576438642), 체크리스트 슬라이스11 항목 `[x]` 갱신 및 "완료 기준(Issue 전체)" 절의 i18n 관련 서술을 완료 반영으로 갱신(roadmap-workflow 완료 게이트 통과, `docs/agents/issue-tracker.md` "게시 승인" 넷째 bullet, 슬라이스10 전례와 동일 판단). 20개 로케일 후속 이슈([#161](https://github.com/cp949/geul/issues/161))는 새 이슈 생성이라 "게시 승인" 기본 규칙에 따라 사용자 확인을 받은 뒤 등록했다. 후속 이슈가 이번 실행 안에서 등록됨으로써 "종료 판단" 표의 "후속 작업이 남았지만 별도 이슈로 분리됨" 행에 해당하고, 나머지 "모두 참이면 닫는다" 조건(완료 댓글 등록·미충족 완료 기준 없음·미등록 초안 없음·이슈가 열려 있음·열린 sub-issue 없음)도 전부 참이라 **Issue #156을 닫았다**.

## 남은 위험

- 이 문서 초안 작성 시점에는 Issue #161 등록 여부가 아직 결정되지 않아 "이슈를 닫지 않는다"로 서술했으나, 이후 사용자 확인 → 등록 → 종료까지 같은 실행에서 이어져 최종적으로는 닫았다(위 "게시" 절이 최종 결과).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

문서 전용 커밋 — `git revert <이 DELTA의 확정 커밋>`으로 문서 서술은 되돌릴 수 있으나 GitHub 쓰기(댓글·이슈 종료·신규 이슈 #161)는 git revert로 되돌릴 수 없다(별도 `gh issue reopen`/`gh issue delete` 등 수동 조치 필요). 위험: 낮음 — 코드 변경 없음. `docs/history/` 신규 파일 13개는 되돌리지 않는 것이 맞다(과거 사실 기록이므로 revert 대상 아님).
