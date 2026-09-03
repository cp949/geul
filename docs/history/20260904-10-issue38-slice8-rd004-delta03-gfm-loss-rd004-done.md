# Issue #38 슬라이스 8 RD-004 DELTA-03 — GFM 손실 카테고리, RD-004 DONE·roadmap 완료

## 목표

roadmap-workflow RD-004의 세 번째이자 마지막 DELTA. 인라인 색상 mark(DELTA-01)·블록 색상/정렬 props(DELTA-02)를 GFM strict export가 거절(손실 위치·기능 종류 보고)하고 lossy export가 값을 버린 채 경고로 보고하게 한다. 이 DELTA로 RD-004 완료 조건 4개가 모두 충족돼 RD-004가 `DONE`으로 전환되고, RD-004가 이 roadmap의 마지막 RD였으므로 Issue #38 슬라이스 8(글자색/배경색/정렬) roadmap 전체가 완료된다.

## 확정 커밋

- `b8e1cb5` — GFM 색상·정렬 손실 카테고리 추가 (Issue #38 슬라이스 8, RD-004 DELTA-03)
- `9cb224d` — prettier 포맷 정리(`pnpm verify` `format:check`에서 처음 발견 — RD-001/RD-002가 남긴 baseline 미포맷 파일 2개 + 이번 세션 5개 파일, 로직 변경 없음)
- `17963ac` — 제품 문서 동기화: 슬라이스 8 완료 반영(`blocknote-free-feature-inventory.md`의 `INL-008`~`INL-011` `VERIFIED`, `current-status.md` 다음 작업 갱신)

## 변경한 계약과 파일

- `packages/io/src/markdown/loss-analysis.ts`: `MarkdownLoss.kind`에 `INLINE_COLOR`(인라인 mark)·`BLOCK_COLOR`·`BLOCK_ALIGN`(블록 레벨 props) 3종 추가. `hasColorMark` 헬퍼 신설. `collectTableLosses`(셀 콘텐츠)·`collectBlockLosses`(제네릭 블록) 각 1곳에 감지 추가. `export-markdown.ts`는 변경 없음 — strict/lossy 분기·`wrapNodes`가 RD-001부터 이미 이 DELTA를 겨냥해 일반화돼 있었음을 실측 확인.
- `packages/io/test/markdown-color-align-loss.test.ts`(신규 6건): 인라인/블록 색상·정렬 개별·결합 손실, 표 셀 내 인라인 mark, lossy 콘텐츠 보존, 무손실 회귀.
- `packages/core/test/editor-controller-block-text-props.test.ts`, `editor-controller-inline-color.test.ts`, `packages/io/test/{html-inline-color,markdown-color-align-loss}.test.ts`, `packages/io/src/html/{import-html,inline-content,sanitize-schema}.ts`, `packages/model/test/document-mark-ordering.test.ts`: prettier 순수 포맷 정리(로직 변경 없음).
- `docs/product/blocknote-free-feature-inventory.md`: `INL-008`~`INL-011`을 `VERIFIED`로 갱신(RD-001~RD-004 근거 명시).
- `docs/product/current-status.md`: "다음 진행 단계" 요약에 슬라이스 8 완료 반영, "다음 작업"을 슬라이스 9(키보드 단축키와 입력 규칙)로 갱신, 슬라이스 8 완료 요약 단락 추가.

## 검증

- `pnpm --filter @cp949/geul-io test` → 61 files, 482 passed(기존 476 + 신규 6).
- `pnpm --filter @cp949/geul-io typecheck`, 루트 `pnpm typecheck`(전체) — 통과.
- 변경 파일 `eslint` — 0 findings.
- `model`/`core`/`react` 전체 test — 무변경 확인(337/1145/406).
- RD-004 완료 조건 4개 실측 재대조 후 `pnpm verify` 전량(마지막 RD 완료 시 1회, RD-004 최초) — lint·format·build·escompat·typecheck·unit 2508·boundaries·licenses·e2e chromium 139 전부 `PASS`(exit 0). 최초 실행이 baseline 미포맷 2개를 발견해 정리(위 확정 커밋 2번째) 후 재실행에서 통과.
- 각 커밋 단일 커밋이라 재그룹화 대상 없음(DELTA-03은 백업 ref·트리 diff 재대조(빈 출력) 후 ff-only 병합, 이후 두 커밋은 dev 직접 — 기본 레인, 문서/포맷 정리라 별도 작업 브랜치 불필요).
- RD-004 완료 조건 갱신: 조건 3(GFM strict 거절)·조건 4(GFM lossy 경고)를 이 DELTA가 충족 — 완료 조건 4개 전부 체크돼 RD-004를 `DONE`으로 전환(재대조 근거는 `_works/_completed/20260904-01-roadmap-color-align-parity/RD-004.md` D3).
- roadmap 전체 완료 — "roadmap 정리" 절차에 따라 `_works/roadmap/`을 `_works/_completed/20260904-01-roadmap-color-align-parity/`로 archive(gitignore 대상이라 git diff 없음).

## 등록한 이슈

- 완료 댓글: RD-004(DELTA-01+02+03 통합 요약)와 Issue #38 슬라이스 8(글자색/배경색/정렬) 전체 완료를 함께 게시할지 사용자 확인 대기 — 게시 결과는 별도 이력 커밋으로 반영(RD-001~003과 같은 패턴).
- 범위 밖 신규 이슈 등록 없음 — 가이드·pitfall 갭 없음.

## 남은 제한

- Issue #38 슬라이스 8(RD-001~RD-004)이 전부 완료됐다 — Issue #38의 다음 남은 슬라이스는 9(키보드 단축키와 입력 규칙, `UI-011`)다. Issue #38 자체는 후속 슬라이스가 남아 `OPEN` 유지.
- 블록 레벨 `textColor`/`backgroundColor`/`textAlignment`는 `blockContainer` attrs가 `rendered: false`라 편집 화면에는 시각 렌더가 없다(RD-003 DELTA-03에서 이미 확인된 기존 설계 결정, 이 DELTA가 만든 사실 아님) — 저장 JSON·HTML round-trip과 undo는 정상 동작한다.
- GFM import는 색상·정렬 생성 문법을 신설하지 않는다(spec §7.2, GFM 자체에 표현 수단 없음 — 계획된 범위 제외).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 3개를 `dev`에서 역순으로 `git revert`한다. 위험: 낮음 — 1번째(GFM 손실 카테고리)는 io 패키지 국소 변경, 2번째(prettier)는 포맷만, 3번째(문서 동기화)는 코드 영향 없음. 셋 다 서로 독립적이라 부분 되돌리기도 안전하다.
