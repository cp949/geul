# PIT-0034 wall-clock 상한이 회귀와 부하 잡음을 가르지 못할 수 있다

- 상태: `ACTIVE`
- 적용 조건: 복잡도 회귀를 시간 상한(`toBeLessThan`, timeout)만으로 게이트
- 지배 가이드: [`G-TST-004`](../guides/G-TST-004-test-complexity-deterministically.md)
- 반복 근거: Issue #12와 #58 — 복잡도·비용 게이트를 시간 상한으로 거는 선택이 두 작업에서 반복됐고, #58에서 동시 실행 간헐 실패로 드러남 (PIT-0018 후속)

## 오해하기 쉬운 신호

`pnpm test`(모노레포 동시 실행) 부하 상태의 **정상 코드** wall-clock 실측이 **회귀 코드**의 무부하 실측과 겹칠 수 있다 — 단독 실행에서는 안정적으로 통과하다가 동시 실행에서만 간헐 실패하고, 상한을 올리면 이번엔 회귀 자체가 상한 아래로 숨는다.

## 원인

측정된 wall-clock은 알고리즘 비용, 무관한 고정 비용, 동시 실행 중인 다른 프로세스와의 코어 경쟁의 합이라 시간 단언이 셋을 구분하지 못한다. 분포 겹침 확인, 결정적 작업량 대체와 구조적 입력 상한 예외의 규칙은 `G-TST-004`가 소유한다.

## 탐지

```bash
grep -rnE "toBeLessThan\(.*(TIME_LIMIT|LIMIT_MS)|performance\.now\(\)|[Tt]imeout" packages/*/test/
```

새로 거는 시간 상한마다 `G-TST-004`가 요구하는 분포 겹침 근거 주석이 있는지 확인한다.
