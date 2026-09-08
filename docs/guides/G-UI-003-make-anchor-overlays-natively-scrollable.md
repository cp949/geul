# G-UI-003 앵커 오버레이는 뷰포트 이탈 시에도 네이티브 스크롤로 도달 가능해야 한다

- 상태: `ACTIVE`
- 적용 조건: 특정 DOM 요소(행·열·미디어 경계 등)에 시각적으로 고정되고, 바깥 클릭·Escape로 닫히지 않는 hover·selection 기반 오버레이 구현 또는 위치 계산 변경

## 구현 규칙

- `position: fixed`를 쓰지 않는다 — 앵커가 뷰포트 밖으로 완전히 나가면 네이티브 `Element.scrollIntoView()`·포커스 시 자동 스크롤·Playwright `.click()`의 자동 스크롤이 전부 no-op이다(`fixed`는 정의상 스크롤에 영향받지 않는 위치라 브라우저가 스크롤 자체를 생략한다, Issue #163).
- 대신 `position: absolute`를 쓰고 positioned ancestor를 두지 않는다(오버레이 트리와 실제 대상 DOM 사이 어떤 조상에도 `position`/`transform`/`filter`/`perspective`를 걸지 않는다) — 초기 containing block(문서 좌표계)에서 렌더시킨다.
- 좌표는 `getBoundingClientRect()`(viewport-relative)가 아니라 `rect.left/top + window.scrollX/scrollY`(page-relative)로 계산한다.
- 일반 페이지 스크롤로는 재계산하지 않는다 — absolute 요소는 스크롤에 자동으로 따라오므로 스크롤 이벤트 리스너로 강제 재렌더할 필요가 없다. resize나 앵커 자체의 크기·위치 변화(레이아웃을 바꾸는 DOM mutation 등)에서만 재계산한다.
- 뷰포트 clamp를 하지 않는다 — `G-UI-001`의 dismissible overlay와 달리, 이 카테고리는 앵커에서 분리되면 어떤 대상(행·열·경계)을 가리키는지 사용자가 알 수 없어진다. 도달성은 "핸들을 사용자 쪽으로 당겨오기"가 아니라 "네이티브 스크롤이 앵커를 뷰포트로 데려오게 두기"로 확보한다.
- pointer 이벤트 기반 드래그·히트테스트(재정렬 대상 판정, 리사이즈 delta 계산 등)는 `event.clientX/clientY`(viewport-relative)와 이 규칙의 geometry(page-relative)를 섞어 비교하지 않는다 — 좌표계를 명시적으로 통일한다.
- 이 접근은 오버레이 트리와 대상 DOM 사이에 `transform`/`filter`를 건 조상이 없다는 전제에 기댄다. 소비자 앱이 그런 조상을 두면 깨진다 — 패키지가 소비자 CSS까지 통제할 수 없으므로 강제하지 않는다.

## 경계

[`G-UI-001`](./G-UI-001-build-dismissible-overlays.md)과 구분한다. G-UI-001은 바깥 클릭·Escape로 닫히고 앵커(트리거)가 항상 뷰포트 안에 있다고 가정하는 dismissible overlay(메뉴·툴바·팝오버) 전용이다. 이 가이드는 hover·selection으로 열리고 명시적으로 닫히지 않으며, 앵커 자체가 뷰포트 밖으로 나갈 수 있는 지속형 오버레이(표 핸들, 미디어 리사이즈 핸들 등) 전용이다. 두 카테고리를 한 가이드에 두면 "뷰포트 clamp" 규칙과 "clamp 금지" 규칙이 충돌하는 것처럼 읽힌다.

## 검증

[`G-TST-001`](./G-TST-001-test-overlays-and-keyboard-interactions.md)을 적용하되, fixed overlay의 clamp 검증 대신 앵커가 뷰포트 밖으로 나간 뒤 네이티브 `scrollIntoView()`·Tab 포커스·Playwright 클릭 각각이 실제로 앵커를 뷰포트 안으로 데려오는지 Chromium E2E로 확인한다.
