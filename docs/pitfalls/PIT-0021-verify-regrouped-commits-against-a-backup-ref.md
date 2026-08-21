# PIT-0021 재그룹화한 커밋은 백업 ref와 트리 diff로 대조한다

- 상태: `ACTIVE`
- 적용 영역: git·process
- 최초 근거: `dev` 재그룹화 (2026-08-20)

## 상황과 징후

이 저장소는 작업 브랜치에 세분화된 커밋을 누적하고 `dev`로 이전하기 직전에 의미 단위로 squash한다(`AGENTS.md`의 "작업 브랜치 수명"). `git rebase -i dev` 또는 `git switch --detach <base>` 후 `git cherry-pick -n`으로 순서를 바꿔 재조립할 때, revert 성격의 커밋을 그 원인 커밋보다 **앞** 그룹에 배치하면 cherry-pick이 충돌도 경고도 없이 `자동 병합`(`Auto-merging`) 한 줄만 출력하고 그 커밋을 no-op으로 흡수한다. 이후 원인 커밋이 적용되면서 되돌렸던 변경이 최종 트리에 되살아난다. 재조립 로그만 보면 모든 커밋이 정상 적용된 것처럼 보이고, typecheck를 다시 실행하기 전까지 회귀가 드러나지 않는다.

## 근본 원인

`cherry-pick`은 커밋의 diff를 3-way merge로 적용한다. revert 커밋의 diff(`undefined` → `void`)를 원인 커밋이 아직 적용되지 않은 트리(이미 `void`)에 적용하면 목표 상태가 이미 성립하므로 "변경 없음"으로 판정한다. 이것은 충돌이 아니라 정상적인 병합 결과이므로 exit code도 `0`이다.

커밋 재정렬은 "각 커밋의 diff"를 옮기는 연산이지 "최종 트리"를 보존하는 연산이 아니다. 서로 상쇄하는 두 커밋의 선후를 뒤집으면 상쇄의 한쪽만 남는다.

## 예방 규칙

- 재조립 전에 백업 ref를 남긴다: `git update-ref refs/backup/<name> HEAD`. 시작은 `git reset --hard`가 아니라 `git switch --detach <base>`로 한다(`AGENTS.md`가 `git reset --hard`를 금지한다).
- revert·fix·되돌림 성격의 커밋은 항상 원인 커밋과 **같은 그룹**에, 원인 커밋 **뒤에** 둔다.
- 그룹을 나눌 때 커밋 제목만 보지 않는다. 같은 파일·같은 줄을 건드리는 상쇄 쌍을 먼저 찾는다: `git log --oneline --name-only <base>..HEAD`. 제목이 서로 다른 관심사를 가리켜도(예: "메뉴 Delete 비활성화" vs "CommandResult 타입 되돌림") 같은 줄을 왕복하면 같은 그룹이다.
- 재조립 로그의 `자동 병합` 한 줄을 성공 신호로 읽지 않는다. 무결성 판정은 아래 트리 diff로만 한다.
- 그룹 경계마다 typecheck/test가 통과하는지 확인한다. 중간 커밋이 깨지면 재그룹화가 목적(의미 단위로 읽히는 이력)을 잃는다.

## 검증 방법

```bash
git update-ref refs/backup/<작업 브랜치>-pre-squash HEAD    # 정리 전
git rebase -i dev                                          # 또는 detach 후 cherry-pick -n
git diff refs/backup/<작업 브랜치>-pre-squash HEAD --stat   # 정리 후: 반드시 빈 출력
```

의도적으로 커밋을 버린 경우가 아니면 이 diff는 비어 있어야 한다. 비어 있지 않으면 그룹 순서가 잘못된 것이고, 출력된 파일이 상쇄 쌍이 갈라진 지점이다.

그룹별 검증은 각 그룹의 커밋을 `git switch --detach <commit>`으로 체크아웃해 해당 범위의 focused 검증을 실행한다. 백업 ref는 `dev` 이전을 확인한 뒤 `git update-ref -d refs/backup/<name>`으로 정리한다.

## 실제 근거

- 2026-08-20 `dev` 재그룹화 — `437c282`(`fix(react): 마지막 행/열에서 표 핸들 메뉴의 Delete 항목을 비활성화한다`)가 `packages/react/src/table-handle-menu.tsx`의 `CommandResult`를 `{ ok: true; value: void }` → `{ ok: true; value: undefined }`로 함께 바꿨고, `db382a6`(`fix(react): CommandResult의 value 타입을 void로 되돌린다`)가 그 한 줄만 되돌렸다. 두 커밋의 선후를 반대로 알고 `db382a6`을 앞 그룹에 넣자 cherry-pick이 no-op으로 흡수했고, 최종 트리에 `value: undefined`가 남아 typecheck가 깨졌다. 커밋 제목이 서로 다른 관심사를 가리켜 그룹을 나눌 때 상쇄 관계를 놓친 것이 직접 원인이다.
- 두 커밋은 재그룹화 이후 어느 branch에도 속하지 않는다(`git branch --contains 437c282` 빈 출력). 원본 이력은 `refs/backup/dev-pre-regroup`으로만 도달할 수 있다 — 백업 ref가 없었다면 대조 자체가 불가능했다.

## 관련 문서

- 작업 브랜치 수명, 커밋 누적과 squash·이전 시점: `AGENTS.md`의 "Git과 작업공간"
- 이 절차를 실행하는 커맨드: `.claude/commands/merge-dev.md`
