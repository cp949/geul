---
description: pending-issues 초안을 GitHub에 등록한다
argument-hint: [작업폴더]
---

인자: `$1`(선택). 지정하면 그 작업 폴더의 초안만, 없으면 `_works/*/pending-issues/*.md` 전체를 대상으로 한다. 게시 계약은 `docs/agents/issue-tracker.md`의 "게시 승인"이 원본이다.

## 절차

1. 대상 초안을 모은다. `상태: 미등록`인 것만 대상이다. 하나도 없으면 그 사실을 보고하고 정지한다.
2. 미푸시 커밋을 확인한다. `origin/dev`가 없으면 `git log origin/dev..dev`는 `fatal: 애매한 인자`로 exit `128`을 낸다. 존재를 먼저 확인한다.

   ```bash
   git rev-parse --verify --quiet origin/dev && git log --oneline origin/dev..dev
   ```

   `git rev-parse`가 실패하면(exit `1`) `dev`가 한 번도 push되지 않은 것이다. 등록하지 않고 정지한다.

   ```
   정지: origin/dev가 없다. dev를 한 번도 push하지 않았다.
         초안이 참조하는 커밋 해시에 GitHub에서 도달할 수 없다.
         push 후 다시 실행해야 한다. push는 지시가 필요하다.
   ```

   `git log` 출력이 비어 있지 않으면 등록하지 않고 정지한다. 초안이 참조하는 커밋 해시가 origin에 없으면 GitHub에서 링크가 깨진다.

   ```
   정지: dev에 미푸시 커밋 <N>개가 있다.
         push 후 다시 실행해야 한다. push는 지시가 필요하다.
   ```

3. 초안 목록을 사용자에게 제시한다 — 파일 경로, 종류(신규 이슈/댓글), 대상 이슈 번호, 제목. 확인을 받은 뒤 등록한다.
4. 종류별로 등록한다. 본문은 임시 파일과 `--body-file`을 쓴다.

   ```bash
   gh issue create --title "<제목>" --body-file <경로>
   gh issue comment <번호> --body-file <경로>
   ```

   초안의 frontmatter는 본문에서 제외한다.
5. 등록에 성공한 초안의 `상태`를 `등록됨 #<번호>`로 갱신한다. 파일을 지우지 않는다.
6. 한 작업 폴더의 초안이 모두 등록되면 그 폴더의 `meta.md` 상태를 `등록 완료`로 바꾸고 진행 로그에 한 줄 덧붙인다.

## 금지

- 초안에 없는 내용을 새로 만들어 올리지 않는다. 내용 생성은 `/a-issue-work`, `/a-handoff-run`, `/a-final-report`가 한다. 이 커맨드는 게시만 한다.
- 이슈를 종료하지 않는다. `gh issue close`는 사용자가 별도로 지시할 때만 실행한다.
- 라벨, assignee, sub-issue와 dependency를 초안이 명시하지 않은 범위에서 바꾸지 않는다.
- push하지 않는다.

보고: 등록한 이슈 번호와 URL, 갱신한 초안 경로, 건너뛴 초안과 이유.
