---
status: accepted
---

# 앵커 오버레이(표 핸들 등)는 `position: fixed` 대신 page-relative `absolute`로 좌표를 계산한다

`packages/react/src/table-handle-overlays.tsx`의 표 핸들 오버레이 6종은 `position: fixed`로 뜨고 좌표를 `getBoundingClientRect()`(viewport-relative)로 스크롤마다 재계산했다(Issue #163). `position: fixed` 요소는 정의상 스크롤에 영향받지 않는 위치라, 브라우저 네이티브 `Element.scrollIntoView()`·포커스 시 자동 스크롤·Playwright `.click()`의 자동 스크롤이 전부 no-op이 된다 — 앵커(행·열·표 경계)가 뷰포트 밖으로 밀려나면 키보드 Tab으로도 자동화 클릭으로도 영구히 도달할 수 없다(RD-001 DELTA-01 실측 재현: 초점은 이동하나 `scrollY` 불변, bounding box는 뷰포트 밖 유지).

대안으로 (A) `fixed`를 유지한 채 focus 이벤트에서 수동으로 `window.scrollBy`하는 방법과 (C) 기존 `use-clamped-menu-position.ts`의 뷰포트 clamp 패턴(G-UI-001)을 재사용하는 방법을 검토했다. A는 키보드 경로만 고치고 Playwright 클릭 자동스크롤·명시적 `scrollIntoView()` 호출 경로는 여전히 no-op으로 남는다. C는 행/열 재정렬 핸들처럼 특정 행·열과 시각적으로 정확히 일치해야 의미가 성립하는 핸들에서, clamp가 앵커에서 핸들을 분리시켜 어느 행/열을 가리키는지 알 수 없게 만든다.

대신 `position: absolute`를 쓰되 positioned ancestor 없이(오버레이 트리와 대상 DOM 사이 어떤 조상에도 `position`/`transform`/`filter`/`perspective`를 두지 않음) 초기 containing block(문서 좌표계)에서 렌더시키고, 좌표를 `rect.left/top + window.scrollX/scrollY`(page-relative)로 계산한다. 오버레이 트리(`TableHandles`)는 `.geul-editor`의 DOM 자손이 아니라 소비자 앱 레이아웃의 형제 컴포넌트(`SlashMenu`가 마운트)라 `.geul-editor`에 `position: relative`를 걸어도 이 계산의 positioning context가 되지 못한다 — 그래서 별도 wrapper 없이 문서 좌표계에 기댄다. 네이티브 `scrollIntoView()`·포커스 스크롤·Playwright 자동스크롤이 모두 표준 브라우저 동작으로 한 번에 해결되고, `table-handles.tsx`의 페이지 스크롤 강제 재렌더 리스너가 불필요해진다.

## Consequences

- 이 전략은 새 가이드 [`G-UI-003`](../guides/G-UI-003-make-anchor-overlays-natively-scrollable.md)이 소유한다 — `G-UI-001`(dismissible overlay clamp)과 분리, `CONTEXT.md`의 "해제형 오버레이"/"앵커 오버레이" 구분과 짝을 이룬다.
- 소비자 앱이 `.geul-editor`와 오버레이 트리 사이 어딘가에 `transform`/`filter`를 건 조상을 두면 이 접근도 깨진다 — 패키지가 소비자 CSS까지 통제하지 않으므로 강제하지 않는다.
- 재정렬·리사이즈 드래그 히트테스트(`computeReorderTargetIndex` 등)는 pointer 이벤트의 `clientX/clientY`(viewport-relative)와 geometry(이제 page-relative)를 섞어 비교하지 않도록 구현 시 좌표계를 통일해야 한다.
- `media-resize-handles.tsx`는 동일한 결함을 갖고 있으나 Issue #163 범위 밖이라 이 ADR의 전환 대상이 아니다 — 후속 이슈에서 이 ADR을 참고해 같은 전략을 적용할 수 있다.
