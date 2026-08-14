# PIT-0008 클로저 경계를 넘는 객체 타입 좁히기를 피한다

- 상태: `ACTIVE`
- 적용 영역: core, ProseMirror position/node 탐색
- 최초 근거: R1 슬라이스 4 작업공간 변경 (`moveBlockBefore`/`duplicateBlock`/`deleteBlock` 구현)

## 상황과 징후

`let x: T | null = null`을 선언하고 `Node.forEach`/`Fragment.forEach` 같은 콜백 안에서 객체(`ProseMirror Node` 등)를 대입한 뒤, 콜백 밖에서 `if (x === null) return;`으로 좁히고 이어서 `x`의 프로퍼티에 접근하면, 이 저장소가 사용하는 TypeScript 7 네이티브(Go 포팅) 컴파일러가 `x`를 `never`로 잘못 좁혀 `Property '...' does not exist on type 'never'` 오류를 낸다. 같은 스코프에서 함께 좁히는 `number | null` 같은 원시 타입 변수는 영향받지 않는다. `tsc --noEmit`으로 최소 재현에 성공했으며(`packages/core/src/__repro*.ts` 임시 파일), 클로저 없이 직접 대입하면 재현되지 않는다.

## 근본 원인

TypeScript 7 네이티브 컴파일러가 클로저 내부에서 재대입된 **객체 타입** `let` 바인딩의 control-flow narrowing을 콜백 호출 지점 이후 정확히 복원하지 못하는 회귀로 보인다(원시 타입은 정상 동작). 기존 코드(`insertParagraphAfter`, `setBlockType` 등)가 이 문제를 겪지 않은 이유는 애초에 노드 객체 자체가 아니라 `number`/`string` 같은 원시 필드만 클로저 밖으로 들고 나왔기 때문이다.

## 예방 규칙

- `doc.forEach`로 위치만 먼저 찾고(`let position: number | null = null`), 좁힌 뒤 `doc.nodeAt(position)`으로 노드를 **콜백 밖에서 다시 조회**한다. 노드 참조 자체를 클로저 밖 `let`에 담지 않는다.
- 객체 타입을 클로저 밖으로 전달해야 한다면 중간 `const`로 한 번 더 바인딩해도 이 버그는 해결되지 않는다(직접 확인함) — `nodeAt()`류의 재조회가 유일하게 검증된 우회다.
- 새 core 명령을 추가할 때 `pnpm --filter @cp949/geul-core typecheck`(또는 `tsc -b`)를 유닛 테스트와 별도로 반드시 실행한다. vitest는 esbuild로 타입을 벗겨내므로 이 오류를 잡지 못한다.

## 검증 방법

```bash
pnpm --filter @cp949/geul-core typecheck
```

## 실제 근거

- `packages/core/src/editor-controller.ts`의 `findTopLevelBlockPosition`과 이를 사용하는 `moveBlockBefore`/`duplicateBlock`/`deleteBlock` — 위치를 원시 타입으로 찾은 뒤 `doc.nodeAt(position)`으로 재조회.
- R1 슬라이스 4 Issue [#3](https://github.com/cp949/geul/issues/3) 댓글에 재현·우회 과정을 기록함.

## 관련 문서

- [PIT-0003 편집기 트랜잭션 원자성 유지](./PIT-0003-keep-editor-transactions-atomic.md)
