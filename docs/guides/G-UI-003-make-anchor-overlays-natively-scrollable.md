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
- 오버레이는 컨테이너 바깥에 그려져 안쪽 스크롤 컨테이너가 잘라내지 못한다. 오버레이 자신의 박스가 그 컨테이너의 보이는 영역 안에 있을 때만 보이게 한다 — 공용 훅 `use-clip-visibility.ts`의 `useClipVisibility`가 영역을 읽고 `visibility`를 갱신한다.
  - 면제 규칙과 포커스 이탈 시 재판정은 이 훅 한 곳에만 둔다. 호출부는 `syncClipVisibility`·`syncAnchorClipVisibility`를 직접 부르지 않는다. `activeElement`도 직접 읽지 않는다.
  - 훅은 `collect()`가 돌려준 노드마다 `exempt`·`box`·`anchor`를 받는다. 판정 계산은 `scroll-clip.ts`의 순수 함수(`readScrollClipBoxes`·`isRectInClipBoxes`·`isPointInClipBoxes`)가 맡는다.
  - 세로는 오버레이 박스가 완전히 안쪽일 때만 보인다. 경계에 걸쳐 잘린 채 떠 있지 않게 한다. 가로는 겹치기만 하면 보인다.
    - 표 열 리사이즈 strip과 열 추가 rail은 clip 영역과의 세로 교집합으로 잘라 그린다(`clipSpanToBoxes`, Issue #260·#278). 표 높이 전체를 덮는 박스라 영역보다 길면 늘 숨기 때문이다. 드래그 중에는 자르지 않는다. rail은 교집합이 비면 원래 구간을 쓴다. 기존 판정이 숨긴다.
    - 표 행 추가 rail은 clip 영역과의 가로 교집합으로 잘라 그린다(`clipHorizontalSpanToBoxes`, Issue #283). 표 폭 전체를 덮는 박스라 영역보다 넓으면 영역 밖 클릭을 받기 때문이다. 드래그 중에는 자르지 않는다. 교집합이 비면 원래 구간을 쓴다. 기존 판정이 숨긴다.
  - `unmount`나 `display: none`이 아니라 `visibility`를 쓴다. 레이아웃 박스와 실측 높이가 남는다. 미디어 캡션은 그 높이를 문서 flow에 되먹인다.
  - 선택에 붙는 popover(서식·링크·표 선택·블록 선택 툴바)는 박스가 아니라 앵커 점으로 판정한다. `useFixedPlacement`의 `clip` 옵션이 `useClipVisibility`에 앵커 점을 넘겨 판정한다. 호출부는 훅을 직접 부르지 않는다([`G-UI-001`](./G-UI-001-build-dismissible-overlays.md)). 앵커 위나 아래에 붙어 앵커가 영역 안이어도 박스가 경계 밖으로 조금 삐져나올 수 있고, 그때 숨기면 첫 줄을 선택할 때 popover가 사라진다. 앵커가 영역 밖으로 스크롤돼 나가면 popover는 뷰포트 가장자리로 clamp된 채 영역 밖에 남으므로 숨긴다.
  - `position: fixed` 오버레이는 앵커 점 판정에 창 레이아웃 뷰포트도 영역에 더한다(Issue #277). `ClipTarget.viewport`가 `true`인 노드만 대상이다.
    - 이유: fixed 오버레이는 viewport clamp로 뷰포트 가장자리에 남는다. 창 스크롤로 앵커가 뷰포트 밖에 나가도 클릭을 받는다. 스크롤 컨테이너 조상이 없으면 영역이 하나도 없어 숨기는 경로가 없었다.
    - 영역: `readViewportBox`가 `{0, 0, innerWidth, innerHeight}`를 돌려준다. `visualViewport`(키보드·핀치 줌)가 아니라 레이아웃 뷰포트다. owner window가 없으면 더하지 않는다.
    - 앵커 점 판정에만 쓴다. 박스 판정(`isRectInClipBoxes`)에는 뷰포트를 더하지 않는다. clamp된 박스는 늘 뷰포트 안이라 판정이 무의미하다. 소비 앱의 jsdom 테스트에서 0×0 rect가 가로 겹침 규칙에 걸려 툴바가 숨는 것도 막는다. 뷰포트보다 큰 오버레이는 앵커 점만 안이면 보인다.
    - 적용: `useFixedPlacement`가 `clip: true`일 때 항상 `viewport: true`를 넘긴다. 옵션은 없다. code-block 툴바도 직접 준다.
    - absolute 오버레이는 `viewport`를 주지 않는다. 문서와 함께 스크롤돼 뷰포트 밖이면 어차피 보이지 않는다. `readScrollClipBoxes`에는 뷰포트를 넣지 않는다. 넣으면 absolute 오버레이까지 숨는다.
    - 면제(`exempt`, 포커스)는 뷰포트에도 같다.
    - 부분 가시를 수용한다. 선택 윗부분만 뷰포트 밖이어도 앵커(선택 위쪽 중앙)가 밖이면 서식 툴바가 숨는다. 아랫부분이 보여도 같다. 앵커를 아랫부분으로 옮기는 규칙은 없다.
    - 블록 앵커 오버레이도 같다. gutter(블록 top), 미디어 툴바(블록 우상단), 코드블록 툴바(블록 우상단)는 앵커가 뷰포트 밖이면 본문이 보여도 숨는다. 블록 top이 뷰포트 위로 1px만 나가도 gutter가 사라진다. 블록 우측이 `innerWidth`를 넘는 가로 오버플로 페이지도 같다. 앵커 점 판정은 경계를 포함한다(y == 0, y == `innerHeight`는 보인다). 수용한다. 안쪽 스크롤 컨테이너의 같은 수용(Issue #267)과 일관된다.
    - 면제로 남는 경우: 오버레이 안에 포커스가 있으면 뷰포트 밖에서도 남는다. 예: 링크 툴바 입력에 포커스를 둔 채 창 스크롤하면 툴바가 뷰포트 가장자리에 남는다. 열린 자식 메뉴(색상 메뉴, More 메뉴, 코드블록 popover)와 드래그 중 핸들도 같다. 설계로 수용한다(Issue #243).
    - 검증하지 않았다: `visualViewport` 차이, iframe 호스트(owner window가 iframe), 줌·transform 조상, RTL.
  - 소비 앱의 sticky 요소(상단 고정 툴바 등)는 `z-index` 6–9를 쓴다. 층 배치와 근거는 아래 [`z-index` 층](#z-index-층) 표가 소유한다.
  - 면제 목록은 아래와 같다. 숨기면 포커스·draft·pointer capture를 잃기 때문이다.
    - 편집 중인 입력(caption).
    - 드래그 중인 핸들.
    - 포커스를 가진 요소가 든 오버레이.
    - 열린 자식 메뉴를 가진 부모 툴바.
    - 블록 메뉴가 열린 블록의 gutter·미디어 그립만(Issue #267). 메뉴만 떠 있는 상태를 막는다. hover가 다른 블록으로 옮겨 가면 그 블록의 gutter·그립은 판정한다.
    - 표 행·열 메뉴를 연 핸들 하나와 표 그립 메뉴를 연 그립 버튼만(Issue #279). 메뉴는 fixed + viewport clamp라 핸들이 영역 밖이어도 뷰포트에 남는다. 메뉴만 떠 있는 상태를 막는다.
      - 행·열은 그 종류 hit box 중 메뉴의 `index`번째 하나다. 나머지 행·열 핸들과 같은 층의 Plus는 판정한다.
      - 판정은 순수 함수 `pickMenuOpenHandleNodes`(`table-handle-helpers.ts`)가 맡는다. 결과를 `exempt`로만 넘긴다.
      - 클릭으로 연 메뉴는 포커스가 편집기에 남아 노드 안 포커스 면제가 걸리지 않는다(Chromium 실측). 이 면제가 따로 필요하다.
      - 메뉴를 닫으면 면제가 풀린다. 핸들이 창 밖으로 나간 뒤 메뉴만 clamp로 남는 잔류는 수용한다(#267과 같다).
  - 열린 팝업(선택기 등)을 연 트리거도 숨기지 않는다. 숨기면 포커스를 잃는다. 이 면제는 팝업이 열린 앵커의 트리거에만 준다. hover가 다른 앵커로 옮겨 간 트리거는 박스로 판정한다.
  - 오버레이 안 요소에 포커스가 있는 동안은 숨기지 않는다. 숨기면 포커스가 body로 빠진다. 적용 대상은 clip을 쓰는 모든 오버레이다(Issue #237, #243).
    - 훅이 document에 `focusout`(capture)을 듣는다.
    - 포커스가 보관 노드 밖으로 나가면 앵커가 그대로여도 렌더를 강제해 다시 판정한다.
    - 보관 노드 사이 이동은 `relatedTarget`으로 무시한다.
    - `target`·`relatedTarget`의 타입 검사는 `dom-node.ts`의 `isNode`로 한다. `nodeType`이 숫자인지 본다(Issue #271).
    - React가 iframe 문서에 그린 노드는 iframe realm 인스턴스다. 전역 `Node`로 검사하면 이탈 재판정이 조용히 생략된다.
    - `ownerDocument.defaultView.Node`도 쓰지 않는다. ProseMirror·core가 만든 노드는 iframe 문서에 붙어도 메인 realm 인스턴스다.
    - react src의 다른 DOM 판정도 같은 기준이다. 요소는 `isElementNode`, HTML 요소·태그는 `isHtmlElement`로 본다. 전역 DOM 생성자 `instanceof`를 쓰지 않는다.
    - `activeElement`는 매 effect에서 읽는다. 별도 state를 두지 않는다.
    - 클릭으로 받은 버튼 포커스는 포커스가 빠질 때까지 영역 밖 오버레이를 남긴다. 설계로 수용한다.
  - 열린 자식 메뉴(서식 툴바 색상 메뉴, 표 셀 서식 메뉴, 미디어 More 메뉴)가 있으면 부모 툴바도 숨기지 않는다. 메뉴만 떠 있는 상태를 막는다. `useFixedPlacement`를 쓰는 오버레이는 `clipExempt` 옵션으로 준다. 훅을 직접 부르는 오버레이는 `exempt`로 준다. 메뉴를 닫아도 포커스가 툴바 안(트리거)으로 돌아오면 면제가 이어진다. 포커스가 툴바를 떠나면 다시 판정한다.
  - 접힌 toggle이 가린 블록은 앵커·측정·드롭 후보가 아니다(Issue #280). 접힘 decoration은 `display: none`이라 숨은 블록의 rect가 0×0이다.
    - 0×0 rect를 앵커로 쓰면 오버레이가 뷰포트 왼쪽 위 구석에 `visible`로 남는다. 앵커 점 판정이 경계를 포함해 구석이 뷰포트 안으로 판정되기 때문이다.
    - 판정은 `hidden-block.ts`의 `isHiddenBlockElement`가 맡는다. 접힘 표식 `data-geul-collapsed-hidden`이 붙은 조상이 있으면 숨은 블록이다. 0×0 rect로 판정하지 않는다. 레이아웃에 의존하지 않는다.
    - 앵커 reader가 숨은 블록이면 `null`을 돌려준다. gutter·미디어 그립·코드블록 툴바·callout 트리거·표 핸들 층은 그리지 않는다.
    - 열린 블록 메뉴·미디어 메뉴·표 행·열·그립 메뉴는 닫는다(`invalidated`). 보이지 않는 블록에 명령이 나가지 않게 한다.
    - hover 중 접히면 포인터가 멈춰 있어도 다시 읽는다. `useHiddenBlockRefresh`가 숨김 여부가 바뀔 때만 렌더한다. 문서 변경마다 렌더하지 않는다.
    - 블록 선택 툴바와 드롭 가이드는 보이는 블록만 계산에 넣는다. 보이는 블록이 없으면 툴바를 그리지 않는다.
    - `useClipVisibility`·`useFixedPlacement`·`scroll-clip.ts`의 판정과 면제 규칙은 바꾸지 않는다.
  - 오버레이의 `style` prop에 `visibility`를 직접 두지 않는다. 다음 렌더가 덮어쓴다.
  - `position: fixed` 오버레이도 이 clip 규칙만 차용한다. 위 "fixed 금지"는 앵커 도달성 규칙이라 그대로 두고, 컨테이너가 잘라내지 못한다는 사정만 같다. 예: code-block 툴바(Issue #236), 블록 gutter·미디어 툴바(Issue #267). 훅에 `anchor`를 함께 줘 박스와 앵커 점을 둘 다 판정한다. 앵커 점을 함께 보는 이유는 viewport clamp다. 컨테이너 상단이 뷰포트 y=0이면 clamp가 툴바 박스를 영역 안에 남긴다. 위 면제 조건(popover·more 메뉴 열림, 툴바 안 포커스)은 박스와 앵커 점 판정 둘 다에 준다.
    - code-block 툴바는 `useClipVisibility`를 직접 부른다.
    - 블록 gutter·미디어 툴바는 `useFixedPlacement`의 `clipBox`로 같은 판정을 받는다([`G-UI-001`](./G-UI-001-build-dismissible-overlays.md)).
    - 긴 블록은 상단(앵커)이 영역 밖이면 본문이 보여도 gutter가 숨는다. 수용한다.
    - 미디어 툴바도 같다. 영역보다 큰 이미지는 상단이 영역 밖이면 본문이 보여도 툴바가 숨는다. 수용한다.
    - 미디어 툴바 앵커는 블록 우상단이다. 에디터가 컨테이너보다 가로로 넓어 블록 우측이 영역 밖이면 이미지가 보여도 툴바가 숨는다. 가로 스크롤로 우측을 들이면 나타난다. 수용한다. 수정 전에는 툴바가 이미지와 떨어진 뷰포트 가장자리에 떠 있었다.
  - 블록 선택 하이라이트(Issue #250)도 `position: fixed`라 같은 규칙을 차용한다. 툴바 본체와 별개로 판정한다.
    - 블록마다 div 하나다. 노드는 callback ref로 `blockId`별로 모으고 해제 때 지운다.
    - 박스만 판정한다. `anchor`를 주지 않는다. 하이라이트는 viewport clamp를 받지 않는다.
    - 면제를 주지 않는다. `pointer-events: none`이라 포커스·드래그·draft가 없다.
    - 일부만 영역에 걸친 블록도 통째로 숨긴다. 영역보다 큰 블록은 선택해도 하이라이트가 안 보인다. 수용한다.
- 뷰포트 clamp를 하지 않는다 — `G-UI-001`의 dismissible overlay와 달리, 이 카테고리는 앵커에서 분리되면 어떤 대상(행·열·경계)을 가리키는지 사용자가 알 수 없어진다. 도달성은 "핸들을 사용자 쪽으로 당겨오기"가 아니라 "네이티브 스크롤이 앵커를 뷰포트로 데려오게 두기"로 확보한다.
- pointer 이벤트 기반 드래그·히트테스트(재정렬 대상 판정, 리사이즈 delta 계산 등)는 `event.clientX/clientY`(viewport-relative)와 이 규칙의 geometry(page-relative)를 섞어 비교하지 않는다 — 좌표계를 명시적으로 통일한다.
- 이 접근은 오버레이 트리와 대상 DOM 사이에 `transform`/`filter`를 건 조상이 없다는 전제에 기댄다. 소비자 앱이 그런 조상을 두면 깨진다 — 패키지가 소비자 CSS까지 통제할 수 없으므로 강제하지 않는다.

## `z-index` 층

오버레이와 소비 앱 sticky 요소는 루트 stacking context에서 비교된다. 이 비교는 위 전제(오버레이 조상에 `transform`·`filter`가 없다)에 기댄다. 값은 `packages/react/src/*.scss`가 소유한다.

| 층 | 요소 | 근거 |
| --- | --- | --- |
| `auto` | 표 행·열 grip, 표 확장·중첩 버튼 | 값을 지정하지 않아 sticky 밑에 깔린다. |
| 5 | 캡션 둘(코드블록·미디어), 표 열 리사이즈 strip(Issue #265) | sticky 밑으로 지나가 툴바 띠에서 입력을 가로채지 않는다. |
| 5 | 블록 선택 하이라이트 | sticky 밑으로 지나가 툴바를 가리지 않는다. |
| 5 | 미디어 그립, callout 트리거, 미디어 리사이즈 핸들, 코드블록 툴바, 미디어 툴바, 블록 gutter | 같은 이유로 sticky 밑에 둔다(Issue #266). |
| 6–9 | 소비 앱 sticky 요소 | 패키지 값이 아니라 소비 앱 계약이다. |
| 10 | 선택 popover(서식·링크·표 선택·블록 선택 툴바) | 툴바 띠와 겹쳐도 sticky 위에 떠야 한다. |
| 10 | 슬래시 메뉴, 이모지 선택기(callout 아이콘 선택기 포함), URL 입력 패널, 공용 메뉴 패널(StaticToolbar 블록 타입·색상 메뉴, 서식 툴바 색상 메뉴, 표 메뉴) | 열린 메뉴는 sticky 위에 뜬다. |
| 10 | 드래그 가이드 둘(블록 삽입, 표 재정렬) | `pointer-events: none`이라 입력을 가로채지 않는다. |
| 30 | 코드블록 언어 popover·more 메뉴, 미디어 More 메뉴 | 부모 툴바(5)의 형제로 렌더돼 부모 층에 갇히지 않는다. |
| 40 | Block menu | gutter(5)의 형제로 렌더된다. |

- 블록 앵커 오버레이는 5 이하여야 한다. 오버레이는 스크롤 영역 뒤 형제로 렌더된다. sticky와 같은 값이면 DOM 순서상 sticky 위에 그려진다.
- 소비 앱 sticky가 5 이하거나 `auto`면 툴바 띠에서 오버레이가 입력을 가로챈다.
- 같은 층은 DOM 순서가 겹침을 정한다. 뒤에 렌더된 요소가 위에 그려진다.
- 블록 선택 하이라이트는 `SlashMenu`가 마지막에 렌더한다. 하이라이트 박스는 블록 박스와 같다.
  - 블록 박스 안에 놓인 callout 트리거·코드블록 툴바·미디어 캡션 위에 tint가 덮인다.
  - 블록 왼쪽 바깥의 gutter·미디어 그립은 자기 하이라이트와 겹치지 않는다.
  - 예외: 들여쓴 자식 블록의 gutter는 부모 하이라이트에 일부 걸린다.
  - 예외: 버튼이 셋인 iframe 그립은 자기 하이라이트에 일부 걸린다.
  - 하이라이트는 `pointer-events: none`이라 입력은 그대로다. 수용한다.
- `MediaToolbar`·`MediaResizeHandles`는 `SlashMenu` 밖에서 따로 마운트하는 공개 컴포넌트다. 같은 층 동료(미디어 캡션·하이라이트) 위에 그려지려면 `SlashMenu` 뒤에 마운트한다. 저장소 앱은 모두 그렇게 한다.

## 경계

[`G-UI-001`](./G-UI-001-build-dismissible-overlays.md)과 구분한다. G-UI-001은 바깥 클릭·Escape로 닫히고 앵커(트리거)가 항상 뷰포트 안에 있다고 가정하는 dismissible overlay(메뉴·툴바·팝오버) 전용이다. 이 가이드는 hover·selection으로 열리고 명시적으로 닫히지 않으며, 앵커 자체가 뷰포트 밖으로 나갈 수 있는 지속형 오버레이(표 핸들, 미디어 리사이즈 핸들 등) 전용이다. 두 카테고리를 한 가이드에 두면 "뷰포트 clamp" 규칙과 "clamp 금지" 규칙이 충돌하는 것처럼 읽힌다.

## 검증

[`G-TST-001`](./G-TST-001-test-overlays-and-keyboard-interactions.md)을 적용하되, fixed overlay의 clamp 검증 대신 앵커가 뷰포트 밖으로 나간 뒤 네이티브 `scrollIntoView()`·Tab 포커스·Playwright 클릭 각각이 실제로 앵커를 뷰포트 안으로 데려오는지 Chromium E2E로 확인한다.

안쪽 스크롤 컨테이너 대응은 jsdom으로 재현하지 못한다(레이아웃이 없다). 단위 테스트는 `stubRect`로 rect를 주입해 판정 로직을 보고, 실제 위치는 Chromium E2E로 확인한다.

뷰포트 판정(Issue #277)은 jsdom의 기본 뷰포트(`innerWidth`·`innerHeight`)와 `window.innerHeight` 대입으로 단위 테스트한다. 대입한 값은 `afterEach`에서 되돌린다. 뷰포트는 앵커 점에만 쓰므로 rect를 스텁하지 않은 0×0 박스도 앵커 점이 뷰포트 안이면 보인다. 이 회귀를 `use-clip-visibility.test.tsx`와 `fixed-placement.test.tsx`가 고정한다. 창 스크롤 e2e는 `e2e/showcase-window-scroll-overlays.spec.ts`다. 포커스를 에디터에 둔 채 `window.scrollTo`로 앵커를 뷰포트 밖에 보내 `visibility`와 그 자리의 클릭 도달성을 본다. 선택마다 노드가 새로 생기는 오버레이(블록 선택 하이라이트)는 노드별 `stubRect`를 걸 수 없다. `Element.prototype.getBoundingClientRect`를 가로채 `style`에서 rect를 읽게 하고 `afterEach`에서 복원한다. 예: `packages/react/test/block-selection-toolbar.test.tsx`. e2e 예: `e2e/showcase-static-toolbar-overlays.spec.ts`.

hover 기반 앵커 오버레이는 포인터를 멈춘 채 스크롤해 확인한다. 포인터가 움직이면 hover 판정이 다시 일어나 위치 갱신 누락이 가려진다. `e2e/support/anchor-gap.ts`의 `scrollPage`로 `scrollTop`을 대입하고 `expectOverlayTopAlignedWithAnchor`로 오버레이 상단과 앵커 상단의 y가 같은지 단언한다. 예: `e2e/showcase-static-toolbar-media-handle.spec.ts`.
