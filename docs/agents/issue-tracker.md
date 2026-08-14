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

현재 작업 범위 밖에서 발견한 항목은 별도 이슈로 만들고 현재 변경에 섞지 않는다. 새 이슈에는 발견 위치, 영향, 현재 범위에서 제외한 이유와 완료 조건을 기록한다.

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
