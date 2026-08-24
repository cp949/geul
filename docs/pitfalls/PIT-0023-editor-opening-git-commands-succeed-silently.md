# PIT-0023 GIT_EDITOR=true는 interactive Git 명령을 조용히 승인한다

- 상태: `ACTIVE`
- 적용 조건: commit·amend·merge·tag·rebase가 editor 입력을 요구
- 정상 절차: [`ff-workflow`](../agents/ff-workflow.md)
- 최초 근거: 작업 branch workflow review

## 오해하기 쉬운 신호

명령이 exit 0과 성공 문구를 내지만 의도한 todo·message 변경이 적용되지 않는다. `git rebase -i`는 전부 `pick`인 상태로 그대로 끝날 수 있다.

## 원인과 회피

에이전트 환경의 `GIT_EDITOR=true`가 editor를 즉시 성공시킨다. 결과 값은 `-m`, `--no-edit` 또는 명시적 비대화형 절차로 전달한다. `GIT_SEQUENCE_EDITOR` 우회를 만들지 않는다.

## 탐지

```bash
git var GIT_EDITOR
git log --oneline
```

명령 성공 문구 대신 실행 전후 실제 상태와 backup ref tree diff로 판정한다.
