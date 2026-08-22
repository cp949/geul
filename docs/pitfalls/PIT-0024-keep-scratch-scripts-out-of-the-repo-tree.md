# PIT-0024 에이전트 스크래치 스크립트를 저장소 트리에 두지 않는다

- 상태: `ACTIVE`
- 적용 영역: 에이전트 작업공간·lint·test
- 최초 근거: Issue #107

## 상황과 징후

에이전트가 재현이나 조사에 쓸 일회용 `.mjs`를 gitignore된 작업공간(`.superpowers/sdd/<태스크>/` 등)에 둔다. 그 경로는 git 추적 대상이 아니므로 커밋에 섞이지 않는다.

그다음 무관한 lint 실패와 테스트 실패가 난다.

```
pnpm lint                 Checked 202 files, Found 2 errors   ← 추적되지 않는 그 두 파일
pnpm vitest run tests/    tests/worktree-lint.test.ts 실패
                          AssertionError: expected 1 to be +0
```

징후가 위험한 이유는 오진의 방향이다. 실패가 자기 변경과 무관해 보이므로 "이 태스크 범위 밖의 사전 실패"로 판정하기 쉽고, 그 판정을 `git stash` 대조로 뒷받침하게 된다.

## 근본 원인

두 겹이다.

1. **biome의 검사 범위는 git의 추적 범위가 아니다.** `biome check .`는 `.superpowers/` 아래를 그대로 훑는다. gitignore에 걸린다고 lint 대상에서 빠지지 않는다. 이 저장소는 `tests/worktree-lint.test.ts`가 lint의 exit code를 단언하므로 lint 실패가 테스트 실패로 번진다.
2. **`git stash`로는 이 원인을 가릴 수 없다.** `git stash`는 추적되는 변경만 치워 두고 ignored·untracked 파일은 그대로 둔다. 그래서 "stash한 베이스 상태에서도 같은 실패가 난다"가 참이 되고, 그것이 "사전 실패"의 근거로 읽힌다. 원인이 추적되지 않는 파일일 때 그 대조는 항상 같은 답을 낸다 — 판별력이 0이다.

## 예방 규칙

- 에이전트가 만드는 재현·조사용 스크립트는 저장소 트리 안에 두지 않는다. 세션 scratchpad에 두고 경로만 브리프에 적는다. 보고서·리뷰 패키지 같은 `.md`/`.diff` 산출물은 biome 대상이 아니므로 작업공간에 둬도 된다.
- **"사전 실패"를 주장할 때 `git stash` 하나를 근거로 쓰지 않는다.** 베이스 커밋을 임시 클론이나 `git worktree`로 꺼내 대조하거나, 최소한 게이트가 보고하는 **검사 대상 파일 수**를 함께 읽는다.
- lint·테스트 게이트가 파일 수를 출력하면 그 수를 기준선과 대조한다.

## 검증 방법

```bash
pnpm lint | tail -3           # "Checked N files" — N이 기준선과 같은지 본다
git status --short --ignored  # 추적되지 않는 파일이 저장소 트리 안에 있는지 본다
```

`N`이 기준선보다 크면 추적되지 않는 파일이 검사 범위에 들어온 것이다. 그 파일을 저장소 밖으로 옮기고 다시 센다.

## 실제 근거

- 2026-08-23 Issue #107 구현 세션 — 메인 세션이 만든 스크래치 `.mjs` 2개를 `.superpowers/sdd/`에 두자 `pnpm lint`가 `Checked 202 files` / `Found 2 errors`를 냈고 `tests/worktree-lint.test.ts`가 함께 졌다. 구현 subagent는 `git stash` 대조를 근거로 셋 다 "사전 실패"로 판정했다. 두 파일을 지우니 `Checked 200 files` 클린, 테스트 85/85 통과. `Checked N files`의 200 → 202가 이 사례에서 유일한 직접 증거였다.

## 관련 문서

- subagent 브리프와 협업 규칙: [`../agents/ff-workflow.md`](../agents/ff-workflow.md)의 "subagent 협업 규칙"
- 게이트 출력의 개수를 기준선과 대조하는 형태: [`PIT-0018`](./PIT-0018-gate-complexity-regressions-deterministically.md)
