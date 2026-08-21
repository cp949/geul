---
description: 작업 브랜치 커밋을 의미 단위로 squash해 dev로 ff-only 이전한다
argument-hint: [작업폴더]
---

인자: `$1`(선택).

소유 경계: 언제 무엇을 하는지는 `docs/agents/a-workflow.md`의 "작업 브랜치 수명"이, 그룹 순서 규칙과 무결성 판정은 [`PIT-0021`](../../docs/pitfalls/PIT-0021-verify-regrouped-commits-against-a-backup-ref.md)이 소유한다. 이 문서는 그 둘을 실행하는 명령 순서만 소유한다.

## 작업 폴더 결정

인자가 있으면 `docs/agents/a-workflow.md`의 "로컬 작업공간" 규칙으로 해석한다. 인자가 없으면 현재 브랜치명으로 `_works/*/meta.md`를 역추적한다.

```
에러: 현재 브랜치에 대응하는 작업 폴더가 없다 — <브랜치명>
      작업 폴더를 인자로 지정해야 한다.

에러: 작업 폴더가 유일하지 않다 — <인자>
후보: <목록>
```

## 전제

다음이 어긋나면 아무것도 바꾸지 않고 정지한다.

- `meta.md` 상태가 `리뷰 완료`여야 한다. `리뷰 대기`면 `/a-handoff-run`이 남았다.
- `git status --short`가 비어 있어야 한다.
- 작업 브랜치가 존재하고 `git log --oneline dev..<브랜치>`가 비어 있지 않아야 한다.

상태가 `리뷰 대기`인데 사용자가 이 세션에서 리뷰 생략을 명시 지시한 경우에만 예외로 진행한다(`docs/agents/a-workflow.md`의 "작업 브랜치 수명"이 허용하는 유일한 예외다). 그때는 `meta.md` 진행 로그에 생략 지시를 받은 사실을 남기고 보고에도 적는다. 지시가 없으면 예외를 적용하지 않는다.

## 절차

1. `pnpm verify` 전량을 실행한다. 실패하면 병합하지 않고 정지한다. baseline 실패와 이 작업이 만든 실패를 구분해 보고한다.
2. 백업 ref를 남긴다. 백업 없이 재조립하지 않는다.

   ```bash
   git update-ref refs/backup/<브랜치>-pre-squash HEAD
   ```

3. 그룹을 정한다. `git log --oneline --name-only dev..HEAD`로 같은 파일·같은 줄을 왕복하는 상쇄 쌍을 먼저 찾는다. revert·되돌림 성격의 커밋은 원인 커밋과 같은 그룹에, 원인 커밋 뒤에 둔다. 판정 근거는 `PIT-0021`이다.
4. `dev`에서 분리해 그룹별로 재조립한다. 커밋을 원래 순서대로 나열하고 그룹마다 한 번 커밋한다.

   ```bash
   git switch --detach dev
   git cherry-pick -n <그룹1 커밋...>
   git commit -m "<그룹1 메시지>"
   git cherry-pick -n <그룹2 커밋...>
   git commit -m "<그룹2 메시지>"
   ```

   커밋 메시지는 한글로 쓰고 `Co-Authored-By`와 생성 표시 라인을 넣지 않는다.

   `git commit`이 `커밋할 사항 없음`으로 실패하면 그 그룹은 내부에서 전부 상쇄된 것이다. 에러가 아니므로 그룹을 버리고 다음으로 넘어가되, 커밋을 의도적으로 버렸다는 사실을 보고에 적는다.

   `git cherry-pick`이 충돌로 멈추면 `git cherry-pick --continue`를 쓰지 않는다. `-n`이 남긴 스테이지 변경 때문에 `로컬 변경 사항을 cherry-pick 때문에 덮어 쓰게 됩니다`로 실패한다(exit `128`). 해결 경로는 다음이다.

   ```bash
   # 충돌 해결 후
   git add <파일>
   git cherry-pick --quit          # 시퀀서 상태만 정리한다. 작업 트리는 그대로 남는다
   git cherry-pick -n <남은 커밋>  # 나머지를 이어서 pick
   ```

5. 트리를 대조한다. 빈 출력이 아니면 그룹 순서가 잘못된 것이다. 되돌리고 3단계부터 다시 한다.

   ```bash
   git diff refs/backup/<브랜치>-pre-squash HEAD --stat
   ```

6. 그룹 경계마다 typecheck가 통과하는지 확인한다. 각 그룹 커밋을 `git switch --detach <커밋>`으로 체크아웃해 해당 범위의 focused 검증을 실행한다.
7. 작업 브랜치를 재조립 결과로 옮기고 `dev`로 이전한다.

   ```bash
   git branch -f <브랜치> HEAD
   git switch <브랜치>
   git switch dev
   git merge --ff-only <브랜치>
   ```

   ff가 거절되면 재조립 중 `dev`가 움직인 것이다. 4단계를 현재 `dev` 기준으로 다시 실행한다.
8. `git branch -d <브랜치>`로 삭제하고 `git update-ref -d refs/backup/<브랜치>-pre-squash`로 백업 ref를 정리한다.
9. `meta.md` 상태를 `병합 완료`로 바꾸고 확정 커밋 해시 목록과 진행 로그를 기록한다. 이 해시가 이후 문서와 이슈가 참조할 유일한 해시다.

## 금지

- `git rebase -i`. 에이전트 세션은 `GIT_EDITOR=true`라 아무것도 합치지 않은 채 `Successfully rebased`와 exit code `0`을 낸다 — [`PIT-0023`](../../docs/pitfalls/PIT-0023-editor-opening-git-commands-succeed-silently.md). `GIT_SEQUENCE_EDITOR` 우회도 쓰지 않는다.
- 명령의 성공 문구를 결과 판정 근거로 쓰기. 판정은 5단계 트리 diff로만 한다.
- push, tag, PR 생성. `dev` push는 사용자가 별도로 지시한다.
- `main`을 대상으로 하는 merge, rebase, push.
- `git reset --hard`, 강제 push, 광범위한 `git clean`.
- superpowers `finishing-a-development-branch` 스킬. 통합 방식 선택 메뉴를 띄우는데 이 저장소는 ff-only 고정에 PR 금지다.

보고: 확정 커밋 해시와 제목 목록, `pnpm verify` 결과, 버린 그룹이 있으면 그 사실, 삭제한 브랜치명, 미푸시 커밋 수.
