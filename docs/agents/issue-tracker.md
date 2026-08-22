# 이슈 트래커: GitHub

이 저장소의 발견 작업, 실행 계획, 체크리스트와 진행 상태는 GitHub Issues에서 관리한다. 모든 작업에는 `gh` CLI를 사용한다.

## 기본 명령

- **이슈 생성**: `gh issue create --title "..." --body "..."`. 여러 줄 본문은 임시 파일과 `--body-file`을 사용한다.
- **이슈 조회**: `gh issue view <번호> --comments`
- **이슈 목록**: `gh issue list --state open --json number,title,body,labels,comments`
- **댓글 작성**: `gh issue comment <번호> --body "..."`
- **이슈 수정**: `gh issue edit <번호> --title "..." --body "..."`
- **이슈 종료**: `gh issue close <번호> --comment "..."`

저장소는 `git remote -v`에서 추론한다. clone 안에서 실행하는 `gh`는 현재 remote를 자동으로 사용한다.

## 게시 승인

에이전트는 사용자 지시 없이 GitHub에 쓰지 않는다. 읽기는 제한하지 않는다 — `gh issue view`, `gh issue list`, `gh api` 조회는 언제든 실행한다.

쓰기에 해당하는 것: 이슈 생성, 댓글 작성, 이슈 수정, 이슈 종료, 라벨과 assignee 변경, sub-issue와 dependency 연결.

- a-workflow로 진행하면 등록하고 싶은 이슈와 댓글을 `_works/<작업 폴더>/pending-issues/NN-<slug>.md`에 초안으로 남긴다(`docs/agents/a-workflow.md`). 기본 레인에는 작업 폴더가 없으므로 등록 대상을 사용자에게 보고하고 지시를 기다린다.
- 사용자가 등록을 지시하면 초안을 그대로 게시하고 초안의 `상태`를 `등록됨 #<번호>`로 갱신한다. 초안 파일은 지우지 않는다.
- a-workflow의 커밋 해시는 작업 브랜치가 `dev`로 이전된 뒤에만 초안과 게시물에 쓴다. 근거는 `docs/agents/a-workflow.md`의 "커밋 해시 참조"다. 기본 레인은 `dev`에 직접 커밋하므로 해시가 처음부터 확정이다.

초안 형식은 다음과 같다.

````markdown
---
종류: 신규 이슈        # 또는 댓글
대상: #26              # 종류가 댓글일 때만
상태: 미등록           # 등록 후 등록됨 #123
---

# 제목

본문은 아래 "이슈 본문 계약"을 따른다.
````

## 이슈 본문 계약

Geul 작업 이슈는 필요한 범위에서 다음 내용을 포함한다.

- 목표와 사용자 결과
- 포함·제외 범위
- 관련 product, spec, ADR와 pitfall
- 구현 순서와 체크리스트
- 완료 기준
- 검증 명령과 결과
- 남은 제한과 별도 후속 이슈

이슈 생성만으로 제품 범위가 승인되지는 않는다. 제품 범위와 기능 상태는 inventory, 릴리스 배정과 완료 조건은 roadmap, 승인된 기능·기술 계약은 spec이 소유한다.

현재 작업 범위 밖에서 발견한 항목은 별도 이슈 초안으로 남기고 현재 변경에 섞지 않는다. 초안에는 발견 위치, 영향, 현재 범위에서 제외한 이유와 완료 조건을 기록한다.

## 등록 기준

**제품 동작을 바꾸거나, 게이트 구멍을 막거나, 거짓 통과 테스트를 드러내지 않으면 이슈로 등록하지 않는다.** 주석·서술·중복 위생은 발견한 커밋에서 고치거나 버린다.

앞 절의 "별도 이슈 초안으로 남긴다"는 이 기준을 통과한 항목에만 적용된다.

리뷰가 자기 산출물(탐지 도구, 리뷰의 전제, 테스트 주석, 서술 복제)을 대상으로 후속을 낳기 시작하면 그 레인은 종료 신호를 지난 것이다. 후속을 더 등록하지 말고 레인을 닫는다.

근거는 2026-08-22 테스트 아키텍처 리뷰다. 원래 후보 8개를 종결하고 측정 목표(e2e 게이트 `66.0s` → `39.6s`)를 달성한 뒤에도 후속이 16건까지 늘었고, 그중 11건이 위생 항목이었다. 같은 대상(`e2e`의 `dragSelectCells` 2벌)에 이슈 2건(#94, #98)이 따로 붙기도 했다. 그동안 제품 작업(R2, Issue #39)은 슬라이스 전량 미착수로 멈춰 있었다. 11건은 `not planned`로 닫았고 게이트 구멍·거짓 통과·회귀 커버리지에 걸리는 5건(#89, #95, #96, #101, #103)만 남겼다.

## Pull Request를 요청 표면으로 사용할지 여부

**PR을 요청 표면으로 사용하지 않는다.** 외부 PR을 기능 요청이나 triage 대기열로 취급하지 않는다.

정책을 바꾸려면 이 문서를 먼저 갱신해야 한다. 변경 후에는 `gh pr view`, `gh pr list`, `gh pr comment`, `gh pr edit`, `gh pr close`의 사용 계약과 외부 기여자 판별 기준을 함께 명시한다.

GitHub는 Issue와 PR이 하나의 번호 공간을 공유한다. `#42`가 어느 쪽인지 불분명하면 `gh pr view 42`를 먼저 시도하고 실패하면 `gh issue view 42`를 사용한다.

## 스킬 표현의 의미

### “이슈 트래커에 게시한다”

GitHub Issue를 생성한다.

### “관련 티켓을 조회한다”

`gh issue view <번호> --comments`로 본문과 댓글을 함께 읽는다.

## Wayfinding 작업

map은 하나의 상위 Issue이고 child는 실행 가능한 하위 Issue다.

이 절차의 GitHub 쓰기(claim, 댓글, 종료, 라벨, dependency 연결)도 "게시 승인"을 따른다. 사용자가 wayfinder 세션을 지시하면 그 지시를 해당 절차의 쓰기 허가로 본다. 지시 없이 map이나 child를 만들지 않는다.

- **Map**: Notes, Decisions-so-far와 Fog를 본문에 가진 단일 Issue다. `wayfinder:map` 라벨을 사용한다.
- **Child**: GitHub sub-issue로 map에 연결한다. sub-issue를 사용할 수 없으면 map 본문의 task list에 추가하고 child 본문 첫 줄에 `Part of #<map 번호>`를 기록한다.
- **종류**: child는 `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task` 중 해당 라벨을 사용한다.
- **차단 관계**: GitHub native issue dependency를 우선 사용한다. 사용할 수 없으면 child 본문 첫 줄에 `Blocked by: #<번호>`를 기록한다.
- **Frontier**: map 순서대로 열린 child를 조회하고 열린 blocker나 assignee가 있는 항목을 제외한 첫 항목을 선택한다.
- **Claim**: `gh issue edit <번호> --add-assignee @me`를 사용한다. claim은 세션의 첫 외부 변경이다.
- **Resolve**: 결론과 근거를 댓글로 남기고 child를 종료한 뒤 map의 Decisions-so-far에 결정 링크를 추가한다.

Native dependency를 만들 때 blocker의 database ID는 다음처럼 조회한다.

```bash
gh api repos/<owner>/<repo>/issues/<번호> --jq .id
gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>
```

`issue_id`에는 Issue 번호나 `node_id`가 아니라 숫자형 database ID를 사용한다.
