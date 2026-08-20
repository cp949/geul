# PIT-0019 안정 key로 재사용되는 DOM의 억제 키는 이동 후 상태로 맞춘다

- 상태: `ACTIVE`
- 적용 영역: react (table overlay)
- 최초 근거: Issue #17

## 상황과 징후

행/열 핸들을 드래그해 실제로 순서를 옮긴 직후, 브라우저가 자동으로 보내는
합성 click이 핸들 메뉴를 연다. 재정렬 자체는 성공했는데 곧바로 원치 않는
메뉴가 뜬다.

## 근본 원인

`table-handles.tsx`의 핸들 버튼은 `key={`row-${row.rowId}`}`/
`key={`column-${column.columnId}`}`로 안정 key를 쓴다. 드래그로
`moveTableRow`/`moveTableColumn`을 dispatch하면 표가 재렌더되지만, 같은
rowId/columnId를 가진 버튼은 React가 같은 DOM 노드를 재사용한다 — 그
노드의 `onClick`은 리렌더 시점의 최신 클로저로 갱신되고, 그 클로저는
이동 전이 아니라 **이동 후 index**를 캡처한다.

`handlePointerUp`은 드래그 종료 시 `suppressedHandleClickRef.current`에
`${kind}-${sourceIndex}`(이동 전 index)를 저장했다. 뒤이은 합성 click은
이동 후 index를 넘기므로 억제 비교(`suppressed === \`${kind}-${index}\``)가
항상 실패해, 억제가 사실상 무력화됐다.

## 예방 규칙

- React key가 항목의 안정 식별자(rowId, columnId 등)이고 그 항목의
  **위치**(index)가 dispatch로 바뀔 수 있는 컴포넌트에서는, "직전 조작이
  가리킨 대상"을 기억할 때 위치가 아니라 그 안정 식별자로 저장하거나,
  위치를 저장해야 한다면 dispatch **이후** 실제로 반영될 최종 위치로
  저장한다. dispatch 이전 위치(source)를 그대로 저장하면, 안정 key로
  재사용되는 DOM 노드의 다음 이벤트 핸들러는 이미 갱신된 위치를 보고
  있어 비교가 어긋난다.
- "직전 조작 뒤 이어지는 합성 이벤트 억제"를 검증하는 회귀 테스트는
  대상 커맨드를 no-op mock으로 대체하면 DOM이 실제로 안 바뀌어 이 결함을
  잡지 못한다. mock을 실제로 DOM/속성을 갱신하는 구현으로 바꾸거나
  (`data-be-columns`처럼 순서의 권위를 갖는 속성을 직접 갱신), 실제
  브라우저 드래그(`page.mouse.down/move/up`)로 DOM을 재정렬하는 e2e를
  추가한다.
- **Playwright/CDP가 구동하는 Chromium은 `pointerdown`~`pointerup` 사이
  총 이동거리가 일정 임계값(이 저장소에서 실측 약 30px, `steps` 개수와
  무관)을 넘으면 `setPointerCapture`로 정확히 재타겟됨에도 `click`
  이벤트 자체를 합성하지 않는다.** 순수 vanilla HTML(React/앱 코드 배제)
  대조군은 200px 이동에도 정상 발생했으므로 "pointer capture + 원거리
  드래그" 일반의 문제가 아니라 이 앱의 렌더/상태 갱신 경로에 특유한
  현상으로 보이며, 정확한 원인은 규명하지 못했다 — 실제 물리 마우스에도
  같은 임계값이 적용되는지도 확인하지 못했다. 표 재정렬처럼 "눈에 띄는
  이동"이 곧 큰 이동거리를 뜻하는 e2e 시나리오에서 "드래그 뒤 합성
  click" 자체를 검증해야 한다면, 브라우저가 click을 자동으로 보내주길
  기다리지 말고 `ElementHandle.dispatchEvent("click", { detail: 1,
  bubbles: true, cancelable: true })`로 명시적으로 재현한다 — 대상은
  Playwright locator의 `.first()`류 재매칭이 아니라 드래그 시작 전
  `elementHandle()`로 붙잡아 둔, `setPointerCapture`가 실제로 고정했던
  바로 그 DOM 노드여야 한다(DOM 순서가 바뀐 뒤에도 안정 key로 재사용되는
  같은 노드).

## 검증 방법

```bash
pnpm --filter @cp949/geul-react test
pnpm exec playwright test e2e/table-handle.spec.ts --project=chromium
```

## 실제 근거

- `packages/react/src/table-handles.tsx`의 `handlePointerUp`(행/열 재정렬
  useEffect 내부) — 억제 키를 이동 후 `finalIndex`로 저장.
- `packages/react/test/table-handles.test.tsx`의 "실제 moveTableRow로 표
  DOM이 재정렬돼도 뒤이은 click이 메뉴를 열지 않는다"/"실제
  moveTableColumn으로 표 DOM이 재정렬돼도 뒤이은 click이 메뉴를 열지
  않는다".
- `e2e/table-handle.spec.ts`의 "행 핸들 드래그 재정렬 직후 합성 click이
  행 메뉴를 열지 않는다"/"열 핸들 드래그 재정렬 직후 합성 click이 열
  메뉴를 열지 않는다".
- Issue #17.

## 관련 문서

- [PIT-0004 저장 배열 대신 논리 테이블 순서 사용](./PIT-0004-use-logical-table-order.md)
- [PIT-0010 병합 셀에서는 오버레이 hit-test와 selection 이동을 명시적으로 다룬다](./PIT-0010-position-overlays-and-selection-for-merged-cells.md)
