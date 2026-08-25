# 20260825-16 Chrome 75 floor 결정과 후속 구현 이슈 분리(#119)

- 레인: qq-workflow (단계 1~4)
- 대상 이슈: #119(종료)
- 작업 브랜치: `docs/119-chrome75-js-blockers`(`dev` ff-only 이전 후 삭제)

## 목표

Issue #119가 정리한 Chrome 75 지원 JS 트랙 차단 요인을 공식 결정(ADR)과 후속 구현 이슈로 확정해 #119를 닫는다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `22da2e2` | docs(adr): Chrome 75를 공식 browser floor로 선언한다 |

작업 브랜치는 원래 커밋 2개(ADR 최초 작성 + 단계-3 리뷰가 찾은 MAJOR 결함 수정, 같은 파일 같은 줄을 왕복)였다 — 재그룹화로 하나로 합쳤다(`dev`로 `e40d4be..22da2e2` fast-forward 이전).

## 바꾼 계약과 파일

신규 `docs/adr/0008-target-chrome-75-as-official-browser-floor.md`(1 file, 14 insertions) — Chrome 75를 Geul 공식 browser floor로 선언하고, Issue #4 완료 기준에 남아 있던 "Chrome 111+" 기록을 대체한다고 명시. 코드 변경 없음.

## 실행한 검증과 결과

단계-3 진입 게이트 `pnpm verify` 전량 1회 통과(95 e2e 포함, exit 0, 31.6s) — 코드 변경이 없어 baseline과 동일. 재그룹화 전 구간과 병합 직전 `pnpm lint`/`git diff --check` 통과, 재조립 트리를 `pre-squash` 백업과 두 차례 대조해 완전 일치 확인.

## 남은 제한

- Issue #4는 원래 범위(Tailwind v4 내부 빌드)가 SCSS+PostCSS로 대체되어 실질적으로 끝났지만 GitHub Issue 자체는 여전히 OPEN이다(체크리스트 7개 미체크, 완료 보고 댓글은 있으나 미종료). 이번 작업 범위 밖이라 손대지 않았다 — Issue #4 자체의 종료 판단은 별도 세션의 몫이다.
- 후속 이슈 #120의 "결정이 필요한 지점" 3개(downlevel 도입 여부, `.at()`/`structuredClone` 대체 구현 vs polyfill, 실제 Chrome 75 E2E 인프라 여부)는 이번 작업에서 확정하지 않았다 — 실제 구현 착수 세션이 결정한다.

## 등록한 이슈와 가이드

- 신규 이슈 등록 — [#120](https://github.com/cp949/geul/issues/120) "Chrome 75 지원: JS 빌드 타겟·downlevel·Web API 차단 요인 해소". Issue #119의 차단 요인 4개(빌드 타겟·downlevel·Vite target·`.at()`/`structuredClone`)를 승계. 5번째(Issue #4 기록 충돌)는 이번 ADR·댓글로 이미 해소해 승계하지 않음.
- 댓글 등록 — [Issue #4](https://github.com/cp949/geul/issues/4#issuecomment-5411094726)(browser floor 정정, ADR 0008 링크), [Issue #119](https://github.com/cp949/geul/issues/119#issuecomment-5411100703)(완료 보고). #119 종료.
- 신규 가이드·함정 등록 없음.

## 절차상 기록

단계-3 결함 탐지 subagent가 ADR 초안이 Issue #4를 "완료됨"으로 서술한 MAJOR 결함 1건(실제 GitHub 상태는 OPEN)과, 후속 이슈 초안이 Issue #119를 "종료됨"으로 서술한 MINOR 결함 1건(당시 #119는 아직 OPEN — 초안이 자기 자신이 유발할 미래 상태를 이미 일어난 사실처럼 서술)을 찾았다. 둘 다 수정했다. 다만 후속 이슈 초안(01.md) 안의 같은 종류 서술이 한 곳 더("이 이슈가 승계하는 원본 조사(차단 요인 5개, 종료됨)") 리뷰에서 누락된 채 GitHub Issue #120 본문으로 그대로 게시됐다 — #119 종료가 그 직후 실제로 일어나 결과적으로는 사실과 맞게 됐지만, 게시 시점 기준으로는 검증되지 않은 채 나간 것이라 재발 방지가 필요한 패턴이다.
