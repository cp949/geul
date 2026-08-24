# PIT-0008 TypeScript는 callback 밖 객체 narrowing을 보존하지 않는다

- 상태: `ACTIVE`
- 적용 조건: ProseMirror node·position을 `forEach` callback에서 찾고 callback 밖에서 사용
- 정상 가이드: [`G-EDT-001`](../guides/G-EDT-001-keep-editor-commands-atomic.md)
- 최초 근거: R1

## 오해하기 쉬운 신호

Vitest는 통과하지만 `tsc`가 callback 밖 변수의 type을 `never` 또는 nullable로 판정한다. 중간 `const` 재바인딩도 해결하지 않는다.

## 원인과 회피

TypeScript control-flow analysis가 callback 실행과 외부 mutation을 보장하지 않는다. callback에서는 position만 찾고, 좁힌 뒤 `doc.nodeAt(position)`으로 node를 다시 조회한다.

## 탐지

```bash
pnpm --filter @cp949/geul-core typecheck
```
