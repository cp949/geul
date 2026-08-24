# PIT-0023 GIT_EDITOR=true는 interactive Git 명령을 조용히 승인한다

- 상태: `ACTIVE`
- 적용 조건: commit·amend·merge·tag·rebase가 editor 입력을 요구
- 지배 계약: [`AGENTS.md`](../../AGENTS.md)의 "공통 규칙", [`ff-workflow`](../agents/ff-workflow.md)의 "금지"
- 반복 근거: 작업 branch workflow review — 저장소 커맨드 문서 자체가 `git rebase -i dev`를 지시할 만큼 기본 행동으로 반복됐고, 임시 저장소 실측으로 무변화 성공(exit 0)을 확인

## 오해하기 쉬운 신호

명령이 exit 0과 성공 문구를 내지만 의도한 todo·message 변경이 적용되지 않는다. `git rebase -i`는 전부 `pick`인 상태로 그대로 끝날 수 있다.

## 원인

에이전트 환경의 `GIT_EDITOR=true`가 editor를 즉시 성공시킨다. 비대화형 값 전달과 금지 명령 목록은 위 지배 계약 두 문서가 소유한다.

## 탐지

```bash
git var GIT_EDITOR
git log --oneline
```

명령 성공 문구 대신 실행 전후 실제 상태와 backup ref tree diff로 판정한다.
