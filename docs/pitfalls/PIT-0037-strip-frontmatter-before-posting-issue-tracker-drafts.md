# PIT-0037 이슈 트래커 초안의 frontmatter를 제거하지 않고 그대로 게시한다

- 상태: `ACTIVE`
- 적용 조건: `pending-issues/` 초안 파일을 `gh issue create --body-file`·`gh issue comment --body-file`·`gh issue edit --body-file`로 게시
- 지배 가이드: [`../agents/issue-tracker.md`](../agents/issue-tracker.md)의 "초안 형식"
- 반복 근거: 같은 날(2026-08-27) Issue #64와 #78 완료 댓글 게시에서 같은 원인으로 2회 반복 — `종류`/`대상`/`상태` YAML frontmatter가 공개 댓글 본문 맨 위에 그대로 노출됐다. 각각 발견 즉시 `gh api PATCH`로 정정했다(`docs/history/20260827-04-issue64-table-handle-click-cause.md`의 "진행 중 정정한 실수", 이 이슈의 완료 댓글 정정).

## 오해하기 쉬운 신호

`gh issue comment --body-file`(또는 `create`/`edit`)이 exit 0으로 성공하고 댓글·이슈 URL을 정상 반환한다 — frontmatter 노출 여부를 알려주는 신호가 없다.

## 원인

초안 파일 하나에 로컬 추적용 frontmatter와 게시할 본문을 같이 담는다. `--body-file`은 파일 전체를 그대로 본문으로 쓰므로 frontmatter까지 공개 댓글·이슈에 포함된다.

## 탐지

게시 직후 `gh api repos/<owner>/<repo>/issues/comments/<id> --jq '.body'`(신규 이슈는 `gh issue view <번호> --json body --jq .body`)로 응답 첫 줄이 `---`로 시작하는지 확인한다. 시작하면 frontmatter가 그대로 올라간 것이다 — `gh api --method PATCH repos/<owner>/<repo>/issues/comments/<id> -f body="<frontmatter 제거한 본문>"`(이슈 본문 정정은 `gh issue edit <번호> --body-file`)으로 즉시 정정한다.
