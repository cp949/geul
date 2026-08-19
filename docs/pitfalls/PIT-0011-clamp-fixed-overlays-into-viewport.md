# PIT-0011 화면 밖으로 나가는 fixed 오버레이는 렌더 후 크기를 재서 접는다

- 상태: `ACTIVE`
- 적용 영역: react (overlay, menu)
- 최초 근거: R1 슬라이스 9a(표 핸들 클릭 메뉴)

## 상황과 징후

표 행 핸들 메뉴(높이 약 336px)를 표 중간 행에서 열면 메뉴 아래쪽 색상 팔레트가 뷰포트 밖(y≈726, 뷰포트 720)으로 나갔다. `position: fixed` 요소는 페이지 스크롤로 화면 안에 들어오지 않아 그 항목은 클릭 자체가 불가능하다. Playwright는 `element is outside of the viewport`로 재시도만 반복하다 타임아웃한다. jsdom 단위 테스트는 모든 `getBoundingClientRect()`가 0이라 이 결함을 재현하지 못한다.

## 근본 원인

오버레이 위치를 앵커(핸들·셀) 좌표만으로 정하고 오버레이 자신의 크기를 고려하지 않았다. 기존 오버레이(formatting toolbar, link toolbar)는 앵커 좌표만으로도 대체로 화면을 벗어나지 않아 가변 높이 메뉴가 처음 생긴 슬라이스 9a에서야 결함이 드러났지만, 이는 안전하다는 보장이 아니었다 — 앵커에서 CSS `transform`으로 크게 벗어나 그려지는 오버레이는 한 줄짜리 콘텐츠라도 화면 경계 근처에서 잘려나갈 수 있다(#43에서 FormattingToolbar가 y=-37로 렌더된 것이 실측 사례).

## 예방 규칙

- 콘텐츠에 따라 높이가 달라지는 `position: fixed` 오버레이는 렌더 직후 `useLayoutEffect`에서 자신의 `getBoundingClientRect()`를 재고, `defaultView.innerWidth`/`innerHeight` 안으로 좌표를 클램프한 뒤 그 값으로 다시 그린다. 앵커 좌표만으로 위치를 확정하지 않는다.
- CSS `transform`으로 앵커에서 벗어나 그려지는 오버레이는 그 오프셋을 클램프에 알려준다(`useClampedMenuPosition`의 `anchor`). 클램프가 `left`/`top`을 렌더된 박스의 좌상단으로 가정하면 한 줄짜리 툴바도 화면 밖으로 밀린다 — #43의 최초 시도가 `FormattingToolbar`를 y=-37로 렌더했다.
- 앵커 좌표가 그대로여도 오버레이 자신의 크기가 바뀌면 이미 계산한 클램프 값은 낡는다. `ResizeObserver`로 박스를 관찰해 다시 클램프한다 — `LinkToolbar`의 view→editing 전환이 폭을 약 80px에서 350px로 늘려 뷰포트 오른쪽으로 144px 넘쳤다(#43).
- 오버레이가 뷰포트보다 클 수 있으면 `max-height`와 `overflow-y: auto`를 함께 준다. 클램프만으로는 화면보다 큰 메뉴의 아래쪽 항목에 닿을 수 없다.
- 이런 오버레이에는 "가장 아래쪽(또는 가장 오른쪽) 항목을 실제로 클릭하는" e2e를 넣는다. jsdom은 rect가 전부 0이라 위치 결함을 잡지 못한다 — 단위 테스트만으로 커버했다고 판단하지 않는다.
- 클램프 e2e는 어느 축이 실제로 깨지는지 먼저 확인하고 그 축을 assert한다. #43의 `FormattingToolbar` 테스트는 세로만 봤지만 마이그레이션 이전 코드에도 `top`에 48px 바닥값이 있어 그 assertion은 수정 전에도 통과했다 — 실제 결함은 가로였다(pre-fix 박스 좌측 x=-33.5 실측). assertion이 통과하는 축을 골라두면 회귀 테스트가 아무것도 지키지 않는다.
- 클램프 e2e의 경계 허용치를 스펙 파일에 리터럴로 적지 않는다. `e2e/support/clamp.ts`의 `CLAMP_BOUNDARY_MIN_MARGIN_PX`(보장 여백 `MENU_VIEWPORT_MARGIN` 8 - 서브픽셀 허용오차 4)를 쓰고, 네 변 전부에 같은 값을 적용한다. 값이 아니라 이름을 공유해야 `MENU_VIEWPORT_MARGIN`이 바뀔 때 assertion이 조용히 헐거워지지 않는다.
- 허용치를 통일할 때는 축 단위가 아니라 assertion 단위로 훑는다. #44에서 세로축만 바꾸고 가로축 5개를 리터럴 `0`/`viewportWidth`로 남겨 그 축이 보장 여백만큼 헐거운 채로 통과했다 — 실측에서 `BlockSideMenu` 핸들 x=8, `LinkToolbar` view 모드 오른쪽 끝 891.99(900px 뷰포트, margin 8.008)라 둘 다 8px 여유가 검증되지 않았다.

## 검증 방법

```bash
pnpm test:e2e --project=chromium e2e/formatting-toolbar.spec.ts e2e/link-toolbar.spec.ts e2e/slash-menu.spec.ts e2e/block-handle.spec.ts e2e/table-format.spec.ts
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
- `useClampedMenuPosition`은 `anchor` 파라미터(`topLeft`/`centerAbove`/
  `centerBelow`/`leftOfAnchor`)로 확장됐다. TableHandleMenu/TableCellFormatMenu처럼
  transform 없이 `left`/`top`이 곧 박스 좌상단인 오버레이는 기본값 `topLeft`라
  훅 호출부가 그대로지만, `translate(...)`로 앵커에서 벗어나 그려지는 오버레이는
  그 벗어난 정도를 `anchor`로 알려줘야 클램프가 올바른 여백을 계산한다 — 이
  전제가 깨졌던 최초 시도가 FormattingToolbar를 뷰포트 위(y<0)로 밀어냈다.
- 각 컴포넌트의 e2e(`e2e/formatting-toolbar.spec.ts`, `link-toolbar.spec.ts`,
  `slash-menu.spec.ts`, `block-handle.spec.ts`, `table-format.spec.ts`)에
  "화면 밖 항목을 실제로 클릭"하는 PIT-0011 테스트를 추가했다.
- 위 다섯 스펙의 경계 허용치는 `e2e/support/clamp.ts`의
  `CLAMP_BOUNDARY_MIN_MARGIN_PX` 하나로 모았다([#44](https://github.com/cp949/geul/issues/44)와
  그 리뷰). 상수 파일 주석에 값의 근거와 실측 기록이 있다. 요구 여백을
  일시적으로 16으로 올려 각 assertion이 실제 지오메트리에 걸리는지 확인한다 —
  이 방식으로 가로축 5개가 헐거웠던 것을 찾았다.
- `useClampedMenuPosition`은 클램프를 `ResizeObserver`로도 다시 돌린다(#43
  리뷰). 앵커 좌표를 그대로 둔 채 박스만 커지는 경로가 실제로 있었다 —
  `LinkToolbar`가 view에서 editing으로 바뀌면 `min-w-56` 입력이 들어와 폭이
  약 80px에서 350px가 되고, `centerBelow`(`dx = -width/2`)라 증가분의 절반이
  오른쪽으로 밀린다. 900px 뷰포트에서 툴바 오른쪽 끝이 1044.13(144px 초과)로
  측정됐다. jsdom에는 `ResizeObserver`가 없어 훅이 feature-guard로 건너뛴다.
- `block-side-menu.tsx`의 블록 메뉴에 `max-h-[calc(100vh-1rem)]`·
  `overflow-y-auto`를 추가했다(#43 리뷰). 마이그레이션 당시 클램프만 적용해
  예방 규칙의 `max-height` 항목을 빠뜨렸다 — 메뉴 높이 274px, 1280x200 뷰포트
  에서 클램프 후에도 bottom=282로 82px가 화면 밖이라 맨 아래 Delete 항목이
  `element is outside of the viewport`로 클릭되지 않았다.
- R1 슬라이스 9a Issue [#3](https://github.com/cp949/geul/issues/3) 댓글에 실측 좌표(menu y=443, height=336, 뷰포트 720)를 기록함.

## 관련 문서

- [PIT-0009 UI를 닫는 키보드 핸들러는 병렬 e2e로 검증](./PIT-0009-verify-keyboard-close-with-parallel-e2e.md)
- [PIT-0010 병합 셀에서는 오버레이 hit-test와 selection 이동을 명시적으로 다룸](./PIT-0010-position-overlays-and-selection-for-merged-cells.md)
