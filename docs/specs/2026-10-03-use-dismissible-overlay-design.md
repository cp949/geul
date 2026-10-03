# Issue #233 — `useDismissibleOverlay` 공개 계약

## 1. 배경과 범위

해제형 오버레이(메뉴, 툴바, 팝업)의 닫힘 규칙은 옛 훅 `useDismissOnOutsideOrEscape`와 호출부 18곳에 흩어져 있었다.

### 옛 훅의 결함

| #   | 결함                                        | 결과                                              |
| --- | ------------------------------------------- | ------------------------------------------------- |
| 1   | Escape 리스너가 오버레이마다 독립이다       | 겹쳐 열린 오버레이가 Escape 한 번에 모두 닫힌다   |
| 2   | 초점 복귀를 호출부가 소유한다               | 호출부마다 규칙이 다르다                          |
| 3   | 입력창 Escape를 소비해도 훅이 막지 못한다   | 호출부가 `IGNORE_ESCAPE_DISMISS` 같은 우회를 둔다 |
| 4   | IME 조합 중 Escape를 구분하지 않는다        | 조합 취소가 오버레이를 닫는다                     |
| 5   | 키보드로 열어도 초점이 항목으로 가지 않는다 | 호출부마다 `focus()` 코드를 따로 둔다             |

### 이 문서가 소유하는 계약

- §2: 공개 export와 시그니처.
- §3: 옵션 표.
- §4: `DismissReason`과 초점 규칙.
- §5: 닫힘 규칙(바깥 pointerdown, Escape, LIFO).
- §6: `focusOnOpen`과 `focusKey`.
- §7: 호출부 책임.
- §8: 마이그레이션.

### 포함·제외

포함:

- `@cp949/geul-react` 공개 API 추가 3건: `useDismissibleOverlay`, `UseDismissibleOverlayOptions`, `DismissReason`.
- 옛 훅 `useDismissOnOutsideOrEscape`와 옵션 타입 `UseDismissOnOutsideOrEscapeOptions` 삭제.
- showcase `17-mention` 예제 이전.

제외:

- 내부 소비처 이전. RD-002–004에서 끝났다.
- 가이드·ADR·README 갱신. RD-005가 맡는다.
- 열림 상태, payload, 재오픈 억제, 배치. 호출부 책임이다(§7).
- 새 런타임 의존성.

### 옛 훅 삭제의 근거

- 옛 훅은 `2cdd02e8`(2026-09-19)에서 export됐다.
- npm 배포본은 0.1.0, 0.1.1뿐이다. 둘 다 옛 훅이 없다.
- 소스 버전 0.1.2는 아직 배포되지 않았다.
- 삭제는 배포된 계약을 깨지 않는다. `@deprecated` 단계를 두지 않는다.
- 전제: 이 삭제가 0.1.2 배포보다 먼저 `main`에 들어간다. 먼저 배포되면 깨지는 변경이 된다.

## 2. 공개 표면

```ts
import {
  useDismissibleOverlay,
  type DismissReason,
  type UseDismissibleOverlayOptions,
} from "@cp949/geul-react";

type DismissReason = "outside" | "escape" | "invalidated" | "trigger";

type UseDismissibleOverlayOptions = {
  open: boolean;
  element: HTMLElement | null;
  allowSelectors: readonly string[];
  onClose: (reason: DismissReason) => void;
  focusOnOpen?: boolean;
  focusKey?: unknown;
};

function useDismissibleOverlay(
  options: UseDismissibleOverlayOptions,
): (reason: DismissReason) => void;
```

- 반환값 `close(reason)`은 호출부가 직접 닫을 때 쓴다.
- `close`의 참조 안정성은 보장하지 않는다. effect 의존성에 넣지 않는다.

## 3. 옵션

| 옵션             | 필수   | 계약                                                                    |
| ---------------- | ------ | ----------------------------------------------------------------------- |
| `open`           | 예     | false면 리스너도 스택 항목도 두지 않는다. 열림 상태는 호출부가 소유한다 |
| `element`        | 예     | 편집기 host. `useFocusEditor(element)`에 넘기는 값과 같다               |
| `allowSelectors` | 예     | 오버레이 자신의 표면 셀렉터. `closest()`로 "안"을 판정한다              |
| `onClose`        | 예     | 닫는다. 열림 상태 갱신은 호출부 책임이다                                |
| `focusOnOpen`    | 아니오 | 기본 false. true면 열릴 때 첫 활성 항목에 초점을 준다                   |
| `focusKey`       | 아니오 | 바뀌면 `focusOnOpen`의 초점을 다시 준다                                 |

