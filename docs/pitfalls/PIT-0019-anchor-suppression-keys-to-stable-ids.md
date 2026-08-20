# PIT-0019 안정 key로 재사용되는 DOM의 억제 키는 안정 식별자로 고정한다

- 상태: `ACTIVE`
- 적용 영역: react, e2e (table overlay, playwright)
- 최초 근거: Issue #17 (Option A 전환: Issue #63)

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

최초 구현(Issue #17)은 `handlePointerUp`에서 드래그 종료 시
`suppressedHandleClickRef.current`에 `${kind}-${sourceIndex}`(이동 전
index)를 저장했다. 뒤이은 합성 click은 이동 후 index를 넘기므로 억제
비교(`suppressed === \`${kind}-${index}\``)가 항상 실패해, 억제가 사실상
무력화됐다.

## 예방 규칙

- React key가 항목의 안정 식별자(rowId, columnId 등)이고 그 항목의
  **위치**(index)가 dispatch로 바뀔 수 있는 컴포넌트에서는, "직전 조작이
  가리킨 대상"을 **위치가 아니라 그 안정 식별자로 저장한다**(Option A,
  Issue #63) — 위치는 성공/실패와 무관하게 애초에 저장 대상에서 뺀다.
  위치를 저장하는 대안(Option B, Issue #17의 최초 구현)도 시도했으나
  버렸다: dispatch가 실패해 반영되지 않았을 때(예: 병합 셀 경계를
  가로지르는 이동 거부) 위치를 갱신하지 않는 분기가 매번 따라붙고,
  dispatch 이전 위치(source)를 그대로 저장해도 안정 key로 재사용되는 DOM
  노드의 다음 이벤트 핸들러는 이미 갱신된 위치를 보고 있어 비교가
  어긋난다. 안정 식별자는 커맨드 성공/실패와 무관하게 안 바뀌므로 이
  분기 자체가 없어진다. 렌더 시점에 그 안정 식별자가 이미 스코프에
  있다면(핸들 props로 넘기는 등) 전환 비용은 작다.
- **안정 식별자가 빈 문자열일 수 있는 컴포넌트**(`getAttribute(...) ??
  ""` 폴백 등)에서는 빈 id를 그대로 억제 키에 쓰지 않는다 — 서로 다른
  항목이 같은 빈 키로 충돌해 엉뚱한 항목을 억제하거나 억제를 풀어준다.
  빈 id면 **억제를 아예 걸지 않는다**(fail-open) — index 폴백은 이 절의
  첫 규칙이 없애려는 위치 기반 분기를 되살린다.
- **억제 키를 "뒤이은 이벤트가 소비하며 비운다"로만 설계하지 않는다.** 그
  이벤트가 오지 않으면(아래 Chromium 관측처럼) 키가 남아, 사용자가 나중에
  같은 대상을 진짜로 조작할 때 한 번 삼켜진다. 억제 키는 **새 제스처를
  시작하는 시점**(pointerdown)에도 비운다 — 같은 제스처의 pointerdown은
  키를 저장하는 pointerup보다 항상 먼저 오므로 의도한 억제는 깨지지 않는다.
  `block-side-menu.tsx`의 `handlePointerDownOnHandle`이 이 규칙을 따른다.

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
  드래그" 일반의 문제는 아니다. 다만 대조군은 React뿐 아니라
  contenteditable, ProseMirror, pointermove마다 재렌더되는 고정
  오버레이도 함께 배제했으므로 정확한 원인은 규명하지 못했다 — 유력한
  후보로 (a) contenteditable에 인접한 콘텐츠에서 브라우저가 네이티브
  드래그 제스처로 판단해 click을 억제하는 경로, (b) pointer capture가
  pointer 이벤트만 재타겟하고 호환 mouse/click 이벤트의 판정에는 영향을
  주지 않는 경로를 후속 조사(Issue #64)로 남긴다. 실제 물리 마우스에도
  같은 임계값이 적용되는지도 확인하지 못했다(Issue #64). 표 재정렬처럼
  "눈에 띄는 이동"이 곧 큰 이동거리를 뜻하는 e2e 시나리오에서 "드래그 뒤 합성
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

- `packages/react/src/table-handles.tsx`의 `ReorderState.sourceId` —
  pointerdown 시점의 rowId/columnId를 그대로 보관한다.
- `packages/react/src/table-handles.tsx`의 `handlePointerUp`(행/열 재정렬
  useEffect 내부) — 억제 키를 `${kind}-${current.sourceId}`로 저장한다.
  커맨드의 `Result`는 이동 자체(성공 시 dispatch)에만 쓰고, 억제 키
  저장 여부와는 무관하다. `sourceId`가 빈 문자열이면 저장을 건너뛴다.
- `packages/react/src/table-handles.tsx`의
  `handlePointerDownOnReorderHandle` — 새 제스처 시작 시 억제 키를 비운다.
- `packages/react/test/table-handles.test.tsx`의 "실제 moveTableRow로 표
  DOM이 재정렬돼도 뒤이은 click이 메뉴를 열지 않는다"/"실제
  moveTableColumn으로 표 DOM이 재정렬돼도 뒤이은 click이 메뉴를 열지
  않는다".
- `packages/react/test/table-handles.test.tsx`의 "moveTableRow가
  실패해도(예: 병합 셀 경계) 뒤이은 click은 여전히 억제된다" — 안정
  식별자 기준 억제가 커맨드 성공/실패와 무관함을 검증한다(Option A).
- `packages/react/test/table-handles.test.tsx`의 "rowId가 빈 문자열이면
  억제를 걸지 않는다" — 빈 id의 fail-open을 검증한다(Option A).
- `e2e/table-handle.spec.ts`의 "행 핸들 드래그 재정렬 직후 합성 click이
  행 메뉴를 열지 않는다"/"열 핸들 드래그 재정렬 직후 합성 click이 열
  메뉴를 열지 않는다".
- `packages/react/test/table-handles.test.tsx`의 "재정렬 뒤 합성 click이
  오지 않아도 다음 진짜 click은 억제되지 않는다"와
  `e2e/table-handle.spec.ts`의 "재정렬 뒤 브라우저가 click을 합성하지
  않아도 다음 진짜 click은 행 메뉴를 연다" — 억제 키 수명 규칙의 회귀
  테스트(후자는 실제 Chromium에서 RED를 확인).
- Issue #17.
- Issue #63 (Option A 전환 검토·구현, 종료).
- Issue #64 (Chromium이 임계값 초과 드래그 뒤 click을 합성하지 않는
  원인 규명과 실 물리 마우스 확인). 이 관측은 현재 구현의 정확성에
  영향을 주지 않는다 — 억제 키가 안정 식별자라 click 도착 순서와
  무관하고, 새 제스처 pointerdown이 키를 비워 click 미도착에도
  대비한다. 남은 것은 위 e2e 작성 기법 규칙의 적용 범위 확정이다.

## 관련 문서

- [PIT-0004 저장 배열 대신 논리 테이블 순서 사용](./PIT-0004-use-logical-table-order.md)
- [PIT-0010 병합 셀에서는 오버레이 hit-test와 selection 이동을 명시적으로 다룬다](./PIT-0010-position-overlays-and-selection-for-merged-cells.md)
