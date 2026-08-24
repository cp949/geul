# PIT-0012 Firefox·WebKit은 ClipboardEventInit의 clipboardData를 보존하지 않는다

- 상태: `ACTIVE`
- 적용 조건: E2E에서 paste event 합성
- 정상 가이드: [`G-TST-001`](../guides/G-TST-001-test-overlays-and-keyboard-interactions.md)
- 최초 근거: R1

## 오해하기 쉬운 신호

`new ClipboardEvent("paste", { clipboardData })`가 Chromium에서는 동작하지만 Firefox·WebKit에서 `clipboardData.types`를 비운다.

## 원인과 회피

평범한 `Event("paste", { bubbles: true, cancelable: true })`를 만들고 `Object.defineProperty`로 `clipboardData`를 설정한다. production이 `instanceof ClipboardEvent`로 분기하지 않아야 한다.

## 탐지

```bash
pnpm exec playwright test e2e/table-paste.spec.ts --project=chromium --project=firefox --project=webkit
```