### `element`

- 이 문서의 `ownerDocument`에 리스너를 건다.
- 초점 복귀 대상 contenteditable을 여기서 찾는다.
- `null`이면 훅은 아무것도 하지 않는다. 스택 항목도 두지 않는다.

### `allowSelectors`

- pointerdown 대상이나 초점이 이 셀렉터 중 하나에 `closest()`로 걸리면 "오버레이 안"이다.
- 호출부의 모듈 스코프 상수로 넘긴다. 권장이다.
- 훅은 이 값을 ref로 읽는다. 새 배열을 넘겨도 리스너와 스택 항목은 다시 만들어지지 않는다. 동작상 요구는 아니다.
- 오버레이 표면이 여러 개면 모두 넣는다.
- 자식 오버레이가 이 오버레이 밖에 그려지면 자식 셀렉터도 넣는다. 넣지 않으면 자식 안의 클릭이 바깥 클릭이 된다.
- `focusOnOpen`을 쓰면 패널 셀렉터를 맨 앞에 둔다(§6).

### `onClose`

- 훅이 호출한다. 이유는 인자 `reason`이다.
- 초점 복귀는 호출 전에 끝나 있다.
- `reason === "outside"`일 때만 `startTransition` 안에서 호출한다. 호출 자체는 동기다.
- 멱등이어야 한다. 한 번의 닫힘에 두 번 호출될 수 있다(§5.3).

## 4. `DismissReason`과 초점

| reason        | 발생                           | 초점                                               |
| ------------- | ------------------------------ | -------------------------------------------------- |
| `outside`     | 훅. 바깥 pointerdown           | 초점이 오버레이 안이었으면 편집기로. 밖이면 그대로 |
| `escape`      | 훅. Escape                     | 편집기로                                           |
| `invalidated` | 호출부. `close("invalidated")` | `outside`와 같다                                   |
| `trigger`     | 호출부. `close("trigger")`     | 편집기로                                           |

- `invalidated` 용도: 대상이 삭제돼 오버레이가 의미를 잃은 경우.
- `trigger` 용도: 트리거 버튼 재클릭으로 닫는 경우.
- 안/밖 판정은 `close` 호출 시점의 `document.activeElement`와 `allowSelectors`로 한다.
- 초점 정리는 동기다. 오버레이가 언마운트되면 초점이 `<body>`로 떨어져 판정할 수 없기 때문이다.
- `outside`에서 초점이 밖에 있으면 옮기지 않는다. 클릭 대상이 초점을 받는다.

## 5. 닫힘 규칙

### 5.1 바깥 pointerdown

