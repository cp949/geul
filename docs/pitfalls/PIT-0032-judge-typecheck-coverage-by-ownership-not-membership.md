# PIT-0032 typecheck 커버리지는 멤버십이 아니라 소유 기준으로 판정한다

- 상태: `ACTIVE`
- 적용 조건: workspace 밖 TS/JS 소스 또는 dependency가 typecheck 스크립트를 잃거나 얻음
- 지배 가이드: [`G-WKS-003`](../guides/G-WKS-003-typecheck-tests-and-non-package-sources.md)
- 반복 근거: Issue #57 → #95 → #105·#106 — 디렉터리, 게이트 스크립트, config 파일에서 같은 커버리지 오판이 재발 (PIT-0016 후속)

## 오해하기 쉬운 신호

패키지가 `scripts.typecheck`를 잃어도 `turbo run typecheck`는 `exit 0`을 유지한다. 일반 실행의 성공·전체 태스크 수는 줄지만, `--dry=json`의 태스크 항목 수는 유지되고 해당 command만 `<NONEXISTENT>`가 된다. 어느 출력 하나만 보면 전량 통과 또는 그래프 편입으로 오판할 수 있다. 반대 방향도 있다 — 어떤 파일이 `tsc --listFilesOnly` 결과에 나타나는 것(멤버십)은 그 파일이 실제로 typecheck된다는 뜻이 아니다. 다른 tsconfig가 `import`로 끌어오기만 해도 멤버십에는 걸린다.

## 원인

turbo는 package가 task script를 잃어도 dry graph의 항목을 없애지 않고 command를 `<NONEXISTENT>`로 표시한다. 실제 실행에서는 그 package가 빠져 실행 태스크 수가 줄어든다. 커버리지 판정의 소유 기준은 `G-WKS-003`이 소유한다.

## 탐지

```bash
git ls-files | rg '\.(m|c)?[jt]sx?$'   # 추적 소스 전량
```

추적 소스 전량과 루트 typecheck 체인이 실제로 컴파일하는 파일 집합의 차집합을 계산하고, 예외 목록과 정확히 같은지 확인한다. `tests/workspace-typecheck-coverage.test.ts`의 "추적 소스 파일 전량이 체인 프로그램의 컴파일 대상에 들거나 예외 목록에 있다" 계약이 이 판정을 소유한다. turbo 태스크 수나 exit code만으로는 판정하지 않는다.
