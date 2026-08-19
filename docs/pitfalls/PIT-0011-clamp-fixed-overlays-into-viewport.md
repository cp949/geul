# PIT-0011 화면 밖으로 나가는 fixed 오버레이는 렌더 후 크기를 재서 접는다

- 상태: `ACTIVE`
- 적용 영역: react (overlay, menu)
- 최초 근거: R1 슬라이스 9a(표 핸들 클릭 메뉴)

## 상황과 징후

표 행 핸들 메뉴(높이 약 336px)를 표 중간 행에서 열면 메뉴 아래쪽 색상 팔레트가 뷰포트 밖(y≈726, 뷰포트 720)으로 나갔다. `position: fixed` 요소는 페이지 스크롤로 화면 안에 들어오지 않아 그 항목은 클릭 자체가 불가능하다. Playwright는 `element is outside of the viewport`로 재시도만 반복하다 타임아웃한다. jsdom 단위 테스트는 모든 `getBoundingClientRect()`가 0이라 이 결함을 재현하지 못한다.

## 근본 원인

오버레이 위치를 앵커(핸들·셀) 좌표만으로 정하고 오버레이 자신의 크기를 고려하지 않았다. 기존 오버레이(formatting toolbar, link toolbar)는 높이가 한 줄이라 앵커 좌표를 그대로 써도 화면을 벗어나지 않았고, 가변 높이 메뉴가 처음 생긴 슬라이스 9a에서 드러났다.

## 예방 규칙

- 콘텐츠에 따라 높이가 달라지는 `position: fixed` 오버레이는 렌더 직후 `useLayoutEffect`에서 자신의 `getBoundingClientRect()`를 재고, `defaultView.innerWidth`/`innerHeight` 안으로 좌표를 클램프한 뒤 그 값으로 다시 그린다. 앵커 좌표만으로 위치를 확정하지 않는다.
- 오버레이가 뷰포트보다 클 수 있으면 `max-height`와 `overflow-y: auto`를 함께 준다. 클램프만으로는 화면보다 큰 메뉴의 아래쪽 항목에 닿을 수 없다.
- 이런 오버레이에는 "가장 아래쪽(또는 가장 오른쪽) 항목을 실제로 클릭하는" e2e를 넣는다. jsdom은 rect가 전부 0이라 위치 결함을 잡지 못한다 — 단위 테스트만으로 커버했다고 판단하지 않는다.

## 검증 방법

```bash
pnpm test:e2e --project=chromium e2e/table-format.spec.ts
```

## 실제 근거

- `packages/react/src/use-clamped-menu-position.ts`의 `useLayoutEffect` 뷰포트 클램프(`TableHandleMenu`·`TableCellFormatMenu`가 공용으로 사용, [#19](https://github.com/cp949/geul/issues/19)에서 추출)와 각 메뉴 컴포넌트의 `max-h-[calc(100vh-1rem)]`/`overflow-y-auto`.
- `e2e/table-format.spec.ts`의 "표 하단 행에서 메뉴를 열어도 팔레트 마지막 항목까지 뷰포트 안에서 클릭할 수 있다 (PIT-0011)" — 표를 11행까지 늘려 마지막 행에서 메뉴를 열고, 메뉴 bounding box가 뷰포트를 벗어나지 않는지 확인한 뒤 팔레트 맨 마지막 항목("Background color None")을 실제로 클릭한다. (슬라이스 9a 리뷰 라운드에서 교체 — 최초 버전은 "행 핸들 메뉴에서 배경색을 고르면..." 테스트를 근거로 들었으나, 그 테스트는 3행 표의 첫 행에서 메뉴를 열고 8개 중 4번째 항목("Yellow")만 클릭해 실제로는 overflow를 재현하지 않았다.)
- `packages/react/src/formatting-toolbar.tsx`, `link-toolbar.tsx`, `slash-menu.tsx`,
  `block-side-menu.tsx`(사이드 버튼·블록 메뉴), `table-selection-toolbar.tsx`도
  같은 훅으로 마이그레이션했다([#43](https://github.com/cp949/geul/issues/43) —
  #19 리뷰에서 발견된 부분/미적용 클램프 잔여분). `block-side-menu.tsx`의 드롭
  가이드 라인은 클릭 대상이 아니고 클램프가 실제 삽입 위치를 왜곡하므로
  마이그레이션에서 제외했다(컴포넌트 내부 주석 참고).
- 각 컴포넌트의 e2e(`e2e/formatting-toolbar.spec.ts`, `link-toolbar.spec.ts`,
  `slash-menu.spec.ts`, `block-handle.spec.ts`, `table-format.spec.ts`)에
  "화면 밖 항목을 실제로 클릭"하는 PIT-0011 테스트를 추가했다.
- R1 슬라이스 9a Issue [#3](https://github.com/cp949/geul/issues/3) 댓글에 실측 좌표(menu y=443, height=336, 뷰포트 720)를 기록함.

## 관련 문서

- [PIT-0009 UI를 닫는 키보드 핸들러는 병렬 e2e로 검증](./PIT-0009-verify-keyboard-close-with-parallel-e2e.md)
- [PIT-0010 병합 셀에서는 오버레이 hit-test와 selection 이동을 명시적으로 다룸](./PIT-0010-position-overlays-and-selection-for-merged-cells.md)
