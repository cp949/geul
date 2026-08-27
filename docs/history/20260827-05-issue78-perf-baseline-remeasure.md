# 20260827-05 성능 기준선 표 재측정(#78)

- 레인: qq-workflow
- 대상 이슈: #78(닫힘)
- 작업 브랜치: `docs/78-perf-baseline-remeasure`(dev로 ff-only 이전, 삭제)

## 목표

`docs/product/performance-baseline.md`의 "측정치" 표가 `perf` 프로젝트 분리(Issue #74) 이전 6워커 경합 아래 측정한 값으로 남아 있었다. 문서 자신이 이 표를 신뢰할 수 없다고 규정하면서도 표는 교체되지 않았다 — 이번 작업이 그 "의도된 재측정"을 수행해 표를 격리 실행(`workers: 1`) 표본으로 교체했다.

레인 선택 근거: 변경 대상이 `docs/product/performance-baseline.md` 1개 파일, 소스 코드 변경 없음 — ff-workflow DELTA 크기 상한(diff 700줄·파일 6개·전문 2,000줄)을 크게 하회하고 분할 신호도 없어 qq로 확정했다.

## 확정 커밋 해시

`dev` @ `64fa9e1`(성능 기준선 표 교체, `docs/78-perf-baseline-remeasure`에서 ff-only 이전). 단계-4 재그룹화는 작업 브랜치 커밋이 1개뿐이라 cherry-pick 재조립 절차 없이 그대로 이전했다 — 근거는 `01-계획.md`의 "## 결정"(작업 폴더, gitignore 대상)에 남겼다.

## 바꾼 계약과 파일

`docs/product/performance-baseline.md` — "측정치" 표 4개 지표(로드·붙여넣기·선택·undo) 값을 `pnpm test:e2e:perf` 단일 실행 결과로 교체하고, "측정 환경" 절 측정일을 갱신(2026-08-19 → 2026-08-27, 기준 `dev` `05d6c89` 명기)했다. 표 아래 "경합 값이라 비교하지 말라" 문단을 과거형 이력 서술로 강등하고, 산문에 괄호로 남아 있던 구 격리값(354.2/305.2/12.9/14.8ms) 언급을 삭제했다. 측정 방식(`performance.now()` 경계, 5회 반복)과 회귀 게이트 절은 건드리지 않았다.

## 실행한 검증과 결과

```
pnpm test:e2e:perf (1회, 재실행 없음)
  load   median=349.6ms  paste  median=328.6ms
  select median=11.5ms   undo   median=14.8ms
pnpm lint / git diff --check / git status --short → 통과
pnpm verify(전량, 병합 직전 1회) → 통과(unit 1189건, e2e chromium 83건 포함)
```

## 단계-3 결함 탐지

읽기 전용 subagent 1개(diff, spec 13·Issue #33·#74·`G-TST-004`, `AGENTS.md` 아키텍처 불변식, ACTIVE pitfall 7건 대조) dispatch. 결함 없음 — 표본→중앙값 재계산 4행 전부 일치, 문서 내부 정합성·Markdown 문법·"비교하지 말라" 잔존 여부·측정 방법론 불변 확인. 상세는 `IMPL-REVIEW-01.md`(작업 폴더, gitignore 대상)가 원본.

## 등록한 이슈와 pitfall

- 완료 댓글 등록(https://github.com/cp949/geul/issues/78#issuecomment-5433537127) 후 Issue #78 종료. 완료 기준 4개 전부 충족.
- `PIT-0037`(이슈 트래커 초안의 frontmatter를 제거하지 않고 그대로 게시) 신규 등록. 완료 댓글을 `gh issue comment --body-file`로 게시하며 `pending-issues/01.md`의 frontmatter가 공개 댓글에 그대로 노출됐다 — 같은 날 Issue #64 완료 댓글에서도 동일 원인이 반복돼(`docs/history/20260827-04-issue64-table-handle-click-cause.md`) 함정으로 승격했다. `gh api PATCH`로 즉시 정정하고 `issue-tracker.md`에 게시 전 frontmatter 제거 절차를 명시했다(`dev` @ `951ec3f`, 이 작업 자체의 DELTA 밖 — 단계-4의 pending-pitfalls 승격 절차로 별도 커밋).

## 진행 중 정정한 실수

완료 댓글 게시 시 `pending-issues/01.md`를 `--body-file`로 그대로 게시해 frontmatter(`종류`/`대상`/`상태`)를 공개 댓글에 노출시켰다 — 발견 즉시 `gh api PATCH`로 frontmatter를 제거한 본문으로 정정했다(위 "등록한 이슈와 pitfall" 참고).

## 남은 제한

측정은 로컬 Chromium 단일 머신이다. 이 표는 같은 머신에서의 시계열 비교에만 쓸 수 있고 절대 성능 목표가 아니다(이슈가 이미 명시한 제한, 이번 변경으로 바뀌지 않음).
