# G-UI-001 dismissible overlay는 공용 hook과 render 후 geometry로 구현한다

- 상태: `ACTIVE`
- 적용 조건: menu·toolbar·popover의 바깥 클릭, Escape, keydown 처리, 위치 계산 또는 focus 처리

## 구현 규칙

- 해제형 오버레이의 바깥 pointerdown과 Escape 닫힘은 `useDismissibleOverlay`를 거친다. 호출부가 리스너를 직접 걸지 않는다. 계약은 [`docs/specs/2026-10-03-use-dismissible-overlay-design.md`](../specs/2026-10-03-use-dismissible-overlay-design.md)다.
- `allowSelectors`는 module-scope 상수로 둔다. 자기 표면 셀렉터를 맨 앞에 둔다. overlay 밖에 그려지는 자식 overlay의 셀렉터도 넣는다.
- 닫는 이유는 `onClose(reason)`으로 받는다. 초점은 훅이 `onClose` 호출 전에 reason별로 처리한다. 호출부가 초점을 옮기지 않는다.

  | reason        | 발생                                                               | 초점                                              |
  | ------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
  | `outside`     | 바깥 pointerdown                                                   | 초점이 overlay 안이었으면 편집기로. 밖이면 그대로 |
  | `escape`      | Escape                                                             | 편집기로                                          |
  | `invalidated` | 호출부의 `close("invalidated")`. 대상 삭제·undo 같은 데이터 무효화 | `outside`와 같다                                  |
  | `trigger`     | 호출부의 `close("trigger")`. 같은 트리거 재클릭                    | 편집기로                                          |