- `ownerDocument`의 `pointerdown`을 bubble 단계에서 듣는다.
- 대상이 `Element`가 아니면 무시한다.
- 대상이 `allowSelectors`에 걸리면 무시한다.
- 그 밖이면 `close("outside")`를 부른다.
- 오버레이마다 독립이다. LIFO를 적용하지 않는다. 바깥 클릭 한 번에 열린 오버레이 모두가 닫힐 수 있다.
- 클릭 대상의 동작은 막지 않는다(ADR 0013).
- `startTransition`으로 미루는 이유: 닫힘이 만든 레이아웃 변화가 같은 클릭의 mouseup·click hit-test를 바꾸지 않게 한다(Issue #155).

### 5.2 Escape와 LIFO

- `ownerDocument`의 `keydown`을 듣는다. `event.key === "Escape"`만 본다.
- 문서별 스택을 둔다. 키는 `element.ownerDocument`다.
  - 한 문서의 여러 편집기가 하나의 스택을 공유한다.
  - `open`이 true가 되는 effect 시점에 스택 맨 뒤에 항목을 넣는다.
  - 가장 나중에 열린 오버레이가 맨 위다.
- Escape는 맨 위 항목 하나만 닫는다. 나머지는 열린 채 둔다.
- 닫을 때 `event.preventDefault()`를 부른다. `stopPropagation()`은 부르지 않는다.
- modifier가 눌린 Escape도 닫는다(Issue #227).

### 5.3 Escape를 건너뛰는 경우

| 조건                                                | 동작                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `event.defaultPrevented`                            | 건너뛴다. 오버레이 안의 모드 취소(입력창 Escape)가 이미 소비한 키다 |
| 예외: target이 `element` 안이고 `allowSelectors` 밖 | 건너뛰지 않고 닫는다                                                |
| `event.isComposing`                                 | 건너뛴다. IME 조합 취소용 Escape다                                  |
| 이 오버레이가 스택 맨 위가 아님                     | 건너뛴다                                                            |

- 예외의 이유: ProseMirror가 편집기 안의 Escape를 습관적으로 `preventDefault`한다.
- 예외의 결과: 호출부의 자체 keydown 리스너가 먼저 닫은 뒤에도 훅이 `onClose`를 한 번 더 부른다. 그래서 `onClose`는 멱등이어야 한다.
- 오버레이 표면 안이나 편집기 밖에서 막힌 키는 모드 취소로 본다. 건너뛴다.

### 5.4 `onClose`·`allowSelectors`의 ref 읽기

- 최신 값을 ref로 읽는다.
- effect 의존성에 넣지 않는다. 의존성이 바뀌면 스택 항목이 맨 위로 다시 올라가 열린 순서가 깨진다.

## 6. `focusOnOpen`과 `focusKey`

### `focusOnOpen`

- 키보드로 열린 경우에만 true로 넘긴다. 마우스로 열린 경우는 초점을 옮기지 않는다.
- 초점 대상: `allowSelectors` 표면 안의 첫 활성 항목.
- 항목 role: `menuitem`, `menuitemcheckbox`, `menuitemradio`, `option`.
- `disabled`와 `aria-disabled="true"`인 항목은 건너뛴다.
- 활성 항목이 없으면 첫 표면에 초점을 준다. 표면에 `tabIndex`가 없으면 효과가 없다.
- 탐색은 문서 전체다. 오버레이가 portal로 `element` 밖에 그려져도 찾는다.
- 셀렉터 순서로 표면을 훑는다. 패널 셀렉터를 `allowSelectors` 맨 앞에 둔다. 트리거가 앞이면 초점이 트리거에 남는다.
- `preventScroll: true`로 초점을 준다.

### `focusKey`

- 값이 바뀌면 `focusOnOpen`의 초점을 다시 준다.
- `open`이 true인 채 payload만 바뀌는 재열림용이다. 예: 열린 메뉴를 다른 대상의 핸들로 다시 연다.
- 스택 항목과 리스너는 다시 만들지 않는다. LIFO 순서가 유지된다.
- `Object.is`로 비교한다.

## 7. 호출부 책임

훅이 소유하지 않는 것:

| 항목                                  | 이유                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| 열림 상태와 payload                   | 오버레이마다 모양이 다르다                                                         |
| 재오픈 억제                           | 예: 닫은 뒤 같은 selection이 재관측돼도 다시 열지 않기. 오버레이마다 조건이 다르다 |
| 배치                                  | `useClampedMenuPosition` 같은 별도 훅이 맡는다                                     |
| 항목 사이 화살표 이동                 | 키 계약이 오버레이마다 다르다                                                      |
| 오버레이 안 입력창의 Escape 모드 취소 | 호출부가 `preventDefault`로 소비하면 훅이 건너뛴다(§5.3)                           |

호출부 요구:

- 오버레이 표면에 `allowSelectors`가 찾을 수 있는 표식(class 또는 data attribute)을 단다.
- `onClose`는 멱등이다.
- 열림 상태를 `open`으로 넘긴다. 닫힌 오버레이에 리스너를 두지 않기 위해서다.

## 8. 마이그레이션

옛 훅은 배포된 적이 없다. 외부 소비자 마이그레이션은 없다. 저장소 안 유일한 잔존 소비처는 showcase `mention-picker.tsx`다.

| 옛 훅              | 새 훅                              |
| ------------------ | ---------------------------------- |
| `active`           | `open`                             |
| `element`          | `element`                          |
| `allowSelectors`   | `allowSelectors`                   |
| `onOutsideDismiss` | `onClose`의 `reason === "outside"` |
| `onEscapeDismiss`  | `onClose`의 `reason === "escape"`  |
| 반환 없음          | `close(reason)`                    |
| 초점 복귀는 호출부 | 훅이 `reason`에 따라 처리          |

`mention-picker.tsx` 이전 시 주의:

- 옛 호출부는 `onEscapeDismiss: IGNORE_ESCAPE_DISMISS`로 Escape를 훅 밖에서 처리했다. element의 상시 keydown 리스너가 `dismissMenuAndFocusEditor`로 닫는다. 이 리스너는 `@query` 텍스트를 문서에 남기고 같은 텍스트로 재열림을 막는다(`dismissedQueryRef`).
- 새 훅에서는 그 리스너가 `preventDefault`한다. target이 편집기 안이므로 §5.3 예외로 훅도 `onClose("escape")`를 부른다.
- `onClose`를 `dismissMenu`로 넘긴다. `dismissMenu`는 같은 캐럿 텍스트를 다시 기록하고 `setMenuState(null)`을 한 번 더 부른다. 멱등이다. DELTA-02가 테스트로 확인한다.
- `e2e/showcase-mention.spec.ts`는 단언 수정 없이 통과해야 한다.

## 9. 알려진 제약

| #   | 제약                                                                                     | 상태                                                        |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | 한글 IME의 Escape `isComposing`을 Chromium 실기로 확인하지 못했다                        | 합성 이벤트만 검증. 가설: 실기에서도 `isComposing`이 true다 |
| 2   | 같은 셀렉터를 공유하는 두 오버레이가 한 문서에 열리면 `focusOnOpen`의 첫 표면이 어긋난다 | 호출부가 자기 표면 셀렉터를 `allowSelectors` 맨 앞에 둔다   |
| 3   | 패널에 활성 항목도 `tabIndex`도 없으면 `focusOnOpen`이 초점을 주지 못한다                | 호출부가 패널에 `tabIndex={-1}`을 단다                      |
| 4   | 바깥 클릭은 LIFO가 아니다                                                                | 의도다                                                      |

## 10. 변경 목록

| 파일                                                            | 변경                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/react/src/index.ts`                                   | `useDismissibleOverlay`, `UseDismissibleOverlayOptions`, `DismissReason` export 추가. 옛 훅과 옛 옵션 타입 export 삭제 |
| `packages/react/src/use-dismissible-overlay.ts`                 | 옵션 타입을 `UseDismissibleOverlayOptions`로 export                                                                    |
| `packages/react/src/use-dismiss-on-outside-or-escape.ts`        | 삭제                                                                                                                   |
| `packages/react/test/use-dismiss-on-outside-or-escape.test.tsx` | 삭제                                                                                                                   |
| `apps/showcase/src/examples/17-mention/mention-picker.tsx`      | 새 훅으로 이전. `IGNORE_ESCAPE_DISMISS` 삭제                                                                           |
| `.changeset/*.md`                                               | 공개 API 추가와 옛 훅 삭제를 적는다                                                                                    |

옛 훅 이름을 인용하는 주석·문서는 RD-005가 정리한다.

## 11. 완료 기준

- [ ] `index.ts`가 §2의 이름 3개를 export한다. 시그니처가 §2와 같다.
- [ ] 저장소 코드에 `useDismissOnOutsideOrEscape`의 정의·import·호출·export가 없다. 주석 언급은 RD-005 범위다.
- [ ] `apps/`에 `IGNORE_ESCAPE_DISMISS`가 없다.
- [ ] `e2e/showcase-mention.spec.ts`가 단언 수정 없이 통과한다.
- [ ] changeset이 공개 API 추가와 옛 훅 삭제를 적는다.
- [ ] `pnpm verify:packages`와 전체 chromium e2e가 통과한다.

## 12. 범위 밖

- reason 추가. 현재 4종으로 고정한다.
- 열림 상태까지 소유하는 컴포넌트형 API(`<DismissibleOverlay>`).
- 편집기 밖 문서(iframe)의 이벤트 중계.
- 한글 IME Escape 실기 검증. 별도 확인 대상이다.
