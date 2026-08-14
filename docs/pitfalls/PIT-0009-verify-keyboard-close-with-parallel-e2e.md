# PIT-0009 UI를 닫는 키보드 핸들러는 병렬 e2e로 검증한다

- 상태: `ACTIVE`
- 적용 영역: react, e2e
- 최초 근거: R1 슬라이스 4 리뷰 (`SlashMenu`의 Escape 처리)

## 상황과 징후

`selectionchange`/`input` 이벤트를 구독해 캐럿 상태로부터 오버레이(메뉴, 툴바 등)를 열고 닫는 컴포넌트에서, Escape 등 키보드로 오버레이를 닫는 시나리오가 Playwright 단일 워커(`--workers=1`)에서는 항상 통과하다가 병렬 실행(`--workers=5` 등, 기본 `pnpm test:e2e`)에서만 10~25% 확률로 간헐 실패한다. 실패 시 스냅샷을 보면 닫혔어야 할 오버레이가 여전히 열려 있다.

## 근본 원인

Escape 같은 키는 보통 오버레이 UI만 닫고 오버레이를 열게 만든 근본 상태(입력된 텍스트, 캐럿 위치 등)는 그대로 둔다. 브라우저의 `selectionchange`는 대응하는 입력 이벤트보다 늦게, 때로는 중복으로 발생할 수 있다(스펙상 타이밍이 보장되지 않음). CPU가 몰리는 병렬 e2e 환경에서 이 지연이 커지면, Escape 처리 직후 지연됐던 `selectionchange`가 뒤늦게 도착해 **닫기 직전과 동일한 상태**를 다시 읽어 오버레이를 즉시 재오픈한다. 단일 워커에서는 지연이 작아 거의 재현되지 않는다.

## 예방 규칙

- selectionchange/input 기반으로 오버레이를 여닫는 컴포넌트에 Escape(또는 유사한 "닫기" 키)를 추가할 때는, 닫은 시점의 키(예: `blockId`+원문 텍스트)를 ref에 기록해두고, 그 키와 정확히 같은 상태를 다시 관측하면 재오픈을 무시한다. 실제로 상태가 바뀌면(텍스트 변경, 캐럿 이동 등) 정상적으로 다시 열릴 수 있어야 한다.
- 이런 "닫기" 시나리오를 다루는 e2e 테스트는 작성 직후 반드시 `--workers=5`(또는 프로젝트 기본 워커 수) 병렬로 최소 수십 회 반복 실행해 간헐 실패가 없는지 확인한다. `--workers=1`만으로는 이 클래스의 레이스를 못 잡는다.
  ```bash
  npx playwright test <spec> -g "<제목>" --repeat-each=20 --workers=5
  ```
- 리스너 등록 자체를 상태 변화에 의존해 매번 해제·재등록하지 않는다(예: `useEffect` deps에 매 keystroke마다 바뀌는 객체를 직접 넣지 않음). 마운트 동안 한 번만 등록하고, 최신 상태는 ref로 읽는다.

## 검증 방법

```bash
npx playwright test e2e/slash-menu.spec.ts -g "closes the menu on Escape" --repeat-each=25 --workers=5
```

## 실제 근거

- `packages/react/src/slash-menu.tsx`의 `dismissedQueryRef` — Escape 시점의 `blockId`+텍스트를 기록해 같은 상태의 재오픈을 무시한다.
- R1 슬라이스 4 Issue [#3](https://github.com/cp949/geul/issues/3) 댓글에 재현·수정 과정을 기록함(수정 전 `--workers=5` 반복 실행 여러 회차에서 10~25% 간헐 실패 관측, 수정 후 동일 조건 150회 연속 전부 통과).

## 관련 문서

- [PIT-0008 클로저 경계를 넘는 객체 타입 좁히기 회피](./PIT-0008-avoid-object-narrowing-across-closures.md)
