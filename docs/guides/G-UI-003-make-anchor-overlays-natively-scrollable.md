# G-UI-003 앵커 오버레이는 뷰포트 이탈 시에도 네이티브 스크롤로 도달 가능해야 한다

- 상태: `ACTIVE`
- 적용 조건: 특정 DOM 요소(행·열·미디어 경계 등)에 시각적으로 고정되고, 바깥 클릭·Escape로 닫히지 않는 hover·selection 기반 오버레이 구현 또는 위치 계산 변경

## 구현 규칙

- `position: fixed`를 쓰지 않는다 — 앵커가 뷰포트 밖으로 완전히 나가면 네이티브 `Element.scrollIntoView()`·포커스 시 자동 스크롤·Playwright `.click()`의 자동 스크롤이 전부 no-op이다(`fixed`는 정의상 스크롤에 영향받지 않는 위치라 브라우저가 스크롤 자체를 생략한다, Issue #163).
- 대신 `position: absolute`를 쓰고 positioned ancestor를 두지 않는다(오버레이 트리와 실제 대상 DOM 사이 어떤 조상에도 `position`/`transform`/`filter`/`perspective`를 걸지 않는다) — 초기 containing block(문서 좌표계)에서 렌더시킨다.
- 좌표는 `getBoundingClientRect()`(viewport-relative)가 아니라 `rect.left/top + window.scrollX/scrollY`(page-relative)로 계산한다.
- 창 스크롤로는 재계산하지 않는다 — absolute 요소는 창 스크롤에 자동으로 따라오므로 스크롤 이벤트 리스너로 강제 재렌더할 필요가 없다. resize나 앵커 자체의 크기·위치 변화(레이아웃을 바꾸는 DOM mutation 등)에서 재계산한다.
- 안쪽 스크롤 컨테이너(소비 앱이 에디터를 `overflow: auto` 영역에 두는 경우)는 다르다. 그 스크롤은 앵커의 page 좌표를 바꾸는데 absolute 요소는 제자리에 남는다. `window`에 `scroll`을 capture로 구독해 다시 읽는다(`useSelectionRefresh`가 이미 그렇게 한다).
  - hover로 뜨는 앵커 오버레이(미디어 그립·callout 트리거 등)도 이 구독 대상이다.
  - hover 판정에 의한 재렌더에 기대지 않는다. 포인터가 같은 블록 위에 있으면 hover 판정이 바뀌지 않아 렌더가 일어나지 않는다.
  - hover 대상이 있는 동안만 구독하려면 `useSelectionRefresh`의 `enabled` 옵션을 쓴다(기본 `true`). `false`면 구독도 초기 호출도 하지 않는다.
- 오버레이는 컨테이너 바깥에 그려져 안쪽 스크롤 컨테이너가 잘라내지 못한다. 오버레이 자신의 박스가 그 컨테이너의 보이는 영역 안에 있을 때만 보이게 한다 — `scroll-clip.ts`의 `readScrollClipBoxes`로 영역을 읽고 `syncClipVisibility`로 `visibility`를 갱신한다.
  - 세로는 오버레이 박스가 완전히 안쪽일 때만 보인다. 경계에 걸쳐 잘린 채 떠 있지 않게 한다. 가로는 겹치기만 하면 보인다.
  - `unmount`나 `display: none`이 아니라 `visibility`를 쓴다. 레이아웃 박스와 실측 높이가 남는다. 미디어 캡션은 그 높이를 문서 flow에 되먹인다.
  - 선택에 붙는 popover(서식·링크·표 선택·블록 선택 툴바)는 박스가 아니라 앵커 점으로 판정한다. `useFixedPlacement`의 `clip` 옵션이 `syncAnchorClipVisibility`를 불러 판정한다. 호출부는 직접 부르지 않는다([`G-UI-001`](./G-UI-001-build-dismissible-overlays.md)). 앵커 위나 아래에 붙어 앵커가 영역 안이어도 박스가 경계 밖으로 조금 삐져나올 수 있고, 그때 숨기면 첫 줄을 선택할 때 popover가 사라진다. 앵커가 영역 밖으로 스크롤돼 나가면 popover는 뷰포트 가장자리로 clamp된 채 영역 밖에 남으므로 숨긴다.
  - 소비 앱의 sticky 요소(상단 고정 툴바 등)는 오버레이보다 `z-index`가 낮아야 한다. popover(10)가 그 밑으로 깔려 가려지면 안 된다. 캡션(5)만 그 밑으로 지나가게 하려면 5와 10 사이 값을 쓴다.
  - 편집 중인 입력과 드래그 중인 핸들은 숨기지 않는다. 숨기면 포커스·draft·pointer capture를 잃는다.
  - 열린 팝업(선택기 등)을 연 트리거도 숨기지 않는다. 숨기면 포커스를 잃는다. 이 면제는 팝업이 열린 앵커의 트리거에만 준다. hover가 다른 앵커로 옮겨 간 트리거는 박스로 판정한다.
  - 오버레이의 `style` prop에 `visibility`를 직접 두지 않는다. 다음 렌더가 덮어쓴다.
- 뷰포트 clamp를 하지 않는다 — `G-UI-001`의 dismissible overlay와 달리, 이 카테고리는 앵커에서 분리되면 어떤 대상(행·열·경계)을 가리키는지 사용자가 알 수 없어진다. 도달성은 "핸들을 사용자 쪽으로 당겨오기"가 아니라 "네이티브 스크롤이 앵커를 뷰포트로 데려오게 두기"로 확보한다.
- pointer 이벤트 기반 드래그·히트테스트(재정렬 대상 판정, 리사이즈 delta 계산 등)는 `event.clientX/clientY`(viewport-relative)와 이 규칙의 geometry(page-relative)를 섞어 비교하지 않는다 — 좌표계를 명시적으로 통일한다.
- 이 접근은 오버레이 트리와 대상 DOM 사이에 `transform`/`filter`를 건 조상이 없다는 전제에 기댄다. 소비자 앱이 그런 조상을 두면 깨진다 — 패키지가 소비자 CSS까지 통제할 수 없으므로 강제하지 않는다.

## 경계

[`G-UI-001`](./G-UI-001-build-dismissible-overlays.md)과 구분한다. G-UI-001은 바깥 클릭·Escape로 닫히고 앵커(트리거)가 항상 뷰포트 안에 있다고 가정하는 dismissible overlay(메뉴·툴바·팝오버) 전용이다. 이 가이드는 hover·selection으로 열리고 명시적으로 닫히지 않으며, 앵커 자체가 뷰포트 밖으로 나갈 수 있는 지속형 오버레이(표 핸들, 미디어 리사이즈 핸들 등) 전용이다. 두 카테고리를 한 가이드에 두면 "뷰포트 clamp" 규칙과 "clamp 금지" 규칙이 충돌하는 것처럼 읽힌다.

## 검증

[`G-TST-001`](./G-TST-001-test-overlays-and-keyboard-interactions.md)을 적용하되, fixed overlay의 clamp 검증 대신 앵커가 뷰포트 밖으로 나간 뒤 네이티브 `scrollIntoView()`·Tab 포커스·Playwright 클릭 각각이 실제로 앵커를 뷰포트 안으로 데려오는지 Chromium E2E로 확인한다.

안쪽 스크롤 컨테이너 대응은 jsdom으로 재현하지 못한다(레이아웃이 없다). 단위 테스트는 `stubRect`로 rect를 주입해 판정 로직을 보고, 실제 위치는 Chromium E2E로 확인한다. 예: `e2e/showcase-static-toolbar-overlays.spec.ts`.

hover 기반 앵커 오버레이는 포인터를 멈춘 채 스크롤해 확인한다. 포인터가 움직이면 hover 판정이 다시 일어나 위치 갱신 누락이 가려진다. `e2e/support/anchor-gap.ts`의 `scrollPage`로 `scrollTop`을 대입하고 `expectOverlayTopAlignedWithAnchor`로 오버레이 상단과 앵커 상단의 y가 같은지 단언한다. 예: `e2e/showcase-static-toolbar-media-handle.spec.ts`.