- 바깥 클릭은 dismiss와 클릭 대상의 동작을 함께 실행한다(예외 없음, ADR-0013). 훅은 클릭 대상의 동작을 막지 않는다.
- 바깥 클릭에서 초점이 overlay 밖이면 옮기지 않는다. 클릭 대상이 초점을 받는다. `mousedown`을 `preventDefault`하는 툴바 버튼은 초점을 받지 않아 초점이 overlay 안에 남는다. 훅이 이 경우 편집기로 돌린다. 그대로 언마운트하면 초점이 `<body>`로 떨어진다.
- 자동 닫힘(대상 삭제, undo)은 호출부가 `close("invalidated")`로 부른다. 닫히는 순간 초점이 overlay 안이었는지는 훅이 `allowSelectors`로 판정한다. 별도 ref를 끌어올리지 않는다(`table-handles.tsx`의 `closeMenuOnInvalidation`, Issue #65 항목4).
- Escape는 문서별 LIFO다. 겹쳐 열린 overlay 중 가장 나중에 열린 하나만 닫는다. 부모가 `active`를 꺼서 순서를 맞추지 않는다.
- Escape가 이미 `preventDefault`됐으면 훅은 닫지 않는다. overlay 안 입력창의 모드 취소가 그 경우다. target이 편집기 안이고 overlay 표면 밖이면 닫는다. ProseMirror가 편집기 안 Escape를 막기 때문이다.
- IME 조합 중 Escape는 닫지 않는다.
- 편집기 안 Escape는 호출부의 keydown 리스너와 훅이 둘 다 닫을 수 있다. `onClose`는 멱등으로 만든다.
- 키보드로 연 메뉴는 `focusOnOpen`으로 첫 활성 항목에 초점을 준다. 마우스로 연 경우는 넘기지 않는다. 같은 overlay를 다른 대상으로 다시 열면 `focusKey`를 바꾼다.
- 열림 상태, payload, 재오픈 억제는 호출부가 소유한다. 배치는 `useFixedPlacement`가 맡는다(아래).
- selection·input 관측으로 열리는 overlay는 닫은 상태의 안정 key를 ref에 기록하고 같은 상태의 재관측만 무시한다 — Escape 직후 같은 selection이 다시 관측되어 재오픈할 수 있다. 실제 text나 caret이 바뀌면 다시 열리게 하고, listener는 mount 동안 유지하며 최신 상태는 ref로 읽는다.
- `selectionchange`로 `editor.state`를 읽는 overlay는 이벤트 안에서 한 번 읽고 매크로태스크 뒤에 한 번 더 읽는다. ProseMirror는 selection이나 문서를 바꾸는 state 갱신마다 자기 `selectionchange` 리스너를 떼었다 다시 붙여 overlay 리스너보다 뒤에 호출된다. 이벤트 안의 읽기는 이동 직전 selection을 보고, 캐럿이 대상 블록을 벗어난 이동은 재통지가 없어 overlay가 열린 채 남는다(Issue #229).
- 열린 `position: fixed` overlay의 위치는 `useFixedPlacement`(`packages/react/src/fixed-placement.ts`)가 정한다. 앵커 읽기, 재측정 구독, viewport clamp, clip 판정을 이 hook이 맡는다. 호출부는 `useClampedMenuPosition`을 직접 부르지 않고 `scroll`·`resize`를 직접 구독하지 않는다. 반환한 `{ menuRef, style }`을 overlay 표면에 단다.
- 열림 상태는 `open`과 식별자(`blockId`, 트리거 요소)만 가진다. 클릭 시점의 rect나 좌표를 값으로 보관하지 않는다. 보관한 좌표는 스크롤에서 앵커와 떨어진다.
- 앵커는 `readAnchor: () => { left, top } | null`로 넘긴다. DOM에서 지금 읽는다.
  - 오프셋(예: 트리거 하단 + 4)은 `readAnchor` 안에서 한 번만 정의한다. 열 때와 갱신 때 공식을 따로 두지 않는다. 트리거 아래 메뉴는 `readAnchorBelowTrigger`를 쓴다.
  - 사라질 수 있는 대상은 요소가 아니라 식별자로 찾는다(`blockId`로 DOM 조회). 요소를 보관하면 `isConnected`를 확인한다.
  - DOM을 읽을 수 없으면 `null`을 돌려준다. hook이 마지막 좌표를 유지한다. 닫기는 호출부가 한다.
  - 열린 첫 읽기가 `null`일 수 있으면 `fallbackAnchor`를 준다. 없으면 (0, 0)에 뜬다.
  - 매 렌더 새 함수여도 된다. hook이 ref로 최신 함수만 쓰고 구독을 다시 걸지 않는다.
- 읽는 시점은 렌더 직후다. 이벤트 핸들러가 아니다. 구독은 `open` 동안 owner window의 `scroll`(중첩 scroll container를 위한 capture)·`resize`이고 강제 렌더만 일으킨다. 이벤트 안에서 앵커를 읽어 상태에 쓰지 않는다. 앵커가 다른 overlay 안에 있으면(툴바 안 트리거) 그 overlay는 이벤트 뒤 한 번 더 렌더된 뒤에야 움직여 낡은 rect를 읽는다.
- 앵커를 움직이는 상태는 hook을 부른 컴포넌트 안에 둔다. 다른 컴포넌트의 상태가 앵커를 움직이면 이 hook은 다시 읽지 않는다.
- 렌더 직후 effect는 같은 좌표에서 `setState`를 부르지 않는다. 상태와 같은 값을 ref에도 두고 `Object.is`로 먼저 거른다. 같은 값으로 `setState`하면 `Maximum update depth exceeded`로 렌더가 연쇄한다.
- 선택에 붙는 popover는 `clip: true`를 준다. 앵커 점이 스크롤 컨테이너의 보이는 영역 밖이면 hook이 `visibility`로 숨긴다. 트리거를 따라가는 메뉴는 기본값 `false`다. 열린 자식 메뉴가 있는 툴바는 `clipExempt`를 준다. 호출부가 clip을 직접 판정하지 않고 `style`에 `visibility`를 넣지 않는다. 판정과 면제는 `use-clip-visibility.ts`의 `useClipVisibility`가 소유한다(미디어 툴바·code-block 툴바의 박스 기준 clip은 아래 예외).
- selection으로 여는 overlay의 reader는 열 때 `cloneRange()`로 보관한 `Range`의 rect를 읽는다. 편집 모드에서는 라이브 selection이 입력창으로 옮겨가 읽을 수 없다. 편집 중 가드(`editingRef`)는 열림·닫힘·payload 판정에만 쓴다. 위치 갱신을 막지 않는다. 편집 중에도 스크롤을 따라가야 한다.
- clamp 계산은 `useClampedMenuPosition`이 하고 `useFixedPlacement`가 내부에서 부른다. 렌더된 크기를 재고, CSS transform offset을 clamp 입력에 포함하고, 크기 변경을 `ResizeObserver`로 다시 계산한다. 호출부는 `clampAnchor`(`topLeft`·`topRight`·`centerAbove`·`centerBelow`·`leftOfAnchor`·`aboveLeft`)로 박스와 앵커 좌표의 관계만 고른다.
- 이 규칙의 예외가 있다. 새 overlay는 예외를 근거로 삼지 않고 `useFixedPlacement`를 쓴다.
  - `useClampedMenuPosition` 직접 호출, 기존 호출부: 표 핸들 메뉴, 표 그립 메뉴, 표 셀 서식 메뉴, code-block 언어 콤보박스(툴바·팝오버·more 메뉴). 툴바는 `useClipVisibility`로 clip을 판정한다(아래 박스 기준 clip 예외).
  - `useClampedMenuPosition` 직접 호출, 미디어 툴바 more 메뉴: `useAnchoredSubmenu`가 트리거 rect와 컨테이너 `ResizeObserver`로 앵커를 정한다. React 렌더 없이 컨테이너 폭이 바뀌어도 `ResizeObserver`가 재정렬한다.
  - 미디어 툴바 박스 기준 clip: `useFixedPlacement({ clip })`은 앵커 점 기준이라 박스 판정에 쓸 수 없다. `useClipVisibility`를 직접 부른다. 열린 More 메뉴는 `exempt`로 준다.
  - code-block 툴바 박스와 앵커 점 clip: `useClampedMenuPosition`을 유지한 채 `useClipVisibility`로 박스와 앵커 점을 함께 판정한다. 언어 popover나 more 메뉴가 열려 있으면 `exempt`로 숨기지 않는다. 툴바 안 요소에 포커스가 있어도 훅이 숨기지 않는다.
  - `useFixedPlacement`를 쓰되 상태 좌표를 유지하는 호출부: 표 선택·블록 선택 툴바. 표 셀 서식 메뉴가 표 선택 상태의 좌표를 쓰고, 블록 선택은 하이라이트와 같은 측정을 공유한다. reader가 상태 좌표를 돌려주고 재측정은 기존 구독이 맡는다. 새 overlay는 이 방식을 따르지 않는다.
  - 배치가 아닌 용도의 `scroll` 구독: 블록 선택 하이라이트 재측정.
  - 패키지 밖 소비처: `useFixedPlacement`는 내부 module이다. 공개 표면은 `useClampedMenuPosition`이다.
- 고정 폭 overlay도 viewport가 더 좁을 수 있으므로 양쪽 clamp 여백을 뺀 `max-width`와 `box-sizing: border-box`를 같이 둔다.
- viewport보다 큰 overlay는 `max-height`와 `overflow-y: auto`를 사용한다.
- 스크롤되는 overlay 안에서 alert·상태 메시지 같은 보조 요소를 나머지 항목과 겹치지 않게 항상 보이려면 `position: sticky`로 스크롤 콘텐츠 위에 얹지 않는다 — 실제 오버플로가 일어나면 스크롤되는 콘텐츠 위에 그대로 겹쳐 그려져 그 지점의 포인터 이벤트를 가로챈다(`table-handle-menu.tsx`/`table-cell-format-menu.tsx`, Issue #65 항목3). 대신 overlay를 flex column 2단으로 나눈다 — 스크롤 컨테이너(`flex: 1 1 auto; min-height: 0; overflow-y: auto`)에 항목을 담고, 보조 요소는 그 밖 형제로 둬 배타적 공간을 갖게 한다. `.geul-menu-panel`/`.geul-menu-panel--with-footer`/`.geul-menu-panel__scroll`가 이 패턴의 예다.
- geometry를 여러 기능이 공유하면 DOM rect를 한 번 읽어 파생한다. viewport 좌표를 React key로 쓰지 않는다.
- popup·트리거 keydown은 `handleMenuKeyDown`(`packages/react/src/menu-keyboard.ts`)을 거친다. 호출부마다 순서를 따로 구현하지 않는다. 처리 순서는 다음과 같다.
  - IME 조합 중(`isComposing`)이면 어떤 키도 처리하지 않는다.
  - Escape는 `escape` 인자가 있으면 처리한다. 수식 키 가드보다 앞이다.
  - Enter 자동 반복은 막고 처리하지 않는다. 수식 키 가드보다 앞이다.
  - Ctrl·Alt·Meta가 눌린 키는 처리 없이 물러나고 `preventDefault`도 하지 않는다. `Alt+ArrowLeft`, `Ctrl+Tab` 같은 브라우저·OS 단축키를 막지 않기 위해서다.
  - Shift는 판정에 넣지 않는다. popup의 `Shift+Tab`은 닫기 키다.
  - 처리한 키는 결과가 무효여도 `preventDefault`한다. 후보 0건 상태의 Enter가 기본 Enter(블록 분할)로 새지 않게 한다(Issue #211).
  - popup 자체 Escape는 `escape` 인자로 넘겨 수식 키 가드보다 앞에서 처리한다(Issue #227). 편집기 안 Escape는 훅도 한 번 더 닫으므로 `onClose`는 멱등이다.
  - Shift+Enter처럼 호출부 전용 키는 `handleMenuKeyDown` 호출 전에 거른다. 예: media 캡션 textarea의 줄바꿈.
  - 규칙 밖: `useDismissibleOverlay`의 Escape 리스너. 이 리스너는 `handleMenuKeyDown`을 거치지 않고 `defaultPrevented`와 `isComposing`을 직접 본다.
  - 규칙 밖: 닫힌 트리거의 Enter. 네이티브 click으로 메뉴를 여는 키라서 module을 거치지 않는다(Issue #228).

## 검증

[`G-TST-001`](./G-TST-001-test-overlays-and-keyboard-interactions.md)을 적용한다. 네 viewport 경계와 마지막 항목의 실제 클릭 가능성을 Chromium E2E에서 확인한다.

열린 채 스크롤하는 시나리오를 Chromium E2E로 확인한다. window만, 안쪽 스크롤 컨테이너만, 둘 다 스크롤해도 앵커와 overlay 사이 간격(gapY)이 열 때와 같아야 한다. 기대 간격을 숫자로 단언한다. 스크롤 전과 같은지만 보면 오프셋 상수 변이가 통과한다. 공용 helper는 `e2e/support/anchor-gap.ts`(`expectOverlayFollowsAnchor`)다. 캐럿 메뉴는 `e2e/support/caret-gap.ts`(`expectCaretMenuFollowsCaret`)다. sticky 툴바 위 트리거는 안쪽 스크롤만으로 움직이지 않는다. 그 조합은 window를 함께 스크롤해 증명한다.

## 경계

이 가이드는 앵커(트리거)가 항상 뷰포트 안에 있다고 가정하는 dismissible overlay 전용이다. 앵커 자체가 뷰포트 밖으로 나갈 수 있는 hover·selection 기반 지속형 오버레이(표 핸들, 미디어 리사이즈 핸들 등)는 [`G-UI-003`](./G-UI-003-make-anchor-overlays-natively-scrollable.md)이 소유한다 — 이 가이드의 뷰포트 clamp를 그런 오버레이에 적용하지 않는다(앵커에서 분리돼 어떤 대상을 가리키는지 알 수 없어진다).
