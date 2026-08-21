---
description: 작업 폴더와 브랜치 현황을 보여준다
argument-hint: [작업폴더]
---

인자: `$1`(선택). 읽기 전용이다 — 파일, 브랜치, 커밋과 GitHub를 바꾸지 않는다.

## 인자가 없을 때: 전체 요약

`_works/*/meta.md`를 읽어 작업 폴더를 상태순으로 나열한다. 작업 폴더 이름을 모르는 세션이 다른 커맨드의 인자를 얻는 진입점이다.

```
작업 폴더
  20260822-01-issue26-editmap-perf   리뷰 대기    feat/26-editmap-perf (dev+7)
  20260821-02-issue74-e2e-trace      리뷰 완료    fix/74-e2e-trace (dev+3)
  20260820-01-issue58-column-align   등록 완료    (브랜치 삭제됨)

미등록 초안
  20260822-01-.../pending-issues/01-표-병합셀-버그.md   신규 이슈
  20260821-02-.../pending-issues/01-issue74-완료.md     댓글 #74

고아 브랜치 (작업 폴더 매핑 없음)
  docs/agents-git-workflow (dev+2)

미푸시
  dev → origin/dev 12 커밋
```

## 인자가 있을 때: 작업 상세

`docs/agents/a-workflow.md`의 "로컬 작업공간" 규칙으로 폴더를 해석하고 다음을 보여준다.

- `meta.md`의 작업 브랜치, 대상 이슈, 상태와 진행 로그
- 산출물 존재 여부: `implementation-report.md`, `final-report.md`
- `handoff/` 목록과 각 파일의 상태
- `pending-issues/` 목록과 각 초안의 종류·대상·상태
- `git log --oneline dev..<작업 브랜치>` 커밋 수와 목록
- 상태에 따른 다음 커맨드

## 판단 규칙

- 브랜치가 `meta.md`에 적혀 있지만 존재하지 않으면 그 사실을 표시한다. 상태가 `병합 완료` 이상이면 정상, 그 이하면 이상 신호다.
- `_works/` 아래 어떤 `meta.md`도 가리키지 않는 `<type>/*` 로컬 브랜치는 고아 브랜치로 따로 표시한다.
- `_works/`가 없거나 비어 있으면 그 사실만 보고한다.
