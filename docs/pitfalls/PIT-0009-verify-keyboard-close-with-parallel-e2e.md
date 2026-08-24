# PIT-0009 Escape 직후 selection event가 overlay를 다시 열 수 있다

- 상태: `ACTIVE`
- 적용 조건: selection·input 관측으로 열리는 overlay에 Escape 닫기 추가
- 정상 가이드: [`G-TST-001`](../guides/G-TST-001-test-overlays-and-keyboard-interactions.md), [`G-UI-001`](../guides/G-UI-001-build-dismissible-overlays.md)
- 최초 근거: R1

## 오해하기 쉬운 신호

단독 E2E에서는 닫히지만 병렬 실행에서 같은 selection 상태가 다시 관측되어 overlay가 재오픈한다.

## 원인과 회피

닫은 상태의 안정 key를 ref에 기록하고 같은 상태의 재관측만 무시한다. 실제 text나 caret이 바뀌면 다시 열 수 있어야 한다. listener는 mount 동안 유지하고 최신 상태는 ref로 읽는다.

## 탐지

```bash
npx playwright test <spec> -g '<닫기 시나리오>' --repeat-each=20 --workers=5
```
