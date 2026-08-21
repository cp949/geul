# PIT-0023 에디터를 여는 git 명령은 에이전트 세션에서 조용히 성공한다

- 상태: `ACTIVE`
- 적용 영역: git·process
- 최초 근거: 작업 브랜치 워크플로 리뷰 (2026-08-22)

## 상황과 징후

에이전트 세션은 `GIT_EDITOR=true`로 실행된다. `true`는 아무 일도 하지 않고 exit code `0`을 내는 명령이라, 편집기를 띄워 사용자 입력을 받아야 하는 git 명령이 **입력 없이 기본값으로 즉시 완료된다.** 실패하지 않으므로 exit code, 에러 메시지, 성공 문구 어느 것으로도 구분할 수 없다.

`git rebase -i <base>`가 대표 사례다. todo 목록이 편집되지 않은 채 수락되므로 모든 커밋이 `pick`으로 남고, 아무것도 합치지 않은 재생만 일어난다. 출력은 `Successfully rebased and updated refs/heads/<branch>.`이고 커밋 해시조차 그대로다. squash를 지시한 절차가 squash 없이 "성공"한다.

## 근본 원인

git은 사용자 입력이 필요한 지점을 `GIT_EDITOR`에 위임한다. 위임 대상이 파일을 비우지도 편집하지도 않으면 git은 그것을 "사용자가 기본값을 그대로 승인했다"로 해석한다. 편집기가 빈 파일이나 비정상 종료를 반환할 때만 git이 작업을 중단하는데, `true`는 둘 다 아니다.

`core.editor=vim`이 설정돼 있어도 무의미하다. `GIT_EDITOR` 환경변수가 `core.editor`보다 우선한다(`git var GIT_EDITOR`이 `true`를 반환한다).

## 예방 규칙

- 편집기를 여는 git 명령을 절차 문서에 쓰지 않는다. 최소한 다음이 해당한다.

  | 명령 | 이 환경에서 일어나는 일 | 대체 |
  | --- | --- | --- |
  | `git rebase -i <base>` | 전부 `pick`으로 재생. 합쳐지지 않음 | `git switch --detach <base>` 후 `git cherry-pick -n` — `PIT-0021` |
  | `git commit` (`-m` 없음) | 기본 메시지로 커밋 | `git commit -m "<메시지>"` |
  | `git commit --amend` (`-m` 없음) | 이전 메시지를 유지한 채 amend | `git commit --amend -m "<메시지>"` |
  | `git merge` (`--no-edit` 없음) | 기본 merge 메시지로 커밋 | `git merge --ff-only` 또는 `--no-edit -m` |
  | `git tag -a <name>` (`-m` 없음) | 빈 메시지 태그 생성 시도 | `git tag -a <name> -m "<메시지>"` |

- 결과를 바꾸는 값(커밋 메시지, todo 목록, 충돌 해결)은 항상 플래그나 파일로 명시한다. 편집기를 거쳐 전달하지 않는다.
- `GIT_SEQUENCE_EDITOR`에 스크립트를 지정해 `rebase -i`를 무인 실행하는 우회는 쓰지 않는다. todo 문법을 생성하는 스크립트가 하나 더 늘고, 실패해도 같은 방식으로 조용히 성공한다.
- 명령의 성공 문구를 결과 판정 근거로 쓰지 않는다. 판정은 항상 상태를 다시 읽어서 한다 — `git log --oneline`, `git diff <backup-ref> HEAD`.

## 검증 방법

절차 문서에 새 git 명령을 넣기 전에 해당 명령이 편집기를 여는지 확인한다.

```bash
git var GIT_EDITOR    # 에이전트 세션에서는 true
```

`true`가 반환되면 편집기를 여는 모든 명령은 무인 승인된다. 의심되는 명령은 임시 저장소에서 실행해 결과를 직접 대조한다.

```bash
git log --oneline     # 실행 전
<의심 명령>
git log --oneline     # 해시가 그대로면 아무 일도 일어나지 않은 것이다
```

## 실제 근거

- 2026-08-22 — `.claude/commands/a-merge-dev.md` 4단계와 `PIT-0021` 검증 방법이 `git rebase -i dev`를 지시했다. 임시 저장소(커밋 3개)에서 `git rebase -i HEAD~2`를 실행하자 `Successfully rebased and updated refs/heads/main.`, exit code `0`, 커밋 해시 `7dfd0fc ea7a7fb f20872e` 전부 변화 없음이었다. `git var GIT_EDITOR`은 `true`, `core.editor`는 `vim`이었다.
- 같은 저장소에서 `git commit --amend`를 `-m` 없이 실행하자 이전 메시지(`원래 메시지`)를 유지한 채 새 스테이지 내용으로 amend되고 exit code `0`을 냈다.
- 대체 절차는 실측으로 확인했다. 상쇄 쌍(원인 커밋 + 되돌림 커밋)을 포함한 4커밋 브랜치를 `git switch --detach dev` 후 `git cherry-pick -n` 두 그룹으로 재조립했을 때 `git diff <backup-ref> HEAD --stat`이 빈 출력이었고, 되돌림을 원인보다 앞 그룹에 두자 같은 diff가 `f.txt | 2 +-`를 출력해 `PIT-0021`의 실패를 검출했다.

## 관련 문서

- squash 순서 규칙과 무결성 판정: [`PIT-0021`](./PIT-0021-verify-regrouped-commits-against-a-backup-ref.md)
- 이 규칙을 적용하는 커맨드: `.claude/commands/a-merge-dev.md`
