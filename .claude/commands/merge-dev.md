---
description: 작업 브랜치 커밋을 의미 단위로 squash해 dev로 ff-only 이전한다
argument-hint: [작업폴더]
---

인자: `$1`(선택). 절차 원본은 `AGENTS.md`의 "작업 브랜치 수명"과 [`PIT-0021`](../../docs/pitfalls/PIT-0021-verify-regrouped-commits-against-a-backup-ref.md)이다.

## 작업 폴더 결정

인자가 있으면 `AGENTS.md`의 "로컬 작업공간" 규칙으로 해석한다. 인자가 없으면 현재 브랜치명으로 `_works/*/meta.md`를 역추적한다.

```
에러: 현재 브랜치에 대응하는 작업 폴더가 없다 — <브랜치명>
      작업 폴더를 인자로 지정해야 한다.

에러: 작업 폴더가 유일하지 않다 — <인자>
후보: <목록>
```

## 전제

다음이 어긋나면 아무것도 바꾸지 않고 정지한다.

- `meta.md` 상태가 `리뷰 완료`여야 한다. `리뷰 대기`면 `/handoff-run`이 남았다.
- `git status --short`가 비어 있어야 한다.
- 작업 브랜치가 존재하고 `git log --oneline dev..<브랜치>`가 비어 있지 않아야 한다.

## 절차

1. `pnpm verify` 전량을 실행한다. 실패하면 병합하지 않고 정지한다. baseline 실패와 이 작업이 만든 실패를 구분해 보고한다.
2. `git update-ref refs/backup/<브랜치>-pre-squash HEAD`로 백업 ref를 남긴다. 백업 없이 재조립하지 않는다.
3. `git log --oneline --name-only dev..HEAD`로 같은 파일·같은 줄을 왕복하는 상쇄 쌍을 먼저 찾는다. revert·되돌림 성격의 커밋은 원인 커밋과 같은 그룹에, 원인 커밋 뒤에 둔다.
4. `git rebase -i dev`로 의미 단위 squash를 한다. 커밋 메시지는 한글로 쓰고 `Co-Authored-By`와 생성 표시 라인을 넣지 않는다.
5. `git diff refs/backup/<브랜치>-pre-squash HEAD --stat`를 확인한다. 빈 출력이 아니면 그룹 순서가 잘못된 것이다 — 되돌리고 3단계부터 다시 한다.
6. 그룹 경계마다 typecheck가 통과하는지 확인한다.
7. `git switch dev` 후 `git merge --ff-only <브랜치>`. 거절되면 작업 브랜치로 돌아가 `git rebase dev`를 하고 2단계부터 다시 검증한다.
8. `git branch -d <브랜치>`로 삭제하고 `git update-ref -d refs/backup/<브랜치>-pre-squash`로 백업 ref를 정리한다.
9. `meta.md` 상태를 `병합 완료`로 바꾸고 확정 커밋 해시 목록과 진행 로그를 기록한다. 이 해시가 이후 문서와 이슈가 참조할 유일한 해시다.

## 금지

- push, tag, PR 생성. `dev` push는 사용자가 별도로 지시한다.
- `main`을 대상으로 하는 merge, rebase, push.
- `git reset --hard`, 강제 push, 광범위한 `git clean`.
- superpowers `finishing-a-development-branch` 스킬. 통합 방식 선택 메뉴를 띄우는데 이 저장소는 ff-only 고정에 PR 금지다.

보고: 확정 커밋 해시와 제목 목록, `pnpm verify` 결과, 삭제한 브랜치명, 미푸시 커밋 수.
