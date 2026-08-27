# 20260827-04 표 핸들 합성 click 원인 후보 규명(#64)

- 레인: qq-workflow
- 대상 이슈: #64(열려 있음 — 완료 조건 1 미충족)
- 작업 브랜치: `test/64-table-handle-click-cause`(dev로 net no-op, 삭제)

## 목표

Issue #64의 완료 조건 중 자동화 가능한 2·3항을 수행했다 — Chromium/CDP가 큰 이동거리 드래그 뒤 native `click`을 합성하지 않는 원인 후보 3가지(contenteditable 인접, ProseMirror 마운트, pointermove 재렌더 오버레이)를 개별·조합으로 격리 실험하고, `G-UI-002` 규칙의 적용 범위를 실측에 맞게 판단했다.

레인 선택 근거: 예상 변경이 e2e 대조군 실험 1개 파일 + 가이드 갱신 여부 판단으로, `table-handles.tsx` 등 제품 코드 수정은 계획하지 않아 ff-workflow "크기 규칙" 상한을 크게 하회해 qq로 확정했다.

## 확정 커밋 해시

`dev`는 바뀌지 않았다 — 재조립 결과 3개 커밋(V0~V3 실험 추가, V4 조합 실험 추가, 결함 탐지 반영 삭제)이 net diff 0으로 완전히 상쇄됐다. `refs/backup/<브랜치>-pre-squash` 대비 트리 diff가 재조립 직후 빈 출력이었고, `git merge --ff-only`도 "이미 업데이트 상태"(no-op)로 끝났다. 이 작업의 산출물은 코드가 아니라 완료 댓글의 관측 기록이다.

## 바꾼 계약과 파일

없음. 실험 spec(`e2e/table-handle-synthetic-click-cause.spec.ts`)을 만들었으나 단계-3 결함 탐지에서 게이트 편입 문제가 지적돼 같은 실행에서 제거했다. `docs/guides/G-UI-002-key-reordered-ui-by-stable-id.md`도 판정 결과 변경 근거가 없어 그대로 뒀다.

## 실행한 검증과 결과

```
pnpm exec playwright test e2e/table-handle-synthetic-click-cause.spec.ts --project=chromium (x3, 단계-2/추가 실험) → 매 실행 5 passed, flaky 없음
pnpm typecheck:e2e → 통과
pnpm verify(전량, 병합 직전 1회) → 통과(83 e2e 포함)
git diff --check / git status --short → 클린
```

## 단계-3 결함 탐지

읽기 전용 subagent 1개(diff, `G-TST-001`, `AGENTS.md` 아키텍처 불변식 대조) dispatch. MAJOR 2건을 확정했다 — F1: 진단 전용 실험이 `table-handles.tsx`를 전혀 마운트하지 않아 product 회귀를 못 잡으면서도 `pnpm test:e2e`/`pnpm verify` 게이트에 무기한 편입됨(성능 기준선 spec을 `perf` project로 뗀 선례와 불일치). F2: `G-TST-001`이 요구하는 브라우저 event 합성 helper의 3-엔진(Chromium·Firefox·WebKit) 최소 재현을 거치지 않음. 새 project·webServer 인프라를 만들어 우회하는 대신 spec 파일 자체를 제거해 해소했다 — 관측 코드와 결과는 완료 댓글에 원문 보존. 상세는 `IMPL-REVIEW-01.md`(작업 폴더, gitignore 대상)가 원본.

## 발견한 결과

원인 후보 (a)/(b)/(c)를 개별 격리(V1~V3)한 실험과, 셋을 한 버튼에 동시에 실은 조합(V4) 모두 **click이 정상 합성됐다** — 대조군(V0)과 동일. 세 후보 중 어느 것도, 조합으로도 실제 표 UI의 미합성을 재현하지 못했다. 원인은 여전히 미확정이다(`table-handles.tsx` 고유 메커니즘 가능성). `G-UI-002`의 기존 규칙("후속 합성 click을 검증하면 명시적으로 dispatch한다")은 좁힐 근거가 없어 변경하지 않기로 판단했다.

## 등록한 이슈와 pitfall

- 완료 댓글 등록(https://github.com/cp949/geul/issues/64#issuecomment-5433207202). Issue #64는 완료 조건 1(실 물리 마우스 확인)이 미충족이라 **닫지 않았다**. 신규 이슈·가이드·pitfall 등록 없음.

## 진행 중 정정한 실수

완료 댓글 게시 시 초안 파일(`pending-issues/01.md`)의 내부 frontmatter(`종류/대상/상태`)를 `--body-file`로 그대로 게시해 공개 댓글에 노출시켰다 — 발견 즉시 `gh api PATCH`로 frontmatter를 제거한 본문으로 정정했다.

## 남은 제한

- 완료 조건 1(실 물리 마우스 확인)과 조건 4(실 환경 적용 시 `block-side-menu.tsx` 등 후속 검토)는 이 세션에서 처리하지 못했다 — 이슈에 그대로 남겼다.
- 다음 조사 후보(이번 실험이 다루지 않음): `table-handles.tsx`의 실제 pointer capture 해제 시점, React 합성 이벤트 배선, 표 오버레이가 여러 요소를 pointermove마다 동시에 재렌더하는 점.
